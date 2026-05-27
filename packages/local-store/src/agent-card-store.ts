import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentCard } from "@envoymesh/protocol";

const AGENT_CARDS_FILE = "agent-cards.json";

export interface CachedAgentCardRecord {
  ownerId: string;
  card: AgentCard;
  cachedAt: string;
  sourceAgentPeerId?: string;
}

interface AgentCardStoreFile {
  version: "0.1";
  records: CachedAgentCardRecord[];
}

export interface AgentCardStore {
  get(ownerId: string): Promise<CachedAgentCardRecord | undefined>;
  list(): Promise<CachedAgentCardRecord[]>;
  upsert(record: CachedAgentCardRecord): Promise<CachedAgentCardRecord>;
}

export function createAgentCardStore(profileDir: string): AgentCardStore {
  const filePath = join(profileDir, AGENT_CARDS_FILE);

  async function load(): Promise<AgentCardStoreFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as AgentCardStoreFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.records)) {
        return { version: "0.1", records: [] };
      }
      return parsed;
    } catch {
      return { version: "0.1", records: [] };
    }
  }

  async function save(data: AgentCardStoreFile): Promise<void> {
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  }

  return {
    async get(ownerId) {
      const data = await load();
      return data.records.find((r) => r.ownerId === ownerId);
    },
    async list() {
      const data = await load();
      return [...data.records].sort(
        (a, b) => new Date(b.cachedAt).getTime() - new Date(a.cachedAt).getTime(),
      );
    },
    async upsert(record) {
      const data = await load();
      const next = data.records.filter((r) => r.ownerId !== record.ownerId);
      next.push(record);
      await save({ version: "0.1", records: next });
      return record;
    },
  };
}
