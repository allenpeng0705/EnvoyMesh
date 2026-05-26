import { describe, expect, it } from "vitest";
import { createInMemoryDb, migrateMobileStorageSchema, mobileStorageSchema } from "@envoymesh/mobile-storage";
import { MobileNode, type MobileNodeConfig } from "../src/index.js";

function makeConfig(db = createInMemoryDb()): MobileNodeConfig {
  return { profileDir: "/test-profile", relayUrls: ["ws://127.0.0.1:15432/ws/client"], database: db };
}

describe("mobile remote home bridge client", () => {
  it("getBridgeStatus is enabled when home bridge agent is paired", async () => {
    const db = createInMemoryDb();
    await db.open();
    for (const sql of mobileStorageSchema()) await db.execute(sql);
    await migrateMobileStorageSchema(db);

    const node = new MobileNode(makeConfig(db));
    const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();

    await node.importOwnerIdentity(
      "/shared-profile",
      owner.privateKeyPem,
      owner.publicKeyPem,
      "12D3KooWHomeNodePeerIdExample00000001",
      {
        homeAgentPeerId: "envoy_agent_bridge123",
        homeAgentPubKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
        homeAgentName: "HomeClaw",
      },
    );

    const status = await node.getBridgeStatus();
    expect(status.enabled).toBe(true);
    expect(status.agentPeerId).toBe("envoy_agent_bridge123");
    expect(status.agentName).toBe("HomeClaw");
    expect(status.agentPublicKeyPem).toContain("BEGIN PUBLIC KEY");
  });

  it("registers bridge agent as virtual contact routed to home node transport", async () => {
    const db = createInMemoryDb();
    await db.open();
    for (const sql of mobileStorageSchema()) await db.execute(sql);
    await migrateMobileStorageSchema(db);

    const node = new MobileNode(makeConfig(db));
    const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();
    const homeTransport = "12D3KooWHomeNodePeerIdExample00000001";
    const bridgeAgent = "envoy_agent_bridge123";

    await node.importOwnerIdentity(
      "/shared-profile",
      owner.privateKeyPem,
      owner.publicKeyPem,
      homeTransport,
      { homeAgentPeerId: bridgeAgent, homeAgentName: "HomeClaw" },
    );

    const bonds = await node.getBonds();
    const bridgeBond = bonds.find((b) => b.peerOwnerId === bridgeAgent);
    expect(bridgeBond?.libp2pPeerId).toBe(homeTransport);
    expect(bridgeBond?.displayName).toBe("HomeClaw");
  });

  it("persists home bridge agent fields in identity state", async () => {
    const db = createInMemoryDb();
    await db.open();
    for (const sql of mobileStorageSchema()) await db.execute(sql);
    await migrateMobileStorageSchema(db);

    const node = new MobileNode(makeConfig(db));
    const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();

    await node.importOwnerIdentity(
      "/shared-profile",
      owner.privateKeyPem,
      owner.publicKeyPem,
      "12D3KooWHomeNodePeerIdExample00000001",
      {
        homeAgentPeerId: "envoy_agent_bridge123",
        homeAgentPubKey: "pubkey-pem",
        homeAgentName: "OpenClaw",
      },
    );
    const persisted = await node.persistSharedIdentity();
    expect(persisted.homeAgentPeerId).toBe("envoy_agent_bridge123");
    expect(persisted.homeAgentPubKey).toBe("pubkey-pem");
    expect(persisted.homeAgentName).toBe("OpenClaw");
  });

  it("reports home bridge offline when mesh has no path to home node", async () => {
    const db = createInMemoryDb();
    await db.open();
    for (const sql of mobileStorageSchema()) await db.execute(sql);
    await migrateMobileStorageSchema(db);

    const node = new MobileNode(makeConfig(db));
    const { generateOwnerIdentity } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();
    const bridgeAgent = "envoy_agent_bridge123";

    await node.importOwnerIdentity(
      "/shared-profile",
      owner.privateKeyPem,
      owner.publicKeyPem,
      "12D3KooWHomeNodePeerIdExample00000001",
      { homeAgentPeerId: bridgeAgent },
    );

    const info = await node.getPeerConnectionInfo(bridgeAgent);
    expect(info.connected).toBe(false);
  });
});
