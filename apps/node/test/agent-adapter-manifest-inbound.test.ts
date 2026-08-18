/**
 * Inbound `adapter.manifest` handler tests (Sprint 3).
 */
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { derivePeerId, generateOwnerIdentity, signCanonicalPayload } from "@envoymesh/identity";
import type { EnvoyEnvelope, SignedCapabilityManifest } from "@envoymesh/protocol";
import {
  handleInboundCapabilityManifest,
  isManifestFresh,
  pruneExpiredManifests,
} from "../src/agent-adapter-manifest-inbound.js";

function makeOwner() {
  return generateOwnerIdentity();
}

function makeManifest(
  owner: ReturnType<typeof generateOwnerIdentity>,
  overrides?: Partial<SignedCapabilityManifest>,
): SignedCapabilityManifest {
  const unsigned = {
    runtime: "openclaw" as const,
    runtimeVersion: "test",
    peerId: "envoy_agent_peer",
    ownerId: owner.ownerId,
    skills: [
      {
        skillId: "research",
        description: "research skill",
        maxSensitivity: "public" as const,
        tags: [],
      },
    ],
    reputationBySkill: {},
    issuedAt: new Date().toISOString(),
    ttlSeconds: 300,
    ...overrides,
  };
  return {
    ...unsigned,
    signature: signCanonicalPayload(unsigned, owner.privateKeyPem),
  };
}

function makeEnvelope(
  manifest: SignedCapabilityManifest,
  senderPeerId = manifest.peerId,
): EnvoyEnvelope {
  return {
    intent: "adapter.manifest",
    messageId: "msg_1",
    senderPeerId,
    senderPublicKey: "unused",
    senderRole: "agent",
    recipientRole: "agent",
    createdAt: new Date().toISOString(),
    payload: manifest,
    signature: "unused",
  } as unknown as EnvoyEnvelope;
}

describe("isManifestFresh", () => {
  it("accepts manifests inside their TTL and rejects expired ones", () => {
    const owner = makeOwner();
    const now = new Date("2026-08-18T00:00:00Z");
    const fresh = makeManifest(owner, { issuedAt: now.toISOString() });
    expect(isManifestFresh(fresh, now)).toBe(true);
    expect(isManifestFresh(fresh, new Date(now.getTime() + 300_000))).toBe(false);
    expect(isManifestFresh(fresh, new Date(now.getTime() + 299_000))).toBe(true);
  });
});

describe("pruneExpiredManifests", () => {
  it("removes only expired manifests and returns the purge count", () => {
    const owner = makeOwner();
    const now = new Date("2026-08-18T00:00:00Z");
    const fresh = makeManifest(owner, { issuedAt: now.toISOString() });
    const stale = makeManifest(owner, {
      peerId: "envoy_agent_stale",
      issuedAt: new Date(now.getTime() - 301_000).toISOString(),
    });
    const store = new Map<string, SignedCapabilityManifest>([
      ["envoy_agent_peer", fresh],
      ["envoy_agent_stale", stale],
    ]);

    const removed = pruneExpiredManifests(store, now);

    expect(removed).toBe(1);
    expect(store.has("envoy_agent_peer")).toBe(true);
    expect(store.has("envoy_agent_stale")).toBe(false);
  });

  it("keeps a store of only fresh manifests intact", () => {
    const owner = makeOwner();
    const now = new Date();
    const store = new Map<string, SignedCapabilityManifest>([
      ["envoy_agent_a", makeManifest(owner, { peerId: "envoy_agent_a" })],
      ["envoy_agent_b", makeManifest(owner, { peerId: "envoy_agent_b" })],
    ]);

    expect(pruneExpiredManifests(store, now)).toBe(0);
    expect(store.size).toBe(2);
  });

  it("purges expired manifests when a fresh one is stored (bounded store)", async () => {
    const owner = makeOwner();
    const stale = makeManifest(owner, {
      peerId: "envoy_agent_stale",
      issuedAt: new Date("2020-01-01T00:00:00Z").toISOString(),
    });
    const now = new Date("2026-08-18T00:00:00Z");
    const store = new Map<string, SignedCapabilityManifest>([["envoy_agent_stale", stale]]);

    const result = await handleInboundCapabilityManifest({
      envelope: makeEnvelope(makeManifest(owner, { peerId: "envoy_agent_fresh" }), "envoy_agent_fresh"),
      store,
      getOwnerPublicKey: async () => owner.publicKeyPem,
      now: () => now,
    });

    expect(result.handled).toBe(true);
    expect(store.has("envoy_agent_stale")).toBe(false);
    expect(store.has("envoy_agent_fresh")).toBe(true);
  });
});

describe("handleInboundCapabilityManifest", () => {
  it("stores a valid, owner-verified manifest", async () => {
    const owner = makeOwner();
    const manifest = makeManifest(owner);
    const store = new Map<string, SignedCapabilityManifest>();
    const result = await handleInboundCapabilityManifest({
      envelope: makeEnvelope(manifest),
      store,
      getOwnerPublicKey: async () => owner.publicKeyPem,
    });

    expect(result.handled).toBe(true);
    expect(store.get("envoy_agent_peer")).toEqual(manifest);
  });

  it("rejects when the manifest peerId does not match the envelope sender", async () => {
    const owner = makeOwner();
    const manifest = makeManifest(owner);
    const store = new Map<string, SignedCapabilityManifest>();
    const result = await handleInboundCapabilityManifest({
      envelope: makeEnvelope(manifest, "envoy_agent_other"),
      store,
      getOwnerPublicKey: async () => owner.publicKeyPem,
    });

    expect(result.handled).toBe(false);
    expect(store.size).toBe(0);
  });

  it("rejects when the owner public key is unknown (cannot verify)", async () => {
    const owner = makeOwner();
    const manifest = makeManifest(owner);
    const result = await handleInboundCapabilityManifest({
      envelope: makeEnvelope(manifest),
      store: new Map(),
      getOwnerPublicKey: async () => undefined,
    });

    expect(result.handled).toBe(false);
  });

  it("rejects when the owner signature fails to verify", async () => {
    const owner = makeOwner();
    const other = makeOwner();
    // Manifest signed by `owner`, but the verifier is presented with another
    // owner's public key → signature mismatch.
    const manifest = makeManifest(owner);
    const result = await handleInboundCapabilityManifest({
      envelope: makeEnvelope(manifest),
      store: new Map(),
      getOwnerPublicKey: async () => other.publicKeyPem,
    });

    expect(result.handled).toBe(false);
  });

  it("rejects expired manifests", async () => {
    const owner = makeOwner();
    const manifest = makeManifest(owner, {
      issuedAt: new Date("2020-01-01T00:00:00Z").toISOString(),
    });
    const result = await handleInboundCapabilityManifest({
      envelope: makeEnvelope(manifest),
      store: new Map(),
      getOwnerPublicKey: async () => owner.publicKeyPem,
      now: () => new Date("2026-08-18T00:00:00Z"),
    });

    expect(result.handled).toBe(false);
  });

  it("rejects non-manifest intents", async () => {
    const owner = makeOwner();
    const manifest = makeManifest(owner);
    const envelope = makeEnvelope(manifest);
    const result = await handleInboundCapabilityManifest({
      envelope: { ...envelope, intent: "chat.message" },
      store: new Map(),
      getOwnerPublicKey: async () => owner.publicKeyPem,
    });

    expect(result.handled).toBe(false);
  });

  it("rejects malformed payloads", async () => {
    const envelope = {
      intent: "adapter.manifest",
      messageId: "msg_1",
      senderPeerId: "envoy_agent_peer",
      senderPublicKey: "unused",
      senderRole: "agent",
      recipientRole: "agent",
      createdAt: new Date().toISOString(),
      payload: { not: "a manifest" },
      signature: "unused",
    } as unknown as EnvoyEnvelope;
    const result = await handleInboundCapabilityManifest({
      envelope,
      store: new Map(),
      getOwnerPublicKey: async () => "unused",
    });

    expect(result.handled).toBe(false);
  });
});
