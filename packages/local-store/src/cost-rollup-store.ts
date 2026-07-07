/**
 * Cost rollup store for per-call model usage tracking.
 *
 * Two-tier cost tracking strategy:
 *   - Raw per-call `model.usage` audit events live in the existing audit JSONL
 *     (7-day TTL via the existing retention policy) for drill-down.
 *   - This store holds long-term aggregated rollups at (day, provider, model)
 *     granularity so the owner dashboard can show 30 days of history without
 *     scanning raw audit lines.
 *
 * Merge semantics: `recordCall()` increments an existing rollup row in place
 * (matched by `date + providerId + modelName + taskType`) or appends a new row.
 * End of day → at most a few rows, not thousands.
 *
 * Retention: daily rows are kept for 30 days, then collapsed into monthly rows.
 * After 12 months, monthly rows can be dropped. Rollups are tiny (each row is
 * ~100 bytes), so even a year of history for ~10 active providers is well
 * under 50KB total.
 *
 * Storage model: JSON file with atomic write (`.tmp` + `rename`), serial
 * `enqueueWrite` to avoid lost updates on concurrent writers, file mode `0o600`.
 * Mirrors `chain-reports-store.ts`.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const COST_ROLLUPS_FILE = "cost-rollups.json";

/** Keep daily-granularity rows for 30 days before collapsing to monthly. */
export const COST_ROLLUP_DAILY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Drop monthly rows older than 12 months. */
export const COST_ROLLUP_MONTHLY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export type CostRollupGranularity = "day" | "month";

export interface CostRollupEntry {
  /** Local day ("2026-07-07") or month ("2026-07"). Matches `granularity`. */
  period: string;
  granularity: CostRollupGranularity;
  providerId: string;
  modelName: string;
  taskType: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** ISO timestamp of last merge. */
  updatedAt: string;
}

export interface CostRollupKey {
  /** Local day ("2026-07-07"). */
  date: string;
  providerId: string;
  modelName: string;
  taskType: string;
}

export interface RecordCallInput {
  /** ISO timestamp of the call. Determines which local-day bucket it lands in. */
  createdAt: string;
  providerId: string;
  modelName: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CostSummaryFilters {
  /** ISO timestamp; only rows with period >= since are returned. */
  since?: string;
  /** ISO timestamp; only rows with period < until are returned. */
  until?: string;
  providerId?: string;
  taskType?: string;
}

export interface CostSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byProvider: Array<{
    providerId: string;
    calls: number;
    costUsd: number;
  }>;
  byPeriod: Array<{
    period: string;
    granularity: CostRollupGranularity;
    calls: number;
    costUsd: number;
  }>;
}

export interface CostRollupStore {
  /** Merge a single call's usage into the matching daily rollup row. */
  recordCall(input: RecordCallInput): Promise<void>;
  /** Read all rollup rows matching the filters. */
  listEntries(filters?: CostSummaryFilters): Promise<CostRollupEntry[]>;
  /** Aggregate entries into a summary for the dashboard. */
  summarize(filters?: CostSummaryFilters): Promise<CostSummary>;
  /**
   * Collapse daily rows older than COST_ROLLUP_DAILY_RETENTION_MS into monthly
   * rows; drop monthly rows older than COST_ROLLUP_MONTHLY_RETENTION_MS.
   * Returns the number of rows removed (not collapsed).
   */
  runRetention(now?: Date): Promise<{ collapsed: number; dropped: number }>;
}

interface CostRollupsFile {
  version: "0.1";
  entries: CostRollupEntry[];
}

/** Convert an ISO timestamp to local-day string ("2026-07-07"). */
function isoToLocalDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Fall back to today if the timestamp is malformed.
    return isoToLocalDay(new Date().toISOString());
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convert an ISO timestamp to local-month string ("2026-07"). */
function isoToLocalMonth(iso: string): string {
  const day = isoToLocalDay(iso);
  return day.slice(0, 7);
}

/** Period string sort comparator — works for both "YYYY-MM-DD" and "YYYY-MM". */
function comparePeriod(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createCostRollupStore(profileDir: string): CostRollupStore {
  const filePath = join(profileDir, COST_ROLLUPS_FILE);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<CostRollupsFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as CostRollupsFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.entries)) {
        return { version: "0.1", entries: [] };
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: "0.1", entries: [] };
      }
      throw error;
    }
  }

  async function writeFileAtomic(data: CostRollupsFile): Promise<void> {
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

  function matchesFilters(entry: CostRollupEntry, filters?: CostSummaryFilters): boolean {
    if (!filters) return true;
    if (filters.providerId && entry.providerId !== filters.providerId) return false;
    if (filters.taskType && entry.taskType !== filters.taskType) return false;
    // Period comparison is lexicographic on "YYYY-MM-DD" / "YYYY-MM" strings.
    // For `since`: a monthly row "2026-07" < since "2026-08-08" → excluded, correct.
    // For `until`: a monthly row "2026-07" < until "2026-07-15" → included, which
    // is the inclusive interpretation (the month overlaps the range). This is a
    // known limitation — partial-month prorating is out of scope for v1. In
    // practice the dashboard's preset ranges (today/7d/30d) set `since` only,
    // and monthly rows are always from prior months, so they're excluded by
    // the `since` check before `until` semantics matter.
    if (filters.since && comparePeriod(entry.period, isoToLocalDay(filters.since)) < 0) {
      return false;
    }
    if (filters.until && comparePeriod(entry.period, isoToLocalDay(filters.until)) >= 0) {
      return false;
    }
    return true;
  }

  return {
    async recordCall(input) {
      return enqueueWrite(async () => {
        const file = await loadFile();
        const day = isoToLocalDay(input.createdAt);
        const nowIso = new Date().toISOString();
        const idx = file.entries.findIndex(
          (e) =>
            e.granularity === "day" &&
            e.period === day &&
            e.providerId === input.providerId &&
            e.modelName === input.modelName &&
            e.taskType === input.taskType,
        );
        if (idx === -1) {
          const entry: CostRollupEntry = {
            period: day,
            granularity: "day",
            providerId: input.providerId,
            modelName: input.modelName,
            taskType: input.taskType,
            calls: 1,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            costUsd: input.costUsd,
            updatedAt: nowIso,
          };
          file.entries.push(entry);
        } else {
          const existing = file.entries[idx];
          file.entries[idx] = {
            ...existing,
            calls: existing.calls + 1,
            inputTokens: existing.inputTokens + input.inputTokens,
            outputTokens: existing.outputTokens + input.outputTokens,
            costUsd: existing.costUsd + input.costUsd,
            updatedAt: nowIso,
          };
        }
        await writeFileAtomic(file);
      });
    },

    async listEntries(filters) {
      const file = await loadFile();
      return file.entries
        .filter((e) => matchesFilters(e, filters))
        .sort((a, b) => comparePeriod(a.period, b.period));
    },

    async summarize(filters) {
      const file = await loadFile();
      const entries = file.entries.filter((e) => matchesFilters(e, filters));
      const totalCalls = entries.reduce((sum, e) => sum + e.calls, 0);
      const totalInputTokens = entries.reduce((sum, e) => sum + e.inputTokens, 0);
      const totalOutputTokens = entries.reduce((sum, e) => sum + e.outputTokens, 0);
      const totalCostUsd = entries.reduce((sum, e) => sum + e.costUsd, 0);

      const providerMap = new Map<string, { calls: number; costUsd: number }>();
      for (const e of entries) {
        const cur = providerMap.get(e.providerId) ?? { calls: 0, costUsd: 0 };
        cur.calls += e.calls;
        cur.costUsd += e.costUsd;
        providerMap.set(e.providerId, cur);
      }
      const byProvider = [...providerMap.entries()]
        .map(([providerId, v]) => ({ providerId, ...v }))
        .sort((a, b) => b.costUsd - a.costUsd);

      const periodMap = new Map<
        string,
        { granularity: CostRollupGranularity; calls: number; costUsd: number }
      >();
      for (const e of entries) {
        const cur = periodMap.get(e.period) ?? {
          granularity: e.granularity,
          calls: 0,
          costUsd: 0,
        };
        cur.calls += e.calls;
        cur.costUsd += e.costUsd;
        periodMap.set(e.period, cur);
      }
      const byPeriod = [...periodMap.entries()]
        .map(([period, v]) => ({ period, ...v }))
        .sort((a, b) => comparePeriod(a.period, b.period));

      return {
        totalCalls,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd,
        byProvider,
        byPeriod,
      };
    },

    async runRetention(now = new Date()) {
      return enqueueWrite(async () => {
        const file = await loadFile();
        const nowMs = now.getTime();
        const dailyCutoffMs = nowMs - COST_ROLLUP_DAILY_RETENTION_MS;
        const monthlyCutoffMs = nowMs - COST_ROLLUP_MONTHLY_RETENTION_MS;

        // Bucket daily rows that should be collapsed, grouped by month+provider+model+task.
        const collapseBuckets = new Map<
          string,
          {
            period: string;
            providerId: string;
            modelName: string;
            taskType: string;
            calls: number;
            inputTokens: number;
            outputTokens: number;
            costUsd: number;
          }
        >();

        const keptDaily: CostRollupEntry[] = [];
        for (const entry of file.entries) {
          if (entry.granularity === "day") {
            const dayMs = new Date(entry.period + "T00:00:00").getTime();
            if (dayMs < dailyCutoffMs) {
              // Collapse into monthly bucket.
              const month = entry.period.slice(0, 7);
              const key = `${month}|${entry.providerId}|${entry.modelName}|${entry.taskType}`;
              const bucket =
                collapseBuckets.get(key) ??
                {
                  period: month,
                  providerId: entry.providerId,
                  modelName: entry.modelName,
                  taskType: entry.taskType,
                  calls: 0,
                  inputTokens: 0,
                  outputTokens: 0,
                  costUsd: 0,
                };
              bucket.calls += entry.calls;
              bucket.inputTokens += entry.inputTokens;
              bucket.outputTokens += entry.outputTokens;
              bucket.costUsd += entry.costUsd;
              collapseBuckets.set(key, bucket);
              continue;
            }
            keptDaily.push(entry);
          }
        }

        // For monthly rows, drop any older than the monthly cutoff.
        const keptMonthly: CostRollupEntry[] = [];
        let dropped = 0;
        for (const entry of file.entries) {
          if (entry.granularity === "month") {
            const monthMs = new Date(entry.period + "-01T00:00:00").getTime();
            if (monthMs < monthlyCutoffMs) {
              dropped += 1;
              continue;
            }
            keptMonthly.push(entry);
          }
        }

        // Merge collapse buckets into existing monthly rows (or append).
        const monthlyEntries: CostRollupEntry[] = [...keptMonthly];
        const nowIso = now.toISOString();
        for (const bucket of collapseBuckets.values()) {
          const idx = monthlyEntries.findIndex(
            (e) =>
              e.granularity === "month" &&
              e.period === bucket.period &&
              e.providerId === bucket.providerId &&
              e.modelName === bucket.modelName &&
              e.taskType === bucket.taskType,
          );
          if (idx === -1) {
            monthlyEntries.push({
              period: bucket.period,
              granularity: "month",
              providerId: bucket.providerId,
              modelName: bucket.modelName,
              taskType: bucket.taskType,
              calls: bucket.calls,
              inputTokens: bucket.inputTokens,
              outputTokens: bucket.outputTokens,
              costUsd: bucket.costUsd,
              updatedAt: nowIso,
            });
          } else {
            const existing = monthlyEntries[idx];
            monthlyEntries[idx] = {
              ...existing,
              calls: existing.calls + bucket.calls,
              inputTokens: existing.inputTokens + bucket.inputTokens,
              outputTokens: existing.outputTokens + bucket.outputTokens,
              costUsd: existing.costUsd + bucket.costUsd,
              updatedAt: nowIso,
            };
          }
        }

        const collapsed = collapseBuckets.size;
        const before = file.entries.length;
        file.entries = [...keptDaily, ...monthlyEntries];
        const after = file.entries.length;

        // Only write if something actually changed.
        if (collapsed > 0 || dropped > 0 || before !== after) {
          await writeFileAtomic(file);
        }
        return { collapsed, dropped };
      });
    },
  };
}
