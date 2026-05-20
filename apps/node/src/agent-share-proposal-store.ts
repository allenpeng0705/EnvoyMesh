import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentShareProposal } from "@envoymesh/api";

const FILE = "agent-share-proposals.json";

type FileShape = { proposals: AgentShareProposal[] };

export interface AgentShareProposalStore {
  list(): Promise<AgentShareProposal[]>;
  upsert(proposal: AgentShareProposal): Promise<void>;
  remove(proposalId: string): Promise<void>;
}

export function createAgentShareProposalStore(profileDir: string): AgentShareProposalStore {
  const path = join(profileDir, FILE);

  async function readAll(): Promise<AgentShareProposal[]> {
    try {
      const raw = await readFile(path, "utf8");
      const j = JSON.parse(raw) as FileShape;
      return Array.isArray(j.proposals) ? j.proposals : [];
    } catch {
      return [];
    }
  }

  return {
    async list(): Promise<AgentShareProposal[]> {
      return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async upsert(proposal: AgentShareProposal): Promise<void> {
      const cur = await readAll();
      const idx = cur.findIndex((p) => p.proposalId === proposal.proposalId);
      if (idx >= 0) cur[idx] = proposal;
      else cur.push(proposal);
      await writeFile(
        path,
        `${JSON.stringify({ proposals: cur }, null, 2)}\n`,
        { mode: 0o600 },
      );
    },

    async remove(proposalId: string): Promise<void> {
      const cur = (await readAll()).filter((p) => p.proposalId !== proposalId);
      await writeFile(
        path,
        `${JSON.stringify({ proposals: cur }, null, 2)}\n`,
        { mode: 0o600 },
      );
    },
  };
}
