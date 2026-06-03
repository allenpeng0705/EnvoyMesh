/**
 * Agent Negotiation Worker (Phase 24A)
 *
 * When owner issues a task, broadcasts task.propose to matched capability
 * providers and manages the negotiation loop.
 */

import { randomUUID } from "node:crypto";

export interface AgentNegotiationDeps {
  /** Discover capability providers matching given tags. */
  discoverCapabilityProviders: (tags: string[]) => Promise<Array<{
    ownerId: string;
    peerId: string;
    capabilities: string[];
    bondLevel: string;
    reputationScore: number;
  }>>;
  /** Send a task.propose to a peer. Returns messageId or null on failure. */
  sendTaskPropose: (peerId: string, ownerId: string, objective: string, constraints?: Record<string, unknown>) => Promise<string | null>;
}

export interface NegotiationResult {
  ok: boolean;
  /** OwnerId of the accepting provider. */
  acceptedBy?: string;
  /** PeerId of the accepting provider (needed for envelope dispatch). */
  acceptedByPeerId?: string;
  providersContacted: number;
  correlationId: string;
  error?: string;
}

/**
 * Run a negotiation pass: find providers, send proposals, wait for acceptance.
 */
export async function runAgentNegotiation(
  deps: AgentNegotiationDeps,
  objective: string,
  capabilityTags: string[],
  opts?: { maxProviders?: number; minReputationScore?: number; allowUnbonded?: boolean },
): Promise<NegotiationResult> {
  const correlationId = randomUUID();
  const maxProviders = opts?.maxProviders ?? 3;
  const minReputationScore = opts?.minReputationScore ?? 0;
  const allowUnbonded = opts?.allowUnbonded ?? false;

  const providers = await deps.discoverCapabilityProviders(capabilityTags);

  // Filter and rank providers
  const eligible = providers
    .filter((p) => allowUnbonded || p.bondLevel === "direct" || p.bondLevel === "referred")
    .filter((p) => p.reputationScore >= minReputationScore)
    .sort((a, b) => b.reputationScore - a.reputationScore)
    .slice(0, maxProviders);

  if (eligible.length === 0) {
    return { ok: false, providersContacted: 0, correlationId, error: "No eligible providers found" };
  }

  let acceptedBy: string | undefined;
  let acceptedByPeerId: string | undefined;

  for (const provider of eligible) {
    const messageId = await deps.sendTaskPropose(provider.peerId, provider.ownerId, objective, {
      correlationId,
      capabilityTags,
    });

    if (messageId) {
      acceptedBy = provider.ownerId;
      acceptedByPeerId = provider.peerId;
      break; // First acceptance wins
    }
  }

  return {
    ok: !!acceptedBy,
    acceptedBy,
    acceptedByPeerId,
    providersContacted: eligible.length,
    correlationId,
  };
}
