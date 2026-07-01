/**
 * Document Acquisition + Capability Provider public-API runtime
 * (Step 31). Extracted from `node-service-impl.ts`.
 *
 * Methods extracted:
 *   - startDocumentAcquisitionJob + getDocumentAcquisitionJob +
 *     listDocumentAcquisitionJobs + cancelDocumentAcquisitionJob
 *   - startCapabilityProviderJob + getCapabilityProviderJob +
 *     listCapabilityProviderJobs + cancelCapabilityProviderJob
 *   - runDocumentAcquisitionWorker + runCapabilityProviderWorker
 *
 * The runtime takes a loose `any`-typed context (only the class
 * calls it).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { startDocumentAcquisitionJob, advanceDocumentAcquisitionJob, runDocumentAcquisitionWorkerTick } from "./document-acquisition-worker.js";
import { transitionDocumentAcquisitionJob } from "@envoymesh/api";
import { startCapabilityProviderJob, advanceCapabilityProviderJob, runCapabilityProviderWorkerTick } from "./capability-provider-worker.js";
import { transitionCapabilityProviderJob } from "@envoymesh/api";
import { randomUUID } from "node:crypto";

export interface DocAcqCapProvDeps {
  getNodeConfig(): Promise<any>;
  hasDocumentAcquisitionJobStore(): boolean;
  requireDocumentAcquisitionJobStore(): any;
  getLocalManifestCapabilities(): Promise<string[]>;
  getDocumentAcquisitionWorkerDeps(config: any): Promise<any>;
  hasCapabilityProviderJobStore(): boolean;
  requireCapabilityProviderJobStore(): any;
  getCapabilityProviderWorkerDeps(config: any): Promise<any>;
  hasAgentActivityStore(): boolean;
  getAgentActivityStore(): any;
  publishAgentActivity(record: any): Promise<void> | void;
}

export function buildDocAcqCapProvDeps(input: DocAcqCapProvDeps): DocAcqCapProvDeps {
  return input;
}

/* ---------- Document Acquisition ---------- */

export async function startDocumentAcquisitionJobViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  params: { query: string; fileTitleHint?: string; pathHint?: string },
): Promise<{ jobId: string; correlationId: string }> {
  const config = await deps.getNodeConfig();
  if (!deps.hasDocumentAcquisitionJobStore()) {
    throw new Error("document acquisition store unavailable");
  }
  if (!config.documentAcquisitionEnabled) {
    throw new Error("document acquisition disabled");
  }
  if (config.autonomousKillSwitch) {
    throw new Error("autonomous kill switch active");
  }
  const policy = {
    searchBondedOnly: true,
    maxNegotiationRounds: 5,
    maxActiveJobs: 3,
    jobTtlHours: 72,
  };
  const localManifestCapabilities = await deps.getLocalManifestCapabilities();
  const started = await startDocumentAcquisitionJob(
    {
      postureRef: config.documentAcquisitionMandateId ?? "default-document-acquisition",
      policy,
      localManifestCapabilities,
      listJobs: (activeOnly?: boolean) => deps.requireDocumentAcquisitionJobStore().list(!!activeOnly),
      saveJob: (job: any) => deps.requireDocumentAcquisitionJobStore().save(job),
      recordActivity: async (input: any) => {
        if (!deps.hasAgentActivityStore()) return;
        const record = {
          activityId: randomUUID(),
          correlationId: input.correlationId,
          taskId: input.jobId,
          domain: "knowledge",
          kind: "document_acq_stage",
          summary: input.summary,
          createdAt: new Date().toISOString(),
        };
        await deps.getAgentActivityStore().append(record);
        await deps.publishAgentActivity(record);
      },
    },
    params,
  );
  await advanceDocumentAcquisitionJob(
    await deps.getDocumentAcquisitionWorkerDeps(config),
    started.jobId,
  );
  return started;
}

export function getDocumentAcquisitionJobViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  jobId: string,
): any {
  if (!deps.hasDocumentAcquisitionJobStore()) return undefined;
  return deps.requireDocumentAcquisitionJobStore().get(jobId.trim());
}

export function listDocumentAcquisitionJobsViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  activeOnly?: boolean,
): any[] {
  if (!deps.hasDocumentAcquisitionJobStore()) return [];
  return deps.requireDocumentAcquisitionJobStore().list(activeOnly);
}

export async function cancelDocumentAcquisitionJobViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  jobId: string,
): Promise<void> {
  if (!deps.hasDocumentAcquisitionJobStore()) return;
  const job = await deps.requireDocumentAcquisitionJobStore().get(jobId.trim());
  if (!job) return;
  const { job: next } = transitionDocumentAcquisitionJob(job, "KILL_SWITCH");
  await deps.requireDocumentAcquisitionJobStore().save(next);
}

export async function runDocumentAcquisitionWorkerViaPublicRuntime(
  deps: DocAcqCapProvDeps,
): Promise<number> {
  const config = await deps.getNodeConfig();
  return runDocumentAcquisitionWorkerTick(
    await deps.getDocumentAcquisitionWorkerDeps(config),
  );
}

/* ---------- Capability Provider ---------- */

export async function startCapabilityProviderJobViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  params: { goal: string; capabilityIds?: string[]; targetOwnerId?: string },
): Promise<{ jobId: string; correlationId: string }> {
  const config = await deps.getNodeConfig();
  if (!deps.hasCapabilityProviderJobStore()) {
    throw new Error("capability provider store unavailable");
  }
  if (!config.capabilityProviderEnabled) {
    throw new Error("capability provider disabled");
  }
  if (config.autonomousKillSwitch) {
    throw new Error("autonomous kill switch active");
  }
  const started = await startCapabilityProviderJob(
    {
      postureRef:
        config.capabilityProviderMandateId ?? "default-capability-provider",
      policy: { maxActiveJobs: 3, jobTtlHours: 72 },
      listJobs: (activeOnly?: boolean) => deps.requireCapabilityProviderJobStore().list(!!activeOnly),
      saveJob: (job: any) => deps.requireCapabilityProviderJobStore().save(job),
      recordActivity: async (input: any) => {
        if (!deps.hasAgentActivityStore()) return;
        const record = {
          activityId: randomUUID(),
          correlationId: input.correlationId,
          taskId: input.jobId,
          domain: "research",
          kind: "capability_provider_stage",
          summary: input.summary,
          createdAt: new Date().toISOString(),
        };
        await deps.getAgentActivityStore().append(record);
        await deps.publishAgentActivity(record);
      },
    },
    params,
  );
  await advanceCapabilityProviderJob(
    await deps.getCapabilityProviderWorkerDeps(config),
    started.jobId,
  );
  return started;
}

export function getCapabilityProviderJobViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  jobId: string,
): any {
  if (!deps.hasCapabilityProviderJobStore()) return undefined;
  return deps.requireCapabilityProviderJobStore().get(jobId.trim());
}

export function listCapabilityProviderJobsViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  activeOnly?: boolean,
): any[] {
  if (!deps.hasCapabilityProviderJobStore()) return [];
  return deps.requireCapabilityProviderJobStore().list(activeOnly);
}

export async function cancelCapabilityProviderJobViaPublicRuntime(
  deps: DocAcqCapProvDeps,
  jobId: string,
): Promise<void> {
  if (!deps.hasCapabilityProviderJobStore()) return;
  const job = await deps.requireCapabilityProviderJobStore().get(jobId.trim());
  if (!job) return;
  const { job: next } = transitionCapabilityProviderJob(job, "KILL_SWITCH");
  await deps.requireCapabilityProviderJobStore().save(next);
}

export async function runCapabilityProviderWorkerViaPublicRuntime(
  deps: DocAcqCapProvDeps,
): Promise<number> {
  const config = await deps.getNodeConfig();
  return runCapabilityProviderWorkerTick(
    await deps.getCapabilityProviderWorkerDeps(config),
  );
}