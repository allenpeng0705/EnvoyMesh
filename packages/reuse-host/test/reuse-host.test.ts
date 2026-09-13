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
  decodePairingToken,
  encodePairingToken,
  parseEnvoyPairUri,
  parsePairingUri,
  probeExtAgentReachability,
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
    host.serve();

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
