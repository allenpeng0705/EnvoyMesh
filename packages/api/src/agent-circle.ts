/**
 * Agent-curated circles (Phase 23A).
 *
 * An AgentCircle is a named group of bonded contacts that the agent
 * proposes based on shared interests, capability tags, and communication
 * patterns. Circles are local-only — not shared over the wire.
 */

export type AgentCircleStatus = "proposed" | "active" | "declined" | "removed";

export interface AgentCircle {
  /** Stable circle identifier. */
  circleId: string;
  /** Owner-assigned or agent-proposed label (e.g. "Rust Enthusiasts"). */
  label: string;
  /** Circle status. */
  status: AgentCircleStatus;
  /** Bonded owner IDs belonging to this circle. */
  memberOwnerIds: string[];
  /** Topic tags that define this circle (derived from member published libraries). */
  topicTags: string[];
  /** When the circle was first proposed. */
  createdAt: string;
  /** Last time the circle was updated. */
  updatedAt: string;
  /** Optional note from the agent explaining why this circle was proposed. */
  agentNote?: string;
}

export interface AgentCircleStore {
  listCircles(): Promise<AgentCircle[]>;
  saveCircle(circle: AgentCircle): Promise<void>;
  deleteCircle(circleId: string): Promise<void>;
}
