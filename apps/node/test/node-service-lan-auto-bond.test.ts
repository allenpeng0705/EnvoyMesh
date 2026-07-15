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
  evaluateLanAutoBondReceipt,
  fingerprintFleetToken,
  sendLanAutoBondRequest,
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

describe("buildLanAutoBondRequest", () => {
  it("refuses when lanAutoBondEnabled is off", async () => {
    const deps = baseDeps();
    const result = await buildLanAutoBondRequest(deps, "peer-1");
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });

  it("refuses when no token is configured", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
        // no token
      }),
    });
    const result = await buildLanAutoBondRequest(deps, "peer-1");
    expect(result).toEqual({ ok: false, reason: "no-token" });
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

  it("returns a payload with the fleet token when enabled and configured", async () => {
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
    expect(result.payload.lanFleetToken).toBe("fleet-secret-1");
    expect(result.fingerprint).toBe(fingerprintFleetToken("fleet-secret-1"));
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
  function makeEnvelope(token: string | undefined): { payload: unknown } {
    const payload: Partial<DevicePairRequestPayload> = {
      requestId: "req-1",
      requesterOwnerId: "envoy:owner:other",
      requesterDeviceId: "envoy:device:other",
      requesterDevicePublicKeyPem: "pem",
      createdAt: new Date().toISOString(),
      lanFleetToken: token,
    };
    return { payload };
  }

  it("rejects an envelope without a token", async () => {
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

  it("rejects when local has no token", async () => {
    const deps = baseDeps({
      loadConfig: async () => ({
        ...((await baseDeps().loadConfig()) as PersistedNodeConfig),
        lanAutoBondEnabled: true,
      }),
    });
    const decision = await evaluateLanAutoBondReceipt(deps, makeEnvelope("fleet-secret-1"));
    expect(decision).toEqual({ accept: false, reason: "no-local-token" });
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

  it("accepts on matching token", async () => {
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
