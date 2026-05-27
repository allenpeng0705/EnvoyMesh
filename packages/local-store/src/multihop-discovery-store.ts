import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MULTIHOP_DISCOVERY_SESSIONS_FILE = "multihop-discovery-sessions.json";

export interface MultiHopDiscoveryMatchRow {
  ownerId: string;
  peerId: string;
  hopDistance: number;
  matchedCapabilities: string[];
  matchedTagHashes: string[];
  viaOwnerId?: string;
  viaDisplayName?: string;
  referralOwnerId?: string;
  trustPath?: string;
}

export interface MultiHopDiscoverySession {
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  bondsQueried: number;
  pendingForwardApprovals: number;
  matches: MultiHopDiscoveryMatchRow[];
}

interface MultiHopDiscoverySessionFile {
  version: "0.1";
  sessions: MultiHopDiscoverySession[];
}

export interface MultiHopDiscoveryStore {
  upsertSession(session: MultiHopDiscoverySession): Promise<void>;
  appendMatches(
    correlationId: string,
    matches: MultiHopDiscoveryMatchRow[],
    input?: { pendingForwardApprovals?: number },
  ): Promise<MultiHopDiscoverySession | undefined>;
  getSession(correlationId: string): Promise<MultiHopDiscoverySession | undefined>;
  listSessions(limit?: number): Promise<MultiHopDiscoverySession[]>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readFileJson(path: string): Promise<MultiHopDiscoverySessionFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as MultiHopDiscoverySessionFile;
    if (parsed.version === "0.1" && Array.isArray(parsed.sessions)) {
      return parsed;
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return { version: "0.1", sessions: [] };
}

function mergeMatches(
  existing: MultiHopDiscoveryMatchRow[],
  incoming: MultiHopDiscoveryMatchRow[],
): MultiHopDiscoveryMatchRow[] {
  const byOwner = new Map(existing.map((row) => [row.ownerId, row]));
  for (const row of incoming) {
    const prev = byOwner.get(row.ownerId);
    if (!prev || row.hopDistance < prev.hopDistance) {
      byOwner.set(row.ownerId, row);
    }
  }
  return [...byOwner.values()].sort((a, b) => a.hopDistance - b.hopDistance);
}

export function createMultiHopDiscoveryStore(profileDir: string): MultiHopDiscoveryStore {
  const path = join(profileDir, MULTIHOP_DISCOVERY_SESSIONS_FILE);

  return {
    async upsertSession(session) {
      const file = await readFileJson(path);
      const idx = file.sessions.findIndex((row) => row.correlationId === session.correlationId);
      if (idx >= 0) {
        file.sessions[idx] = session;
      } else {
        file.sessions.unshift(session);
      }
      file.sessions = file.sessions.slice(0, 32);
      await mkdir(profileDir, { recursive: true });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    },

    async appendMatches(correlationId, matches, input) {
      const file = await readFileJson(path);
      const idx = file.sessions.findIndex((row) => row.correlationId === correlationId);
      if (idx < 0) return undefined;
      const now = new Date().toISOString();
      const current = file.sessions[idx]!;
      const updated: MultiHopDiscoverySession = {
        ...current,
        updatedAt: now,
        pendingForwardApprovals:
          input?.pendingForwardApprovals ?? current.pendingForwardApprovals,
        matches: mergeMatches(current.matches, matches),
      };
      file.sessions[idx] = updated;
      await mkdir(profileDir, { recursive: true });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
      return updated;
    },

    async getSession(correlationId) {
      const file = await readFileJson(path);
      return file.sessions.find((row) => row.correlationId === correlationId.trim());
    },

    async listSessions(limit = 8) {
      const file = await readFileJson(path);
      return file.sessions.slice(0, limit);
    },
  };
}
