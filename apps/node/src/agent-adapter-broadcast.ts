/**
 * Agent-adapter manifest broadcast (Sprint 3, first cut).
 *
 * Periodically pushes the node's owner-signed `SignedCapabilityManifest` to
 * bonded peers over the existing envelope transport (`adapter.manifest`
 * intent, agent→agent), so the mesh learns what runtimes/skills each node
 * can run *from the wire* instead of synthesizing it from local cards.
 *
 * This is the "wire-broadcast manifests land" step that activates the
 * manifest-carrying worker pool (`findWorkersWithManifests` /
 * `resolveWorkerPool` in chain-orchestrator.ts).
 *
 * Design doc: `docs/improving-agent-network.en.md` §3.1, §4.1, Sprint 1 Week 2-3.
 */

import {
  createUnsignedEnvelope,
  type AgentRuntime,
  type CapabilityManifest,
  type EnvoyEnvelope,
  type SignedCapabilityManifest,
  type SkillDescriptor,
} from "@envoymesh/protocol";
import { derivePeerId, signCanonicalPayload } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendEnvelopeWithRetry,
  type OutboundDeliverMesh,
} from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

/** Broadcast interval: manifest TTL / 2 (default 2.5 min for a 5-min TTL). */
export const MANIFEST_BROADCAST_INTERVAL_MS = 150_000;

export interface BuildSignedCapabilityManifestInput {
  profile: NodeProfile;
  /** The agent peerId (worker-pool identity, `envoy_agent_*`). */
  agentPeerId: string;
  /** Skills the node is willing to run. */
  skills: SkillDescriptor[];
  /** Past reputation per skill (from the 3-tuple book). */
  reputationBySkill?: Record<string, number>;
  /** Runtime this manifest describes. Defaults to `"openclaw"`. */
  runtime?: AgentRuntime;
  runtimeVersion?: string;
  now?: () => Date;
  ttlSeconds?: number;
}

/**
 * Build the node's owner-signed capability manifest.
 *
 * Per design §4.1 the signature is the owner's Ed25519 key (not the agent's),
 * so a compromised adapter cannot advertise capabilities on a node it does
 * not own. The receiver verifies against the owner public key from the
 * contact key store.
 */
export function buildSignedCapabilityManifest(
  input: BuildSignedCapabilityManifestInput,
): SignedCapabilityManifest {
  const now = input.now ?? (() => new Date());
  const unsigned: CapabilityManifest = {
    runtime: input.runtime ?? "openclaw",
    runtimeVersion: input.runtimeVersion ?? "mesh-broadcast",
    peerId: input.agentPeerId,
    ownerId: input.profile.owner.ownerId,
    skills: input.skills,
    reputationBySkill: input.reputationBySkill ?? {},
    issuedAt: now().toISOString(),
    ttlSeconds: input.ttlSeconds ?? 300,
  };
  const signature = signCanonicalPayload(unsigned, input.profile.owner.privateKeyPem);
  return { ...unsigned, signature };
}

export interface ManifestBroadcastMesh
  extends OutboundDeliverMesh,
    Pick<EnvoyMesh, "mergePeerStoreDialHints"> {}

export interface SendCapabilityManifestInput {
  mesh: ManifestBroadcastMesh;
  manifest: SignedCapabilityManifest;
  /** Agent key pair — signs the broadcast envelope (the node's wire identity). */
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  /** Bonded peers to notify (dedup by ownerId). */
  bondOwnerIds: string[];
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}

/** One agent-signed envelope reused for every bond (mirrors `sendProfileSyncToBonds`). */
export function buildManifestBroadcastEnvelope(input: {
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  manifest: SignedCapabilityManifest;
}): EnvoyEnvelope {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.agentPublicKeyPem),
    senderPublicKey: input.agentPublicKeyPem,
    senderRole: "agent",
    recipientRole: "agent",
    intent: "adapter.manifest",
    payload: input.manifest,
  });
  return {
    ...unsigned,
    signature: signCanonicalPayload(unsigned, input.agentPrivateKeyPem),
  };
}

export async function sendCapabilityManifestToPeers(
  input: SendCapabilityManifestInput,
): Promise<void> {
  const envelope = buildManifestBroadcastEnvelope({
    agentPublicKeyPem: input.agentPublicKeyPem,
    agentPrivateKeyPem: input.agentPrivateKeyPem,
    manifest: input.manifest,
  });
  const seenOwnerIds = new Set<string>();
  for (const ownerId of input.bondOwnerIds) {
    if (seenOwnerIds.has(ownerId)) continue;
    seenOwnerIds.add(ownerId);
    try {
      const resolved = await input.resolveLibp2pPeer(ownerId);
      if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
        continue;
      }
      let dialHints: string[] = [];
      try {
        dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      } catch {
        // Best-effort dial hints; sendEnvelopeWithRetry rebuilds on failure.
      }
      if (typeof input.mesh.mergePeerStoreDialHints === "function") {
        void Promise.resolve(
          input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints),
        ).catch(() => undefined);
      }
      await sendEnvelopeWithRetry({
        mesh: input.mesh,
        transportPeerId: resolved.peerId,
        envelope,
        dialHints,
        peerListenAddrs: resolved.listenAddrs,
        rebuildDialHints: () => input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
      });
    } catch {
      // A failed broadcast to one bond must not break the cycle.
    }
  }
}

export interface ManifestBroadcasterDeps {
  mesh: ManifestBroadcastMesh;
  manifest: SignedCapabilityManifest;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  bondOwnerIds: () => Promise<string[]>;
  resolveLibp2pPeer: SendCapabilityManifestInput["resolveLibp2pPeer"];
  dialHintsFor: SendCapabilityManifestInput["dialHintsFor"];
  intervalMs?: number;
  onError?: (err: unknown) => void;
}

/**
 * Start the periodic manifest broadcaster. Broadcasts every `intervalMs`
 * (default TTL/2). Returns `{ stop }`; `stop()` clears the timer and is
 * idempotent.
 */
export function startManifestBroadcaster(
  deps: ManifestBroadcasterDeps,
): { stop: () => void } {
  const intervalMs = deps.intervalMs ?? MANIFEST_BROADCAST_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | undefined;

  const run = async (): Promise<void> => {
    try {
      const bondOwnerIds = await deps.bondOwnerIds();
      if (bondOwnerIds.length === 0) return;
      await sendCapabilityManifestToPeers({
        mesh: deps.mesh,
        manifest: deps.manifest,
        agentPublicKeyPem: deps.agentPublicKeyPem,
        agentPrivateKeyPem: deps.agentPrivateKeyPem,
        bondOwnerIds,
        resolveLibp2pPeer: deps.resolveLibp2pPeer,
        dialHintsFor: deps.dialHintsFor,
      });
    } catch (err) {
      deps.onError?.(err);
    }
  };

  // Fire immediately so manifests land soon after startup, then on the interval.
  void run();
  timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
