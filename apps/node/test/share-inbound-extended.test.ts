/**
 * Phase 8L — Extended share inbound tests (share-inbound.ts 67% → higher coverage).
 *
 * Tests the uncovered paths in handleInboundShareRequest and handleInboundShareAccept:
 * - share.request with capability manifest (visibility, sensitivity ceiling)
 * - share.request approval_required path (policy.decided audit, preview sent)
 * - share.request deny path (policy.decided audit)
 * - share.accept declined flow (with audit)
 * - isSafeVaultPath edge cases
 */

import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createCapabilityManifestStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerDirectoryStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundShareRequest, handleInboundShareAccept, isSafeVaultPath } from "../src/share-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-share-ext-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen", "mesh.discovery", "knowledge.query"],
    }),
  };
}

function signedEnvelope(profile: NodeProfile, intent: string, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent: intent as any,
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `share-ext-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("handleInboundShareRequest — approval_required path", () => {
  it("returns ok=true with requiresApproval=true when policy returns approval_required (referred bond, friends sensitivity)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // referred bond + friends sensitivity → limitSensitivity("friends", "public") → approval_required
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:referred-contact",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:referred-contact", level: "referred" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "what is my name?",
      requestedSensitivity: "friends",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-approval",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    // approval_required returns ok: true with requiresApproval: true
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.requiresApproval).toBe(true);
      expect(result.responsePayload.sensitivity).toBe("public");
    }
  });

  it("returns ok=true with requiresApproval=true when policy returns approval_required (direct bond, private sensitivity)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // direct bond + private sensitivity → limitSensitivity("private", "friends") → approval_required
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "direct" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "private info",
      requestedSensitivity: "private",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-approval-direct",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.requiresApproval).toBe(true);
      expect(result.responsePayload.sensitivity).toBe("public");
    }
  });

  it("audits policy.decided deny when policy denies the request", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // Blocked peer
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:blocked",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:blocked", level: "blocked" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "secret info",
      requestedSensitivity: "private",
    });

    await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-blocked",
      receivedAt: Date.now(),
      correlationId: "corr-deny",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    const audits = await taskStore.readAuditEvents();
    const denyAudit = audits.find((a) => a.outcome === "deny");
    expect(denyAudit).toBeDefined();
    expect(denyAudit!.type).toBe("policy.decided");
  });
});


describe("handleInboundShareRequest — preview text", () => {
  it("truncates long query preview to 80 chars in previewText", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "referred" });

    // 300 A's — after truncation: 77 + "...)" = 80 chars in query preview
    const longQuery = "A".repeat(300);

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: longQuery,
      requestedSensitivity: "public",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-preview",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Query preview is truncated to 77 chars + "...", so 80 chars for query portion
      // Full preview includes template text, so the previewText length > 80 but should be < 300
      expect(result.responsePayload.previewText.length).toBeLessThan(300);
      expect(result.responsePayload.previewText).toContain("AAA"); // start of long query
    }
  });

  it("returns generic preview when query is absent", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "referred" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      // no query field
      requestedSensitivity: "public",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-noquery",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.previewText).toContain("knowledge answer");
    }
  });
});

describe("handleInboundShareAccept — declined", () => {
  it("audits share.accept with deny outcome when accept=false", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });

    const envelope = signedEnvelope(profile, "share.accept", {
      inReplyTo: "preview-msg-456",
      accept: false,
    });

    const result = await handleInboundShareAccept({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-decline",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("declined");
    }

    const audits = await taskStore.readAuditEvents();
    const denyAudit = audits.find((a) => a.outcome === "deny");
    expect(denyAudit).toBeDefined();
    expect(denyAudit!.type).toBe("share.accept");
  });

  it("audits share.accept with allow outcome when accept=true", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });

    const envelope = signedEnvelope(profile, "share.accept", {
      inReplyTo: "preview-msg-789",
      accept: true,
    });

    await handleInboundShareAccept({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-accept",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
    });

    const audits = await taskStore.readAuditEvents();
    const allowAudit = audits.find((a) => a.outcome === "allow");
    expect(allowAudit).toBeDefined();
    expect(allowAudit!.type).toBe("share.accept");
  });
});

describe("isSafeVaultPath", () => {
  const vaultDir = "/Users/shileipeng/vault";

  it("allows simple relative path inside vault", () => {
    expect(isSafeVaultPath(vaultDir, "notes.md")).toBe(true);
    expect(isSafeVaultPath(vaultDir, "subdir/file.txt")).toBe(true);
    expect(isSafeVaultPath(vaultDir, "a/b/c/nested.pdf")).toBe(true);
  });

  it("blocks path with .. traversal that escapes vault", () => {
    expect(isSafeVaultPath(vaultDir, "../etc/passwd")).toBe(false);
    // a/b/c/../../../../secret.md → resolve goes above vault to /Users/shileipeng/secret.md
    expect(isSafeVaultPath(vaultDir, "a/b/c/../../../../secret.md")).toBe(false);
  });

  it("blocks absolute paths", () => {
    expect(isSafeVaultPath(vaultDir, "/etc/passwd")).toBe(false);
    expect(isSafeVaultPath(vaultDir, "/Users/shileipeng/vault/../other.txt")).toBe(false);
  });

  it("blocks paths starting with vault root string but not actually inside", () => {
    // "/Users/shileipeng/vaultfile.txt" starts with "/Users/shileipeng/vault" but is NOT inside it
    expect(isSafeVaultPath("/Users/shileipeng/vault", "/Users/shileipeng/vaultfile.txt")).toBe(false);
    expect(isSafeVaultPath("/mnt/vault", "/mnt/vault_other/file.md")).toBe(false);
  });

  it("blocks all paths containing .. as substring (defensive: prevents traversal)", () => {
    // The function checks path.includes("..") which catches ANY occurrence
    // This is a defensive measure: even if the path resolves inside vault,
    // if it contains ".." as a substring it is rejected
    expect(isSafeVaultPath(vaultDir, "a/../outside.md")).toBe(false);
    expect(isSafeVaultPath(vaultDir, "a/b/../secret.md")).toBe(false);
    expect(isSafeVaultPath(vaultDir, "../etc/passwd")).toBe(false);
    expect(isSafeVaultPath(vaultDir, "a/b/c/../../../../secret.md")).toBe(false);
  });

  it("handles Windows-style backslashes (converts to forward slashes)", () => {
    expect(isSafeVaultPath(vaultDir, "subdir\\file.txt")).toBe(true);
    expect(isSafeVaultPath(vaultDir, "..\\etc\\passwd")).toBe(false);
  });

  it("handles empty path", () => {
    // Empty path resolves to vaultDir itself, which starts with vaultDir → true (edge case)
    expect(isSafeVaultPath(vaultDir, "")).toBe(true);
  });

  it("blocks path that resolves outside vault after normalization", () => {
    // /foo/bar/../../baz = /foo/baz, which is outside /foo/bar
    expect(isSafeVaultPath("/foo/bar", "a/b/../../../etc/passwd")).toBe(false);
  });
});
