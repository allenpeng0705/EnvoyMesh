/**
 * The reuse host — the acceptance test for the whole encapsulation programme
 * (plan §8.17.6; the boundary review's "no second-product proof").
 *
 * ## What this proves, and how
 *
 * The Dart fixture (`packages/envoy-reuse-fixture`) proves the *SDK* claim. There
 * was no equivalent for the TypeScript side: the host/connect layer was
 * extracted, the harness became fully reusable, `@envoymesh/api/core` exists —
 * and nothing actually *consumed* them. A boundary claim that no consumer tests
 * is a manifest entry, not a fact.
 *
 * So this file is a consumer built **only** from the reusable surface:
 *
 *   * `@envoymesh/host-connect` — the WS host, with **two** injected ports
 *     (`sessionIdentity`, `dispatch`); everything else is optional.
 *   * `@envoymesh/protocol` — the claims a non-social host can make for itself.
 *
 * No `@envoymesh/api`, no product store, no `NodeProfile`, no social concept. The
 * second test enforces that mechanically rather than by promise: it reads this
 * file's own imports and fails if any of them is not a declared core package, and
 * it asks the manifest whether every module behind them is `reusable`.
 */

import { createServer } from "node:net";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  WsServer,
  type HostNodeService,
  type HostRpcDispatcher,
  type HostSession,
  type SessionIdentityResolver,
} from "@envoymesh/host-connect";
import { ENVOYMESH_VERSION } from "@envoymesh/protocol";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

/** A free port, so this host never fights the product's fixed port. */
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

/** The five members a host actually needs — no `NodeService`, no 435 methods. */
function makeHostNodeService(): HostNodeService & { activityCount: number } {
  let activityCount = 0;
  return {
    activityCount,
    on: () => undefined,
    onCallEvent: () => () => undefined,
    getNodeStatus: () => "running",
    getConnectionStatus: () => ({ connected: true, clients: 1 }),
    noteClientActivity: () => {
      activityCount++;
    },
  };
}

describe("a host built only from the reusable surface", () => {
  const running: WsServer[] = [];

  afterEach(() => {
    for (const server of running.splice(0)) {
      try {
        server.stop?.();
      } catch {
        /* teardown is best-effort */
      }
    }
  });

  it("boots, authenticates a client and serves an RPC end to end", async () => {
    const port = await freePort();
    const server = new WsServer(port, "/ws");
    running.push(server);

    const host = makeHostNodeService();
    const dispatcher: HostRpcDispatcher = async (method, params, session) => {
      if (method === "hostInfo") {
        return { version: ENVOYMESH_VERSION, ownerId: session?.ownerId ?? null, nthParam: params["n"] };
      }
      throw new Error(`unknown method: ${method}`);
    };
    const sessionIdentity: SessionIdentityResolver = {
      localScopeKey: "local",
      resolveSession: async (token: string): Promise<HostSession | null> =>
        token === "thin-client-token"
          ? { scopeKey: "scope-1", ownerId: "owner-1", isOwnerScope: false, caller: undefined }
          : null,
    };

    server.start(host, { sessionIdentity, dispatch: dispatcher, preAuthMethods: [] });

    const { WebSocket } = await import("ws");
    // The host authenticates a socket from the connect URL's `token` query
    // parameter (`resolveSession`), not from RPC params — a thin client pairs
    // once and then every call carries the session.
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=thin-client-token`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no reply from the host")), 5_000);
      socket.once("message", (raw: Buffer) => {
        clearTimeout(timer);
        resolve(JSON.parse(raw.toString()) as Record<string, unknown>);
      });
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "hostInfo",
          params: { n: 7 },
        }),
      );
    });

    expect(reply["error"]).toBeUndefined();
    expect(reply["result"]).toEqual({ version: ENVOYMESH_VERSION, ownerId: "owner-1", nthParam: 7 });
    socket.close();
  }, 15_000);

  it("imports nothing product-bound — checked against the manifest, not promised", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "scripts/module-boundary.json"), "utf8"),
    ) as {
      reusable: { path: string }[];
      productBound: { path: string }[];
      declaredInputs: { corePackages: string[] };
    };
    const reusable = new Set(manifest.reusable.map((r) => r.path));
    const core = new Set(manifest.declaredInputs.corePackages);

    const own = readFileSync(path.join(here, "reuse-host.test.ts"), "utf8");
    const envSpecifiers = [...own.matchAll(/from "(@envoymesh\/[^"]+)"/g)].map((m) => m[1]);
    expect(envSpecifiers.length).toBeGreaterThan(0);

    // 1. Every EnvoyMesh import is a declared core package.
    const nonCore = envSpecifiers.filter((s) => !core.has(s));
    expect(nonCore, "a reuse consumer must import declared core packages only").toEqual([]);

    // 2. Every module behind those packages is `reusable` in the manifest.
    for (const spec of [...new Set(envSpecifiers)]) {
      const dir = `packages/${spec.replace("@envoymesh/", "")}`;
      const files = readdirSync(path.join(repoRoot, dir, "src"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => `${dir}/src/${f}`);
      const tainted = files.filter((f) => !reusable.has(f));
      expect(tainted, `${spec} still has product-bound modules`).toEqual([]);
    }

    // 3. The product package is not reachable — not even through a subpath.
    expect(envSpecifiers.some((s) => s.startsWith("@envoymesh/api"))).toBe(false);
  });
});
