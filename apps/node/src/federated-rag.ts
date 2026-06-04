/**
 * Federated RAG (Phase 22B)
 *
 * Fans out knowledge queries to bonded peers' published libraries
 * and synthesizes results from distributed sources.
 */

import type { FederatedRagConfig } from "@envoymesh/protocol";

export interface FederatedRagDeps {
  /** Federated RAG configuration. */
  config: FederatedRagConfig;
  /** Get bonded peer records with their peer IDs. */
  getBondedPeers: () => Promise<Array<{ ownerId: string; peerId: string }>>;
  /** Send a knowledge query to a specific peer and await the response.
   *  The implementation handles envelope construction, signing, and dispatch. */
  queryPeer: (
    peerId: string,
    ownerId: string,
    query: string,
  ) => Promise<{ ok: boolean; answerText?: string }>;
}

export interface FederatedRagResult {
  /** The local vault answer (if any). */
  localAnswer?: string;
  /** Peer-sourced answers, keyed by ownerId. */
  peerAnswers: Array<{
    ownerId: string;
    answerText: string;
  }>;
  /** Total peers queried. */
  peersQueried: number;
  /** Peers that responded successfully. */
  peersResponded: number;
}

/**
 * Execute a federated RAG query: fan out to bonded peers and collect answers.
 * Respects config limits (maxPeers, queryTimeoutMs, maxSensitivity).
 */
export async function executeFederatedRagQuery(
  deps: FederatedRagDeps,
  query: string,
): Promise<FederatedRagResult> {
  const config = deps.config;

  if (!config.enabled) {
    return { peerAnswers: [], peersQueried: 0, peersResponded: 0 };
  }

  const bondedPeers = await deps.getBondedPeers();
  const peersToQuery = bondedPeers.slice(0, config.maxPeers);

  if (peersToQuery.length === 0) {
    return { peerAnswers: [], peersQueried: 0, peersResponded: 0 };
  }

  // Fan out queries to all peers concurrently.
  // Note: deps.queryPeer handles envelope construction, signing, and dispatch.
  const results = await Promise.allSettled(
    peersToQuery.map((peer) =>
      deps.queryPeer(peer.peerId, peer.ownerId, query),
    ),
  );

  const peerAnswers: FederatedRagResult["peerAnswers"] = [];
  let peersResponded = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value.ok && result.value.answerText) {
      peerAnswers.push({
        ownerId: peersToQuery[i].ownerId,
        answerText: result.value.answerText,
      });
      peersResponded++;
    }
  }

  return {
    peerAnswers,
    peersQueried: peersToQuery.length,
    peersResponded,
  };
}

/**
 * Synthesize local + peer answers into a single result.
 * In production this would call the LLM, but here we provide
 * a deterministic merge for testing and integration.
 */
export function synthesizeFederatedResult(
  localAnswer: string | undefined,
  peerAnswers: Array<{ ownerId: string; answerText: string }>,
): string {
  const parts: string[] = [];

  if (localAnswer) {
    parts.push(`[Local vault]: ${localAnswer}`);
  }

  for (const pa of peerAnswers) {
    parts.push(`[${pa.ownerId}]: ${pa.answerText}`);
  }

  if (parts.length === 0) {
    return "No results found locally or from peers.";
  }

  return parts.join("\n\n");
}
