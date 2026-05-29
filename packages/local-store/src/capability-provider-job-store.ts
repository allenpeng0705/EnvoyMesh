import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EnvoyIntent } from "@envoymesh/protocol";

const FILE_NAME = "capability-provider-jobs.json";

export type CapabilityProviderStage =
  | "queued"
  | "routing"
  | "routed"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface CapabilityProviderRouteStepRecord {
  phase: string;
  description: string;
  intents: EnvoyIntent[];
  meshTools?: string[];
  minBond?: "public" | "referred" | "direct";
}

export interface CapabilityProviderJobRecord {
  jobId: string;
  correlationId: string;
  postureRef: string;
  goal: string;
  capabilityIds: string[];
  targetOwnerId?: string;
  stage: CapabilityProviderStage;
  agentRouteId?: string;
  agentRoutePhase?: string;
  routeSteps: CapabilityProviderRouteStepRecord[];
  routeStepIndex: number;
  stepResults: Array<{
    phase: string;
    toolName?: string;
    ok: boolean;
    deferred?: boolean;
    summary: string;
  }>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CapabilityProviderJobStore {
  list(activeOnly?: boolean): Promise<CapabilityProviderJobRecord[]>;
  get(jobId: string): Promise<CapabilityProviderJobRecord | undefined>;
  save(job: CapabilityProviderJobRecord): Promise<void>;
}

interface JobFile {
  version: "0.1";
  jobs: CapabilityProviderJobRecord[];
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

const TERMINAL = new Set<CapabilityProviderStage>(["completed", "failed", "cancelled"]);

export function createCapabilityProviderJobStore(profileDir: string): CapabilityProviderJobStore {
  const filePath = join(profileDir, FILE_NAME);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<JobFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as JobFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.jobs)) {
        return { version: "0.1", jobs: [] };
      }
      return parsed;
    } catch (error) {
      if (isMissing(error)) return { version: "0.1", jobs: [] };
      throw error;
    }
  }

  async function writeFileAtomic(data: JobFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, filePath);
  }

  return {
    async list(activeOnly = false) {
      const file = await loadFile();
      if (!activeOnly) return file.jobs;
      return file.jobs.filter((j) => !TERMINAL.has(j.stage));
    },
    async get(jobId) {
      const file = await loadFile();
      return file.jobs.find((j) => j.jobId === jobId);
    },
    async save(job) {
      const run = async () => {
        const file = await loadFile();
        const idx = file.jobs.findIndex((j) => j.jobId === job.jobId);
        if (idx >= 0) file.jobs[idx] = job;
        else file.jobs.push(job);
        await writeFileAtomic(file);
      };
      writeChain = writeChain.then(run, run);
      await writeChain;
    },
  };
}
