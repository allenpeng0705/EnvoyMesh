/**
 * Task result store — caches the latest `task.result` payload per taskId so the
 * Activity drill-down (Phase 34C) can render typed Artifacts without forcing
 * the user to scroll the audit journal. Same shape as `agent-card-store.ts`:
 * one JSON file keyed by `taskId`, atomic rename writes, serialized through a
 * single write chain so concurrent inbound `task.result` envelopes never lose
 * data.
 *
 * Audit events remain the source of truth for *every* task.result (one row per
 * envelope). This store only keeps the *latest* payload per taskId so the UI
 * can render it. Older results are best-effort: a follow-up `task.result`
 * for the same taskId overwrites the prior payload.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TaskResultPayload } from "@envoymesh/protocol";

const TASK_RESULTS_FILE = "task-results.json";

interface TaskResultStoreFile {
  version: "0.1";
  results: TaskResultPayload[];
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export interface LocalTaskResultsStore {
  /** Upsert by `taskId`; if the same taskId arrives again the latest payload wins. */
  recordTaskResult(payload: TaskResultPayload): Promise<void>;
  getTaskResult(taskId: string): Promise<TaskResultPayload | undefined>;
  listTaskResults(): Promise<TaskResultPayload[]>;
}

export function createLocalTaskResultsStore(profileDir: string): LocalTaskResultsStore {
  const filePath = join(profileDir, TASK_RESULTS_FILE);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<TaskResultStoreFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as TaskResultStoreFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.results)) {
        return { version: "0.1", results: [] };
      }
      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) return { version: "0.1", results: [] };
      throw error;
    }
  }

  async function writeFileAtomic(data: TaskResultStoreFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, filePath);
  }

  function enqueueWrite(task: () => Promise<void>): Promise<void> {
    const done = writeChain.then(task);
    writeChain = done.then(
      () => {},
      () => {},
    );
    return done;
  }

  return {
    async recordTaskResult(payload) {
      const taskId = payload.taskId;
      if (typeof taskId !== "string" || taskId.length === 0) {
        // Defensive: the protocol schema enforces this, but a corrupt
        // inbound payload should not poison the on-disk file.
        return;
      }
      await enqueueWrite(async () => {
        const file = await loadFile();
        const next: TaskResultPayload = { ...payload, taskId };
        const existingIdx = file.results.findIndex((r) => r.taskId === taskId);
        if (existingIdx >= 0) {
          file.results[existingIdx] = next;
        } else {
          file.results.push(next);
        }
        await writeFileAtomic(file);
      });
    },

    async getTaskResult(taskId) {
      const file = await loadFile();
      return file.results.find((r) => r.taskId === taskId);
    },

    async listTaskResults() {
      const file = await loadFile();
      return file.results.slice();
    },
  };
}
