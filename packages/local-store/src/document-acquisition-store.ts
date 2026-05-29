import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Sensitivity } from "@envoymesh/protocol";

const FILE_NAME = "document-acquisition-jobs.json";

export type DocumentAcquisitionStage =
  | "queued"
  | "local_search"
  | "bonded_catalog"
  | "wider_discovery"
  | "awaiting_forward_approval"
  | "candidate_ranking"
  | "negotiating"
  | "share_requested"
  | "awaiting_share_accept"
  | "transferring"
  | "completed"
  | "failed"
  | "approval_needed"
  | "cancelled";

export interface DocumentAcquisitionCandidateRecord {
  candidateId: string;
  sourceOwnerId: string;
  sourcePeerId?: string;
  libraryItemId?: string;
  title: string;
  sensitivity: Sensitivity;
  hopDistance: number;
  trustPathLabel?: string;
  score: number;
  status: "open" | "negotiating" | "rejected" | "matched" | "retrieved";
}

export interface LibraryMatchSummaryRecord {
  path: string;
  title: string;
  score: number;
}

/** Persisted job shape — matches @envoymesh/api DocumentAcquisitionJob. */
export interface DocumentAcquisitionJobRecord {
  jobId: string;
  correlationId: string;
  postureRef: string;
  query: string;
  fileTitleHint?: string;
  pathHint?: string;
  stage: DocumentAcquisitionStage;
  candidates: DocumentAcquisitionCandidateRecord[];
  selectedCandidateId?: string;
  negotiationRound: number;
  localMatches: LibraryMatchSummaryRecord[];
  resultVaultPath?: string;
  resultShareId?: string;
  error?: string;
  approvalItemId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface DocumentAcquisitionJobStore {
  list(activeOnly?: boolean): Promise<DocumentAcquisitionJobRecord[]>;
  get(jobId: string): Promise<DocumentAcquisitionJobRecord | undefined>;
  save(job: DocumentAcquisitionJobRecord): Promise<void>;
}

interface JobFile {
  version: "0.1";
  jobs: DocumentAcquisitionJobRecord[];
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function createDocumentAcquisitionJobStore(profileDir: string): DocumentAcquisitionJobStore {
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
