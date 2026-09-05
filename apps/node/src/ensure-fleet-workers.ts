/**
 * Phase 66B — one-click ensure Join + lease publish for fleet workers.
 *
 * Local: turn Join on, start lease broadcaster, publishNow.
 * Peers: bonded direct/referred only (strangers stay out); refresh cards;
 * best-effort `agent.worker.lease.request` so peers republish leases.
 */

import { randomUUID } from "node:crypto";
import {
  createAgentWorkerLeaseRequestPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { signUnsignedEnvelope } from "@envoymesh/identity";

export type EnsureFleetWorkersParams = {
  /** Target bonded owner ids. Empty/omit → all direct|referred bonds. */
  ownerIds?: string[];
};

export type EnsureFleetWorkersPeerResult = {
  ownerId: string;
  displayName?: string;
  ok: boolean;
  actions: Array<
    | "join_local"
    | "lease_published_local"
    | "card_refresh"
    | "lease_request_sent"
    | "skipped_blocked"
    | "skipped_public"
    | "skipped_self"
  >;
  reason?: string;
};

export type EnsureFleetWorkersResult = {
  localJoinEnabled: boolean;
  localLeasePublished: boolean;
  peers: EnsureFleetWorkersPeerResult[];
};

export type EnsureFleetWorkersBond = {
  peerOwnerId: string;
  displayName?: string;
  level: string;
};

export type EnsureFleetWorkersDeps = {
  getOwnOwnerId(): string | undefined;
  getNodeConfig(): Promise<{ capabilityProviderEnabled?: boolean }>;
  enableJoin(): Promise<void>;
  ensureLeaseBroadcaster(): Promise<{ publishNow: () => Promise<void> } | undefined>;
  refreshAgentNetworkWorkers(): Promise<{ requested: number; failed: number }>;
  getBonds(): Promise<EnsureFleetWorkersBond[]>;
  ensureAgentIdentity(): Promise<{
    agentPeerId: string;
    agentPublicKeyPem: string;
    agentPrivateKeyPem: string;
  } | null>;
  resolveLibp2pPeer(ownerId: string): Promise<
    | { peerId: string; listenAddrs?: string[] }
    | undefined
  >;
  dialHintsFor(peerId: string, listenAddrs?: string[]): Promise<string[] | undefined> | string[] | undefined;
  sendEnvelope(input: {
    transportPeerId: string;
    envelope: ReturnType<typeof signUnsignedEnvelope>;
    dialHints: string[];
  }): Promise<void>;
};

/**
 * Pure orchestration for fleet ensure — unit-testable without NodeServiceImpl.
 */
export async function ensureFleetWorkersReadyViaRuntime(
  deps: EnsureFleetWorkersDeps,
  params: EnsureFleetWorkersParams = {},
): Promise<EnsureFleetWorkersResult> {
  const peers: EnsureFleetWorkersPeerResult[] = [];
  let localJoinEnabled = false;
  let localLeasePublished = false;

  const cfg = await deps.getNodeConfig();
  if (cfg.capabilityProviderEnabled !== true) {
    await deps.enableJoin();
    localJoinEnabled = true;
    peers.push({
      ownerId: deps.getOwnOwnerId() ?? "local",
      ok: true,
      actions: ["join_local"],
    });
  } else {
    localJoinEnabled = true;
  }

  const broadcaster = await deps.ensureLeaseBroadcaster();
  if (broadcaster) {
    await broadcaster.publishNow();
    localLeasePublished = true;
  }

  await deps.refreshAgentNetworkWorkers();

  const ownOwnerId = deps.getOwnOwnerId();
  const bonds = await deps.getBonds();
  const wanted = new Set(
    (params.ownerIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  const targets = bonds.filter((b) => {
    if (ownOwnerId && b.peerOwnerId === ownOwnerId) return false;
    if (wanted.size > 0 && !wanted.has(b.peerOwnerId)) return false;
    return true;
  });

  const agentIdentity = await deps.ensureAgentIdentity();

  for (const bond of targets) {
    const row: EnsureFleetWorkersPeerResult = {
      ownerId: bond.peerOwnerId,
      displayName: bond.displayName,
      ok: false,
      actions: ["card_refresh"],
    };
    if (bond.level === "blocked") {
      row.reason = "blocked";
      row.actions = ["skipped_blocked"];
      peers.push(row);
      continue;
    }
    if (bond.level === "public") {
      row.reason = "public_bond";
      row.actions = ["skipped_public"];
      peers.push(row);
      continue;
    }
    if (bond.level !== "direct" && bond.level !== "referred") {
      row.reason = `unsupported_bond_${bond.level}`;
      row.actions = ["skipped_public"];
      peers.push(row);
      continue;
    }

    if (!agentIdentity) {
      row.reason = "no_agent_identity";
      peers.push(row);
      continue;
    }

    try {
      const resolved = await deps.resolveLibp2pPeer(bond.peerOwnerId);
      if (!resolved?.peerId) {
        row.reason = "peer_unresolved";
        peers.push(row);
        continue;
      }
      const payload = createAgentWorkerLeaseRequestPayload({
        requestId: `fleet_lease_req_${randomUUID()}`,
        requestedAt: new Date().toISOString(),
      });
      const unsigned = createUnsignedEnvelope({
        senderPeerId: agentIdentity.agentPeerId,
        senderPublicKey: agentIdentity.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: resolved.peerId,
        recipientRole: "agent",
        intent: "agent.worker.lease.request",
        payload,
      });
      const envelope = signUnsignedEnvelope(unsigned, agentIdentity.agentPrivateKeyPem);
      const hintsRaw = await deps.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      const dialHints = Array.isArray(hintsRaw) ? hintsRaw : [];
      await deps.sendEnvelope({
        transportPeerId: resolved.peerId,
        envelope,
        dialHints,
      });
      row.ok = true;
      row.actions.push("lease_request_sent");
      if (localLeasePublished) row.actions.push("lease_published_local");
    } catch (err) {
      row.reason = err instanceof Error ? err.message : String(err);
    }
    peers.push(row);
  }

  return { localJoinEnabled, localLeasePublished, peers };
}
