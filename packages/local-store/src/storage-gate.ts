import { stat } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_ACTIVITY_FILE } from "./agent-activity-store.js";
import {
  queryJsonlIndex,
  readJsonlIndex,
  type JsonlIndexQueryParams,
} from "./jsonl-query-index.js";

export const AUDIT_QUERY_INDEX_FILE = "audit-query-index.jsonl";
export const ACTIVITY_QUERY_INDEX_FILE = "activity-query-index.jsonl";

/** Thresholds from docs/sqlite-adoption.md §2 */
export const SQLITE_TRIGGER_AUDIT_BYTES = 500 * 1024 * 1024;
export const SQLITE_TRIGGER_QUERY_MS = 2000;

export interface StorageFileMetrics {
  path: string;
  bytes: number;
  exists: boolean;
}

export interface StorageQueryBenchmark {
  fullAuditReadMs: number;
  indexedAuditQueryMs: number;
  auditRowCount: number;
  indexRowCount: number;
}

export interface StorageGateReport {
  profileDir: string;
  measuredAt: string;
  files: StorageFileMetrics[];
  benchmark: StorageQueryBenchmark;
  sqliteTriggersMet: boolean;
  triggerReasons: string[];
  recommendation: "stay-jsonl-with-index" | "plan-sqlite-migration";
}

async function fileMetrics(profileDir: string, name: string): Promise<StorageFileMetrics> {
  const path = join(profileDir, name);
  try {
    const st = await stat(path);
    return { path: name, bytes: st.size, exists: true };
  } catch {
    return { path: name, bytes: 0, exists: false };
  }
}

export async function measureStorageGate(input: {
  profileDir: string;
  readAuditEvents: () => Promise<unknown[]>;
  queryAuditIndex: (params: JsonlIndexQueryParams) => Promise<unknown[]>;
  sinceIso?: string;
}): Promise<StorageGateReport> {
  const files = await Promise.all([
    fileMetrics(input.profileDir, "audit-events.jsonl"),
    fileMetrics(input.profileDir, AUDIT_QUERY_INDEX_FILE),
    fileMetrics(input.profileDir, AGENT_ACTIVITY_FILE),
    fileMetrics(input.profileDir, ACTIVITY_QUERY_INDEX_FILE),
  ]);

  const fullStart = performance.now();
  const auditRows = await input.readAuditEvents();
  const fullAuditReadMs = performance.now() - fullStart;

  const since =
    input.sinceIso ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const indexStart = performance.now();
  await input.queryAuditIndex({ since, limit: 100 });
  const indexedAuditQueryMs = performance.now() - indexStart;

  const indexRows = await readJsonlIndex(join(input.profileDir, AUDIT_QUERY_INDEX_FILE));

  const triggerReasons: string[] = [];
  const auditFile = files.find((f) => f.path === "audit-events.jsonl");
  if (auditFile && auditFile.bytes >= SQLITE_TRIGGER_AUDIT_BYTES) {
    triggerReasons.push(
      `audit-events.jsonl size ${auditFile.bytes} bytes >= ${SQLITE_TRIGGER_AUDIT_BYTES} threshold`,
    );
  }
  if (fullAuditReadMs >= SQLITE_TRIGGER_QUERY_MS) {
    triggerReasons.push(
      `full audit read ${fullAuditReadMs.toFixed(0)}ms >= ${SQLITE_TRIGGER_QUERY_MS}ms threshold`,
    );
  }

  const sqliteTriggersMet = triggerReasons.length > 0;

  return {
    profileDir: input.profileDir,
    measuredAt: new Date().toISOString(),
    files,
    benchmark: {
      fullAuditReadMs,
      indexedAuditQueryMs,
      auditRowCount: auditRows.length,
      indexRowCount: indexRows.length,
    },
    sqliteTriggersMet,
    triggerReasons,
    recommendation: sqliteTriggersMet ? "plan-sqlite-migration" : "stay-jsonl-with-index",
  };
}

/** @internal test helper */
export function evaluateSqliteTriggersFromMetrics(input: {
  auditBytes: number;
  fullAuditReadMs: number;
}): { met: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.auditBytes >= SQLITE_TRIGGER_AUDIT_BYTES) {
    reasons.push("audit size threshold");
  }
  if (input.fullAuditReadMs >= SQLITE_TRIGGER_QUERY_MS) {
    reasons.push("query latency threshold");
  }
  return { met: reasons.length > 0, reasons };
}
