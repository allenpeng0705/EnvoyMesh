/**
 * Federated scoreboard broadcast tests (design §9.2, libp2p round-trip).
 *
 * Mirrors agent-adapter-broadcast.test.ts: the periodic broadcaster shares
 * the local scoreboard's latest `kept` entry per runtime over the mesh, and
 * cycles with nothing to share are skipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";
import { generateOwnerIdentity, signCanonicalPayload } from "@envoymesh/identity";
import type { AgentRuntime } from "@envoymesh/protocol";
import { createOutboundMeshMock } from "./helpers/outbound-mesh-mock.js";
import {
  buildScoreboardRuleEnvelope,
  sendScoreboardRuleToPeers,
  startScoreboardRuleBroadcaster,
} from "../src/scoreboard-rule-broadcast.js";
import {
  VerifierScoreboard,
  type VerifierScoreboardEntry,
} from "../src/verifier-scoreboard.js";

const OWNER = generateOwnerIdentity();
const agentKeyPair = generateKeyPairSync("ed25519");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "envoy-scoreboard-broadcast-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

function agentKeys() {
  return {
    agentPublicKeyPem: agentKeyPair.publicKey.export({ format: "pem", type: "spki" }).toString(),
    agentPrivateKeyPem: agentKeyPair.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
  };
}

function entry(overrides: Partial<VerifierScoreboardEntry> = {}): VerifierScoreboardEntry {
  const unsigned: Omit<VerifierScoreboardEntry, "ownerSignature"> = {
    version: 3,
    runtime: "openclaw",
    hypothesis: "enforce markdown summaries",
    rulesetHash: "ruleset_xyz",
    meanScore: 0.8,
    passRateBefore: 0.65,
    passRateAfter: 0.8,
    nRuns: 40,
    status: "kept",
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
  return {
    ...unsigned,
    ownerSignature: signCanonicalPayload(unsigned, OWNER.privateKeyPem),
  };
}

async function makeScoreboard(): Promise<VerifierScoreboard> {
  return new VerifierScoreboard({
    filePath: join(dir, "scoreboard.jsonl"),
    ownerPublicKeyPem: OWNER.publicKeyPem,
  });
}

function makeMesh() {
  const peerId = "12D3KooWScoreboardBroadcastPeer";
  const send = vi.fn().mockResolvedValue(0);
  const mesh = createOutboundMeshMock({
    send,
    getConnectedPeerIds: vi.fn().mockReturnValue([peerId]),
    getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    mergePeerStoreDialHints: vi.fn().mockResolvedValue(undefined),
  });
  return { peerId, send, mesh };
}

describe("buildScoreboardRuleEnvelope", () => {
  it("builds an agent-to-agent scoreboard.rule envelope", () => {
    const envelope = buildScoreboardRuleEnvelope({ ...agentKeys(), rule: entry() });

    expect(envelope.intent).toBe("scoreboard.rule");
    expect(envelope.senderRole).toBe("agent");
    expect(envelope.recipientRole).toBe("agent");
    expect(envelope.signature.length).toBeGreaterThan(0);
  });
});

describe("sendScoreboardRuleToPeers", () => {
  it("delivers the rule to reachable bonds and skips unresolvable owners", async () => {
    const { peerId, send, mesh } = makeMesh();
    const rule = { runtime: "openclaw", ruleVersion: 3 } as never;

    await sendScoreboardRuleToPeers({
      mesh,
      rule,
      ...agentKeys(),
      bondOwnerIds: ["owner-a", "owner-a", "owner-b"], // dedup + one unresolvable
      resolveLibp2pPeer: async (ownerId) =>
        ownerId === "owner-a" ? { peerId, listenAddrs: ["/ip4/127.0.0.1/tcp/4001"] } : undefined,
      dialHintsFor: async () => [],
    });

    expect(send).toHaveBeenCalledTimes(1);
    const envelope = send.mock.calls[0]?.[1] as { intent?: string; payload?: unknown };
    expect(envelope.intent).toBe("scoreboard.rule");
    expect((envelope.payload as { ruleVersion?: number }).ruleVersion).toBe(3);
  });
});

describe("startScoreboardRuleBroadcaster", () => {
  it("broadcasts a kept rule immediately and on the interval; stop() halts", async () => {
    const scoreboard = await makeScoreboard();
    await scoreboard.append(entry());
    const { peerId, send, mesh } = makeMesh();

    const broadcaster = startScoreboardRuleBroadcaster({
      mesh,
      scoreboard,
      runtimes: () => ["openclaw", "pi"] as AgentRuntime[],
      ownerPrivateKeyPem: OWNER.privateKeyPem,
      signerOwnerId: OWNER.ownerId,
      publisherPeerId: "envoy_agent_self",
      ...agentKeys(),
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
    const payload = send.mock.calls[0]?.[1] as { payload?: { ruleVersion?: number } };
    expect(payload.payload?.ruleVersion).toBe(3);

    broadcaster.stop();
    const callsAtStop = send.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(send.mock.calls.length).toBe(callsAtStop);
  });

  it("skips cycles when the scoreboard has no kept entry for the node's runtimes", async () => {
    const scoreboard = await makeScoreboard();
    await scoreboard.append(entry({ version: 4, status: "reverted" }));
    const { peerId, send, mesh } = makeMesh();

    const broadcaster = startScoreboardRuleBroadcaster({
      mesh,
      scoreboard,
      runtimes: () => ["openclaw"] as AgentRuntime[],
      ownerPrivateKeyPem: OWNER.privateKeyPem,
      signerOwnerId: OWNER.ownerId,
      publisherPeerId: "envoy_agent_self",
      ...agentKeys(),
      bondOwnerIds: async () => ["owner-a"],
      resolveLibp2pPeer: async () => ({ peerId }),
      dialHintsFor: async () => [],
      intervalMs: 20,
      onError: (err) => {
        throw err;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(send).not.toHaveBeenCalled();

    broadcaster.stop();
  });
});
