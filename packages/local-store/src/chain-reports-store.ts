/**
 * Local persistence for chain reports (Phase 40 — Agent Network Collaboration Layer).
 *
 * Mirrors `fleet-manifest-store.ts`:
 * - JSON file under `profileDir`
 * - atomic write (`.tmp` + `rename`)
 * - serial `enqueueWrite` to avoid lost updates on concurrent writers
 * - file mode `0o600` (chain reports can quote task results, journal entries,
 *   and vault references — treat the file as sensitive even though the report
 *   itself is owner-facing and intentionally visible)
 *
 * Adds chain-report-specific behaviors on top of the JSON-store template:
 * - `recordChainReport` upserts by `chainId` (a chain publishes exactly one
 *   final report, but if the orchestrator restarts mid-synthesis it may write
 *   twice — the second write wins).
 * - `listChainReports({ sinceMs, limit, pinnedOnly })` is the read API used by
 *   the Social UI's ChainsView.
 * - `pinChainReport(chainId, pinned)` toggles the pinned flag — pinned reports
 *   are exempt from the default 90-day retention GC.
 * - `pruneExpiredReports(now, retentionMs)` runs the GC: drops reports whose
 *   `createdAt + retentionMs < now` unless `pinned === true`. Returns the
 *   number of pruned records.
 *
 * **GC is run on-demand by the caller, not on every read/write.** The caller
 * is responsible for scheduling prune calls (the Phase 40C integration
 * will tie this to the existing periodic-timer pattern in `apps/node`).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ChainReport } from "@envoymesh/protocol";

export const CHAIN_REPORTS_FILE = "chain-reports.json";

/** Default retention window. Pinned reports are exempt from this GC. */
export const CHAIN_REPORT_DEFAULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** A persisted chain report (currently just the protocol-level ChainReport). */
export interface ChainReportRecord {
  /** The protocol-level ChainReport payload. */
  report: ChainReport;
  /** When this record was first persisted (may differ from report.createdAt). */
  storedAt: string;
  /** When this record was last updated (always >= storedAt). */
  updatedAt: string;
}

export interface ListChainReportsParams {
  /** Only return reports with `createdAt >= sinceMs`. Optional. */
  sinceMs?: number;
  /** Maximum number of records to return. Default: 200. */
  limit?: number;
  /** When true, only return reports with `report.pinned === true`. */
  pinnedOnly?: boolean;
}

export interface LocalChainReportsStore {
  recordChainReport(report: ChainReport): Promise<ChainReportRecord>;
  getChainReport(chainId: string): Promise<ChainReportRecord | null>;
  listChainReports(params?: ListChainReportsParams): Promise<ChainReportRecord[]>;
  pinChainReport(chainId: string, pinned: boolean): Promise<ChainReportRecord | null>;
  /**
   * Drops records whose `createdAt + retentionMs < now` and `report.pinned !== true`.
   * Returns the number of records removed. Idempotent and safe to call repeatedly.
   */
  pruneExpiredReports(now: number, retentionMs?: number): Promise<number>;
}

interface ChainReportsFile {
  version: "0.1";
  reports: ChainReportRecord[];
}

export function createLocalChainReportsStore(
  profileDir: string,
): LocalChainReportsStore {
  const filePath = join(profileDir, CHAIN_REPORTS_FILE);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<ChainReportsFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as ChainReportsFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.reports)) {
        return { version: "0.1", reports: [] };
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: "0.1", reports: [] };
      }
      throw error;
    }
  }

  async function writeFileAtomic(data: ChainReportsFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, filePath);
  }

  function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const done = writeChain.then(task);
    writeChain = done.then(
      () => {},
      () => {},
    );
    return done;
  }

  return {
    async recordChainReport(report) {
      return enqueueWrite(async () => {
        const file = await loadFile();
        const nowIso = new Date().toISOString();
        const idx = file.reports.findIndex(
          (r) => r.report.chainId === report.chainId,
        );
        if (idx === -1) {
          const record: ChainReportRecord = {
            report,
            storedAt: nowIso,
            updatedAt: nowIso,
          };
          file.reports.push(record);
          await writeFileAtomic(file);
          return record;
        }
        // Preserve the original storedAt so GC age is anchored to first-write.
        const updated: ChainReportRecord = {
          report,
          storedAt: file.reports[idx].storedAt,
          updatedAt: nowIso,
        };
        file.reports[idx] = updated;
        await writeFileAtomic(file);
        return updated;
      });
    },

    async getChainReport(chainId) {
      const file = await loadFile();
      return file.reports.find((r) => r.report.chainId === chainId) ?? null;
    },

    async listChainReports(params) {
      const file = await loadFile();
      let filtered = file.reports;
      if (params?.pinnedOnly) {
        filtered = filtered.filter((r) => r.report.pinned === true);
      }
      if (typeof params?.sinceMs === "number") {
        const sinceMs = params.sinceMs;
        filtered = filtered.filter(
          (r) => new Date(r.report.createdAt).getTime() >= sinceMs,
        );
      }
      // Newest first.
      filtered = [...filtered].sort(
        (a, b) =>
          new Date(b.report.createdAt).getTime() -
          new Date(a.report.createdAt).getTime(),
      );
      const limit = params?.limit ?? 200;
      return filtered.slice(0, limit);
    },

    async pinChainReport(chainId, pinned) {
      return enqueueWrite(async () => {
        const file = await loadFile();
        const idx = file.reports.findIndex(
          (r) => r.report.chainId === chainId,
        );
        if (idx === -1) return null;
        const nowIso = new Date().toISOString();
        const existing = file.reports[idx];
        // No-op if the flag is already set to the requested value.
        if (existing.report.pinned === pinned) {
          return existing;
        }
        const updated: ChainReportRecord = {
          report: { ...existing.report, pinned },
          storedAt: existing.storedAt,
          updatedAt: nowIso,
        };
        file.reports[idx] = updated;
        await writeFileAtomic(file);
        return updated;
      });
    },

    async pruneExpiredReports(now, retentionMs) {
      return enqueueWrite(async () => {
        const retention = retentionMs ?? CHAIN_REPORT_DEFAULT_RETENTION_MS;
        const file = await loadFile();
        const before = file.reports.length;
        file.reports = file.reports.filter((r) => {
          if (r.report.pinned === true) return true;
          const ageMs = now - new Date(r.report.createdAt).getTime();
          return ageMs < retention;
        });
        const removed = before - file.reports.length;
        if (removed > 0) {
          await writeFileAtomic(file);
        }
        return removed;
      });
    },
  };
}