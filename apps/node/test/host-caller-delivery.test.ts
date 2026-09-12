/**
 * Per-caller delivery, end to end, on a real host.
 *
 * ## Why this file exists
 *
 * An adversarial review of the host extraction found that the composition
 * `hostHandled → emitToSubscribers → transformForSession` had **zero** coverage:
 * `social-session-delivery.test.ts` tests the policy as a pure function,
 * `ws-host-wiring.test.ts` drives the real host but passes **no**
 * `eventDispositions` and **no** `transformForSession`, and
 * `ws-event-dispositions.test.ts` stops at `dispatchEvent` with a stub handler.
 * A regression that wired `bridge:status` or `home:config-updated` as `broadcast`
 * — or that dropped the transform option at the composition root — would have
 * passed all three.
 *
 * So this test drives the real thing: a real `WsServer` on a real port, the
 * **real** `SOCIAL_EVENT_DISPOSITIONS`, the **real** `createSocialSessionDelivery`
 * (with a stub capability gate), four sockets with different identities, and
 * assertions on what each socket actually received on the wire.
 *
 * | Socket | Identity | `bridge:status` must be | `home:config-updated` must be |
 * |---|---|---|---|
 * | owner | owner profile | `enabled: true` | stamped owner, bots intact |
 * | member denied | `mom`, gate false | **`enabled: false`** | stamped `mom`, `aiBots: []`, other profiles' bots stripped |
 * | member allowed | `dad`, gate true | `enabled: true` | stamped `dad` |
 * | untokened local | none | `enabled: true` (raw — same as before this work) | raw |
 */

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api";
import { CORE_EVENT_DISPOSITIONS, WsServer, mergeEventDispositions, type HostNodeService } from "@envoymesh/host-connect";
import {
  SOCIAL_EVENT_DISPOSITIONS,
  createSocialSessionIdentityResolver,
  type SocialSessionHost,
} from "../src/social-ws-policy.js";
import { createSocialSessionDelivery } from "../src/social-session-delivery.js";
import type { RpcCallerContext } from "../src/rpc-caller-context.js";

/** One token per identity: the resolver is the product's, stubbed at its host port. */
const TOKENS: Record<string, { ownerId: string; profileId: string }> = {
  "tok-owner": { ownerId: "acct-1", profileId: OWNER_FAMILY_PROFILE_ID },
  "tok-mom": { ownerId: "acct-1", profileId: "mom" },
  "tok-dad": { ownerId: "acct-1", profileId: "dad" },
};

const host = {
  // The port's `SessionTokenRecordLike`: ownerId is required, profileId optional.
  lookupSessionToken: async (token: string) => TOKENS[token],
  listFamilyProfiles: async () => ({
    profiles: [
      { id: OWNER_FAMILY_PROFILE_ID, isOwner: true },
      { id: "mom", isOwner: false },
      { id: "dad", isOwner: false },
    ],
  }),
} as unknown as SocialSessionHost;

const servers: WsServer<RpcCallerContext>[] = [];
const sockets: WebSocket[] = [];

/**
 * Wait for the listener's address. `start()` is synchronous and `listen()` is
 * not, so reading `address()` right after it returns null — which is how the
 * first version of this file failed with "host did not bind".
 */
async function boundPort(server: WsServer<RpcCallerContext>): Promise<number> {
  const http = (server as unknown as { httpServer: { address(): { port: number } | null } }).httpServer;
  for (let i = 0; i < 100; i += 1) {
    const address = http.address();
    if (address && typeof address.port === "number") return address.port;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("host did not bind");
}

/** Start a real host on an ephemeral port and return its URL. */
function startHost(gateAllows: (profileId: string) => boolean) {
  const emitted: Array<{ event: string; data: unknown }> = [];
  const node: HostNodeService & { emit(event: string, data: unknown): void } = {
    on: (event, listener) => {
      emitted.push({ event, data: listener });
    },
    onCallEvent: () => () => undefined,
    getNodeStatus: () => "running" as const,
    getConnectionStatus: () => ({ peerId: "peer-1", multiaddrs: [] }),
    noteClientActivity: () => undefined,
    emit: (event, data) => {
      // Drive the host's disposition loop the way the node does: call the
      // listener the host registered for that event.
      const entry = emitted.find((e) => e.event === event);
      (entry?.data as (d: unknown) => void)?.(data);
    },
  };

  const server = new WsServer<RpcCallerContext>(0);
  servers.push(server);
  server.start(node as unknown as HostNodeService, {
    sessionIdentity: createSocialSessionIdentityResolver(host),
    eventDispositions: SOCIAL_EVENT_DISPOSITIONS,
    dispatch: async () => null,
    transformForSession: createSocialSessionDelivery(async (session) =>
      gateAllows(session.scopeKey),
    ),
  });
  // `server.port` is the *requested* port (0 → ephemeral), so the bound port has
  // to come from the listening socket, asynchronously.
  return { server, emit: node.emit, port: boundPort(server) };
}

/** Connect and subscribe; resolves once the socket has been authenticated. */
async function connect(port: number, token?: string): Promise<WebSocket> {
  const url = `ws://127.0.0.1:${port}/ws${token ? `?token=${token}` : ""}`;
  const ws = new WebSocket(url);
  sockets.push(ws);
  const frames: Array<Record<string, unknown>> = [];
  (ws as unknown as { received: typeof frames }).received = frames;
  ws.on("message", (raw) => {
    const parsed = JSON.parse(String(raw)) as { event?: string; data?: unknown };
    if (parsed.event) frames.push(parsed as Record<string, unknown>);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  // Subscribe to both caller-dependent events, then let the host process it.
  for (const event of ["bridge:status", "home:config-updated"]) {
    ws.send(JSON.stringify({ id: `sub-${event}`, method: "on", params: { event } }));
  }
  await new Promise((resolve) => setTimeout(resolve, 60));
  return ws;
}

function deliveries(ws: WebSocket, event: string): unknown[] {
  const frames = (ws as unknown as { received: Array<Record<string, unknown>> }).received;
  return frames.filter((f) => f.event === event).map((f) => f.data);
}

afterEach(() => {
  while (sockets.length) sockets.pop()?.close();
  while (servers.length) servers.pop()?.stop();
});

describe("bridge:status is masked per receiving session", () => {
  it("owner sees enabled, a non-granted member sees masked, a granted member sees enabled", async () => {
    const { emit, port: portPromise } = startHost((profileId) => profileId === "dad");
    const port = await portPromise;
    const owner = await connect(port, "tok-owner");
    const mom = await connect(port, "tok-mom");
    const dad = await connect(port, "tok-dad");
    const local = await connect(port);

    emit("bridge:status", { enabled: true, detail: "ok" });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(deliveries(owner, "bridge:status")).toEqual([{ enabled: true, detail: "ok" }]);
    expect(deliveries(mom, "bridge:status")).toEqual([{ enabled: false, detail: "ok" }]);
    expect(deliveries(dad, "bridge:status")).toEqual([{ enabled: true, detail: "ok" }]);
    expect(deliveries(local, "bridge:status")).toEqual([{ enabled: true, detail: "ok" }]);
  });
});

describe("home:config-updated is stamped for the receiving session", () => {
  it("each session gets its own identity, and a member loses the owner's bots and secrets", async () => {
    const { emit, port: portPromise } = startHost(() => false);
    const port = await portPromise;
    const owner = await connect(port, "tok-owner");
    const mom = await connect(port, "tok-mom");

    emit("home:config-updated", {
      config: {
        callerFamilyProfileId: OWNER_FAMILY_PROFILE_ID,
        callerIsOwnerProfile: true,
        aiBots: [{ id: "owner-bot" }],
        skillApiKeys: { secret: "x" },
        theme: "dark",
        familyProfiles: [
          { id: OWNER_FAMILY_PROFILE_ID, aiBots: [{ id: "owner-bot" }] },
          { id: "mom", aiBots: [{ id: "mom-bot" }] },
        ],
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 60));

    const ownerConfig = (deliveries(owner, "home:config-updated")[0] as { config: Record<string, unknown> }).config;
    expect(ownerConfig.callerFamilyProfileId).toBe(OWNER_FAMILY_PROFILE_ID);
    expect(ownerConfig.callerIsOwnerProfile).toBe(true);
    expect(ownerConfig.theme).toBe("dark");

    const momConfig = (deliveries(mom, "home:config-updated")[0] as { config: Record<string, unknown> }).config;
    // The point of the port: the *receiving* session decides the stamp, never the
    // emitter — the emitter here claims to be the owner.
    expect(momConfig.callerFamilyProfileId).toBe("mom");
    expect(momConfig.callerIsOwnerProfile).toBe(false);
    expect(momConfig.aiBots).toEqual([]);
    expect(momConfig.skillApiKeys).toBeUndefined();
    const profiles = momConfig.familyProfiles as Array<Record<string, unknown>>;
    expect(profiles.find((p) => p.id === "mom")?.aiBots).toEqual([{ id: "mom-bot" }]);
    expect(profiles.find((p) => p.id === OWNER_FAMILY_PROFILE_ID)?.aiBots).toBeUndefined();
  });
});

describe("the wiring itself is pinned", () => {
  it("both caller-dependent events are hostHandled in the merged table", async () => {
    // The composition gap this file closes: nothing asserted that these two are
    // delivered by a host handler rather than broadcast. They come from *different*
    // tables — `bridge:status` is a core event, `home:config-updated` is the
    // product's — and the core/product disjointness rule in
    // ws-event-dispositions.test.ts only protects the core side. Someone re-adding
    // `home:config-updated` as `broadcast` would silently expose the emitter's
    // identity to every session and no test would notice.
    const merged = mergeEventDispositions(CORE_EVENT_DISPOSITIONS, SOCIAL_EVENT_DISPOSITIONS);
    for (const event of ["bridge:status", "home:config-updated"]) {
      expect(merged[event]?.kind, `${event} must be hostHandled`).toBe("hostHandled");
    }
  });

  it("a transformation that throws denies that socket and keeps the fan-out alive", async () => {
    // A throwing transform used to abort the whole fan-out (the host awaits the
    // transform per socket with no guard) *and* surface as an unhandled rejection.
    // The port contract says a gate should return the restricted payload rather
    // than throw — but "should" is not a guarantee, and one caller-dependent event
    // failing must not deny the event to everyone else.
    const { emit, port: portPromise } = startHost(() => false);
    const port = await portPromise;
    const owner = await connect(port, "tok-owner");
    const mom = await connect(port, "tok-mom");

    // Wrap the *injected* transform (not `transformForSession`, which calls it —
    // doing that recursed until the stack overflowed, which the host then caught
    // exactly as designed, so the mistake showed up as a `RangeError` in the log
    // rather than as a silent pass).
    const internals = servers[servers.length - 1] as unknown as {
      _transformForSession: (
        event: string,
        data: unknown,
        session: { scopeKey?: string } | undefined,
      ) => Promise<unknown>;
    };
    const real = internals._transformForSession;
    internals._transformForSession = async (event, data, session) => {
      if (event === "bridge:status" && session?.scopeKey === "mom") {
        throw new Error("gate exploded");
      }
      return real.call(internals, event, data, session);
    };

    emit("bridge:status", { enabled: true, detail: "ok" });
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Owner unaffected.
    expect(deliveries(owner, "bridge:status")).toEqual([{ enabled: true, detail: "ok" }]);
    // Mom denied (masked or nothing) — never the raw `enabled: true`.
    for (const frame of deliveries(mom, "bridge:status")) {
      expect(frame).toMatchObject({ enabled: false });
    }
  });
});
