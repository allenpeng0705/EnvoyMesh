/**
 * H1 acceptance — event dispositions as data.
 *
 * `docs/envoymesh-refactoring-plan.md` §6.1 requires **two layers** of
 * acceptance for the host split. This is the behavioural layer for H1:
 *
 * 1. The mechanism works — broadcast, audience routing, custom transformation,
 *    host delegation.
 * 2. **A social-free host does not deliver social events.** That is the
 *    requirement in one line: a product host has no chat, so a `chat:message`
 *    must be silently undeliverable — not delivered, and not a crash.
 * 3. **A typo cannot pass as a no-op.** A disposition table is data, so a
 *    misspelled event name is not a compile error. Without the guard,
 *    assertion 2 would pass for the wrong reason.
 *
 * The static layer (the 11 symbols unreachable from `ws-server.ts`) is enforced
 * separately by `scripts/check-module-boundary.mjs`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CORE_EVENT_DISPOSITIONS,
  CORE_EVENT_NAMES,
  dispatchEvent,
  mergeEventDispositions,
  type EventDelivery,
  type EventDisposition,
  type HostEventHandler,
} from "@envoymesh/host-connect";
import {
  SOCIAL_EVENT_DISPOSITIONS,
  resolveChatMessageTargetProfiles,
} from "../src/social-ws-policy.js";

/** Records what the host was asked to deliver. */
function makeDelivery() {
  const broadcasts: Array<{ event: string; data: unknown }> = [];
  const toProfiles: Array<{ profileId: string; event: string; data: unknown }> = [];
  const delivery: EventDelivery = {
    broadcast: (event, data) => broadcasts.push({ event, data }),
    toProfile: (profileId, event, data) => toProfiles.push({ profileId, event, data }),
  };
  return { delivery, broadcasts, toProfiles };
}

const NO_HANDLERS: Record<string, HostEventHandler> = {};

describe("H1 — the disposition mechanism", () => {
  it("broadcast reaches every subscriber", () => {
    const { delivery, broadcasts } = makeDelivery();
    dispatchEvent("node:status", { kind: "broadcast" }, { up: true }, delivery, NO_HANDLERS);
    expect(broadcasts).toEqual([{ event: "node:status", data: { up: true } }]);
  });

  it("byProfile routes only to the audience the policy resolved", () => {
    const { delivery, broadcasts, toProfiles } = makeDelivery();
    dispatchEvent(
      "chat:message",
      { kind: "byProfile", resolve: () => ["mom", "dad"] },
      { text: "hi" },
      delivery,
      NO_HANDLERS,
    );
    expect(broadcasts).toHaveLength(0);
    expect(toProfiles.map((p) => p.profileId)).toEqual(["mom", "dad"]);
  });

  it("an empty audience is reported as dropped, not silently ignored", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { delivery, broadcasts, toProfiles } = makeDelivery();
    const delivered = dispatchEvent(
      "chat:message",
      { kind: "byProfile", resolve: () => [] },
      {},
      delivery,
      NO_HANDLERS,
    );
    expect(delivered).toBe(false);
    expect(broadcasts).toHaveLength(0);
    expect(toProfiles).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("empty audience"));
    warn.mockRestore();
  });

  it("custom can rename an event and reshape its payload", () => {
    // The case §6.1's original three-case sketch could not express.
    const { delivery, toProfiles } = makeDelivery();
    const disposition: EventDisposition = {
      kind: "custom",
      handle: (d, data) => {
        const row = data as { targetProfileId?: string; room?: unknown };
        if (row.targetProfileId) d.toProfile(row.targetProfileId, "chat:room-updated", row.room);
      },
    };
    dispatchEvent(
      "chat:family-room-updated",
      disposition,
      { targetProfileId: "grandma", room: { roomId: "r1" } },
      delivery,
      NO_HANDLERS,
    );
    expect(toProfiles).toEqual([
      { profileId: "grandma", event: "chat:room-updated", data: { roomId: "r1" } },
    ]);
  });

  it("hostHandled runs the named host handler", async () => {
    const seen: unknown[] = [];
    const { delivery } = makeDelivery();
    await dispatchEvent(
      "bridge:status",
      { kind: "hostHandled", handler: "bridge:status" },
      { connected: 2 },
      delivery,
      { "bridge:status": (data) => void seen.push(data) },
    );
    expect(seen).toEqual([{ connected: 2 }]);
  });
});

describe("H1 — a typo cannot pass as a silent no-op", () => {
  it("an event with no registered disposition warns and is dropped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { delivery, broadcasts } = makeDelivery();
    const delivered = dispatchEvent("chat:message", undefined, {}, delivery, NO_HANDLERS);
    expect(delivered).toBe(false);
    expect(broadcasts).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no disposition registered"));
    warn.mockRestore();
  });

  it("a disposition naming an unknown handler warns and is dropped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { delivery, broadcasts } = makeDelivery();
    const delivered = dispatchEvent(
      "bridge:status",
      // A misspelled handler name — exactly the failure mode the guard exists for.
      { kind: "hostHandled", handler: "brige:status" },
      {},
      delivery,
      { "bridge:status": () => {} },
    );
    expect(delivered).toBe(false);
    expect(broadcasts).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown handler"));
    warn.mockRestore();
  });
});

describe("H1 — the reusable/social boundary in the tables", () => {
  it("a social-free host does not deliver any chat event", () => {
    // The requirement, mechanised: build the host with CORE dispositions ONLY
    // (what a non-social product would have) and drive the product's events.
    const { delivery, broadcasts, toProfiles } = makeDelivery();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const coreOnly = mergeEventDispositions(CORE_EVENT_DISPOSITIONS);

    const socialEvents = [
      "chat:message",
      "chat:delivered",
      "chat:room-updated",
      "chat:room-message",
      "chat:family-room-updated",
      "chat:family-room-message",
      "chat:draft",
      "chat:auto-reply-paused",
      "bond:established",
      "bond:revoked",
      "profile:updated",
      "home:config-updated",
      "hello:request",
      "share:agent-proposed",
      "agent:activity",
      "agent:awareness",
    ];
    for (const event of socialEvents) {
      dispatchEvent(event, coreOnly[event], { targetProfileId: "mom" }, delivery, NO_HANDLERS);
    }

    expect(broadcasts, "a social-free host must broadcast no social event").toEqual([]);
    expect(toProfiles, "a social-free host must route no social event").toEqual([]);
    // And every one of them was reported rather than silently swallowed.
    expect(warn).toHaveBeenCalledTimes(socialEvents.length);
    warn.mockRestore();
  });

  it("the core table is product-agnostic: no owner/profile concept in its vocabulary", () => {
    const encoded = JSON.stringify(CORE_EVENT_DISPOSITIONS);
    for (const concept of ["ownerOnly", "profile", "chat", "bond", "family"]) {
      expect(encoded.toLowerCase()).not.toContain(concept.toLowerCase());
    }
  });

  it("every core event name is a real RPC event (drift guard)", () => {
    // The contract declares its vocabulary locally so it stays dependency-free
    // (importing `@envoymesh/api` would classify it product-bound, and this
    // contract exists to be part of the *reusable* host layer). That trades
    // duplication for a drift risk, which this test closes: rename an event in
    // the RPC contract and this fails, instead of a disposition silently dying.
    //
    // `NodeServiceEvents` is a type with no runtime value, so the declaration is
    // parsed — the same approach `scripts/classify-modules.mjs` uses.
    const src = readFileSync(
      new URL("../../../packages/api/src/node-service.ts", import.meta.url),
      "utf8",
    );
    const start = src.indexOf("export interface NodeServiceEvents");
    expect(start, "NodeServiceEvents declaration not found").toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}", start));
    const declared = new Set(
      [...body.matchAll(/^\s{2}"([^"]+)"/gm)].map((m) => m[1]),
    );
    expect(declared.size, "parsed no event names — the guard would be vacuous").toBeGreaterThan(50);

    const unknown = CORE_EVENT_NAMES.filter((n) => !declared.has(n));
    expect(
      unknown,
      `core event names missing from NodeServiceEvents: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("the two tables are disjoint and cover both halves of the host", () => {
    const core = new Set(Object.keys(CORE_EVENT_DISPOSITIONS));
    const social = new Set(Object.keys(SOCIAL_EVENT_DISPOSITIONS));
    const overlap = [...core].filter((k) => social.has(k));
    expect(overlap, "a product table must not redefine a core event").toEqual([]);
    expect(core.size).toBe(25);
    expect(social.size).toBe(20);
  });
});

describe("H1 — the product table keeps the routing rules it inherited", () => {
  it("chat:message with no thread-key match falls back to owner-only", () => {
    const disp = SOCIAL_EVENT_DISPOSITIONS["chat:message"];
    expect(disp.kind).toBe("byProfile");
    if (disp.kind !== "byProfile") throw new Error("unreachable");
    // No sender/recipient owner ids → no profiles resolved → owner fallback.
    expect(disp.resolve({}).length).toBeGreaterThan(0);
  });

  it("chat:message with family thread keys resolves to those profiles", () => {
    const disp = SOCIAL_EVENT_DISPOSITIONS["chat:message"];
    if (disp.kind !== "byProfile") throw new Error("unreachable");
    const data = { sender: { ownerId: "family:mom:dad" }, recipient: {} };
    // Delegates to the same resolver H3 moved out of the transport.
    expect(disp.resolve(data)).toEqual(resolveChatMessageTargetProfiles(data));
  });

  it("family-room events are remapped onto the mesh-room names", () => {
    const { delivery, toProfiles } = makeDelivery();
    const updated = SOCIAL_EVENT_DISPOSITIONS["chat:family-room-updated"];
    const message = SOCIAL_EVENT_DISPOSITIONS["chat:family-room-message"];
    expect(updated.kind).toBe("custom");
    expect(message.kind).toBe("custom");

    void dispatchEvent("chat:family-room-updated", updated, {
      targetProfileId: "dad",
      room: { id: "r2" },
    }, delivery, NO_HANDLERS);
    void dispatchEvent("chat:family-room-message", message, {
      targetProfileId: "dad",
      roomId: "r2",
      message: { text: "hi" },
    }, delivery, NO_HANDLERS);

    expect(toProfiles[0]).toEqual({
      profileId: "dad",
      event: "chat:room-updated",
      data: { id: "r2" },
    });
    expect(toProfiles[1]).toEqual({
      profileId: "dad",
      event: "chat:room-message",
      data: { roomId: "r2", message: { text: "hi" }, kind: "family" },
    });
  });
});
