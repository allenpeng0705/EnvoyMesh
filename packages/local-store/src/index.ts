import type { BondLevel } from "@envoymesh/bonds";
import type {
  Capability,
  DeviceCertificate,
  DeviceProfile,
  EnvoyIntent,
  MandateAction,
  TaskJournalEntry,
  TaskLifecycleState,
} from "@envoymesh/protocol";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
  type DeviceIdentity,
  type OwnerIdentity,
} from "@envoymesh/identity";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const PROFILE_FILE = "profile.json";
const TASK_JOURNAL_FILE = "task-journal.jsonl";
const AUDIT_EVENTS_FILE = "audit-events.jsonl";
const APPROVAL_QUEUE_FILE = "approval-queue.jsonl";
const TRUST_STORE_FILE = "trust-records.json";

export interface NodeProfile {
  owner: OwnerIdentity;
  device: DeviceIdentity;
  deviceCertificate: DeviceCertificate;
}

const defaultPrimaryCapabilities: Capability[] = [
  "mesh.listen",
  "mesh.discovery",
  "message.send",
  "device.sync",
];

export async function loadOrCreateNodeProfile(profileDir: string): Promise<NodeProfile> {
  const profilePath = join(profileDir, PROFILE_FILE);

  try {
    return JSON.parse(await readFile(profilePath, "utf8")) as NodeProfile;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  const deviceProfile: DeviceProfile = "primary";
  const profile: NodeProfile = {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile,
      capabilities: defaultPrimaryCapabilities,
    }),
  };

  await mkdir(dirname(profilePath), { recursive: true });
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, {
    mode: 0o600,
  });

  return profile;
}

export type AuditEventType =
  | "message.sent"
  | "message.rejected"
  | "message.verified"
  | "task.handled"
  | "task.rejected";

export interface AuditEvent {
  version: "0.1";
  eventId: string;
  type: AuditEventType;
  createdAt: string;
  intent?: EnvoyIntent;
  taskId?: string;
  mandateId?: string;
  messageId?: string;
  remotePeerId?: string;
  outcome: "allow" | "deny" | "record";
  summary: string;
}

export interface CreateAuditEventInput {
  type: AuditEventType;
  intent?: EnvoyIntent;
  taskId?: string;
  mandateId?: string;
  messageId?: string;
  remotePeerId?: string;
  outcome: AuditEvent["outcome"];
  summary: string;
  createdAt?: string;
  eventId?: string;
}

export type ApprovalRequestStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  version: "0.1";
  approvalId: string;
  ownerId: string;
  taskId: string;
  mandateId?: string;
  requestedAction: MandateAction;
  reason: string;
  status: ApprovalRequestStatus;
  createdAt: string;
  peerOwnerId?: string;
  peerDeviceId?: string;
}

export interface CreateApprovalRequestInput {
  ownerId: string;
  taskId: string;
  requestedAction: MandateAction;
  reason: string;
  mandateId?: string;
  status?: ApprovalRequestStatus;
  createdAt?: string;
  approvalId?: string;
  peerOwnerId?: string;
  peerDeviceId?: string;
}

export interface LocalTaskStore {
  appendTaskJournalEntry(entry: TaskJournalEntry): Promise<void>;
  readTaskJournalEntries(): Promise<TaskJournalEntry[]>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
  readAuditEvents(): Promise<AuditEvent[]>;
  appendApprovalRequest(request: ApprovalRequest): Promise<void>;
  readApprovalRequests(): Promise<ApprovalRequest[]>;
  updateApprovalRequestStatus(approvalId: string, status: ApprovalRequestStatus): Promise<ApprovalRequest>;
}

export interface LocalDispatcherHandledDecision {
  action: "handled";
  intent: EnvoyIntent;
  taskId: string;
  mandateId?: string;
  state: TaskLifecycleState;
}

export interface LocalDispatcherRejectedDecision {
  action: "rejected";
  intent: EnvoyIntent;
  reason: string;
}

export type LocalDispatcherDecision = LocalDispatcherHandledDecision | LocalDispatcherRejectedDecision;

export function createLocalTaskStore(profileDir: string): LocalTaskStore {
  const taskJournalPath = join(profileDir, TASK_JOURNAL_FILE);
  const auditEventsPath = join(profileDir, AUDIT_EVENTS_FILE);
  const approvalQueuePath = join(profileDir, APPROVAL_QUEUE_FILE);

  return {
    async appendTaskJournalEntry(entry) {
      await appendJsonLine(taskJournalPath, entry);
    },

    async readTaskJournalEntries() {
      return readJsonLines<TaskJournalEntry>(taskJournalPath);
    },

    async appendAuditEvent(event) {
      await appendJsonLine(auditEventsPath, event);
    },

    async readAuditEvents() {
      return readJsonLines<AuditEvent>(auditEventsPath);
    },

    async appendApprovalRequest(request) {
      await appendJsonLine(approvalQueuePath, request);
    },

    async readApprovalRequests() {
      return readJsonLines<ApprovalRequest>(approvalQueuePath);
    },

    async updateApprovalRequestStatus(approvalId, status) {
      const requests = await readJsonLines<ApprovalRequest>(approvalQueuePath);
      const request = requests.find((candidate) => candidate.approvalId === approvalId);

      if (!request) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      request.status = status;
      await writeJsonLines(approvalQueuePath, requests);
      return request;
    },
  };
}

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  return {
    version: "0.1",
    eventId: input.eventId ?? `audit_${randomUUID()}`,
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    intent: input.intent,
    taskId: input.taskId,
    mandateId: input.mandateId,
    messageId: input.messageId,
    remotePeerId: input.remotePeerId,
    outcome: input.outcome,
    summary: input.summary,
  };
}

export function createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequest {
  return {
    version: "0.1",
    approvalId: input.approvalId ?? `approval_${randomUUID()}`,
    ownerId: input.ownerId,
    taskId: input.taskId,
    mandateId: input.mandateId,
    requestedAction: input.requestedAction,
    reason: input.reason,
    status: input.status ?? "pending",
    createdAt: input.createdAt ?? new Date().toISOString(),
    peerOwnerId: input.peerOwnerId,
    peerDeviceId: input.peerDeviceId,
  };
}

export function auditEventForDispatcherDecision(
  decision: LocalDispatcherDecision,
  input: {
    messageId?: string;
    remotePeerId?: string;
    createdAt?: string;
  } = {},
): AuditEvent {
  if (decision.action === "handled") {
    return createAuditEvent({
      type: "task.handled",
      intent: decision.intent,
      taskId: decision.taskId,
      mandateId: decision.mandateId,
      messageId: input.messageId,
      remotePeerId: input.remotePeerId,
      outcome: "record",
      summary: `Handled ${decision.intent} as ${decision.state}.`,
      createdAt: input.createdAt,
    });
  }

  return createAuditEvent({
    type: "task.rejected",
    intent: decision.intent,
    messageId: input.messageId,
    remotePeerId: input.remotePeerId,
    outcome: "deny",
    summary: decision.reason,
    createdAt: input.createdAt,
  });
}

export interface TrustRecord {
  version: "0.1";
  peerOwnerId: string;
  level: Exclude<BondLevel, "self">;
  displayName?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SetTrustRecordInput {
  peerOwnerId: string;
  level: TrustRecord["level"];
  displayName?: string;
  note?: string;
  now?: string;
}

export interface LocalTrustStore {
  listTrustRecords(): Promise<TrustRecord[]>;
  setTrustRecord(input: SetTrustRecordInput): Promise<TrustRecord>;
  removeTrustRecord(peerOwnerId: string): Promise<TrustRecord>;
  getTrustRecord(peerOwnerId: string): Promise<TrustRecord | undefined>;
}

interface TrustStoreFile {
  version: "0.1";
  records: TrustRecord[];
}

export function createLocalTrustStore(profileDir: string): LocalTrustStore {
  const trustStorePath = join(profileDir, TRUST_STORE_FILE);

  return {
    async listTrustRecords() {
      return (await readTrustStoreFile(trustStorePath)).records.sort((left, right) =>
        left.peerOwnerId.localeCompare(right.peerOwnerId),
      );
    },

    async getTrustRecord(peerOwnerId) {
      return (await readTrustStoreFile(trustStorePath)).records.find(
        (record) => record.peerOwnerId === peerOwnerId,
      );
    },

    async setTrustRecord(input) {
      const file = await readTrustStoreFile(trustStorePath);
      const now = input.now ?? new Date().toISOString();
      const existing = file.records.find((record) => record.peerOwnerId === input.peerOwnerId);

      if (existing) {
        existing.level = input.level;
        existing.displayName = input.displayName ?? existing.displayName;
        existing.note = input.note ?? existing.note;
        existing.updatedAt = now;
        await writeTrustStoreFile(trustStorePath, file);
        return existing;
      }

      const record: TrustRecord = {
        version: "0.1",
        peerOwnerId: input.peerOwnerId,
        level: input.level,
        displayName: input.displayName,
        note: input.note,
        createdAt: now,
        updatedAt: now,
      };

      file.records.push(record);
      await writeTrustStoreFile(trustStorePath, file);
      return record;
    },

    async removeTrustRecord(peerOwnerId) {
      const file = await readTrustStoreFile(trustStorePath);
      const record = file.records.find((candidate) => candidate.peerOwnerId === peerOwnerId);

      if (!record) {
        throw new Error(`Trust record not found: ${peerOwnerId}`);
      }

      file.records = file.records.filter((candidate) => candidate.peerOwnerId !== peerOwnerId);
      await writeTrustStoreFile(trustStorePath, file);
      return record;
    },
  };
}

export function parseTrustLevel(value: string): TrustRecord["level"] {
  if (value === "direct" || value === "referred" || value === "public" || value === "blocked") {
    return value;
  }

  throw new Error(`Invalid trust level: ${value}`);
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

async function writeJsonLines(path: string, values: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, values.map((value) => JSON.stringify(value)).join("\n") + "\n", {
    mode: 0o600,
  });
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  let contents: string;

  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  return contents
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function readTrustStoreFile(path: string): Promise<TrustStoreFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as TrustStoreFile;
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        version: "0.1",
        records: [],
      };
    }

    throw error;
  }
}

async function writeTrustStoreFile(path: string, file: TrustStoreFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
