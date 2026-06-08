import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  /** Direct bonds still awaiting hop-2 relay-back from intermediaries. */
  awaitingHop2ViaBonds: string[];
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
  applyInboundResponse(
    correlationId: string,
    input: {
      responderOwnerId: string;
      forwardPendingAck?: boolean;
      matches: MultiHopDiscoveryMatchRow[];
    },
  ): Promise<MultiHopDiscoverySession | undefined>;
  getSession(correlationId: string): Promise<MultiHopDiscoverySession | undefined>;
  listSessions(limit?: number): Promise<MultiHopDiscoverySession[]>;
  updateAwaitingHop2Bonds(
    correlationId: string,
    awaitingHop2ViaBonds: string[],
    pendingForwardApprovals: number,
  ): Promise<MultiHopDiscoverySession | undefined>;
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
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return { version: "0.1", sessions: [] };
    throw error;
  }
  // Tolerate empty files (writer can briefly truncate to 0 bytes during
  // a rename-replace, or the OS may report a partially-written file).
  if (raw.trim().length === 0) return { version: "0.1", sessions: [] };
  try {
    const parsed = JSON.parse(raw) as MultiHopDiscoverySessionFile;
    if (parsed.version === "0.1" && Array.isArray(parsed.sessions)) {
      return parsed;
    }
  } catch {
    // Malformed file: treat as empty rather than crashing the caller.
    return { version: "0.1", sessions: [] };
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
  let writeChain: Promise<void> = Promise.resolve();

  async function withSerializedWrite<T>(fn: () => Promise<T>): Promise<T> {
    const run = writeChain.then(fn);
    writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function writeFileJson(file: MultiHopDiscoverySessionFile): Promise<void> {
    await mkdir(profileDir, { recursive: true });
    // Atomic write: stage to a tmp file then rename. Prevents readers from
    // observing a half-written or empty file mid-update.
    const tmp = `${path}.tmp-${process.pid}-${Date.now().toString(36)}`;
    await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, path);
  }

  return {
    async upsertSession(session) {
      await withSerializedWrite(async () => {
        const file = await readFileJson(path);
        const idx = file.sessions.findIndex((row) => row.correlationId === session.correlationId);
        if (idx >= 0) {
          file.sessions[idx] = session;
        } else {
          file.sessions.unshift(session);
        }
        file.sessions = file.sessions.slice(0, 32);
        await writeFileJson(file);
      });
    },

    async appendMatches(correlationId, matches, input) {
      return withSerializedWrite(async () => {
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
          awaitingHop2ViaBonds: current.awaitingHop2ViaBonds ?? [],
          matches: mergeMatches(current.matches, matches),
        };
        file.sessions[idx] = updated;
        await writeFileJson(file);
        return updated;
      });
    },

    async applyInboundResponse(correlationId, input) {
      return withSerializedWrite(async () => {
        const file = await readFileJson(path);
        const idx = file.sessions.findIndex((row) => row.correlationId === correlationId);
        if (idx < 0) return undefined;
        const now = new Date().toISOString();
        const current = file.sessions[idx]!;
        const awaiting = new Set(current.awaitingHop2ViaBonds ?? []);

        if (input.forwardPendingAck && input.matches.length === 0) {
          awaiting.add(input.responderOwnerId);
          const updated: MultiHopDiscoverySession = {
            ...current,
            updatedAt: now,
            awaitingHop2ViaBonds: [...awaiting],
            pendingForwardApprovals: awaiting.size,
          };
          file.sessions[idx] = updated;
          await writeFileJson(file);
          return updated;
        }

        if (input.matches.length === 0) {
          return current;
        }

        awaiting.delete(input.responderOwnerId);
        const updated: MultiHopDiscoverySession = {
          ...current,
          updatedAt: now,
          awaitingHop2ViaBonds: [...awaiting],
          pendingForwardApprovals: awaiting.size,
          matches: mergeMatches(current.matches, input.matches),
        };
        file.sessions[idx] = updated;
        await writeFileJson(file);
        return updated;
      });
    },

    async getSession(correlationId) {
      const file = await readFileJson(path);
      return file.sessions.find((row) => row.correlationId === correlationId.trim());
    },

    async listSessions(limit = 8) {
      const file = await readFileJson(path);
      return file.sessions.slice(0, limit);
    },

    async updateAwaitingHop2Bonds(correlationId, awaitingHop2ViaBonds, pendingForwardApprovals) {
      return withSerializedWrite(async () => {
        const file = await readFileJson(path);
        const idx = file.sessions.findIndex((row) => row.correlationId === correlationId);
        if (idx < 0) return undefined;
        const now = new Date().toISOString();
        const updated: MultiHopDiscoverySession = {
          ...file.sessions[idx]!,
          updatedAt: now,
          awaitingHop2ViaBonds,
          pendingForwardApprovals,
        };
        file.sessions[idx] = updated;
        await writeFileJson(file);
        return updated;
      });
    },
  };
}
