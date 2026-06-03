/**
 * Circle Proposer (Phase 23A)
 *
 * Analyzes bonded contacts' published library topics, capability tags,
 * and communication patterns to propose circle groupings.
 * Pure computation — no wire protocol.
 */

import { randomUUID } from "node:crypto";
import type { AgentCircle } from "@envoymesh/api";

export interface CircleProposerDeps {
  /** Get all bonded contacts. */
  getBonds: () => Promise<Array<{
    peerOwnerId: string;
    displayName?: string;
    level: string;
    createdAt: string;
  }>>;
  /** Get published document topics per contact. */
  getContactTopics: (ownerId: string) => Promise<string[]>;
  /** Get advertised capability tags per contact. */
  getContactCapabilities: (ownerId: string) => Promise<string[]>;
}

export interface CircleProposal {
  /** Proposed circle label. */
  label: string;
  /** Owner IDs that belong to this circle. */
  memberOwnerIds: string[];
  /** Shared topic tags that define the circle. */
  topicTags: string[];
  /** Confidence score (0.0–1.0). */
  score: number;
  /** Why this circle was proposed. */
  reason: string;
  /** Minimum number of members for a viable circle. */
  minMembers: number;
}

/**
 * Analyze bonds and propose circle groupings based on shared topics.
 */
export async function proposeCircles(
  deps: CircleProposerDeps,
  opts?: { minMembers?: number; minTopicOverlap?: number; maxCircles?: number },
): Promise<CircleProposal[]> {
  const minMembers = opts?.minMembers ?? 2;
  const minTopicOverlap = opts?.minTopicOverlap ?? 0.3;
  const maxCircles = opts?.maxCircles ?? 5;

  const bonds = await deps.getBonds();
  const bondedBonds = bonds.filter((b) => b.level !== "blocked" && b.level !== "public");

  if (bondedBonds.length < minMembers) return [];

  // Collect topics per contact
  const contactTopics = new Map<string, Set<string>>();
  const contactCapabilities = new Map<string, Set<string>>();

  for (const bond of bondedBonds) {
    const topics = await deps.getContactTopics(bond.peerOwnerId);
    const capabilities = await deps.getContactCapabilities(bond.peerOwnerId);
    contactTopics.set(bond.peerOwnerId, new Set(topics));
    contactCapabilities.set(bond.peerOwnerId, new Set(capabilities));
  }

  // Find topic clusters
  const allTopics = new Set<string>();
  for (const topics of contactTopics.values()) {
    for (const t of topics) allTopics.add(t);
  }

  const proposals: CircleProposal[] = [];

  for (const topic of allTopics) {
    const members: string[] = [];
    for (const [ownerId, topics] of contactTopics) {
      if (topics.has(topic)) {
        members.push(ownerId);
      }
    }

    if (members.length >= minMembers) {
      // Compute topic overlap score
      const sharedTopics = new Set<string>();
      for (const memberId of members) {
        const memberTopics = contactTopics.get(memberId);
        if (memberTopics) {
          for (const t of memberTopics) {
            // Check if at least half the circle shares this topic
            let count = 0;
            for (const otherId of members) {
              if (contactTopics.get(otherId)?.has(t)) count++;
            }
            if (count >= Math.ceil(members.length * minTopicOverlap)) {
              sharedTopics.add(t);
            }
          }
        }
      }

      const topicList = Array.from(sharedTopics).slice(0, 100);
      const score = Math.min(1.0, members.length / 5);

      proposals.push({
        label: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Circle`,
        memberOwnerIds: members,
        topicTags: topicList,
        score,
        reason: `${members.length} contacts share the topic "${topic}"`,
        minMembers,
      });
    }
  }

  // Also check capability-based clusters
  const allCapabilities = new Set<string>();
  for (const caps of contactCapabilities.values()) {
    for (const c of caps) allCapabilities.add(c);
  }

  for (const cap of allCapabilities) {
    const members: string[] = [];
    for (const [ownerId, caps] of contactCapabilities) {
      if (caps.has(cap)) {
        members.push(ownerId);
      }
    }

    if (members.length >= minMembers) {
      proposals.push({
        label: `${cap.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Circle`,
        memberOwnerIds: members,
        topicTags: [cap],
        score: Math.min(1.0, members.length / 5),
        reason: `${members.length} contacts share the capability "${cap}"`,
        minMembers,
      });
    }
  }

  // Deduplicate by member sets
  const seen = new Set<string>();
  const deduped: CircleProposal[] = [];
  for (const p of proposals) {
    const key = [...p.memberOwnerIds].sort().join(",");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }

  // Sort by score descending, limit
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, maxCircles);
}

/**
 * Convert a CircleProposal into an AgentCircle.
 */
export function circleFromProposal(
  proposal: CircleProposal,
  status: AgentCircle["status"] = "proposed",
): AgentCircle {
  const now = new Date().toISOString();
  return {
    circleId: randomUUID(),
    label: proposal.label,
    status,
    memberOwnerIds: proposal.memberOwnerIds,
    topicTags: proposal.topicTags,
    createdAt: now,
    updatedAt: now,
    agentNote: proposal.reason,
  };
}
