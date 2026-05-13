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
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
} from "@envoymesh/api";

function mockMesh(overrides: Partial<{ peerId: string; multiaddrs: string[] }> = {}): EnvoyMesh {
  const peerId = overrides.peerId ?? "12D3KooWTestMeshPeerId";
  const multiaddrs = overrides.multiaddrs ?? ["/ip4/10.0.0.5/tcp/4001"];
  return { peerId, multiaddrs } as unknown as EnvoyMesh;
}

/** Derive the auto-discovered relay WS URL from the community relay bootstrap addr. */
function communityRelayWsUrl(): string {
  const match = DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR.match(/\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
  const ip = match?.[1] ?? "47.93.11.212";
  return `ws://${ip}:${DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT}/ws`;
}

describe("NodeServiceImpl getPairingPayload", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-pairing-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("auto-discovers relay WS URL and encodes target+token in wsUrl", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWHome", multiaddrs: ["/ip4/192.168.1.50/tcp/63641"] });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    const expectedRelay = communityRelayWsUrl();
    expect(p.relayWsUrl).toBe(expectedRelay);
    expect(p.relayPeerId).toBe("12D3KooWHome");
    expect(p.wsUrl).toContain(expectedRelay);
    expect(p.wsUrl).toContain("target=12D3KooWHome");
    expect(p.wsUrl).toContain("token=");
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
    expect(p.relayWsUrl).toBe(communityRelayWsUrl());
    expect(p.token).toBeTruthy();
  });

  it("auto-discovers relay WS URL when using external mesh", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWExt", multiaddrs: ["/ip4/172.16.0.7/tcp/4001"] });

    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir);
    svc.bindExternalMesh(mesh);
    svc.setWsListenAddress(8080, "/ws");

    const p = await svc.getPairingPayload();
    const expectedRelay = communityRelayWsUrl();
    expect(p.relayWsUrl).toBe(expectedRelay);
    expect(p.wsUrl).toContain(expectedRelay);
    expect(p.wsUrl).toContain("target=12D3KooWExt");
    expect(p.relayPeerId).toBe("12D3KooWExt");
  });

  it("skips 127.0.0.1 multiaddr but still uses relay auto-discovery for mobile pairing", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({
      peerId: "12D3KooWHome",
      multiaddrs: [
        "/ip4/127.0.0.1/tcp/63641",
        "/ip4/192.168.1.50/tcp/63641",
      ],
    });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    // Should use relay auto-discovery, not the LAN IP
    expect(p.relayWsUrl).toBe(communityRelayWsUrl());
    expect(p.wsUrl).toContain(communityRelayWsUrl());
  });

  it("falls back to localhost LAN wsUrl when only loopback multiaddr exists and relayPublicWsUrl is explicitly disabled", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({
      peerId: "12D3KooWHome",
      multiaddrs: ["/ip4/127.0.0.1/tcp/63641"],
    });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    // Explicitly disable relay proxy so auto-discovery is skipped
    await svc.updateNodeConfig({ relayPublicWsUrl: "" });

    const p = await svc.getPairingPayload();
    expect(p.wsUrl).toBe("ws://localhost:3030/ws");
    expect(p.relayWsUrl).toBeUndefined();
    expect(p.relayPeerId).toBe("12D3KooWHome");
  });

  it("uses relay proxy URL with target and token when relayPublicWsUrl is configured", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWHome", multiaddrs: ["/ip4/192.168.1.50/tcp/63641"] });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    svc.setRelayPublicWsUrl("ws://relay.example.com:15432/ws");

    const p = await svc.getPairingPayload();
    expect(p.relayWsUrl).toBe("ws://relay.example.com:15432/ws");
    expect(p.relayPeerId).toBe("12D3KooWHome");
    expect(p.wsUrl).toContain("ws://relay.example.com:15432/ws");
    expect(p.wsUrl).toContain("target=12D3KooWHome");
    expect(p.wsUrl).toContain("token=");
    expect(p.token).toBeTruthy();
  });

  it("auto-discovers relay WS URL from community relay when no explicit config", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWHome", multiaddrs: ["/ip4/192.168.1.50/tcp/63641"] });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    // no setRelayPublicWsUrl call → auto-discovery kicks in

    const p = await svc.getPairingPayload();
    const expectedRelay = communityRelayWsUrl();
    expect(p.relayWsUrl).toBe(expectedRelay);
    expect(p.wsUrl).toContain(expectedRelay);
    expect(p.relayPeerId).toBe("12D3KooWHome");
  });

  it("auto-discovers relay WS URL from configured relay in persisted config", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({ peerId: "12D3KooWHome", multiaddrs: ["/ip4/192.168.1.50/tcp/63641"] });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    // Add a configured relay — auto-discovery should pick it up
    await svc.addRelay("/ip4/10.0.0.1/tcp/4001/p2p/12D3KooWConfigRelay");

    const p = await svc.getPairingPayload();
    expect(p.relayWsUrl).toBe("ws://10.0.0.1:15432/ws");
    expect(p.wsUrl).toContain("ws://10.0.0.1:15432/ws");
    expect(p.wsUrl).toContain("target=12D3KooWHome");
    expect(p.relayPeerId).toBe("12D3KooWHome");
  });
});
