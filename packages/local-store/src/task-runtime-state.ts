import type { Mandate } from "@envoymesh/protocol";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const TASK_RUNTIME_STATE_FILE = "task-runtime-state.json";

export type TaskLifecycleStatus = "open" | "cancelled" | "satisfied";

export interface MandateTerminationRecord {
  taskId: string;
  expiresAt: string;
  closeOnFirstCompletedResult: boolean;
  collectCompletedResults?: number;
}

export interface TaskRuntimeStateFile {
  version: "0.1";
  mandateTerminationByMandateId: Record<string, MandateTerminationRecord>;
  completedResultCountByTaskId?: Record<string, number>;
  taskLifecycleByTaskId: Record<
    string,
    {
      status: TaskLifecycleStatus;
      updatedAt: string;
    }
  >;
}

export interface TaskRuntimeStateStore {
  read(): Promise<TaskRuntimeStateFile>;
  recordMandateTermination(mandate: Mandate, resolvedTaskId: string): Promise<void>;
  getMandateTermination(mandateId: string): Promise<MandateTerminationRecord | undefined>;
  getTaskLifecycle(taskId: string): Promise<TaskLifecycleStatus | undefined>;
  markTaskCancelled(taskId: string): Promise<void>;
  markTaskSatisfied(taskId: string): Promise<void>;
  incrementCompletedResultCount(taskId: string): Promise<number>;
}

export function createTaskRuntimeStateStore(profileDir: string): TaskRuntimeStateStore {
  const statePath = join(profileDir, TASK_RUNTIME_STATE_FILE);

  return {
    read: () => readTaskRuntimeStateFile(statePath),
    recordMandateTermination: async (mandate, resolvedTaskId) => {
      await mutateTaskRuntimeState(statePath, (draft) => {
        draft.mandateTerminationByMandateId[mandate.mandateId] = {
          taskId: resolvedTaskId,
          expiresAt: mandate.expiresAt,
          closeOnFirstCompletedResult: mandate.closeOnFirstCompletedResult ?? false,
          collectCompletedResults: mandate.collectCompletedResults,
        };
      });
    },
    getMandateTermination: async (mandateId) => {
      const file = await readTaskRuntimeStateFile(statePath);
      return file.mandateTerminationByMandateId[mandateId];
    },
    getTaskLifecycle: async (taskId) => {
      const file = await readTaskRuntimeStateFile(statePath);
      return file.taskLifecycleByTaskId[taskId]?.status;
    },
    markTaskCancelled: async (taskId) => {
      await mutateTaskRuntimeState(statePath, (draft) => {
        draft.taskLifecycleByTaskId[taskId] = {
          status: "cancelled",
          updatedAt: new Date().toISOString(),
        };
      });
    },
    markTaskSatisfied: async (taskId) => {
      await mutateTaskRuntimeState(statePath, (draft) => {
        draft.taskLifecycleByTaskId[taskId] = {
          status: "satisfied",
          updatedAt: new Date().toISOString(),
        };
      });
    },
    incrementCompletedResultCount: async (taskId) => {
      let next = 0;
      await mutateTaskRuntimeState(statePath, (draft) => {
        if (!draft.completedResultCountByTaskId) {
          draft.completedResultCountByTaskId = {};
        }
        const prior = draft.completedResultCountByTaskId[taskId] ?? 0;
        next = prior + 1;
        draft.completedResultCountByTaskId[taskId] = next;
      });
      return next;
    },
  };
}

function emptyTaskRuntimeState(): TaskRuntimeStateFile {
  return {
    version: "0.1",
    mandateTerminationByMandateId: {},
    completedResultCountByTaskId: {},
    taskLifecycleByTaskId: {},
  };
}

async function readTaskRuntimeStateFile(path: string): Promise<TaskRuntimeStateFile> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as TaskRuntimeStateFile;
    if (parsed.version !== "0.1") {
      return emptyTaskRuntimeState();
    }
    return {
      version: "0.1",
      mandateTerminationByMandateId: parsed.mandateTerminationByMandateId ?? {},
      completedResultCountByTaskId: parsed.completedResultCountByTaskId ?? {},
      taskLifecycleByTaskId: parsed.taskLifecycleByTaskId ?? {},
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return emptyTaskRuntimeState();
    }
    throw error;
  }
}

async function mutateTaskRuntimeState(
  path: string,
  mutator: (draft: TaskRuntimeStateFile) => void,
): Promise<void> {
  const draft = await readTaskRuntimeStateFile(path);
  mutator(draft);
  await writeTaskRuntimeStateFile(path, draft);
}

async function writeTaskRuntimeStateFile(path: string, file: TaskRuntimeStateFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload = `${JSON.stringify(file, null, 2)}\n`;
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, payload, { mode: 0o600 });
  await rename(tempPath, path);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
