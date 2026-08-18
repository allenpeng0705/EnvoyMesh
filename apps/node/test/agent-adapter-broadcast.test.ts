/**
 * Agent-adapter manifest broadcast tests (Sprint 3).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  verifyCanonicalPayload,
} from "@envoymesh/identity";
import type { SkillDescriptor } from "@envoymesh/protocol";
import { createOutboundMeshMock } from "./helpers/outbound-mesh-mock.js";
import {
  buildManifestBroadcastEnvelope,
  buildSignedCapabilityManifest,
  sendCapabilityManifestToPeers,
  startManifestBroadcaster,
} from "../src/agent-adapter-broadcast.js";

const SAMPLE_SKILLS: SkillDescriptor[] = [
  {
    skillId: "research",
    description: "Summarize and research topics",
    maxSensitivity: "public",
    tags: [],
  },
  {
    skillId: "code_review",
    description: "Review code changes",
    maxSensitivity: "friends",
    tags: [],
  },
];

const agentKeyPair = generateKeyPairSync("ed25519");

function makeProfile() {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return { owner, device, deviceCertificate: undefined as never };
}

const REAL_ENV = { ...process.env };
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...REAL_ENV };
});

describe("buildSignedCapabilityManifest", () => {
  it("produces an owner-signed manifest that verifies against the owner public key", () => {
    const profile = makeProfile();
    const manifest = buildSignedCapabilityManifest({
      profile,
      agentPeerId: "envoy_agent_self",
      skills: SAMPLE_SKILLS,
      runtime: "openclaw",
      now: () => new Date("2026-08-18T00:00:00Z"),
    });

    expect(manifest.runtime).toBe("openclaw");
    expect(manifest.peerId).toBe("envoy_agent_self");
    expect(manifest.ownerId).toBe(profile.owner.ownerId);
    expect(manifest.skills).toHaveLength(2);
    expect(manifest.ttlSeconds).toBe(300);

    const { signature, ...unsigned } = manifest;
    expect(verifyCanonicalPayload(unsigned, signature, profile.owner.publicKeyPem)).toBe(true);
  });

  it("carries reputationBySkill when provided", () => {
    const profile = makeProfile();
    const manifest = buildSignedCapabilityManifest({
      profile,
      agentPeerId: "envoy_agent_self",
      skills: SAMPLE_SKILLS,
      reputationBySkill: { research: 0.9 },
    });
    expect(manifest.reputationBySkill).toEqual({ research: 0.9 });
  });
});

describe("buildManifestBroadcastEnvelope", () => {
  it("builds an adapter.manifest agent-to-agent envelope signed by the agent key", () => {
    const profile = makeProfile();
    const manifest = buildSignedCapabilityManifest({
      profile,
      agentPeerId: "envoy_agent_self",
      skills: SAMPLE_SKILLS,
    });
    const agentPublicKeyPem = agentKeyPair.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    const agentPrivateKeyPem = agentKeyPair.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();

    const envelope = buildManifestBroadcastEnvelope({
      agentPublicKeyPem,
      agentPrivateKeyPem,
      manifest,
    });

    expect(envelope.intent).toBe("adapter.manifest");
    expect(envelope.senderRole).toBe("agent");
    expect(envelope.recipientRole).toBe("agent");
    expect(envelope.senderPeerId).toBe(derivePeerId(agentPublicKeyPem));
    expect(envelope.signature.length).toBeGreaterThan(0);
    expect(envelope.payload).toEqual(manifest);
  });
});

describe("sendCapabilityManifestToPeers", () => {
  it("delivers the manifest to reachable bonds and skips unresolvable owners", async () => {
    const profile = makeProfile();
    const manifest = buildSignedCapabilityManifest({
      profile,
      agentPeerId: "envoy_agent_self",
      skills: SAMPLE_SKILLS,
    });
    const peerId = "12D3KooWManifestBroadcastPeer";
    const send = vi.fn().mockResolvedValue(0);
    const mesh = createOutboundMeshMock({
      send,
      getConnectedPeerIds: vi.fn().mockReturnValue([peerId]),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
      mergePeerStoreDialHints: vi.fn().mockResolvedValue(undefined),
    }) as Parameters<typeof sendCapabilityManifestToPeers>[0]["mesh"];

    const agentPublicKeyPem = agentKeyPair.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    const agentPrivateKeyPem = agentKeyPair.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();

    await sendCapabilityManifestToPeers({
      mesh,
      manifest,
      agentPublicKeyPem,
      agentPrivateKeyPem,
      bondOwnerIds: ["owner-a", "owner-a", "owner-b"], // dedup + one unresolvable
      resolveLibp2pPeer: async (ownerId) =>
        ownerId === "owner-a"
          ? { peerId, listenAddrs: ["/ip4/127.0.0.1/tcp/4001"] }
          : undefined,
      dialHintsFor: async () => [],
    });

    // owner-a delivered, owner-b unresolvable → skipped, owner-a deduped.
    expect(send).toHaveBeenCalledTimes(1);
    const envelope = send.mock.calls[0]?.[1] as { intent?: string; payload?: unknown };
    expect(envelope.intent).toBe("adapter.manifest");
    expect((envelope.payload as { peerId?: string }).peerId).toBe("envoy_agent_self");
  });
});

describe("startManifestBroadcaster", () => {
  it("broadcasts immediately, then on the interval, and stop() halts", async () => {
    const profile = makeProfile();
    const manifest = buildSignedCapabilityManifest({
      profile,
      agentPeerId: "envoy_agent_self",
      skills: SAMPLE_SKILLS,
    });
    const peerId = "12D3KooWManifestBroadcastPeer";
    const send = vi.fn().mockResolvedValue(0);
    const mesh = createOutboundMeshMock({
      send,
      getConnectedPeerIds: vi.fn().mockReturnValue([peerId]),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
      mergePeerStoreDialHints: vi.fn().mockResolvedValue(undefined),
    }) as Parameters<typeof sendCapabilityManifestToPeers>[0]["mesh"];

    const broadcaster = startManifestBroadcaster({
      mesh,
      manifest,
      agentPublicKeyPem: agentKeyPair.publicKey.export({ format: "pem", type: "spki" }).toString(),
      agentPrivateKeyPem: agentKeyPair.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      bondOwnerIds: async () => ["owner-a"],
      resolveLibp2pPeer: async () => ({ peerId }),
      dialHintsFor: async () => [],
      intervalMs: 20,
      onError: (err) => {
        throw err;
      },
    });

    // Immediate broadcast + at least one interval tick.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(2);

    broadcaster.stop();
    const callsAtStop = send.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(send.mock.calls.length).toBe(callsAtStop);
  });
});
