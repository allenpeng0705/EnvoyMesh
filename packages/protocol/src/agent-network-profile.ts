/**
 * Agent Network worker profile — owner-attested traits used to rank peers
 * when selecting workers (direct-assign mode). Advertised on the Agent Card
 * only when Capability Provider / Join Agent Network is enabled.
 */

import { z } from "zod";

export const AgentNetworkContextWindowSchema = z.enum(["128k", "256k", "512k", "1M+"]);
export type AgentNetworkContextWindow = z.infer<typeof AgentNetworkContextWindowSchema>;

export const AgentNetworkSpendPostureSchema = z.enum(["subscription", "metered", "unknown"]);
export type AgentNetworkSpendPosture = z.infer<typeof AgentNetworkSpendPostureSchema>;

export const AgentNetworkProfileSchema = z.object({
  /** Owner-attested model freshness / modernity (1 = older, 10 = newest). */
  modelFreshness: z.number().int().min(1).max(10).default(5),
  /**
   * Spend posture: subscription (pooled / monthly-yearly) vs metered prepaid
   * usage. Prefer subscription for long chains that must not stop mid-task.
   */
  spendPosture: AgentNetworkSpendPostureSchema.default("unknown"),
  contextWindow: AgentNetworkContextWindowSchema.default("128k"),
  /** Free-form strength tags (e.g. research, coding, summarization, zh). */
  strengths: z.array(z.string().min(1).max(64)).max(16).default([]),
  /**
   * Owner-attested inference throughput (tokens/sec). Soft ranking hint —
   * not a measured probe until a later phase.
   */
  throughputTokensPerSec: z.number().nonnegative().max(1_000_000).optional(),
});

export type AgentNetworkProfile = z.infer<typeof AgentNetworkProfileSchema>;

export const DEFAULT_AGENT_NETWORK_PROFILE: AgentNetworkProfile = {
  modelFreshness: 5,
  spendPosture: "unknown",
  contextWindow: "128k",
  strengths: [],
};

export function parseAgentNetworkProfile(input: unknown): AgentNetworkProfile {
  return AgentNetworkProfileSchema.parse(input);
}

export function createAgentNetworkProfile(
  input: Partial<AgentNetworkProfile> = {},
): AgentNetworkProfile {
  return AgentNetworkProfileSchema.parse({
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input,
    strengths: input.strengths ?? DEFAULT_AGENT_NETWORK_PROFILE.strengths,
  });
}
