/**
 * `/health` has to say *who* it is.
 *
 * Every EnvoyMesh-family product answers this endpoint with the same body, so
 * `200` alone means "something is listening on the port" — which is not the
 * question a liveness watchdog, a desktop guardian, or an attaching product is
 * asking. These tests pin the identity fields and the change that carries them.
 *
 * Found in review: the CLI watchdog accepted any `200`, and the desktop guardian's
 * Rust probe checks only for `"ok":true`, so a *different* product holding :3030
 * could keep a wedged node alive. `setHealthIdentity` is the server half of the fix;
 * `@envoymesh/node-core`'s `probeNodeEndpoint` is the client half.
 */

import { get } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WsServer, type HostNodeService, type HostRpcDispatcher, type SessionIdentityResolver } from "../src/index.js";

const servers: WsServer[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    try {
      server.stop();
    } catch {
      /* best effort */
    }
  }
});

const nodeService: HostNodeService = {
  on: () => undefined,
  onCallEvent: () => () => undefined,
  getNodeStatus: () => "running",
  getConnectionStatus: () => ({ peerId: "peer-1", multiaddrs: [] }),
  noteClientActivity: () => undefined,
};

const sessionIdentity: SessionIdentityResolver = {
  localScopeKey: "local",
  resolveSession: async () => null,
};

const dispatch: HostRpcDispatcher = async () => null;

async function boot(configure?: (server: WsServer) => void): Promise<{ server: WsServer; port: number }> {
  const server = new WsServer(0, "/ws");
  servers.push(server);
  configure?.(server);
  server.start(nodeService, { sessionIdentity, dispatch });
  await server.waitUntilListening();
  return { server, port: server.boundPort };
}

async function fetchHealth(port: number): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const req = get({ host: "127.0.0.1", port, path: "/health", timeout: 3_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as Record<string, unknown>);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("health probe timed out"));
    });
  });
}

describe("/health identity", () => {
  it("reports the app and owner when the host knows them", async () => {
    const { port } = await boot((server) => {
      server.setHealthIdentity(() => ({ app: "EnvoyMesh", ownerId: "envoy:owner:abc123" }));
    });
    const body = await fetchHealth(port);
    expect(body["ok"]).toBe(true);
    expect(body["app"]).toBe("EnvoyMesh");
    expect(body["ownerId"]).toBe("envoy:owner:abc123");
  });

  it("includes the peer id when the host has one", async () => {
    const { port } = await boot((server) => {
      server.setHealthIdentity(() => ({
        app: "EnvoyMesh",
        peerId: "12D3KooWHome",
        ownerId: "envoy:owner:abc123",
      }));
    });
    expect((await fetchHealth(port))["peerId"]).toBe("12D3KooWHome");
  });

  it("omits identity fields entirely when none is set — never invents one", async () => {
    // A host with no identity yet must not look like a *named* node: the probe
    // reports `identityUnknown` rather than pretending a mismatch is a match.
    const { port } = await boot();
    const body = await fetchHealth(port);
    expect(body["ok"]).toBe(true);
    expect(body["ownerId"]).toBeUndefined();
    expect(body["app"]).toBeUndefined();
    expect(body["peerId"]).toBeUndefined();
  });

  it("reflects a later call, so identity can be published once it is known", async () => {
    const { server, port } = await boot((s) => {
      s.setHealthIdentity(() => ({ app: "EnvoyMesh" }));
    });
    expect((await fetchHealth(port))["ownerId"]).toBeUndefined();
    server.setHealthIdentity(() => ({ app: "EnvoyMesh", ownerId: "envoy:owner:later" }));
    expect((await fetchHealth(port))["ownerId"]).toBe("envoy:owner:later");
  });

  it("still reports the bound port, not the requested one", async () => {
    const { port } = await boot();
    expect((await fetchHealth(port))["port"]).toBe(port);
  });
});
