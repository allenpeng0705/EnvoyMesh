import type { BondLevel } from "@envoymesh/bonds";
import type {
  Capability,
  DeviceCertificate,
  DeviceProfile,
  EnvoyIntent,
  MandateAction,
  SystemSignalPayload,
  TaskJournalEntry,
  TaskLifecycleState,
} from "@envoymesh/protocol";
import {
  parseTaskAcceptPayload,
  parseTaskCancelPayload,
  parseTaskHeartbeatPayload,
  parseTaskMandatePayload,
  parseTaskNegotiatePayload,
  parseTaskProposePayload,
  parseTaskRejectPayload,
  parseTaskResultPayload,
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
const PEER_DIRECTORY_FILE = "peer-directory.json";
const DISCOVERY_EVENTS_FILE = "discovery-events.jsonl";

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

export async function saveNodeProfile(profileDir: string, profile: NodeProfile): Promise<void> {
  const profilePath = join(profileDir, PROFILE_FILE);
  await mkdir(dirname(profilePath), { recursive: true });
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, {
    mode: 0o600,
  });
}

export type AuditEventType =
  | "message.sent"
  | "message.rejected"
  | "message.verified"
  | "task.handled"
  | "task.rejected"
  | "p2p.trace";

export type AuditDirection = "inbound" | "outbound";

export type AuditVerificationStatus = "verified" | "rejected";

export interface AuditEvent {
  version: "0.1";
  eventId: string;
  type: AuditEventType;
  createdAt: string;
  intent?: EnvoyIntent;
  taskId?: string;
  mandateId?: string;
  messageId?: string;
  correlationId?: string;
  remotePeerId?: string;
  direction?: AuditDirection;
  verificationStatus?: AuditVerificationStatus;
  latencyMs?: number;
  protocol?: string;
  outcome: "allow" | "deny" | "record";
  summary: string;
}

export interface CreateAuditEventInput {
  type: AuditEventType;
  intent?: EnvoyIntent;
  taskId?: string;
  mandateId?: string;
  messageId?: string;
  correlationId?: string;
  remotePeerId?: string;
  direction?: AuditDirection;
  verificationStatus?: AuditVerificationStatus;
  latencyMs?: number;
  protocol?: string;
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
  appendDiscoveryEvent(event: DiscoveryEvent): Promise<void>;
  readDiscoveryEvents(): Promise<DiscoveryEvent[]>;
  appendApprovalRequest(request: ApprovalRequest): Promise<void>;
  readApprovalRequests(): Promise<ApprovalRequest[]>;
  updateApprovalRequestStatus(approvalId: string, status: ApprovalRequestStatus): Promise<ApprovalRequest>;
}

export interface DiscoveryEvent {
  version: "0.1";
  eventId: string;
  createdAt: string;
  direction: "inbound" | "outbound";
  intent: "discovery.request" | "discovery.response";
  ownerId: string;
  remotePeerId?: string;
  correlationId?: string;
  requestMessageId?: string;
  matchCount: number;
  requestedTagHashes: string[];
  requestedCapabilities: string[];
  matchedTagHashes: string[];
  matchedCapabilities: string[];
  trustLevel?: TrustRecord["level"];
  outcome: "allow" | "deny" | "record";
  summary: string;
}

export interface CreateDiscoveryEventInput {
  createdAt?: string;
  eventId?: string;
  direction: DiscoveryEvent["direction"];
  intent: DiscoveryEvent["intent"];
  ownerId: string;
  remotePeerId?: string;
  correlationId?: string;
  requestMessageId?: string;
  matchCount?: number;
  requestedTagHashes?: string[];
  requestedCapabilities?: string[];
  matchedTagHashes?: string[];
  matchedCapabilities?: string[];
  trustLevel?: TrustRecord["level"];
  outcome: DiscoveryEvent["outcome"];
  summary: string;
}

export interface MorningReportEntry {
  ownerId: string;
  peerId?: string;
  trustLevel: TrustRecord["level"] | "unknown";
  score: number;
  reason: string;
  lastSeenAt?: string;
  discoveryMatchCount: number;
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
  const discoveryEventsPath = join(profileDir, DISCOVERY_EVENTS_FILE);

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

    async appendDiscoveryEvent(event) {
      await appendJsonLine(discoveryEventsPath, event);
    },

    async readDiscoveryEvents() {
      return readJsonLines<DiscoveryEvent>(discoveryEventsPath);
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

export function createDiscoveryEvent(input: CreateDiscoveryEventInput): DiscoveryEvent {
  return {
    version: "0.1",
    eventId: input.eventId ?? `discovery_${randomUUID()}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
    direction: input.direction,
    intent: input.intent,
    ownerId: input.ownerId,
    remotePeerId: input.remotePeerId,
    correlationId: input.correlationId,
    requestMessageId: input.requestMessageId,
    matchCount: input.matchCount ?? 0,
    requestedTagHashes: input.requestedTagHashes ?? [],
    requestedCapabilities: input.requestedCapabilities ?? [],
    matchedTagHashes: input.matchedTagHashes ?? [],
    matchedCapabilities: input.matchedCapabilities ?? [],
    trustLevel: input.trustLevel,
    outcome: input.outcome,
    summary: input.summary,
  };
}

export function buildMorningReportDigest(input: {
  trustRecords: TrustRecord[];
  peerDirectoryRecords: PeerDirectoryRecord[];
  discoveryEvents: DiscoveryEvent[];
  limit?: number;
}): MorningReportEntry[] {
  const trustByOwner = new Map(input.trustRecords.map((record) => [record.peerOwnerId, record]));
  const peerByOwner = new Map(input.peerDirectoryRecords.map((record) => [record.ownerId, record]));
  const discoveryByOwner = new Map<
    string,
    {
      matches: number;
      lastSeenAt?: string;
    }
  >();

  for (const event of input.discoveryEvents) {
    const current = discoveryByOwner.get(event.ownerId);
    discoveryByOwner.set(event.ownerId, {
      matches: (current?.matches ?? 0) + event.matchCount,
      lastSeenAt: current?.lastSeenAt
        ? current.lastSeenAt.localeCompare(event.createdAt) > 0
          ? current.lastSeenAt
          : event.createdAt
        : event.createdAt,
    });
  }

  const ownerIds = new Set<string>([
    ...input.trustRecords.map((record) => record.peerOwnerId),
    ...input.peerDirectoryRecords.map((record) => record.ownerId),
    ...input.discoveryEvents.map((event) => event.ownerId),
  ]);

  const ranked = [...ownerIds].map((ownerId): MorningReportEntry => {
    const trust = trustByOwner.get(ownerId);
    const peer = peerByOwner.get(ownerId);
    const discovery = discoveryByOwner.get(ownerId);
    const trustScore = trustLevelScore(trust?.level);
    const matchScore = Math.min(discovery?.matches ?? 0, 20) * 2;
    const recencyScore = peer?.lastSeenAt ? recencyPoints(peer.lastSeenAt) : 0;
    const score = trustScore + matchScore + recencyScore;
    return {
      ownerId,
      peerId: peer?.peerId,
      trustLevel: trust?.level ?? "unknown",
      score,
      reason: `trust=${trust?.level ?? "unknown"}, matches=${discovery?.matches ?? 0}, recency=${recencyScore}`,
      lastSeenAt: peer?.lastSeenAt ?? discovery?.lastSeenAt,
      discoveryMatchCount: discovery?.matches ?? 0,
    };
  });

  return ranked.sort((left, right) => right.score - left.score).slice(0, input.limit ?? 10);
}

function trustLevelScore(level: TrustRecord["level"] | undefined): number {
  switch (level) {
    case "direct":
      return 60;
    case "referred":
      return 45;
    case "public":
      return 20;
    case "blocked":
      return -100;
    default:
      return 10;
  }
}

function recencyPoints(lastSeenAt: string): number {
  const minutes = Math.max(0, (Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (minutes <= 15) {
    return 20;
  }
  if (minutes <= 60) {
    return 12;
  }
  if (minutes <= 24 * 60) {
    return 6;
  }
  return 2;
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
    correlationId: input.correlationId,
    remotePeerId: input.remotePeerId,
    direction: input.direction,
    verificationStatus: input.verificationStatus,
    latencyMs: input.latencyMs,
    protocol: input.protocol,
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
    correlationId?: string;
    remotePeerId?: string;
    createdAt?: string;
    direction?: AuditDirection;
    verificationStatus?: AuditVerificationStatus;
    latencyMs?: number;
  } = {},
): AuditEvent {
  if (decision.action === "handled") {
    return createAuditEvent({
      type: "task.handled",
      intent: decision.intent,
      taskId: decision.taskId,
      mandateId: decision.mandateId,
      messageId: input.messageId,
      correlationId: input.correlationId ?? decision.taskId,
      remotePeerId: input.remotePeerId,
      direction: input.direction,
      verificationStatus: input.verificationStatus ?? "verified",
      latencyMs: input.latencyMs,
      outcome: "record",
      summary: `Handled ${decision.intent} as ${decision.state}.`,
      createdAt: input.createdAt,
    });
  }

  return createAuditEvent({
    type: "task.rejected",
    intent: decision.intent,
    messageId: input.messageId,
    correlationId: input.correlationId,
    remotePeerId: input.remotePeerId,
    direction: input.direction,
    verificationStatus: input.verificationStatus ?? "rejected",
    latencyMs: input.latencyMs,
    outcome: "deny",
    summary: decision.reason,
    createdAt: input.createdAt,
  });
}

export function deriveCorrelationIdFromEnvelope(envelope: {
  correlationId?: string;
  intent: EnvoyIntent;
  payload: unknown;
}): string | undefined {
  if (envelope.correlationId) {
    return envelope.correlationId;
  }

  return inferTaskIdFromA2APayload(envelope.intent, envelope.payload);
}

function inferTaskIdFromA2APayload(intent: EnvoyIntent, payload: unknown): string | undefined {
  try {
    switch (intent) {
      case "task.mandate": {
        const parsed = parseTaskMandatePayload(payload);
        return parsed.taskId ?? parsed.mandate.mandateId;
      }
      case "task.propose":
        return parseTaskProposePayload(payload).taskId;
      case "task.negotiate":
        return parseTaskNegotiatePayload(payload).taskId;
      case "task.accept":
        return parseTaskAcceptPayload(payload).taskId;
      case "task.reject":
        return parseTaskRejectPayload(payload).taskId;
      case "task.cancel":
        return parseTaskCancelPayload(payload).taskId;
      case "task.heartbeat":
        return parseTaskHeartbeatPayload(payload).taskId;
      case "task.result":
        return parseTaskResultPayload(payload).taskId;
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
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

export interface PeerDirectoryRecord {
  version: "0.1";
  ownerId: string;
  peerId: string;
  deviceId: string;
  /** Present when learned from system.signal; used for signed payloads such as data-transfer vouchers. */
  devicePublicKeyPem?: string;
  lastSeenAt: string;
  listenAddrs: string[];
}

export interface LocalPeerDirectoryStore {
  listPeerRecords(): Promise<PeerDirectoryRecord[]>;
  getPeerByOwnerId(ownerId: string): Promise<PeerDirectoryRecord | undefined>;
  upsertPeerFromSignal(input: {
    peerId: string;
    payload: SystemSignalPayload;
    seenAt?: string;
  }): Promise<PeerDirectoryRecord>;
}

interface PeerDirectoryFile {
  version: "0.1";
  records: PeerDirectoryRecord[];
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

export function createLocalPeerDirectoryStore(profileDir: string): LocalPeerDirectoryStore {
  const directoryPath = join(profileDir, PEER_DIRECTORY_FILE);

  return {
    async listPeerRecords() {
      return (await readPeerDirectoryFile(directoryPath)).records.sort((left, right) =>
        right.lastSeenAt.localeCompare(left.lastSeenAt),
      );
    },

    async getPeerByOwnerId(ownerId) {
      return (await readPeerDirectoryFile(directoryPath)).records.find((record) => record.ownerId === ownerId);
    },

    async upsertPeerFromSignal(input) {
      const file = await readPeerDirectoryFile(directoryPath);
      const seenAt = input.seenAt ?? new Date().toISOString();
      const existing = file.records.find((record) => record.ownerId === input.payload.ownerId);
      if (existing) {
        existing.peerId = input.peerId;
        existing.deviceId = input.payload.deviceId;
        existing.devicePublicKeyPem = input.payload.deviceCertificate.devicePublicKeyPem;
        existing.lastSeenAt = seenAt;
        existing.listenAddrs = input.payload.listenAddrs;
        await writePeerDirectoryFile(directoryPath, file);
        return existing;
      }

      const created: PeerDirectoryRecord = {
        version: "0.1",
        ownerId: input.payload.ownerId,
        peerId: input.peerId,
        deviceId: input.payload.deviceId,
        devicePublicKeyPem: input.payload.deviceCertificate.devicePublicKeyPem,
        lastSeenAt: seenAt,
        listenAddrs: input.payload.listenAddrs,
      };
      file.records.push(created);
      await writePeerDirectoryFile(directoryPath, file);
      return created;
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

async function readPeerDirectoryFile(path: string): Promise<PeerDirectoryFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PeerDirectoryFile;
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

async function writePeerDirectoryFile(path: string, file: PeerDirectoryFile): Promise<void> {
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

export * from "./task-runtime-state.js";
