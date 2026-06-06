import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { TerminalAssistPlan } from "@envoymesh/api";

export interface PersistedGoalLoop {
  goal: string;
  stepCount: number;
  maxSteps: number;
  suspended: boolean;
}

export interface PersistedAssistSession {
  lastGoal?: string;
  watchGoal?: string;
  goalLoop?: PersistedGoalLoop;
  activePlan?: TerminalAssistPlan;
  pinnedContextSessionId?: string;
  execPaneEnabled?: boolean;
  backgroundWatchGoal?: string;
  backgroundWatchStableMs?: number;
}

export interface PersistedAssistStateFile {
  version: 1;
  sessions: Record<string, PersistedAssistSession>;
}

const EMPTY_FILE: PersistedAssistStateFile = { version: 1, sessions: {} };

export function assistStateFilePath(profileDir: string): string {
  return join(profileDir, "terminals", "assist-state.json");
}

export async function loadPersistedAssistState(profileDir: string): Promise<PersistedAssistStateFile> {
  const path = assistStateFilePath(profileDir);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as PersistedAssistStateFile;
    if (parsed.version !== 1 || typeof parsed.sessions !== "object") {
      return { ...EMPTY_FILE };
    }
    return parsed;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { ...EMPTY_FILE };
    throw err;
  }
}

export async function savePersistedAssistState(
  profileDir: string,
  file: PersistedAssistStateFile,
): Promise<void> {
  const path = assistStateFilePath(profileDir);
  await mkdir(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}

export function sessionToPersisted(input: {
  lastGoal?: string;
  watchGoal?: string;
  goalLoop?: { goal: string; stepCount: number; maxSteps: number; active: boolean };
  activePlan?: TerminalAssistPlan;
  pinnedContextSessionId?: string;
  execPaneEnabled?: boolean;
  backgroundWatch?: { goal: string; stableMs: number };
}): PersistedAssistSession | undefined {
  const hasGoalLoop = Boolean(input.goalLoop);
  const hasPlan = Boolean(input.activePlan);
  const hasPin = Boolean(input.pinnedContextSessionId?.trim());
  const hasLastGoal = Boolean(input.lastGoal?.trim());
  const hasWatch = Boolean(input.watchGoal?.trim());
  const hasExec = Boolean(input.execPaneEnabled);
  const hasBg = Boolean(input.backgroundWatch?.goal);
  if (!hasGoalLoop && !hasPlan && !hasPin && !hasLastGoal && !hasWatch && !hasExec && !hasBg) {
    return undefined;
  }
  return {
    ...(input.lastGoal ? { lastGoal: input.lastGoal } : {}),
    ...(input.watchGoal ? { watchGoal: input.watchGoal } : {}),
    ...(input.goalLoop
      ? {
          goalLoop: {
            goal: input.goalLoop.goal,
            stepCount: input.goalLoop.stepCount,
            maxSteps: input.goalLoop.maxSteps,
            suspended: !input.goalLoop.active,
          },
        }
      : {}),
    ...(input.activePlan ? { activePlan: { ...input.activePlan, steps: [...input.activePlan.steps] } } : {}),
    ...(input.pinnedContextSessionId ? { pinnedContextSessionId: input.pinnedContextSessionId } : {}),
    ...(input.execPaneEnabled ? { execPaneEnabled: true } : {}),
    ...(input.backgroundWatch
      ? {
          backgroundWatchGoal: input.backgroundWatch.goal,
          backgroundWatchStableMs: input.backgroundWatch.stableMs,
        }
      : {}),
  };
}
