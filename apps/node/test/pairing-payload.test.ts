import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalCompanyInviteStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import type { CompanyInviteRecord } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createCompanyInviteViaRuntime } from "../src/node-service-company-invite.js";
import { buildCompanyInviteInviteContext } from "../src/node-service-wan.js";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
} from "@envoymesh/api";

function mockMesh(overrides: Partial<{ peerId: string; multiaddrs: string[]; directConnections: string[] }> = {}): EnvoyMesh {
  const peerId = overrides.peerId ?? "12D3KooWTestMeshPeerId";
  const multiaddrs = overrides.multiaddrs ?? ["/ip4/10.0.0.5/tcp/4001"];
  const directConnections = new Set(overrides.directConnections ?? [communityRelayPeerId()]);
  return {
    peerId,
    multiaddrs,
    getPeerConnectionInfo: (connPeerId: string) => ({
      connected: directConnections.has(connPeerId),
      direct: directConnections.has(connPeerId),
    }),
  } as unknown as EnvoyMesh;
}

/** Derive the auto-discovered relay WS URL from the community relay bootstrap addr. */
function communityRelayWsUrl(): string {
  const match = DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR.match(/\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
  const ip = match?.[1] ?? "47.93.11.212";
  return `ws://${ip}:${DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT}/ws`;
}

/** Extract the relay's peer ID from the community relay bootstrap addr. */
function communityRelayPeerId(): string {
  const match = DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR.match(/\/p2p\/([1-9A-HJ-NP-Za-km-z]+)/);
  return match?.[1] ?? "";
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
    const expectedRelayPeerId = communityRelayPeerId();
    expect(p.relayWsUrl).toBe(expectedRelay);
    // relayPeerId is the RELAY's peer ID, not the home node's
    expect(p.relayPeerId).toBe(expectedRelayPeerId);
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
    expect(p.agentName).toBe("HomeClaw");
    // relayPeerId is the RELAY's peer ID, not the home node's
    expect(p.relayPeerId).toBe(communityRelayPeerId());
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
    // relayPeerId is the RELAY's peer ID, not the home node's
    expect(p.relayPeerId).toBe(communityRelayPeerId());
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
    // No relay → no relay peer ID
    expect(p.relayPeerId).toBeUndefined();
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
    // Explicit URL → can't derive relay peer ID
    expect(p.relayPeerId).toBeUndefined();
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
    // relayPeerId is the RELAY's peer ID, not the home node's
    expect(p.relayPeerId).toBe(communityRelayPeerId());
  });

  it("auto-discovers relay WS URL from configured relay in persisted config", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({
      peerId: "12D3KooWHome",
      multiaddrs: ["/ip4/192.168.1.50/tcp/63641"],
      directConnections: ["12D3KooWConfigRe1ay"],
    });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    // Add a configured relay — auto-discovery should pick it up
    await svc.addRelay("/ip4/10.0.0.1/tcp/4001/p2p/12D3KooWConfigRe1ay");

    const p = await svc.getPairingPayload();
    expect(p.relayWsUrl).toBe("ws://10.0.0.1:15432/ws");
    expect(p.wsUrl).toContain("ws://10.0.0.1:15432/ws");
    expect(p.wsUrl).toContain("target=12D3KooWHome");
    // relayPeerId extracted from the configured relay's /p2p/ component
    expect(p.relayPeerId).toBe("12D3KooWConfigRe1ay");
  });

  it("falls back to LAN wsUrl when no relay has a direct connection", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    // No direct connections to any relay
    const mesh = mockMesh({
      peerId: "12D3KooWHome",
      multiaddrs: ["/ip4/192.168.1.50/tcp/63641"],
      directConnections: [], // no relay has a direct connection
    });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    // Falls back to LAN because no relay can proxy to this node
    expect(p.wsUrl).toBe("ws://192.168.1.50:3030/ws");
    expect(p.relayWsUrl).toBeUndefined();
    expect(p.relayPeerId).toBeUndefined();
    expect(p.token).toBeTruthy();
  });

  it("falls back to LAN when only a relayed (non-direct) connection exists", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const cnRelayId = communityRelayPeerId();
    // Node is "connected" to the relay but only via circuit-relay (not direct).
    // getPeerConnectionInfo returns connected:true but direct:false.
    const mesh = {
      peerId: "12D3KooWHome",
      multiaddrs: ["/ip4/192.168.1.50/tcp/63641"],
      getPeerConnectionInfo: (peerId: string) => ({
        connected: peerId === cnRelayId, // connected through relay
        direct: false, // but NOT direct — the relay's findOpenConnectionToPeer would skip it
      }),
    } as unknown as EnvoyMesh;

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    // Falls back to LAN — indirect relay connections can't serve client-proxy
    expect(p.wsUrl).toBe("ws://192.168.1.50:3030/ws");
    expect(p.relayWsUrl).toBeUndefined();
    expect(p.relayPeerId).toBeUndefined();
  });

  it("family invite QR always carries the auto-discovered relay when directly connected", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    // Direct connection to the community relay → auto-discovery picks it up.
    const mesh = mockMesh({
      peerId: "12D3KooWHome",
      multiaddrs: ["/ip4/192.168.1.50/tcp/63641"],
      directConnections: [communityRelayPeerId()],
    });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");

    // The family-invite context is built from getPairingPayload — the relay
    // must survive into the invite record.
    const ctx = await buildCompanyInviteInviteContext(svc);
    expect(ctx.relayWsUrl).toBe(communityRelayWsUrl());

    const store = createLocalCompanyInviteStore(profileDir);
    const taskStore = {
      saveCompanyInvite: async (r: CompanyInviteRecord) => store.saveInvite(r),
      getCompanyInvite: async (id: string) => store.getInvite(id),
      findCompanyInviteByToken: async (t: string) => store.findByToken(t),
      listCompanyInvites: async () => store.listInvites(),
    } as unknown as Parameters<typeof createCompanyInviteViaRuntime>[0]["taskStore"];

    const { uri } = await createCompanyInviteViaRuntime(
      { taskStore, ...ctx },
      { kind: "family" },
    );
    expect(uri.startsWith("envoy://invite?")).toBe(true);
    // The relay must be in the QR URI so a phone on 5G has a WAN path.
    expect(uri).toContain(`relayWsUrl=${encodeURIComponent(communityRelayWsUrl())}`);
    expect(uri).toContain("lanWsUrl=");
  });

  it("family invite QR carries extra configured relays as comma-joined rels", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = mockMesh({
      peerId: "12D3KooWHome",
      multiaddrs: ["/ip4/192.168.1.50/tcp/63641"],
      directConnections: [],
    });

    const svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    // Two operator relays (EU + US), primary explicit override = EU.
    await svc.addRelay("/ip4/10.0.0.1/tcp/4001/p2p/12D3KooWEuRelay");
    await svc.addRelay("/ip4/10.0.0.2/tcp/4001/p2p/12D3KooWUsRelay");
    svc.setRelayPublicWsUrl("ws://10.0.0.1:15432/ws");

    const ctx = await buildCompanyInviteInviteContext(svc);
    expect(ctx.relayWsUrl).toBe("ws://10.0.0.1:15432/ws");
    expect(ctx.relayWsUrls).toEqual(["ws://10.0.0.2:15432/ws"]);

    const store = createLocalCompanyInviteStore(profileDir);
    const taskStore = {
      saveCompanyInvite: async (r: CompanyInviteRecord) => store.saveInvite(r),
      getCompanyInvite: async (id: string) => store.getInvite(id),
      findCompanyInviteByToken: async (t: string) => store.findByToken(t),
      listCompanyInvites: async () => store.listInvites(),
    } as unknown as Parameters<typeof createCompanyInviteViaRuntime>[0]["taskStore"];

    const { uri } = await createCompanyInviteViaRuntime(
      { taskStore, ...ctx },
      { kind: "family" },
    );
    expect(uri).toContain(
      `rels=${encodeURIComponent("ws://10.0.0.2:15432/ws")}`,
    );
  });
});
