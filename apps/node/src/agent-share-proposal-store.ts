/**
 * Pending agent → owner share proposals (Inbox).
 * Bounded: hard cap + age TTL. Empty list deletes the file.
 */

import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AgentShareProposal } from "@envoymesh/api";

const FILE = "agent-share-proposals.json";

/** Keep the proposal queue small and easy to reason about. */
export const MAX_AGENT_SHARE_PROPOSALS = 64;
/** Drop proposals older than this if never dismissed. */
export const MAX_AGENT_SHARE_PROPOSAL_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type FileShape = { proposals: AgentShareProposal[] };

export interface AgentShareProposalStore {
  list(): Promise<AgentShareProposal[]>;
  upsert(proposal: AgentShareProposal): Promise<void>;
  remove(proposalId: string): Promise<void>;
}

export function pruneAgentShareProposals(
  proposals: AgentShareProposal[],
  nowMs: number = Date.now(),
): AgentShareProposal[] {
  const cutoff = nowMs - MAX_AGENT_SHARE_PROPOSAL_AGE_MS;
  const fresh = proposals.filter((p) => {
    const t = Date.parse(p.createdAt);
    if (!Number.isFinite(t)) return false;
    return t >= cutoff;
  });
  return fresh
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_AGENT_SHARE_PROPOSALS);
}

export function createAgentShareProposalStore(profileDir: string): AgentShareProposalStore {
  const path = join(profileDir, FILE);

  async function readAll(): Promise<AgentShareProposal[]> {
    try {
      const raw = await readFile(path, "utf8");
      const j = JSON.parse(raw) as FileShape;
      if (!Array.isArray(j.proposals)) return [];
      return pruneAgentShareProposals(j.proposals);
    } catch {
      return [];
    }
  }

  async function writeAll(proposals: AgentShareProposal[]): Promise<void> {
    const pruned = pruneAgentShareProposals(proposals);
    if (pruned.length === 0) {
      await unlink(path).catch((err) => {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      });
      return;
    }
    await writeFile(path, `${JSON.stringify({ proposals: pruned })}\n`, { mode: 0o600 });
  }

  return {
    async list(): Promise<AgentShareProposal[]> {
      return readAll();
    },

    async upsert(proposal: AgentShareProposal): Promise<void> {
      const cur = await readAll();
      const idx = cur.findIndex((p) => p.proposalId === proposal.proposalId);
      if (idx >= 0) cur[idx] = proposal;
      else cur.push(proposal);
      await writeAll(cur);
    },

    async remove(proposalId: string): Promise<void> {
      const cur = (await readAll()).filter((p) => p.proposalId !== proposalId);
      await writeAll(cur);
    },
  };
}
