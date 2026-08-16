import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalTaskStore } from "@envoymesh/local-store";
import type { LocalTaskStore, PersistedNodeConfig } from "@envoymesh/local-store";
import type { DevicePairRequestPayload } from "@envoymesh/protocol";
import {
  applyLanAutoBondAccept,
  buildLanAutoBondRequest,
  createLanFleetTokenProof,
  evaluateLanAutoBondReceipt,
  fingerprintFleetToken,
  LAN_AUTO_BOND_NOTE,
  lanFleetProofBinding,
  OPEN_LAN_FINGERPRINT,
  sendLanAutoBondRequest,
  verifyLanFleetTokenProof,
  type LanAutoBondDeps,
} from "../src/node-service-lan-auto-bond.js";

let profileDir: string;
let taskStore: LocalTaskStore;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-lan-auto-bond-"));
  taskStore = createLocalTaskStore(profileDir);
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function baseDeps(overrides: Partial<LanAutoBondDeps> = {}): LanAutoBondDeps {
  let config: PersistedNodeConfig | undefined = overrides.loadConfig
    ? undefined
    : {
        version: "0.1",
        profileDir,
        discoveryProfile: "lan-fast",
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        updatedAt: new Date().toISOString(),
      };
  return {
    taskStore,
    loadConfig: overrides.loadConfig ?? (async () => config),
    sendPairRequest: overrides.sendPairRequest ?? (async () => ({ ok: true })),
    getLocalIdentity:
      overrides.getLocalIdentity ??
      (() => ({
        ownerId: "envoy:owner:self",
        deviceId: "envoy:device:1",
        devicePublicKeyPem: "pem",
      })),
    getOwnOwnerId: overrides.getOwnOwnerId ?? (() => "envoy:owner:self"),
  };
}

describe("fingerprintFleetToken", () => {
  it("is a stable, short hash of the token", () => {
    const a = fingerprintFleetToken("fleet-secret-1");
    const b = fingerprintFleetToken("fleet-secret-1");
    expect(a).toBe(b);
    expect(a.length).toBe(12);
  });

  it("differs across tokens", () => {
    expect(fingerprintFleetToken("alpha")).not.toBe(fingerprintFleetToken("beta"));
  });
});

describe("lanFleetTokenProof", () => {
  const binding = {
    requesterOwnerId: "envoy:owner:other",
    requesterDeviceId: "envoy:device:other",
    requestId: "req-1",
  };

  it("creates a v1 prefix proof and verifies", () => {
    const proof = createLanFleetTokenProof("fleet-secret-1", binding);
    expect(proof.startsWith("v1.")).toBe(true);
    expect(verifyLanFleetTokenProof("fleet-secret-1", proof, binding)).toBe(true);
    // Never contains the raw token.
    expect(proof).not.toContain("fleet-secret-1");
  });

  it("fails for a different token", () => {
    const proof = createLanFleetTokenProof("fleet-secret-1", binding);
    expect(verifyLanFleetTokenProof("other-token", proof, binding)).toBe(false);
  });

  it("fails when replayed against a different requester (binding)", () => {
    const proof = createLanFleetTokenProof("fleet-secret-1", binding);
    const replayed = verifyLanFleetTokenProof("fleet-secret-1", proof, {
      requesterOwnerId: "envoy:owner:attacker",
      requesterDeviceId: "envoy:device:attacker",
      requestId: binding.requestId,
    });
    expect(replayed).toBe(false);
  });

  it("fails when replayed with a different requestId", () => {
    const proof = createLanFleetTokenProof("fleet-secret-1", binding);
    expect(
      verifyLanFleetTokenProof("fleet-secret-1", proof, { ...binding, requestId: "req-2" }),
    ).toBe(false);
  });

  it("binding is stable for the same identity", () => {
    expect(lanFleetProofBinding(binding)).toBe(lanFleetProofBinding(binding));
  });
});

describe("buildLanAutoBondRequest", () => {
  it("refuses when lanAutoBondEnabled is off", async () => {
    const deps = baseDeps();
    const result = await buildLanAutoBondRequest(deps, "peer-1");
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });

  it("builds an open-LAN payload when enabled with no token", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        // no token
      }),
    });
    const result = await buildLanAutoBondRequest(deps, "peer-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.lanFleetToken).toBeUndefined();
    expect(result.payload.note).toBe(LAN_AUTO_BOND_NOTE);
    expect(result.fingerprint).toBe(OPEN_LAN_FINGERPRINT);
  });

  it("refuses self-targeting", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const result = await buildLanAutoBondRequest(deps, "envoy:owner:self");
    expect(result).toEqual({ ok: false, reason: "self-target" });
  });

  it("returns a payload with an HMAC token proof (never the raw token) when enabled and configured", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const result = await buildLanAutoBondRequest(deps, "peer-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Raw token must never be placed on the wire.
    expect(result.payload.lanFleetToken).toBeUndefined();
    expect(result.payload.lanFleetTokenProof).toBeDefined();
    expect(result.payload.lanFleetTokenProof!.startsWith("v1.")).toBe(true);
    expect(result.payload.lanFleetTokenProof).not.toContain("fleet-secret-1");
    expect(result.fingerprint).toBe(fingerprintFleetToken("fleet-secret-1"));
    // Proof verifies against the requester identity bound in the payload.
    expect(
      verifyLanFleetTokenProof(
        "fleet-secret-1",
        result.payload.lanFleetTokenProof!,
        {
          requesterOwnerId: result.payload.requesterOwnerId,
          requesterDeviceId: result.payload.requesterDeviceId,
          requestId: result.payload.requestId,
        },
      ),
    ).toBe(true);
  });
});

describe("sendLanAutoBondRequest", () => {
  it("is a no-op when the runtime says no (disabled)", async () => {
    const sendPairRequest = vi.fn();
    const deps = baseDeps({ sendPairRequest });
    const result = await sendLanAutoBondRequest(deps, "peer-1");
    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(sendPairRequest).not.toHaveBeenCalled();
  });

  it("emits a 'message.sent' audit event on success", async () => {
    const sendPairRequest = vi.fn().mockResolvedValue({ ok: true });
    const deps = baseDeps({
      sendPairRequest,
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const result = await sendLanAutoBondRequest(deps, "peer-1");
    expect(result.ok).toBe(true);
    expect(sendPairRequest).toHaveBeenCalledTimes(1);
    const events = await taskStore.readAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("message.sent");
    expect(events[0]?.summary).toContain("lan-auto:");
    expect(events[0]?.summary).toContain("fleetTokenFingerprint=");
  });

  it("emits a denied audit on transport failure", async () => {
    const sendPairRequest = vi.fn().mockResolvedValue({ ok: false, error: "dial timeout" });
    const deps = baseDeps({
      sendPairRequest,
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const result = await sendLanAutoBondRequest(deps, "peer-1");
    expect(result.ok).toBe(false);
    const events = await taskStore.readAuditEvents();
    expect(events[0]?.type).toBe("message.sent");
    expect(events[0]?.outcome).toBe("deny");
    expect(events[0]?.summary).toContain("dial timeout");
  });
});

describe("evaluateLanAutoBondReceipt", () => {
  function makeEnvelope(
    token: string | undefined,
    note?: string,
  ): { payload: unknown } {
    const payload: Partial<DevicePairRequestPayload> = {
      requestId: "req-1",
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterDevicePublicKeyPem: "pem",
      createdAt: new Date().toISOString(),
      lanFleetToken: token,
      note,
    };
    return { payload };
  }

  function makeProofEnvelope(token: string, note = LAN_AUTO_BOND_NOTE): { payload: unknown } {
    const payload: Partial<DevicePairRequestPayload> = {
      requestId: "req-proof",
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterDevicePublicKeyPem: "pem",
      createdAt: new Date().toISOString(),
      lanFleetTokenProof: createLanFleetTokenProof(token, {
        requesterOwnerId: "envoy:owner:other",
        requesterDeviceId: "envoy:device:other",
        requestId: "req-proof",
      }),
      note,
    };
    return { payload };
  }

  it("rejects an ordinary envelope without a token or lan-auto note", async () => {
    const deps = baseDeps();
    const decision = await evaluateLanAutoBondReceipt(deps, makeEnvelope(undefined));
    expect(decision).toEqual({ accept: false, reason: "no-token-on-envelope" });
  });

  it("rejects when local feature is off", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: false,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(deps, makeEnvelope("fleet-secret-1"));
    expect(decision).toEqual({ accept: false, reason: "disabled" });
  });

  it("rejects when local has no token but remote sent one", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(deps, makeEnvelope("fleet-secret-1"));
    expect(decision).toEqual({ accept: false, reason: "no-local-token" });
  });

  it("rejects open remote when local has a token", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(
      deps,
      makeEnvelope(undefined, LAN_AUTO_BOND_NOTE),
    );
    expect(decision).toEqual({ accept: false, reason: "open-mode-mismatch" });
  });

  it("accepts open LAN when both sides have no token", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(
      deps,
      makeEnvelope(undefined, LAN_AUTO_BOND_NOTE),
    );
    expect(decision.accept).toBe(true);
    expect(decision.reason).toBe("matched-open-lan");
    expect(decision.fingerprint).toBe(OPEN_LAN_FINGERPRINT);
    // Open LAN must never grant direct — limited referred tier.
    expect(decision.bondLevel).toBe("referred");
  });

  it("accepts a matching HMAC proof as a tokened direct bond", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(deps, makeProofEnvelope("fleet-secret-1"));
    expect(decision.accept).toBe(true);
    expect(decision.reason).toBe("matched-fleet-token");
    expect(decision.bondLevel).toBe("direct");
    expect(decision.fingerprint).toBe(fingerprintFleetToken("fleet-secret-1"));
  });

  it("rejects a proof made with a different token", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(deps, makeProofEnvelope("wrong-token"));
    expect(decision.accept).toBe(false);
    expect(decision.reason).toBe("token-mismatch");
  });

  it("rejects a proof bound to a different requester (replay protection)", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const payload: Partial<DevicePairRequestPayload> = {
      requestId: "req-proof",
      requesterOwnerId: "envoy:owner:attacker",
      requesterDeviceId: "envoy:device:attacker",
      requesterDevicePublicKeyPem: "pem",
      createdAt: new Date().toISOString(),
      lanFleetTokenProof: createLanFleetTokenProof("fleet-secret-1", {
        requesterOwnerId: "envoy:owner:other",
        requesterDeviceId: "envoy:device:other",
        requestId: "req-proof",
      }),
      note: LAN_AUTO_BOND_NOTE,
    };
    const decision = await evaluateLanAutoBondReceipt(deps, { payload });
    expect(decision.accept).toBe(false);
    expect(decision.reason).toBe("token-mismatch");
  });

  it("rejects on token mismatch", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(deps, makeEnvelope("different-token"));
    expect(decision.accept).toBe(false);
    expect(decision.reason).toBe("token-mismatch");
  });

  it("rejects self-targeting (requesterOwnerId matches own owner)", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
      getOwnOwnerId: () => "envoy:owner:self",
    });
    const selfEnvelope: { payload: unknown } = {
      payload: {
        requestId: "req-1",
        requesterOwnerId: "envoy:owner:self",
        requesterDeviceId: "envoy:device:1",
        requesterDevicePublicKeyPem: "pem",
        createdAt: new Date().toISOString(),
        lanFleetToken: "fleet-secret-1",
      },
    };
    const decision = await evaluateLanAutoBondReceipt(deps, selfEnvelope);
    expect(decision).toEqual({ accept: false, reason: "self-target" });
  });

  it("accepts on matching token (legacy plaintext interop)", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(deps, makeEnvelope("fleet-secret-1"));
    expect(decision.accept).toBe(true);
    expect(decision.reason).toBe("matched-fleet-token");
    expect(decision.fingerprint).toBe(fingerprintFleetToken("fleet-secret-1"));
    expect(decision.bondLevel).toBe("direct");
  });
});

describe("applyLanAutoBondAccept", () => {
  function trustStoreSpy() {
    return { setTrustRecord: vi.fn().mockResolvedValue(undefined) };
  }
  function peerDirSpy() {
    return { ensurePeerFromInboundChat: vi.fn().mockResolvedValue(undefined) };
  }
  it("writes a 'direct' trust record with the lan-auto-bond note", async () => {
    const deps = baseDeps();
    const trust = trustStoreSpy();
    const peer = peerDirSpy();
    await applyLanAutoBondAccept(deps, {
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterPeerId: "envoy:peer:other",
      fingerprint: "abc123",
      correlationId: "corr-1",
      messageId: "msg-1",
      trustStore: trust,
      peerDirectory: peer,
    });
    expect(trust.setTrustRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        peerOwnerId: "envoy:owner:other",
        level: "direct",
        note: "lan-auto-bond",
      }),
    );
  });

  it("registers the peer in the peer directory with the listen addr", async () => {
    const deps = baseDeps();
    const trust = trustStoreSpy();
    const peer = peerDirSpy();
    await applyLanAutoBondAccept(deps, {
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterPeerId: "envoy:peer:other",
      remoteAddr: "10.0.0.5:3030",
      fingerprint: "abc123",
      correlationId: "corr-1",
      messageId: "msg-1",
      trustStore: trust,
      peerDirectory: peer,
    });
    expect(peer.ensurePeerFromInboundChat).toHaveBeenCalledWith({
      ownerId: "envoy:owner:other",
      peerId: "envoy:peer:other",
      listenAddrs: ["10.0.0.5:3030"],
    });
  });

  it("writes a 'referred' trust record for open LAN bonds", async () => {
    const deps = baseDeps();
    const trust = trustStoreSpy();
    await applyLanAutoBondAccept(deps, {
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterPeerId: "envoy:peer:other",
      fingerprint: OPEN_LAN_FINGERPRINT,
      correlationId: "corr-1",
      messageId: "msg-1",
      bondLevel: "referred",
      allowAutoJoinAgentNetwork: false,
      trustStore: trust,
      peerDirectory: peerDirSpy(),
    });
    expect(trust.setTrustRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        peerOwnerId: "envoy:owner:other",
        level: "referred",
        displayName: "LAN peer",
      }),
    );
  });

  it("auto-joins Agent Network only for tokened fleet bonds (allowAutoJoinAgentNetwork)", async () => {
    const enableCapabilityProvider = vi.fn();
    const deps: LanAutoBondDeps = {
      ...baseDeps({
        loadConfig: async () => ({
          ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
          lanAutoBondEnabled: true,
          lanAutoBondFleetToken: "fleet-secret-1",
          lanAutoBondAutoJoinAgentNetwork: true,
          capabilityProviderEnabled: false,
        }),
      }),
      enableCapabilityProvider,
    };
    await applyLanAutoBondAccept(deps, {
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterPeerId: "envoy:peer:other",
      fingerprint: "fp-1",
      correlationId: "corr-1",
      messageId: "msg-1",
      bondLevel: "direct",
      allowAutoJoinAgentNetwork: true,
      trustStore: trustStoreSpy(),
      peerDirectory: peerDirSpy(),
    });
    expect(enableCapabilityProvider).toHaveBeenCalledTimes(1);
  });

  it("never auto-joins Agent Network for open-LAN / referred bonds", async () => {
    const enableCapabilityProvider = vi.fn();
    const deps: LanAutoBondDeps = {
      ...baseDeps({
        loadConfig: async () => ({
          ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
          lanAutoBondEnabled: true,
          capabilityProviderEnabled: false,
        }),
      }),
      enableCapabilityProvider,
    };
    await applyLanAutoBondAccept(deps, {
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterPeerId: "envoy:peer:other",
      fingerprint: OPEN_LAN_FINGERPRINT,
      correlationId: "corr-1",
      messageId: "msg-1",
      bondLevel: "referred",
      allowAutoJoinAgentNetwork: false,
      trustStore: trustStoreSpy(),
      peerDirectory: peerDirSpy(),
    });
    expect(enableCapabilityProvider).not.toHaveBeenCalled();
  });

  it("emits a 'message.verified' audit event with the fingerprint and never the raw token", async () => {
    const deps = baseDeps();
    await applyLanAutoBondAccept(deps, {
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterPeerId: "envoy:peer:other",
      fingerprint: "abc123",
      correlationId: "corr-1",
      messageId: "msg-1",
      trustStore: trustStoreSpy(),
      peerDirectory: peerDirSpy(),
    });
    const events = await taskStore.readAuditEvents();
    const accept = events.find((e) => e.type === "message.verified");
    expect(accept).toBeDefined();
    expect(accept?.summary).toContain("lan-auto:");
    expect(accept?.summary).toContain("fleetTokenFingerprint=abc123");
    expect(accept?.summary).not.toContain("fleet-secret"); // never log the raw token
  });

  it("logs a peer-directory failure but does not abort the trust-record write", async () => {
    const deps = baseDeps();
    const trust = trustStoreSpy();
    const peer = {
      ensurePeerFromInboundChat: vi.fn().mockRejectedValue(new Error("disk full")),
    };
    await applyLanAutoBondAccept(deps, {
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterPeerId: "envoy:peer:other",
      fingerprint: "abc123",
      correlationId: "corr-1",
      messageId: "msg-1",
      trustStore: trust,
      peerDirectory: peer,
    });
    expect(trust.setTrustRecord).toHaveBeenCalledTimes(1);
    const events = await taskStore.readAuditEvents();
    const fail = events.find((e) => e.type === "agent.card.auto_fetch_failed");
    expect(fail).toBeDefined();
    expect(fail?.summary).toContain("lan-auto: peer directory pre-fill failed");
  });
});

describe("handleLanAutoBondInbound", () => {
  function trustStoreSpy() {
    return { setTrustRecord: vi.fn().mockResolvedValue(undefined) };
  }

  it("accepts matching fleet token and writes trust (shared daemon/E2E path)", async () => {
    const { handleLanAutoBondInbound } = await import("../src/node-service-lan-auto-bond.js");
    const enableCapabilityProvider = vi.fn();
    const deps: LanAutoBondDeps = {
      ...baseDeps({
        loadConfig: async () => ({
          ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
          lanAutoBondEnabled: true,
          lanAutoBondFleetToken: "fleet-secret-1",
          lanAutoBondAutoJoinAgentNetwork: false,
        }),
      }),
      enableCapabilityProvider,
    };
    const trust = trustStoreSpy();
    const peer = { ensurePeerFromInboundChat: vi.fn().mockResolvedValue(undefined) };
    const payload = {
      requestId: "req-shared",
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterDevicePublicKeyPem: "pem",
      createdAt: new Date().toISOString(),
      // Current nodes send an HMAC proof — never the raw token.
      lanFleetTokenProof: createLanFleetTokenProof("fleet-secret-1", {
        requesterOwnerId: "envoy:owner:other",
        requesterDeviceId: "envoy:device:other",
        requestId: "req-shared",
      }),
    };
    let accepted = false;
    const result = await handleLanAutoBondInbound({
      deps,
      envelope: { payload, messageId: "msg-1", correlationId: "c-1" },
      remotePeerId: "12D3KooW-other",
      trustStore: trust,
      peerDirectory: peer,
      onAccepted: async () => {
        accepted = true;
      },
    });
    expect(result.outcome).toBe("accepted");
    expect(accepted).toBe(true);
    expect(trust.setTrustRecord).toHaveBeenCalledWith(
      expect.objectContaining({ peerOwnerId: "envoy:owner:other", level: "direct" }),
    );
    expect(enableCapabilityProvider).not.toHaveBeenCalled();
  });

  it("accepts open LAN with no token as a referred bond (no auto-join)", async () => {
    const { handleLanAutoBondInbound } = await import("../src/node-service-lan-auto-bond.js");
    const enableCapabilityProvider = vi.fn();
    const deps: LanAutoBondDeps = {
      ...baseDeps({
        loadConfig: async () => ({
          ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
          lanAutoBondEnabled: true,
          lanAutoBondAutoJoinAgentNetwork: true,
          capabilityProviderEnabled: false,
        }),
      }),
      enableCapabilityProvider,
    };
    const trust = trustStoreSpy();
    const peer = { ensurePeerFromInboundChat: vi.fn().mockResolvedValue(undefined) };
    const result = await handleLanAutoBondInbound({
      deps,
      envelope: {
        payload: {
          requestId: "req-open",
          requesterOwnerId: "envoy:owner:other",
          requesterDeviceId: "envoy:device:other",
          requesterDevicePublicKeyPem: "pem",
          createdAt: new Date().toISOString(),
          note: LAN_AUTO_BOND_NOTE,
        },
        messageId: "msg-open",
        correlationId: "c-open",
      },
      remotePeerId: "12D3KooW-other",
      trustStore: trust,
      peerDirectory: peer,
    });
    expect(result.outcome).toBe("accepted");
    if (result.outcome !== "accepted") return;
    expect(result.bondLevel).toBe("referred");
    expect(trust.setTrustRecord).toHaveBeenCalledWith(
      expect.objectContaining({ peerOwnerId: "envoy:owner:other", level: "referred" }),
    );
    // Open LAN must never auto-recruit a chain worker.
    expect(enableCapabilityProvider).not.toHaveBeenCalled();
  });

  it("returns not-applicable without logging path for tokenless pair requests", async () => {
    const { handleLanAutoBondInbound } = await import("../src/node-service-lan-auto-bond.js");
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: "fleet-secret-1",
      }),
    });
    const trust = trustStoreSpy();
    const peer = { ensurePeerFromInboundChat: vi.fn() };
    const result = await handleLanAutoBondInbound({
      deps,
      envelope: {
        payload: {
          requestId: "req-qr",
          requesterOwnerId: "envoy:owner:other",
          requesterDeviceId: "envoy:device:other",
          requesterDevicePublicKeyPem: "pem",
          createdAt: new Date().toISOString(),
        },
        messageId: "msg-qr",
      },
      remotePeerId: "12D3KooW-other",
      trustStore: trust,
      peerDirectory: peer,
    });
    expect(result.outcome).toBe("not-applicable");
    expect(trust.setTrustRecord).not.toHaveBeenCalled();
  });
});
