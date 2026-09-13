/**
 * `@envoymesh/reuse-host` — a second product's host, exercised end to end.
 *
 * Four claims, in the order a consumer would check them:
 *   1. it boots and serves an RPC without the product's surface;
 *   2. the QR payload round-trips, and rejects a foreign QR code;
 *   3. the harness surface is reachable (it is the reason the package exists);
 *   4. **nothing in this package can reach product code** — checked against the
 *      manifest, so re-tainting a module breaks the proof and not just the prose.
 */

import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPairingUri,
  createBackend,
  createReuseHost,
  createShellHostNodeService,
  decodePairingToken,
  encodePairingToken,
  parseEnvoyPairUri,
  parsePairingUri,
  probeExtAgentReachability,
  type EventDisposition,
  type HostNodeService,
  type HostRpcDispatcher,
  type PairWithHomeNodeParams,
  type SessionIdentityResolver,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const identity: SessionIdentityResolver = {
  localScopeKey: "local",
  resolveSession: async (token) =>
    token === "pair-token"
      ? { scopeKey: "scope", ownerId: "account-1", isOwnerScope: false, caller: undefined }
      : null,
};

const dispatcher: HostRpcDispatcher = async (method, _params, session) => {
  if (method === "whoami") return { ownerId: session?.ownerId ?? null };
  throw new Error(`unknown method: ${method}`);
};

const hosts: { stop(): void }[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.stop();
});

describe("@envoymesh/reuse-host", () => {
  it("boots and serves an RPC with no product surface", async () => {
    const port = await freePort();
    const host = createReuseHost({ port, sessionIdentity: identity, dispatch: dispatcher });
    hosts.push(host);
    await host.serve();

    const { WebSocket } = await import("ws");
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=pair-token`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no reply")), 5_000);
      socket.once("message", (raw: Buffer) => {
        clearTimeout(timer);
        resolve(JSON.parse(raw.toString()) as Record<string, unknown>);
      });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "whoami", params: {} }));
    });

    expect(reply["error"]).toBeUndefined();
    expect(reply["result"]).toEqual({ ownerId: "account-1" });
    socket.close();
  }, 15_000);

  it("builds a QR payload that round-trips, and rejects a foreign one", () => {
    const params: PairWithHomeNodeParams = {
      wsUrl: "ws://192.168.1.20:3030/ws",
      lanWsUrl: "ws://192.168.1.20:3030/ws",
      token: "pair-token",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----",
      ownerId: "envoy:owner:alice",
      homeNodePeerId: "12D3KooWHome",
    };
    const uri = buildPairingUri(params);
    expect(uri.startsWith("envoy://pair?")).toBe(true);
    expect(parsePairingUri(uri)).toEqual(params);

    // **The interoperability proof.** This package builds the URI; EnvoyMesh's own
    // parser reads it. If the two ever drift apart, a second product's QR code stops
    // pairing with the product's app — a failure no package-local round-trip would
    // catch.
    expect(parseEnvoyPairUri(uri)).toEqual(params);

    // A scanner meets QR codes that are not ours.
    expect(parsePairingUri("https://example.com")).toBeNull();
    expect(parsePairingUri("not a uri")).toBeNull();
    expect(parsePairingUri("envoy://pair?wsUrl=ws://x")).toBeNull(); // missing token
  });

  it("encodes the same compressed token the product reads", async () => {
    // The token codec moved to the reusable layer with the payload contract, so a
    // second product produces tokens the product's own decoder accepts.
    const token = await encodePairingToken({
      wsUrl: "ws://192.168.1.20:3030/ws",
      token: "pair-token",
      ownerId: "envoy:owner:alice",
    });
    const decoded = decodePairingToken(token);
    expect(decoded.ownerId).toBe("envoy:owner:alice");
    expect(decoded.token).toBe("pair-token");
  });

  it("hands the host's own pairing URI out with the caller's identity", async () => {
    const port = await freePort();
    const host = createReuseHost({
      port,
      displayName: "Studio Mac",
      sessionIdentity: identity,
      dispatch: dispatcher,
    });
    hosts.push(host);
    const parsed = parsePairingUri(
      host.pairingUri("pair-token", { ownerPublicKey: "PEM", ownerId: "envoy:owner:alice" }),
    );
    expect(parsed?.wsUrl).toBe(`ws://127.0.0.1:${port}/ws`);
    expect(parsed?.ownerId).toBe("envoy:owner:alice");
  });

  it("reports the port the OS chose, and a URI that can be dialled", async () => {
    // `port: 0` is the documented way to take any free port, so the host has to
    // report the one it got. It used to answer with the *requested* port — the
    // pairing URI read `ws://127.0.0.1:0/ws`, which nobody can dial. Every test
    // that passed a concrete port still passed, which is exactly why this went
    // unnoticed until the CLI was run by hand.
    const host = createReuseHost({ port: 0, sessionIdentity: identity, dispatch: dispatcher });
    hosts.push(host);
    await host.serve();

    expect(host.port).toBeGreaterThan(0);
    const uri = host.pairingUri("pair-token", { ownerPublicKey: "PEM", ownerId: "envoy:owner:alice" });
    expect(parsePairingUri(uri)?.wsUrl).toBe(`ws://127.0.0.1:${host.port}/ws`);

    // Not just a number in a string: a client can reach it.
    const { WebSocket } = await import("ws");
    const socket = new WebSocket(`ws://127.0.0.1:${host.port}/ws?token=pair-token`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    socket.close();
  }, 15_000);

  it("rejects an occupied port instead of killing the process", async () => {
    // The transport's default policy on `EADDRINUSE` is `process.exit(1)` — right
    // for the desktop host, fatal for a library a second product embeds. If this
    // package did not take over that decision, this test would end the run.
    const port = await freePort();
    const first = createReuseHost({ port, sessionIdentity: identity, dispatch: dispatcher });
    hosts.push(first);
    await first.serve();

    const second = createReuseHost({ port, sessionIdentity: identity, dispatch: dispatcher });
    hosts.push(second);
    await expect(second.serve()).rejects.toThrow(/EADDRINUSE|in use/i);
  }, 15_000);

  it("exposes the harness surface a second product needs", () => {
    expect(typeof createBackend).toBe("function");
    expect(typeof probeExtAgentReachability).toBe("function");
  });

  it("cannot reach product code — checked against the manifest", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "scripts/module-boundary.json"), "utf8"),
    ) as {
      reusable: { path: string }[];
      productBound: { path: string }[];
      declaredInputs: { corePackages: string[] };
    };
    const reusable = new Set(manifest.reusable.map((r) => r.path));
    const core = new Set(manifest.declaredInputs.corePackages);

    const source = readFileSync(path.join(here, "../src/index.ts"), "utf8");
    const specifiers = [...source.matchAll(/from "(@envoymesh\/[^"]+)"/g)].map((m) => m[1]);
    expect(specifiers.length).toBeGreaterThan(0);

    const nonCore = specifiers.filter((s) => !core.has(s));
    expect(nonCore, "a second product must import declared core packages only").toEqual([]);

    // **Entry points, not whole packages.** `@envoymesh/api/core` is a declared
    // subpath of a package that *does* hold product-bound modules; what matters is
    // that the entry point this package imports is reusable (rules 6a/6b). A root
    // specifier has to be clean throughout, because importing it reaches every
    // module the barrel exports.
    for (const spec of [...new Set(specifiers)]) {
      const [pkg, sub] = [spec.split("/").slice(0, 2).join("/"), spec.split("/")[2]];
      const dir = `packages/${pkg.replace("@envoymesh/", "")}`;
      if (sub) {
        expect(reusable.has(`${dir}/src/${sub}.ts`), `${spec} entry point is not reusable`).toBe(true);
        continue;
      }
      const files = readdirSync(path.join(repoRoot, dir, "src"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => `${dir}/src/${f}`);
      expect(files.filter((f) => !reusable.has(f)), `${spec} has product-bound modules`).toEqual([]);
    }

    // This package itself must be reusable, or it is not a base for a second product.
    expect(reusable.has("packages/reuse-host/src/index.ts")).toBe(true);
  });
});

/* ─────────────────── the product's own events reach its own clients ─────────────────── */

/**
 * A product's event vocabulary is half of what a host is for: the daemon owns the events, and the
 * transport decides who receives them. That only works if the table a product passes in **arrives** —
 * it used to be dropped here while `socketMethods`, `preAuthMethods` and `transformForSession` were
 * forwarded, so declaring dispositions correctly still produced silence. Found by a product that had
 * to route its own events around the host instead.
 */
describe("a product's event dispositions", () => {
  /** A node surface whose emitted events the test can fire, and whose subscriptions it can inspect. */
  function capturableNode(): {
    service: HostNodeService;
    emit: (event: string, data: unknown) => void;
    /** A function, not a snapshot: the host registers its dispositions in `serve()`, which happens
     *  after this object is built. Reading a captured array here reported "nothing registered" for a
     *  host that had registered everything. */
    subscribed: () => string[];
  } {
    const listeners = new Map<string, (data: unknown) => void>();
    return {
      service: {
        ...createShellHostNodeService(),
        on: (event: string, listener: (data: unknown) => void) => {
          listeners.set(event, listener);
        },
      },
      emit: (event, data) => listeners.get(event)?.(data),
      subscribed: () => [...listeners.keys()],
    };
  }

  it("registers the product's names with the transport, beside the core table", async () => {
    const port = await freePort();
    const node = capturableNode();
    const host = createReuseHost({
      port,
      sessionIdentity: identity,
      dispatch: dispatcher,
      eventDispositions: { "coder:run-updated": { kind: "broadcast" } },
    });
    hosts.push(host);
    await host.serve(node.service);

    // The product's own name…
    expect(node.subscribed()).toContain("coder:run-updated");
    // …and the core's, because the transport merges rather than replaces. A forward that overwrote
    // the core table would be a worse bug than the one this fixes.
    expect(node.subscribed()).toContain("node:status");
  });

  it("delivers one of the product's events to a client that asked for it", async () => {
    const port = await freePort();
    const node = capturableNode();
    const host = createReuseHost({
      port,
      sessionIdentity: identity,
      dispatch: dispatcher,
      eventDispositions: { "coder:run-updated": { kind: "broadcast" } satisfies EventDisposition },
    });
    hosts.push(host);
    await host.serve(node.service);

    const { WebSocket } = await import("ws");
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=pair-token`);
    const frames: string[] = [];
    socket.on("message", (raw: Buffer) => frames.push(raw.toString()));
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    // A product's names are not in the transport's auto-subscribe list — that list is EnvoyMesh's own
    // vocabulary — so the client asks for what it wants. That is the documented contract, and this
    // test is what keeps it true.
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "on", params: { event: "coder:run-updated" } }));
    await new Promise((done) => setTimeout(done, 200));

    node.emit("coder:run-updated", { workspace: "feature-auth", status: "running" });
    await new Promise((done) => setTimeout(done, 250));

    const delivered = frames.map((frame) => JSON.parse(frame) as { event?: string; data?: unknown });
    expect(delivered).toContainEqual({
      event: "coder:run-updated",
      data: { workspace: "feature-auth", status: "running" },
    });
    socket.close();
  });
});
