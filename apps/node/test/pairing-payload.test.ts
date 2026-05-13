import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

function mockMesh(overrides: Partial<{ peerId: string; multiaddrs: string[] }> = {}): EnvoyMesh {
  const peerId = overrides.peerId ?? "12D3KooWTestMeshPeerId";
  const multiaddrs = overrides.multiaddrs ?? ["/ip4/10.0.0.5/tcp/4001"];
  return { peerId, multiaddrs } as unknown as EnvoyMesh;
}

describe("NodeServiceImpl getPairingPayload", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-pairing-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("includes relayPeerId and wsUrl from mesh multiaddr when bridge disabled", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWHome", multiaddrs: ["/ip4/192.168.1.50/tcp/63641"] });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    expect(p.wsUrl).toBe("ws://192.168.1.50:3030/ws");
    expect(p.relayPeerId).toBe("12D3KooWHome");
    expect(p.agentPeerId).toBeUndefined();
    expect(p.agentPubKey).toBeUndefined();
    expect(typeof p.token).toBe("string");
    expect(p.token.length).toBeGreaterThan(8);
  });

  it("uses bridge agent PEM in agentPubKey when bridge is enabled", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWHome" });

    const agentPem = "-----BEGIN PUBLIC KEY-----\nAGENT\n-----END PUBLIC KEY-----";

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    svc.setBridgeStatus({
      enabled: true,
      agentPeerId: "envoy_agent_test",
      agentUrl: "http://127.0.0.1:9/inbound",
      listenPort: 3031,
      agentName: "HomeClaw",
      agentPublicKeyPem: agentPem,
    });

    const p = await svc.getPairingPayload();
    expect(p.agentPeerId).toBe("envoy_agent_test");
    expect(p.agentPubKey).toBe(agentPem);
    expect(p.relayPeerId).toBe("12D3KooWHome");
  });

  it("uses external mesh for relayPeerId and LAN IP when bound via bindExternalMesh", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWExt", multiaddrs: ["/ip4/172.16.0.7/tcp/4001"] });

    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir);
    svc.bindExternalMesh(mesh);
    svc.setWsListenAddress(8080, "/ws");

    const p = await svc.getPairingPayload();
    expect(p.wsUrl).toBe("ws://172.16.0.7:8080/ws");
    expect(p.relayPeerId).toBe("12D3KooWExt");
  });
});
