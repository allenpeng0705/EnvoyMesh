/**
 * Append-only owner Activity feed (local JSONL — not an EMP intent).
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { ACTIVITY_QUERY_INDEX_FILE } from "./storage-gate.js";
import {
  createJsonlIndexAppender,
  queryJsonlIndex,
  readJsonlIndex,
  rebuildJsonlIndex,
  type JsonlIndexEntry,
} from "./jsonl-query-index.js";

export const AGENT_ACTIVITY_FILE = "agent-activity.jsonl";

export type AgentActivityDomain = "social" | "knowledge" | "home" | "research";

export type AgentActivityKind =
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "knowledge_answered"
  | "intro_sync"
  | "friend_autopilot_pass"
  | "social_proxy_transition"
  | "document_acq_stage"
  | "capability_provider_stage"
  | "share_proposed"
  | "approval_needed"
  | "report_received"
  | "commerce_receipt";

export interface AgentActivityEvidence {
  type: string;
  ref: string;
}

export interface AgentActivityRecord {
  activityId: string;
  correlationId?: string;
  taskId?: string;
  domain: AgentActivityDomain;
  kind: AgentActivityKind;
  summary: string;
  remoteOwnerId?: string;
  remoteAgentId?: string;
  remoteActorRole?: "agent" | "human";
  evidence?: AgentActivityEvidence[];
  requiresOwnerAction?: boolean;
  createdAt: string;
}

export interface AgentActivityLine extends AgentActivityRecord {
  version: "0.1";
}

export interface ListAgentActivityParams {
  since?: string;
  until?: string;
  limit?: number;
  correlationId?: string;
  domain?: AgentActivityDomain;
  remoteOwnerId?: string;
}

export interface LocalAgentActivityStore {
  append(record: AgentActivityRecord): Promise<AgentActivityRecord>;
  list(params?: ListAgentActivityParams): Promise<AgentActivityRecord[]>;
  countSince(sinceIso: string): Promise<number>;
}

const MAX_JSONL_LINE_CHARS = 12 * 1024 * 1024;

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  if (line.length > MAX_JSONL_LINE_CHARS) {
    throw new Error(
      `JSONL record exceeds MAX_JSONL_LINE_CHARS (${MAX_JSONL_LINE_CHARS}): ${basename(path)}`,
    );
  }
  await appendFile(path, line, { mode: 0o600 });
}

async function readAllActivityLines(path: string): Promise<AgentActivityLine[]> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  const lines = contents.split("\n").filter((l) => l.trim().length > 0);
  const out: AgentActivityLine[] = [];
  for (const line of lines) {
    if (line.length > MAX_JSONL_LINE_CHARS) continue;
    try {
      const row = JSON.parse(line) as AgentActivityLine;
      if (row.version === "0.1" && row.activityId && row.summary && row.createdAt) {
        out.push(row);
      }
    } catch {
      /* skip corrupted line */
    }
  }
  return out;
}

export function createLocalAgentActivityStore(profileDir: string): LocalAgentActivityStore {
  const path = join(profileDir.trim(), AGENT_ACTIVITY_FILE);
  const indexPath = join(profileDir.trim(), ACTIVITY_QUERY_INDEX_FILE);
  let tail: Promise<unknown> = Promise.resolve();

  const appendIndexQueued = createJsonlIndexAppender(indexPath);

  const activityToIndexEntry = (line: AgentActivityLine): JsonlIndexEntry => ({
    id: line.activityId,
    createdAt: line.createdAt,
    correlationId: line.correlationId,
    taskId: line.taskId,
    payload: {
      domain: line.domain,
      kind: line.kind,
      summary: line.summary,
      remoteOwnerId: line.remoteOwnerId,
      remoteAgentId: line.remoteAgentId,
      remoteActorRole: line.remoteActorRole,
      evidence: line.evidence,
      requiresOwnerAction: line.requiresOwnerAction,
    },
  });

  const indexEntryToActivity = (entry: JsonlIndexEntry): AgentActivityRecord => ({
    activityId: entry.id,
    correlationId: entry.correlationId,
    taskId: entry.taskId,
    domain: entry.payload.domain as AgentActivityDomain,
    kind: entry.payload.kind as AgentActivityKind,
    summary: String(entry.payload.summary ?? ""),
    remoteOwnerId: entry.payload.remoteOwnerId as string | undefined,
    remoteAgentId: entry.payload.remoteAgentId as string | undefined,
    remoteActorRole: entry.payload.remoteActorRole as AgentActivityRecord["remoteActorRole"],
    evidence: entry.payload.evidence as AgentActivityEvidence[] | undefined,
    requiresOwnerAction: entry.payload.requiresOwnerAction as boolean | undefined,
    createdAt: entry.createdAt,
  });

  const ensureActivityIndex = async (): Promise<void> => {
    const [indexRows, activityRows] = await Promise.all([
      readJsonlIndex(indexPath),
      readAllActivityLines(path),
    ]);
    if (activityRows.length > 0 && indexRows.length < activityRows.length) {
      await rebuildJsonlIndex(activityRows, indexPath, activityToIndexEntry);
    }
  };

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const done = tail.then(fn);
    tail = done.then(
      () => {},
      () => {},
    );
    return done;
  };

  return {
    append(record) {
      return enqueue(async () => {
        const line: AgentActivityLine = {
          version: "0.1",
          activityId: record.activityId.trim() || randomUUID(),
          correlationId: record.correlationId,
          taskId: record.taskId,
          domain: record.domain,
          kind: record.kind,
          summary: record.summary,
          remoteOwnerId: record.remoteOwnerId,
          remoteAgentId: record.remoteAgentId,
          remoteActorRole: record.remoteActorRole,
          evidence: record.evidence,
          requiresOwnerAction: record.requiresOwnerAction,
          createdAt: record.createdAt,
        };
        await appendJsonLine(path, line);
        await appendIndexQueued(activityToIndexEntry(line));
        return line;
      });
    },

    async list(params = {}) {
      await ensureActivityIndex();
      const indexRows = await readJsonlIndex(indexPath);
      let filtered = queryJsonlIndex(indexRows, {
        since: params.since,
        until: params.until,
        correlationId: params.correlationId,
        limit: params.limit ?? 200,
      }).map(indexEntryToActivity);

      if (params.domain) {
        filtered = filtered.filter((row) => row.domain === params.domain);
      }
      if (params.remoteOwnerId?.trim()) {
        const ownerId = params.remoteOwnerId.trim();
        filtered = filtered.filter((row) => row.remoteOwnerId === ownerId);
      }

      return filtered;
    },

    async countSince(sinceIso: string) {
      await ensureActivityIndex();
      const indexRows = await readJsonlIndex(indexPath);
      return queryJsonlIndex(indexRows, { since: sinceIso, limit: 5000 }).length;
    },
  };
}
