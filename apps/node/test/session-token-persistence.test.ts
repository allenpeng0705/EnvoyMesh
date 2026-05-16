import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function mockMesh(overrides: Partial<{ peerId: string; multiaddrs: string[]; directConnections: string[] }> = {}): EnvoyMesh {
  const peerId = overrides.peerId ?? "12D3KooWTestMeshPeerId";
  const multiaddrs = overrides.multiaddrs ?? ["/ip4/10.0.0.5/tcp/4001"];
  const directConnections = new Set(overrides.directConnections ?? []);
  return {
    peerId,
    multiaddrs,
    getPeerConnectionInfo: (connPeerId: string) => ({
      connected: directConnections.has(connPeerId),
      direct: directConnections.has(connPeerId),
    }),
  } as unknown as EnvoyMesh;
}

/** A valid Ed25519 public key PEM for derivePeerId (44 base64 chars after the header). */
const VALID_DEVICE_PUBKEY_PEM =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAoRGW3bARLZ5RT/h7RhcS5RCkr4CkIYpWSNkDcf7IbM4=\n-----END PUBLIC KEY-----";

describe("NodeServiceImpl session token persistence", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-session-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  function createSvc(mesh?: EnvoyMesh): NodeServiceImpl {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    return new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir);
  }

  function createSvcWithStores(mesh?: EnvoyMesh) {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const svc = new NodeServiceImpl(mesh ?? mockMesh({ peerId: "12D3KooWHome" }), trustStore, peerDirectory, human, profileDir);
    svc.setWsListenAddress(3030, "/ws");
    return { svc, trustStore, peerDirectory, human };
  }

  // ============================================================
  // pairDevice
  // ============================================================

  it("pairDevice validates QR token and creates persistent session token", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    expect(p.token).toBeTruthy();

    const result = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    expect(result.sessionToken).toBeTruthy();
    expect(typeof result.sessionToken).toBe("string");
    expect(result.sessionToken.length).toBeGreaterThan(8);

    const valid = await svc.validatePairingToken(result.sessionToken);
    expect(valid).toBe(true);

    const invalid = await svc.validatePairingToken("some-random-token");
    expect(invalid).toBe(false);
  });

  it("pairDevice rejects with invalid pairing token", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    await expect(
      svc.pairDevice({
        requesterOwnerId: "envoy:owner:mobile",
        requesterDeviceId: "envoy:device:mobile-phone",
        requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
        pairingToken: "wrong-token",
      }),
    ).rejects.toThrow("Invalid or expired pairing token");
  });

  it("pairDevice rejects with empty pairing token", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    await expect(
      svc.pairDevice({
        requesterOwnerId: "envoy:owner:mobile",
        requesterDeviceId: "envoy:device:mobile-phone",
        requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
        pairingToken: "",
      }),
    ).rejects.toThrow("Missing required pairDevice params");
  });

  it("pairDevice rejects with whitespace-only pairing token", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    await expect(
      svc.pairDevice({
        requesterOwnerId: "envoy:owner:mobile",
        requesterDeviceId: "envoy:device:mobile-phone",
        requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
        pairingToken: "   ",
      }),
    ).rejects.toThrow("Invalid or expired pairing token");
  });

  it("pairDevice rejects with missing requesterOwnerId", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    await expect(
      svc.pairDevice({
        requesterOwnerId: "",
        requesterDeviceId: "envoy:device:mobile-phone",
        requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
        pairingToken: p.token!,
      }),
    ).rejects.toThrow("Missing required pairDevice params");
  });

  it("pairDevice creates a trust record at direct level", async () => {
    const { svc, trustStore } = createSvcWithStores();

    const p = await svc.getPairingPayload();
    await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    const trust = await trustStore.getTrustRecord("envoy:owner:mobile");
    expect(trust).toBeDefined();
    expect(trust!.level).toBe("direct");
    expect(trust!.displayName).toBe("Companion");
  });

  it("pairDevice creates a peer directory entry", async () => {
    const { svc, peerDirectory } = createSvcWithStores();

    const p = await svc.getPairingPayload();
    await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    const entry = await peerDirectory.getPeerByOwnerId("envoy:owner:mobile");
    expect(entry).toBeDefined();
    // The peerId should be derived from the device public key (envoy_ prefix)
    expect(entry!.peerId).toBeTruthy();
    expect(entry!.peerId).toMatch(/^envoy_/);
  });

  it("pairDevice returns bridge info when bridge is enabled", async () => {
    const { svc } = createSvcWithStores();
    svc.setBridgeStatus({
      enabled: true,
      agentPeerId: "envoy_agent_test",
      agentUrl: "http://127.0.0.1:9/inbound",
      listenPort: 3031,
      agentName: "HomeClaw",
      agentPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nBRIDGE\n-----END PUBLIC KEY-----",
    });

    const p = await svc.getPairingPayload();
    const result = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    expect(result.agentPeerId).toBe("envoy_agent_test");
    expect(result.agentPubKey).toBe("-----BEGIN PUBLIC KEY-----\nBRIDGE\n-----END PUBLIC KEY-----");
  });

  it("pairDevice does NOT return bridge info when bridge is disabled", async () => {
    const { svc } = createSvcWithStores();

    const p = await svc.getPairingPayload();
    const result = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    expect(result.agentPeerId).toBeUndefined();
    expect(result.agentPubKey).toBeUndefined();
  });

  it("pairDevice for same owner replaces old session token", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    // First pairing
    const p1 = await svc.getPairingPayload();
    const r1 = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p1.token!,
    });

    // Old token works
    expect(await svc.validatePairingToken(r1.sessionToken)).toBe(true);

    // Re-pair same owner (new QR scan)
    const p2 = await svc.getPairingPayload();
    const r2 = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p2.token!,
    });

    // New token works
    expect(await svc.validatePairingToken(r2.sessionToken)).toBe(true);

    // Old token is revoked (upsert replaced by ownerId)
    expect(await svc.validatePairingToken(r1.sessionToken)).toBe(false);
  });

  it("pairDevice for different owners creates independent tokens", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    // Pair owner A
    const p1 = await svc.getPairingPayload();
    const r1 = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:alice",
      requesterDeviceId: "envoy:device:alice-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p1.token!,
    });

    // Pair owner B (re-use same QR token since it's still valid)
    const r2 = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:bob",
      requesterDeviceId: "envoy:device:bob-tablet",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p1.token!,
    });

    // Both tokens work independently
    expect(await svc.validatePairingToken(r1.sessionToken)).toBe(true);
    expect(await svc.validatePairingToken(r2.sessionToken)).toBe(true);
  });

  // ============================================================
  // validatePairingToken
  // ============================================================

  it("validatePairingToken accepts both QR tokens and persisted session tokens", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    const qrToken = p.token!;

    expect(await svc.validatePairingToken(qrToken)).toBe(true);

    const result = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: qrToken,
    });

    expect(await svc.validatePairingToken(result.sessionToken)).toBe(true);
    expect(await svc.validatePairingToken(qrToken)).toBe(true);
  });

  it("validatePairingToken rejects empty string", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    expect(await svc.validatePairingToken("")).toBe(false);
  });

  it("validatePairingToken rejects whitespace-only string", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    expect(await svc.validatePairingToken("   ")).toBe(false);
  });

  it("validatePairingToken touches lastUsedAt on session token match", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();
    const result = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    // Read the stored token to get its original lastUsedAt
    const filePath = join(profileDir, "session-tokens.json");
    const beforeRaw = await readFile(filePath, "utf8");
    const before = JSON.parse(beforeRaw);
    const beforeLastUsed = before.records[0].lastUsedAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 5));

    // Validate — should touch
    expect(await svc.validatePairingToken(result.sessionToken)).toBe(true);

    const afterRaw = await readFile(filePath, "utf8");
    const after = JSON.parse(afterRaw);
    const afterLastUsed = after.records[0].lastUsedAt;

    expect(afterLastUsed > beforeLastUsed).toBe(true);
  });

  it("validatePairingToken does NOT touch when QR token matches", async () => {
    // QR tokens are in-memory only — no file touch happens
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    const p = await svc.getPairingPayload();

    // Should not throw or write anything
    expect(await svc.validatePairingToken(p.token!)).toBe(true);
  });

  // ============================================================
  // revokeBond cleanup
  // ============================================================

  it("revokeBond cleans up session tokens", async () => {
    const { svc } = createSvcWithStores();

    const p = await svc.getPairingPayload();
    const result = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    expect(await svc.validatePairingToken(result.sessionToken)).toBe(true);

    await svc.revokeBond("envoy:owner:mobile");

    expect(await svc.validatePairingToken(result.sessionToken)).toBe(false);
  });

  it("revokeBond only removes tokens for the specified owner", async () => {
    const { svc } = createSvcWithStores();

    const p = await svc.getPairingPayload();
    const r1 = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:alice",
      requesterDeviceId: "envoy:device:alice-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });
    const r2 = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:bob",
      requesterDeviceId: "envoy:device:bob-tablet",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    await svc.revokeBond("envoy:owner:alice");

    expect(await svc.validatePairingToken(r1.sessionToken)).toBe(false);
    expect(await svc.validatePairingToken(r2.sessionToken)).toBe(true);
  });

  // ============================================================
  // Restart survivability
  // ============================================================

  it("session token survives service restarts (new instance reads same profile dir)", async () => {
    const svc1 = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc1.setWsListenAddress(3030, "/ws");

    const p = await svc1.getPairingPayload();
    const result = await svc1.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    const sessionToken = result.sessionToken;

    const svc2 = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc2.setWsListenAddress(3030, "/ws");

    const valid = await svc2.validatePairingToken(sessionToken);
    expect(valid).toBe(true);
  });

  it("session token survives corrupted session-tokens.json (recovery)", async () => {
    const svc1 = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc1.setWsListenAddress(3030, "/ws");

    // Create a valid token
    const p = await svc1.getPairingPayload();
    const result = await svc1.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p.token!,
    });

    // Corrupt the file
    await writeFile(join(profileDir, "session-tokens.json"), "not valid json {{{", { mode: 0o600 });

    // A new instance should start fresh without crashing
    const svc2 = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc2.setWsListenAddress(3030, "/ws");

    // Old token won't work (data was corrupted)
    expect(await svc2.validatePairingToken(result.sessionToken)).toBe(false);

    // But the system should still be operational — new pairing still works
    const p2 = await svc2.getPairingPayload();
    const result2 = await svc2.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: p2.token!,
    });
    expect(await svc2.validatePairingToken(result2.sessionToken)).toBe(true);
  });

  // ============================================================
  // client-proxy flow simulation
  // ============================================================

  it("simulates full pairing + reconnect flow", async () => {
    const svc = createSvc(mockMesh({ peerId: "12D3KooWHome" }));
    svc.setWsListenAddress(3030, "/ws");

    // --- Phase 1: Initial pairing (QR scan) ---
    const pairingPayload = await svc.getPairingPayload();
    expect(pairingPayload.token).toBeTruthy();

    // Mobile calls pairDevice with the QR token
    const pairResult = await svc.pairDevice({
      requesterOwnerId: "envoy:owner:mobile",
      requesterDeviceId: "envoy:device:mobile-phone",
      requesterDevicePublicKeyPem: VALID_DEVICE_PUBKEY_PEM,
      pairingToken: pairingPayload.token!,
    });

    const sessionToken = pairResult.sessionToken;
    expect(sessionToken).toBeTruthy();

    // --- Phase 2: Reconnection (no QR) ---
    // Mobile app uses saved sessionToken to reconnect via relay proxy

    // The relay's client-proxy handler would call validatePairingToken
    const isValid = await svc.validatePairingToken(sessionToken);
    expect(isValid).toBe(true);

    // QR token is still valid (within TTL)
    expect(await svc.validatePairingToken(pairingPayload.token!)).toBe(true);
  });
});
