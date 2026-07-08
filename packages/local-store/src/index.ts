import type { BondLevel } from "@envoymesh/bonds";
import type {
  Capability,
  ChainReport,
  DeviceCertificate,
  DeviceProfile,
  EnvoyIntent,
  HumanProfilePayload,
  MandateAction,
  RelayBookState,
  RelayRelation,
  RelayVisibility,
  Sensitivity,
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
  deriveDeviceId,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  type DeviceIdentity,
  type OwnerIdentity,
} from "@envoymesh/identity";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  createJsonlIndexAppender,
  queryJsonlIndex,
  readJsonlIndex,
  rebuildJsonlIndex,
  type JsonlIndexEntry,
  type JsonlIndexQueryParams,
} from "./jsonl-query-index.js";
import { AUDIT_QUERY_INDEX_FILE } from "./storage-gate.js";
import { createLocalTaskResultsStore } from "./task-results-store.js";
import {
  createLocalCompanyInviteStore,
  type CompanyInviteRecord,
  type LocalCompanyInviteStore,
} from "./company-invite-store.js";
import {
  createLocalFleetManifestStore,
  type FleetManifestRecord,
  type LocalFleetManifestStore,
} from "./fleet-manifest-store.js";
import {
  createLocalChainReportsStore,
  type ChainReportRecord,
  type ListChainReportsParams,
  type LocalChainReportsStore,
} from "./chain-reports-store.js";
import {
  createCostRollupStore,
  type CostRollupEntry,
  type CostRollupStore,
  type CostSummary,
  type CostSummaryFilters,
  type RecordCallInput,
} from "./cost-rollup-store.js";
import {
  createLocalChainRecipesStore,
  type ChainRecipeRecord,
  type LocalChainRecipesStore,
} from "./chain-recipes-store.js";

const PEER_DIRECTORY_READ_BUDGET_MS = 20_000;

/** Bounded read so a stuck `fs.readFile` cannot hang the node forever (Windows + AV / cloud-sync paths). */
async function readPeerDirectoryRaw(path: string): Promise<string> {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return readFile(path, { encoding: "utf8", signal: AbortSignal.timeout(PEER_DIRECTORY_READ_BUDGET_MS) });
  }
  return readFile(path, "utf8");
}

const PROFILE_FILE = "profile.json";
const TASK_JOURNAL_FILE = "task-journal.jsonl";
const AUDIT_EVENTS_FILE = "audit-events.jsonl";
const APPROVAL_QUEUE_FILE = "approval-queue.jsonl";
const TRUST_STORE_FILE = "trust-records.json";
const PEER_DIRECTORY_FILE = "peer-directory.json";
const DISCOVERY_EVENTS_FILE = "discovery-events.jsonl";
const REPUTATION_STORE_FILE = "peer-reputation.json";
const SHARE_EVENTS_FILE = "share-events.jsonl";
const RELAY_BOOK_FILE = "relay-book.json";
const RELAY_SUMMARIES_FILE = "relay-summaries.json";
const HUMAN_PROFILE_FILE = "human-profile.json";

/** Skip JSONL lines larger than this to avoid OOM when a single record is pathological or corrupted. */
const MAX_JSONL_LINE_CHARS = 12 * 1024 * 1024;
/** Cap text copied from audit events into relay manager snapshots (recentTraces, warnings). */
const MAX_SNAPSHOT_EMBEDDED_CHARS = 4096;

function truncateForSnapshotEmbed(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 1) {
    return "";
  }
  return `${text.slice(0, maxChars - 1)}…`;
}

/**
 * Retention policy for bounded JSONL files.
 */
export interface JsonlRetentionPolicy {
  /** Maximum file size in bytes before rotation (default: 100MB) */
  maxSizeBytes?: number;
  /** Maximum age of entries in milliseconds (default: 7 days) */
  maxAgeMs?: number;
}

/**
 * Serialize appends to a JSONL file so concurrent audit/journal writes cannot interleave bytes
 * and produce a corrupted line (two JSON objects sharing one line fragment).
 * Supports optional retention policy for size and TTL-based rotation.
 */
function createSerialJsonlAppender(
  path: string,
  policy: JsonlRetentionPolicy = {},
): (value: unknown) => Promise<void> {
  const { maxSizeBytes = 100 * 1024 * 1024, maxAgeMs = 7 * 24 * 60 * 60 * 1000 } = policy;
  let tail: Promise<unknown> = Promise.resolve();

  return (value: unknown) => {
    const done = tail.then(() => appendJsonLineWithRetention(path, value, maxSizeBytes, maxAgeMs));
    tail = done.then(
      () => {},
      () => {},
    );
    return done;
  };
}

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
  | "policy.decided"
  | "vault.searched"
  | "vault.ipfs_export.started"
  | "vault.ipfs_export.completed"
  | "vault.ipfs_export.failed"
  | "vault.ipfs_export.helia_shadow.started"
  | "vault.ipfs_export.helia_parity.matched"
  | "vault.ipfs_export.helia_parity.mismatched"
  | "vault.ipfs_gateway_verify.started"
  | "vault.ipfs_gateway_verify.completed"
  | "vault.ipfs_gateway_verify.failed"
  | "vault.ipfs_pin.completed"
  | "model.routed"
  | "share.preview"
  | "share.request"
  | "share.accept"
  | "p2p.trace"
  | "autonomous.decided"
  | "tool.called"
  | "discovery.capability.verified"
  | "discovery.capability.rejected"
  | "trigger.fired"
  | "terminal.session.created"
  | "terminal.session.closed"
  | "terminal.session.renamed"
  | "terminal.session.exited"
  | "terminal.agent.proposed"
  | "terminal.agent.executed"
  | "terminal.agent.denied"
  | "terminal.agent.modelChanged"
  | "task.tool.propose"
  | "task.tool.cancel"
  | "task.tool.await_result"
  | "agent.card.auto_fetched"
  | "agent.card.auto_fetch_failed"
  | "bond.pre_staged"
  | "bond.pre_staged_failed"
  | "bond.revoked"
  | "device.merge"
  | "device.revoked"
  // Phase 40 — Agent Network Collaboration Layer.
  // Chain events flow through createAuditEvent using:
  //   - taskId     → the orchestrator's chain-level taskId (also stored in
  //                  the chain-reports-store as chainId)
  //   - mandateId  → the chain mandate id
  //   - correlationId → thread key stitching chain.* events for a single chain
  // The subtaskId / depth fields are encoded into the summary string by the
  // orchestrator (e.g. "subtask=sub-A depth=2"). Subtask-specific journal
  // entries (with structured subtaskId / parentTaskId / depth fields) go via
  // appendTaskJournalEntry, not createAuditEvent.
  | "chain.created"
  | "chain.planned"
  | "chain.launched"
  | "chain.completed"
  | "chain.failed"
  | "chain.cancelled"
  | "chain.subtask_proposed"
  | "chain.bid_received"
  | "chain.awarded"
  | "chain.partial_received"
  | "chain.subtask_completed"
  | "chain.subtask_split"
  | "chain.merged"
  | "chain.re_bid"
  | "chain.report_published"
  | "chain.report_received"
  | "chain.depth_exceeded"
  | "chain.budget_exceeded"
  | "chain.bid_expired";

export type AuditDirection = "inbound" | "outbound" | "local";

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

export interface RelayManagerRosterRuntimeEntry {
  peerId: string;
  ownerId?: string;
  capabilities: string[];
  advertisements: Array<{ visibility: RelayVisibility; capability?: string; topicHash?: string }>;
  lastSeenAt: number;
  expiresAt: number;
  reservationFreshUntil: number;
}

export interface RelayManagerRelayBookRuntimeEntry {
  relayId: string;
  level?: number;
  region?: string;
  addrs: string[];
  relation: RelayRelation;
  state: RelayBookState;
  lastVerifiedAt: number;
  expiresAt: number;
  failureCount: number;
}

export interface RelayManagerSummaryRuntimeEntry {
  relayId: string;
  level: number;
  region?: string;
  livePeerCount: number;
  childRelayCount: number;
  topicBuckets: string[];
  lastSeenAt: number;
  expiresAt: number;
}

export interface RelayManagerRoutingMetrics {
  forwardedLookupCount: number;
  duplicateQueryDropCount: number;
  negativeCacheSize: number;
  selectedForwardTargetCount: number;
  failedForwardCount: number;
  collectedForwardResponseCount: number;
}

export type RelayHealthStatus = "healthy" | "degraded" | "unhealthy" | "critical";
export type RelayHealthAction =
  | "none"
  | "reprobe-neighbors"
  | "refresh-relay-summary"
  | "restart-libp2p"
  | "exit-for-supervisor";

export interface RelayHealthSnapshot {
  status: RelayHealthStatus;
  checkedAt: string;
  lastHealthyAt?: string;
  reasons: string[];
  actions: RelayHealthAction[];
  recoveryCounters: {
    healthChecks: number;
    degraded: number;
    unhealthy: number;
    critical: number;
    softRepair: number;
    restartRequested: number;
    exitRequested: number;
  };
}

export interface RelayManagerRuntimeState {
  enabled: boolean;
  relayServerEnabled: boolean;
  peerId: string;
  listenAddrs: string[];
  uptimeMs?: number;
  rosterEntries: RelayManagerRosterRuntimeEntry[];
  relayBook: RelayManagerRelayBookRuntimeEntry[];
  summaries: RelayManagerSummaryRuntimeEntry[];
  routing: RelayManagerRoutingMetrics;
  health?: RelayHealthSnapshot;
}

export interface RelayManagerSnapshot {
  generatedAt: string;
  source: "runtime" | "audit" | "empty";
  relay: {
    peerId?: string;
    enabled: boolean;
    relayServerEnabled: boolean;
    listenAddrs: string[];
    uptimeMs?: number;
  };
  roster: {
    total: number;
    fresh: number;
    stale: number;
    visibilityCounts: Record<string, number>;
    topCapabilities: Array<{ capability: string; count: number }>;
    topTopics: Array<{ topicHash: string; count: number }>;
  };
  relayBook: {
    total: number;
    byRelation: Record<string, number>;
    byState: Record<string, number>;
    neighbors: RelayManagerRelayBookRuntimeEntry[];
  };
  summaries: {
    total: number;
    fresh: number;
    stale: number;
    entries: RelayManagerSummaryRuntimeEntry[];
  };
  routing: RelayManagerRoutingMetrics & {
    recentTraces: Array<{
      createdAt: string;
      protocol?: string;
      remotePeerId?: string;
      summary: string;
    }>;
  };
  health: RelayHealthSnapshot;
  warnings: string[];
}

export interface BuildRelayManagerSnapshotInput {
  profile?: NodeProfile;
  auditEvents?: AuditEvent[];
  runtime?: RelayManagerRuntimeState;
  now?: () => number;
}

export const RELAY_MANAGER_SNAPSHOT_PROTOCOL = "relay.manager.snapshot";

export function buildRelayManagerSnapshot(input: BuildRelayManagerSnapshotInput): RelayManagerSnapshot {
  const now = input.now ?? Date.now;
  const generatedAt = new Date(now()).toISOString();
  if (input.runtime) {
    return snapshotFromRuntime(input.runtime, input.auditEvents ?? [], generatedAt, now());
  }

  const latest = lastRelayManagerSnapshot(input.auditEvents ?? []);
  if (latest) {
    return latest;
  }

  return emptyRelayManagerSnapshot(generatedAt, input.profile);
}

export function serializeRelayManagerSnapshot(snapshot: RelayManagerSnapshot): string {
  return `relay manager snapshot json=${JSON.stringify(snapshot)}`;
}

function snapshotFromRuntime(
  runtime: RelayManagerRuntimeState,
  auditEvents: AuditEvent[],
  generatedAt: string,
  current: number,
): RelayManagerSnapshot {
  const freshRoster = runtime.rosterEntries.filter((entry) => entry.expiresAt > current && entry.reservationFreshUntil > current);
  const freshSummaries = runtime.summaries.filter((entry) => entry.expiresAt > current);
  const routingTraces = auditEvents
    .filter(
      (event) =>
        event.type === "p2p.trace" &&
        event.protocol?.startsWith("relay.") &&
        event.protocol !== RELAY_MANAGER_SNAPSHOT_PROTOCOL,
    )
    .slice(-12)
    .map((event) => ({
      createdAt: event.createdAt,
      protocol: event.protocol,
      remotePeerId: event.remotePeerId,
      summary: truncateForSnapshotEmbed(event.summary, MAX_SNAPSHOT_EMBEDDED_CHARS),
    }));

  return {
    generatedAt,
    source: "runtime",
    relay: {
      peerId: runtime.peerId,
      enabled: runtime.enabled,
      relayServerEnabled: runtime.relayServerEnabled,
      listenAddrs: runtime.listenAddrs,
      uptimeMs: runtime.uptimeMs,
    },
    roster: {
      total: runtime.rosterEntries.length,
      fresh: freshRoster.length,
      stale: runtime.rosterEntries.length - freshRoster.length,
      visibilityCounts: countVisibility(runtime.rosterEntries),
      topCapabilities: topCounts(runtime.rosterEntries.flatMap((entry) => entry.capabilities), "capability"),
      topTopics: topCounts(runtime.rosterEntries.flatMap((entry) => entry.advertisements.flatMap((ad) => (ad.topicHash ? [ad.topicHash] : []))), "topicHash"),
    },
    relayBook: {
      total: runtime.relayBook.length,
      byRelation: countBy(runtime.relayBook.map((entry) => entry.relation)),
      byState: countBy(runtime.relayBook.map((entry) => entry.state)),
      neighbors: runtime.relayBook,
    },
    summaries: {
      total: runtime.summaries.length,
      fresh: freshSummaries.length,
      stale: runtime.summaries.length - freshSummaries.length,
      entries: runtime.summaries,
    },
    routing: {
      ...runtime.routing,
      recentTraces: routingTraces,
    },
    health: runtime.health ?? emptyRelayHealthSnapshot(generatedAt),
    warnings: auditEvents
      .filter((event) => event.protocol === "connectivity.warning" || event.protocol === "relay.manager.warning")
      .slice(-8)
      .map((event) => truncateForSnapshotEmbed(event.summary, MAX_SNAPSHOT_EMBEDDED_CHARS)),
  };
}

function emptyRelayManagerSnapshot(generatedAt: string, profile: NodeProfile | undefined): RelayManagerSnapshot {
  return {
    generatedAt,
    source: "empty",
    relay: {
      peerId: profile ? derivePeerId(profile.device.publicKeyPem) : undefined,
      enabled: false,
      relayServerEnabled: false,
      listenAddrs: [],
    },
    roster: { total: 0, fresh: 0, stale: 0, visibilityCounts: {}, topCapabilities: [], topTopics: [] },
    relayBook: { total: 0, byRelation: {}, byState: {}, neighbors: [] },
    summaries: { total: 0, fresh: 0, stale: 0, entries: [] },
    routing: {
      forwardedLookupCount: 0,
      duplicateQueryDropCount: 0,
      negativeCacheSize: 0,
      selectedForwardTargetCount: 0,
      failedForwardCount: 0,
      collectedForwardResponseCount: 0,
      recentTraces: [],
    },
    health: emptyRelayHealthSnapshot(generatedAt),
    warnings: [],
  };
}

function emptyRelayHealthSnapshot(generatedAt: string): RelayHealthSnapshot {
  return {
    status: "healthy",
    checkedAt: generatedAt,
    lastHealthyAt: generatedAt,
    reasons: [],
    actions: ["none"],
    recoveryCounters: {
      healthChecks: 0,
      degraded: 0,
      unhealthy: 0,
      critical: 0,
      softRepair: 0,
      restartRequested: 0,
      exitRequested: 0,
    },
  };
}

function lastRelayManagerSnapshot(events: AuditEvent[]): RelayManagerSnapshot | undefined {
  for (const event of [...events].reverse()) {
    if (event.protocol !== RELAY_MANAGER_SNAPSHOT_PROTOCOL) {
      continue;
    }
    const marker = "json=";
    const index = event.summary.indexOf(marker);
    if (index < 0) {
      continue;
    }
    try {
      return normalizeRelayManagerSnapshot(JSON.parse(event.summary.slice(index + marker.length)), "audit", event.createdAt);
    } catch {
      continue;
    }
  }
  return undefined;
}

function normalizeRelayManagerSnapshot(input: unknown, source: RelayManagerSnapshot["source"], fallbackGeneratedAt: string): RelayManagerSnapshot {
  const snapshot = input as Partial<RelayManagerSnapshot>;
  const generatedAt = snapshot.generatedAt ?? fallbackGeneratedAt;
  return {
    generatedAt,
    source,
    relay: snapshot.relay ?? { enabled: false, relayServerEnabled: false, listenAddrs: [] },
    roster: snapshot.roster ?? { total: 0, fresh: 0, stale: 0, visibilityCounts: {}, topCapabilities: [], topTopics: [] },
    relayBook: snapshot.relayBook ?? { total: 0, byRelation: {}, byState: {}, neighbors: [] },
    summaries: snapshot.summaries ?? { total: 0, fresh: 0, stale: 0, entries: [] },
    routing: {
      forwardedLookupCount: snapshot.routing?.forwardedLookupCount ?? 0,
      duplicateQueryDropCount: snapshot.routing?.duplicateQueryDropCount ?? 0,
      negativeCacheSize: snapshot.routing?.negativeCacheSize ?? 0,
      selectedForwardTargetCount: snapshot.routing?.selectedForwardTargetCount ?? 0,
      failedForwardCount: snapshot.routing?.failedForwardCount ?? 0,
      collectedForwardResponseCount: snapshot.routing?.collectedForwardResponseCount ?? 0,
      recentTraces: snapshot.routing?.recentTraces ?? [],
    },
    health: snapshot.health ?? emptyRelayHealthSnapshot(generatedAt),
    warnings: snapshot.warnings ?? [],
  };
}

function countVisibility(entries: RelayManagerRosterRuntimeEntry[]): Record<string, number> {
  return countBy(entries.flatMap((entry) => entry.advertisements.map((advertisement) => advertisement.visibility)));
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function topCounts<T extends "capability" | "topicHash">(
  values: string[],
  key: T,
): Array<T extends "capability" ? { capability: string; count: number } : { topicHash: string; count: number }> {
  return Object.entries(countBy(values))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([value, count]) => ({ [key]: value, count })) as Array<
      T extends "capability" ? { capability: string; count: number } : { topicHash: string; count: number }
    >;
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
  queryAuditEvents(params?: JsonlIndexQueryParams): Promise<AuditEvent[]>;
  rebuildAuditQueryIndex(): Promise<number>;
  appendDiscoveryEvent(event: DiscoveryEvent): Promise<void>;
  readDiscoveryEvents(): Promise<DiscoveryEvent[]>;
  appendShareEvent(event: ShareEvent): Promise<void>;
  readShareEvents(): Promise<ShareEvent[]>;
  appendApprovalRequest(request: ApprovalRequest): Promise<void>;
  readApprovalRequests(): Promise<ApprovalRequest[]>;
  updateApprovalRequestStatus(approvalId: string, status: ApprovalRequestStatus): Promise<ApprovalRequest>;
  recordTaskResult(payload: import("@envoymesh/protocol").TaskResultPayload): Promise<void>;
  getTaskResult(taskId: string): Promise<import("@envoymesh/protocol").TaskResultPayload | undefined>;
  saveCompanyInvite(record: CompanyInviteRecord): Promise<void>;
  getCompanyInvite(inviteId: string): Promise<CompanyInviteRecord | undefined>;
  findCompanyInviteByToken(token: string): Promise<CompanyInviteRecord | undefined>;
  listCompanyInvites(): Promise<CompanyInviteRecord[]>;
  saveFleetManifest(record: FleetManifestRecord): Promise<FleetManifestRecord>;
  getFleetManifest(manifestId: string): Promise<FleetManifestRecord | null>;
  listFleetManifests(): Promise<FleetManifestRecord[]>;
  revokeFleetManifest(
    manifestId: string,
    at: string,
  ): Promise<FleetManifestRecord | null>;
  // Phase 40 — Agent Network Collaboration Layer.
  /**
   * Return all journal entries whose `chainId` matches the given chainId.
   * Entries without a `chainId` are solo A2A and are excluded. Useful for
   * reconstructing the chain tree (audit + lineage) after a crash.
   */
  listChainEntries(chainId: string): Promise<TaskJournalEntry[]>;
  /**
   * Return the persisted chain report for the given chainId, or null.
   * `record` includes both the protocol-level `ChainReport` and the local
   * store metadata (`storedAt`, `updatedAt`).
   */
  getChainReport(chainId: string): Promise<ChainReportRecord | null>;
  /** List persisted chain reports with optional filters. Newest first. */
  listChainReports(params?: ListChainReportsParams): Promise<ChainReportRecord[]>;
  /** Persist (upsert) a published chain report. */
  recordChainReport(report: ChainReport): Promise<ChainReportRecord>;
  /**
   * Toggle the pinned flag on a chain report. Pinned reports are exempt
   * from the 90-day GC and surface in the UI's "Pinned" tab.
   */
  pinChainReport(
    chainId: string,
    pinned: boolean,
  ): Promise<ChainReportRecord | null>;
  /** Phase 43H — list owner-saved chain recipes. */
  listChainRecipes(): Promise<ChainRecipeRecord[]>;
  saveChainRecipe(
    recipe: Omit<ChainRecipeRecord, "createdAt" | "updatedAt"> & { createdAt?: string },
  ): Promise<ChainRecipeRecord>;
  deleteChainRecipe(id: string): Promise<boolean>;
  // Per-call cost tracking.
  /** Merge one model call's actual usage into the daily cost rollup. */
  recordModelCallCost(input: RecordCallInput): Promise<void>;
  /** Aggregate rollup entries into a dashboard summary. */
  summarizeModelCallCosts(filters?: CostSummaryFilters): Promise<CostSummary>;
  /** Run retention: collapse old daily rows to monthly, drop very old monthly. */
  runCostRollupRetention(now?: Date): Promise<{ collapsed: number; dropped: number }>;
}

export type AbuseFlag = "none" | "slow_response" | "no_answer" | "malicious" | "offensive";

export interface PeerReputationRecord {
  version: "0.1";
  peerOwnerId: string;
  score: number; // 0–100
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  avgLatencyMs: number;
  abuseFlags: AbuseFlag[];
  lastUpdated: string;
}

export interface PeerReputationStore {
  getReputation(peerOwnerId: string): Promise<PeerReputationRecord | undefined>;
  upsertReputation(peerOwnerId: string, update: Partial<PeerReputationRecord> & { outcome?: "success" | "failure"; latencyMs?: number; abuseFlag?: AbuseFlag }): Promise<PeerReputationRecord>;
  listReputations(): Promise<PeerReputationRecord[]>;
  clearReputation(peerOwnerId: string): Promise<void>;
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
  /** Story D: hop distance when match came via forwarded discovery. */
  hopDistance?: number;
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
  hopDistance?: number;
  outcome: DiscoveryEvent["outcome"];
  summary: string;
}

/** Share lifecycle event for correlating share.preview → share.accept → content transfer. */
export interface ShareEvent {
  version: "0.1";
  eventId: string;
  createdAt: string;
  direction: "inbound" | "outbound";
  intent: "share.preview" | "share.request" | "share.accept";
  ownerId: string;
  remotePeerId?: string;
  correlationId?: string;
  requestMessageId?: string;
  requestType?: "knowledge" | "file";
  sensitivity?: Sensitivity;
  requiresApproval?: boolean;
  isFileTransfer?: boolean;
  previewRefused?: boolean;
  previewRefusalReason?: string;
  accepted?: boolean;
  outcome: "allow" | "deny" | "record";
  summary: string;
}

export interface CreateShareEventInput {
  createdAt?: string;
  eventId?: string;
  direction: ShareEvent["direction"];
  intent: ShareEvent["intent"];
  ownerId: string;
  remotePeerId?: string;
  correlationId?: string;
  requestMessageId?: string;
  requestType?: "knowledge" | "file";
  sensitivity?: Sensitivity;
  requiresApproval?: boolean;
  isFileTransfer?: boolean;
  previewRefused?: boolean;
  previewRefusalReason?: string;
  accepted?: boolean;
  outcome: ShareEvent["outcome"];
  summary: string;
}

export interface MorningReportEntry {
  ownerId: string;
  peerId?: string;
  displayName?: string;
  trustLevel: TrustRecord["level"] | "unknown";
  score: number;
  reason: string;
  lastSeenAt?: string;
  discoveryMatchCount: number;
  /** Minimum hop distance from recent discovery events (1 = direct). */
  hopDistance?: number;
  /** Phase 17C: location peer-count summary (not an individual peer row). */
  geoCitySummary?: {
    peerCount: number;
    cityLabel: string;
  };
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
  const auditIndexPath = join(profileDir, AUDIT_QUERY_INDEX_FILE);
  const approvalQueuePath = join(profileDir, APPROVAL_QUEUE_FILE);
  const discoveryEventsPath = join(profileDir, DISCOVERY_EVENTS_FILE);
  const shareEventsPath = join(profileDir, SHARE_EVENTS_FILE);

  const appendTaskJournalQueued = createSerialJsonlAppender(taskJournalPath);
  // Audit events: 100MB max file size, 7-day retention
  const appendAuditQueued = createSerialJsonlAppender(auditEventsPath, {
    maxSizeBytes: 100 * 1024 * 1024,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  });
  const appendAuditIndexQueued = createJsonlIndexAppender(auditIndexPath);
  const appendDiscoveryQueued = createSerialJsonlAppender(discoveryEventsPath);
  const appendShareQueued = createSerialJsonlAppender(shareEventsPath);
  const taskResultsStore = createLocalTaskResultsStore(profileDir);
  const companyInviteStore = createLocalCompanyInviteStore(profileDir);
  const fleetManifestStore = createLocalFleetManifestStore(profileDir);
  const chainReportsStore = createLocalChainReportsStore(profileDir);
  const chainRecipesStore = createLocalChainRecipesStore(profileDir);
  const costRollupStore = createCostRollupStore(profileDir);

  const auditEventToIndexEntry = (event: AuditEvent): JsonlIndexEntry => ({
    id: event.eventId,
    createdAt: event.createdAt,
    correlationId: event.correlationId,
    taskId: event.taskId,
    payload: {
      type: event.type,
      intent: event.intent,
      remotePeerId: event.remotePeerId,
      direction: event.direction,
      outcome: event.outcome,
      summary: event.summary,
    },
  });

  const indexEntryToAuditEvent = (entry: JsonlIndexEntry): AuditEvent => ({
    version: "0.1",
    eventId: entry.id,
    createdAt: entry.createdAt,
    correlationId: entry.correlationId,
    taskId: entry.taskId,
    type: entry.payload.type as AuditEvent["type"],
    intent: entry.payload.intent as AuditEvent["intent"],
    remotePeerId: entry.payload.remotePeerId as string | undefined,
    direction: entry.payload.direction as AuditEvent["direction"],
    outcome: entry.payload.outcome as AuditEvent["outcome"],
    summary: String(entry.payload.summary ?? ""),
  });

  const ensureAuditIndex = async (): Promise<void> => {
    const [indexRows, auditRows] = await Promise.all([
      readJsonlIndex(auditIndexPath),
      readJsonLines<AuditEvent>(auditEventsPath),
    ]);
    if (auditRows.length > 0 && indexRows.length < auditRows.length) {
      await rebuildJsonlIndex(auditRows, auditIndexPath, auditEventToIndexEntry);
    }
  };

  let approvalFileTail: Promise<unknown> = Promise.resolve();
  const runApprovalFileOp = <T>(fn: () => Promise<T>): Promise<T> => {
    const done = approvalFileTail.then(() => fn());
    approvalFileTail = done.then(
      () => {},
      () => {},
    );
    return done;
  };

  return {
    async appendTaskJournalEntry(entry) {
      await appendTaskJournalQueued(entry);
    },

    async readTaskJournalEntries() {
      return readJsonLines<TaskJournalEntry>(taskJournalPath);
    },

    // Phase 40 — filtered journal read for chain reconstruction. Returns
    // entries with matching chainId only; entries without a chainId (solo
    // A2A) are excluded.
    async listChainEntries(chainId) {
      const all = await readJsonLines<TaskJournalEntry>(taskJournalPath);
      return all.filter((e) => e.chainId === chainId);
    },

    async appendAuditEvent(event) {
      // No event-type filter here: every emitted audit event is
      // diagnostically meaningful. `message.rejected` is high-volume
      // (one per failed signature / policy check) but it tells you WHY a
      // message was refused, which the developer CLI's `audit` view
      // surfaces. Dropping it at the store layer hides that from
      // operators. The JSONL appender handles concurrent writes safely;
      // future size caps can be added in `createJsonlAppender` if the log
      // grows too large.
      await appendAuditQueued(event);
      await appendAuditIndexQueued(auditEventToIndexEntry(event));
    },

    async readAuditEvents() {
      return readJsonLines<AuditEvent>(auditEventsPath);
    },

    async queryAuditEvents(params = {}) {
      await ensureAuditIndex();
      const indexRows = await readJsonlIndex(auditIndexPath);
      return queryJsonlIndex(indexRows, params).map(indexEntryToAuditEvent);
    },

    async rebuildAuditQueryIndex() {
      const auditRows = await readJsonLines<AuditEvent>(auditEventsPath);
      return rebuildJsonlIndex(auditRows, auditIndexPath, auditEventToIndexEntry);
    },

    async appendDiscoveryEvent(event) {
      await appendDiscoveryQueued(event);
    },

    async readDiscoveryEvents() {
      return readJsonLines<DiscoveryEvent>(discoveryEventsPath);
    },

    async appendShareEvent(event) {
      await appendShareQueued(event);
    },

    async readShareEvents() {
      return readJsonLines<ShareEvent>(shareEventsPath);
    },

    async appendApprovalRequest(request) {
      await runApprovalFileOp(() => appendJsonLine(approvalQueuePath, request));
    },

    async readApprovalRequests() {
      return readJsonLines<ApprovalRequest>(approvalQueuePath);
    },

    async updateApprovalRequestStatus(approvalId, status) {
      return runApprovalFileOp(async () => {
        const requests = await readJsonLines<ApprovalRequest>(approvalQueuePath);
        const request = requests.find((candidate) => candidate.approvalId === approvalId);

        if (!request) {
          throw new Error(`Approval request not found: ${approvalId}`);
        }

        request.status = status;
        await writeJsonLines(approvalQueuePath, requests);
        return request;
      });
    },

    async recordTaskResult(payload) {
      await taskResultsStore.recordTaskResult(payload);
    },

    async getTaskResult(taskId) {
      return taskResultsStore.getTaskResult(taskId);
    },

    async saveCompanyInvite(record) {
      await companyInviteStore.saveInvite(record);
    },

    async getCompanyInvite(inviteId) {
      return companyInviteStore.getInvite(inviteId);
    },

    async findCompanyInviteByToken(token) {
      return companyInviteStore.findByToken(token);
    },

    async listCompanyInvites() {
      return companyInviteStore.listInvites();
    },

    async saveFleetManifest(record) {
      return fleetManifestStore.saveManifest(record);
    },

    async getFleetManifest(manifestId) {
      return fleetManifestStore.getManifest(manifestId);
    },

    async listFleetManifests() {
      return fleetManifestStore.listManifests();
    },

    async revokeFleetManifest(manifestId, at) {
      return fleetManifestStore.revokeManifest(manifestId, at);
    },

    // Phase 40 — chain reports store pass-throughs.
    async getChainReport(chainId) {
      return chainReportsStore.getChainReport(chainId);
    },

    async listChainReports(params) {
      return chainReportsStore.listChainReports(params);
    },

    async recordChainReport(report) {
      return chainReportsStore.recordChainReport(report);
    },

    async pinChainReport(chainId, pinned) {
      return chainReportsStore.pinChainReport(chainId, pinned);
    },
    async listChainRecipes() {
      return chainRecipesStore.listRecipes();
    },
    async saveChainRecipe(recipe) {
      return chainRecipesStore.saveRecipe(recipe);
    },
    async deleteChainRecipe(id) {
      return chainRecipesStore.deleteRecipe(id);
    },
    async recordModelCallCost(input) {
      return costRollupStore.recordCall(input);
    },
    async summarizeModelCallCosts(filters) {
      return costRollupStore.summarize(filters);
    },
    async runCostRollupRetention(now) {
      return costRollupStore.runRetention(now);
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
    hopDistance: input.hopDistance,
    outcome: input.outcome,
    summary: input.summary,
  };
}

export function createShareEvent(input: CreateShareEventInput): ShareEvent {
  return {
    version: "0.1",
    eventId: input.eventId ?? `share_${randomUUID()}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
    direction: input.direction,
    intent: input.intent,
    ownerId: input.ownerId,
    remotePeerId: input.remotePeerId,
    correlationId: input.correlationId,
    requestMessageId: input.requestMessageId,
    requestType: input.requestType,
    sensitivity: input.sensitivity,
    requiresApproval: input.requiresApproval,
    isFileTransfer: input.isFileTransfer,
    previewRefused: input.previewRefused,
    previewRefusalReason: input.previewRefusalReason,
    accepted: input.accepted,
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
      minHopDistance?: number;
    }
  >();

  for (const event of input.discoveryEvents) {
    const current = discoveryByOwner.get(event.ownerId);
    const hop = event.hopDistance;
    discoveryByOwner.set(event.ownerId, {
      matches: (current?.matches ?? 0) + event.matchCount,
      lastSeenAt: current?.lastSeenAt
        ? current.lastSeenAt.localeCompare(event.createdAt) > 0
          ? current.lastSeenAt
          : event.createdAt
        : event.createdAt,
      minHopDistance:
        hop !== undefined
          ? Math.min(current?.minHopDistance ?? hop, hop)
          : current?.minHopDistance,
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
    const hopBoost = discovery?.minHopDistance === 2 ? 8 : 0;
    const recencyScore = peer?.lastSeenAt ? recencyPoints(peer.lastSeenAt) : 0;
    const score = trustScore + matchScore + recencyScore + hopBoost;
    return {
      ownerId,
      peerId: peer?.peerId,
      displayName: trust?.displayName?.trim() || undefined,
      trustLevel: trust?.level ?? "unknown",
      score,
      reason: `trust=${trust?.level ?? "unknown"}, matches=${discovery?.matches ?? 0}, hop=${discovery?.minHopDistance ?? 1}, recency=${recencyScore}`,
      lastSeenAt: peer?.lastSeenAt ?? discovery?.lastSeenAt,
      discoveryMatchCount: discovery?.matches ?? 0,
      hopDistance: discovery?.minHopDistance,
    };
  });

  return ranked
    .filter((entry) => entry.trustLevel === "unknown")
    .filter((entry) => entry.discoveryMatchCount > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit ?? 10);
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

/**
 * Selective audit filtering: skip noisy routine events that would cause unbounded growth.
 * Keep: security decisions (rejections), task lifecycle, bond/trust events, important errors.
 * Skip: routine message passes, vault searches, model routes, tool calls, AI decisions.
 */
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
  getPeerByPeerId(peerId: string): Promise<PeerDirectoryRecord | undefined>;
  /** Append dialable multiaddrs learned from inbound libp2p connections (e.g. relay circuit path). */
  mergeListenAddrsForPeerId(peerId: string, addrs: string[]): Promise<void>;
  /** Cap stored listen addrs per peer (repairs bloated directories from pre-cap merges). */
  compactListenAddrs(maxPerRecord?: number): Promise<{ recordsTouched: number; addrsRemoved: number }>;
  /** Strip ephemeral inbound TCP snapshots from every peer row. */
  sanitizeListenAddrs(): Promise<{ recordsTouched: number; addrsRemoved: number }>;
  /** Drop oldest peer rows when the directory grows too large (repairs WAN discovery bloat). */
  capPeerRecordCount(maxRecords?: number): Promise<{ recordsRemoved: number }>;
  /**
   * Learn device signing key from a verified inbound human envelope (`senderPublicKey`).
   * Repairs placeholder rows created by {@link ensurePeerFromInboundChat} (`deviceId: chat-inbound`,
   * no `devicePublicKeyPem`) so inbound data-transfer vouchers can be verified.
   */
  mergeInboundDeviceBinding(input: {
    peerId: string;
    devicePublicKeyPem: string;
    ownerId?: string;
  }): Promise<void>;
  /**
   * Ensure a row exists for a peer learned on the wire: inbound `chat.message`, any inbound
   * `bond.request` / `bond.accept`, manual `acceptHello`, or outbound `sendHello` after send.
   * Updates `peerId` / listen addrs when the row already exists so bonds always reflect current libp2p id.
   *
   * `peerId` must be the **libp2p** transport peer id (`12D3Koo…` / `Qm…` from the connection),
   * not an Envoy envelope `senderPeerId` (`envoy_…` prefix) — libp2p cannot parse those for dialing.
   */
  ensurePeerFromInboundChat(input: {
    ownerId: string;
    peerId: string;
    listenAddrs?: string[];
  }): Promise<void>;
  /**
   * Ensure a peer record exists for a given libp2p peerId, creating a stub if absent.
   * Used by `updateMyListenAddrs` when a mobile shares its UPnP address before any
   * inbound message has created the peer's directory entry.
   */
  ensurePeerByPeerId(input: {
    peerId: string;
    listenAddrs?: string[];
  }): Promise<void>;
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

/**
 * Persisted relay book entry — represents a neighbor relay the local relay has registered.
 * This is loaded on startup so the relay graph structure survives restarts.
 */
export interface PersistedRelayBookEntry {
  relayId: string;
  level?: number;
  region?: string;
  addrs: string[];
  relation: RelayRelation;
  state: RelayBookState;
  lastVerifiedAt: number;
  expiresAt: number;
  failureCount: number;
}

/**
 * Persisted relay summary — represents a summary received from a neighbor relay.
 * Loaded on startup so relay-to-relay routing state survives restarts.
 */
export interface PersistedRelaySummaryEntry {
  relayId: string;
  level: number;
  region?: string;
  livePeerCount: number;
  childRelayCount: number;
  topicBuckets: string[];
  lastSeenAt: number;
  expiresAt: number;
}

interface RelayBookFile {
  version: "0.1";
  entries: PersistedRelayBookEntry[];
}

interface RelaySummariesFile {
  version: "0.1";
  entries: PersistedRelaySummaryEntry[];
}

export interface RelayStateStore {
  loadRelayBook(): Promise<PersistedRelayBookEntry[]>;
  saveRelayBook(entries: PersistedRelayBookEntry[]): Promise<void>;
  loadRelaySummaries(): Promise<PersistedRelaySummaryEntry[]>;
  saveRelaySummaries(entries: PersistedRelaySummaryEntry[]): Promise<void>;
}

export function createRelayStateStore(profileDir: string): RelayStateStore {
  const relayBookPath = join(profileDir, RELAY_BOOK_FILE);
  const relaySummariesPath = join(profileDir, RELAY_SUMMARIES_FILE);

  return {
    async loadRelayBook() {
      try {
        const file: RelayBookFile = JSON.parse(await readFile(relayBookPath, "utf8"));
        const now = Date.now();
        return file.entries.filter((entry) => entry.expiresAt > now && entry.state !== "removed");
      } catch {
        return [];
      }
    },

    async saveRelayBook(entries) {
      const file: RelayBookFile = { version: "0.1", entries };
      await mkdir(dirname(relayBookPath), { recursive: true });
      await writeFile(relayBookPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    },

    async loadRelaySummaries() {
      try {
        const file: RelaySummariesFile = JSON.parse(await readFile(relaySummariesPath, "utf8"));
        const now = Date.now();
        return file.entries.filter((entry) => entry.expiresAt > now);
      } catch {
        return [];
      }
    },

    async saveRelaySummaries(entries) {
      const file: RelaySummariesFile = { version: "0.1", entries };
      await mkdir(dirname(relaySummariesPath), { recursive: true });
      await writeFile(relaySummariesPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    },
  };
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

interface ReputationStoreFile {
  version: "0.1";
  records: PeerReputationRecord[];
}

async function readReputationStoreFile(path: string): Promise<ReputationStoreFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || (parsed as Record<string, unknown>).version !== "0.1") {
      return { version: "0.1", records: [] };
    }
    return parsed as ReputationStoreFile;
  } catch {
    return { version: "0.1", records: [] };
  }
}

async function writeReputationStoreFile(path: string, file: ReputationStoreFile): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}

export function createLocalPeerReputationStore(profileDir: string): PeerReputationStore {
  const reputationStorePath = join(profileDir, REPUTATION_STORE_FILE);

  return {
    async getReputation(peerOwnerId) {
      const file = await readReputationStoreFile(reputationStorePath);
      return file.records.find((r) => r.peerOwnerId === peerOwnerId);
    },

    async upsertReputation(peerOwnerId, update) {
      const file = await readReputationStoreFile(reputationStorePath);
      const existing = file.records.find((r) => r.peerOwnerId === peerOwnerId);
      const now = new Date().toISOString();

      if (existing) {
        // Apply deltas
        if (update.outcome === "success") {
          existing.successfulTasks += 1;
          existing.score = Math.min(100, existing.score + 5);
        } else if (update.outcome === "failure") {
          existing.failedTasks += 1;
          existing.score = Math.max(0, existing.score - 10);
        }
        if (update.latencyMs !== undefined) {
          // Rolling average
          existing.avgLatencyMs =
            existing.totalTasks === 0
              ? update.latencyMs
              : (existing.avgLatencyMs * existing.totalTasks + update.latencyMs) / (existing.totalTasks + 1);
        }
        if (update.abuseFlag && update.abuseFlag !== "none") {
          if (!existing.abuseFlags.includes(update.abuseFlag)) {
            existing.abuseFlags.push(update.abuseFlag);
          }
          existing.score = Math.max(0, existing.score - 20);
        }
        existing.totalTasks += 1;
        existing.lastUpdated = now;
        await writeReputationStoreFile(reputationStorePath, file);
        return existing;
      }

      // New record
      const score =
        update.outcome === "success" ? 55 : update.outcome === "failure" ? 40 : 50;
      const newRecord: PeerReputationRecord = {
        version: "0.1",
        peerOwnerId,
        score,
        totalTasks: 1,
        successfulTasks: update.outcome === "success" ? 1 : 0,
        failedTasks: update.outcome === "failure" ? 1 : 0,
        avgLatencyMs: update.latencyMs ?? 0,
        abuseFlags: update.abuseFlag && update.abuseFlag !== "none" ? [update.abuseFlag] : [],
        lastUpdated: now,
      };
      file.records.push(newRecord);
      await writeReputationStoreFile(reputationStorePath, file);
      return newRecord;
    },

    async listReputations() {
      const file = await readReputationStoreFile(reputationStorePath);
      return file.records.sort((a, b) => b.score - a.score);
    },

    async clearReputation(peerOwnerId) {
      const file = await readReputationStoreFile(reputationStorePath);
      file.records = file.records.filter((r) => r.peerOwnerId !== peerOwnerId);
      await writeReputationStoreFile(reputationStorePath, file);
    },
  };
}

/** True when peerId is a libp2p transport id (not an Envoy envelope `envoy_*` id). */
function isDialableLibp2pPeerId(peerId: string): boolean {
  const id = peerId.trim();
  if (!id || id.startsWith("envoy_") || id.startsWith("envoy:")) {
    return false;
  }
  return id.startsWith("12D3KooW") || id.startsWith("Qm") || id.startsWith("16Uiu2");
}

export function createLocalPeerDirectoryStore(profileDir: string): LocalPeerDirectoryStore {
  const directoryPath = join(profileDir, PEER_DIRECTORY_FILE);

  // Serialize ALL peer directory operations (reads and writes) to prevent
  // EPERM errors on Windows where concurrent file access causes lock violations.
  // Single mutex ensures read-modify-write cycles are atomic.
  let directoryMutex = Promise.resolve<PeerDirectoryFile | null>(null);

  async function withDirectory<T>(fn: (file: PeerDirectoryFile) => Promise<T>): Promise<T> {
    const mutexSnapshot = directoryMutex;
    const result = mutexSnapshot.then(async () => {
      let file: PeerDirectoryFile;
      try {
        file = await readPeerDirectoryFile(directoryPath);
      } catch {
        // read failed or returned null — start with empty state
        file = { version: "0.1", records: [] };
      }
      return fn(file);
    });
    // Store completion state for next operation, ignoring the return value of fn
    directoryMutex = result.then(() => null as PeerDirectoryFile | null).catch(() => null as PeerDirectoryFile | null);
    return result;
  }

  async function upsertPeerFromSignalSerialized(input: {
    peerId: string;
    payload: SystemSignalPayload;
    seenAt?: string;
  }): Promise<PeerDirectoryRecord> {
    return withDirectory(async (file) => {
      const seenAt = input.seenAt ?? new Date().toISOString();
      // First try to find by correct ownerId
      let existing = file.records.find((record) => record.ownerId === input.payload.ownerId);
      if (existing) {
        existing.peerId = input.peerId;
        existing.deviceId = input.payload.deviceId;
        existing.devicePublicKeyPem = input.payload.deviceCertificate.devicePublicKeyPem;
        existing.lastSeenAt = seenAt;
        existing.listenAddrs = input.payload.listenAddrs;
        await writePeerDirectoryFileAtomic(directoryPath, file);
        return existing;
      }

      // Also check if there's a corrupted record with the same peerId but wrong ownerId
      // (ownerId stored as peerId from buggy mDNS peer.discovered handler)
      existing = file.records.find(
        (record) => record.peerId === input.peerId && record.ownerId !== input.payload.ownerId,
      );
      if (existing) {
        console.warn(
          `[peer-directory] fixing corrupted record: ownerId was "${existing.ownerId}", updating to "${input.payload.ownerId}" for peerId=${input.peerId}`,
        );
        existing.ownerId = input.payload.ownerId;
        existing.deviceId = input.payload.deviceId;
        existing.devicePublicKeyPem = input.payload.deviceCertificate.devicePublicKeyPem;
        existing.lastSeenAt = seenAt;
        existing.listenAddrs = input.payload.listenAddrs;
        await writePeerDirectoryFileAtomic(directoryPath, file);
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
      await writePeerDirectoryFileAtomic(directoryPath, file);
      return created;
    });
  }

  return {
    async listPeerRecords() {
      // Reads bypass the mutex so lookups are not blocked by an in-flight write (Windows EPERM
      // retries can hold the mutex for a long time; chat send would otherwise stall with no logs).
      const file = await readPeerDirectoryFile(directoryPath);
      return file.records.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
    },

    async getPeerByOwnerId(ownerId) {
      const file = await readPeerDirectoryFile(directoryPath);
      const matches = file.records.filter((record) => record.ownerId === ownerId);
      if (matches.length === 0) {
        return undefined;
      }
      const libp2pMatches = matches.filter((record) => isDialableLibp2pPeerId(record.peerId));
      const pool = libp2pMatches.length > 0 ? libp2pMatches : matches;
      if (pool.length === 1) {
        return pool[0];
      }
      return pool.reduce((a, b) => (a.lastSeenAt >= b.lastSeenAt ? a : b));
    },

    async getPeerByPeerId(peerId) {
      const file = await readPeerDirectoryFile(directoryPath);
      return file.records.find((record) => record.peerId === peerId) ?? undefined;
    },

    async upsertPeerFromSignal(input) {
      return upsertPeerFromSignalSerialized(input);
    },

    async mergeListenAddrsForPeerId(peerId, addrs) {
      await withDirectory(async (file) => {
        const record = file.records.find((r) => r.peerId === peerId);
        if (!record) {
          return;
        }
        const trimmed = filterDialableListenAddrs(addrs.map((a) => a.trim()).filter(Boolean));
        const merged = capPeerListenAddrs([...record.listenAddrs, ...trimmed]);
        const same =
          merged.length === record.listenAddrs.length && merged.every((a, i) => a === record.listenAddrs[i]);
        if (same) {
          return;
        }
        record.listenAddrs = merged;
        record.lastSeenAt = new Date().toISOString();
        await writePeerDirectoryFileAtomic(directoryPath, file);
      });
    },

    async compactListenAddrs(maxPerRecord = MAX_PEER_LISTEN_ADDRS_PER_RECORD) {
      let recordsTouched = 0;
      let addrsRemoved = 0;
      await withDirectory(async (file) => {
        let dirty = false;
        for (const record of file.records) {
          const capped = capPeerListenAddrs(record.listenAddrs, maxPerRecord);
          const removed = record.listenAddrs.length - capped.length;
          if (removed <= 0) {
            continue;
          }
          record.listenAddrs = capped;
          recordsTouched += 1;
          addrsRemoved += removed;
          dirty = true;
        }
        if (dirty) {
          await writePeerDirectoryFileAtomic(directoryPath, file);
        }
      });
      return { recordsTouched, addrsRemoved };
    },

    async sanitizeListenAddrs() {
      let recordsTouched = 0;
      let addrsRemoved = 0;
      await withDirectory(async (file) => {
        let dirty = false;
        for (const record of file.records) {
          const sanitized = filterDialableListenAddrs(record.listenAddrs);
          const removed = record.listenAddrs.length - sanitized.length;
          if (removed <= 0) {
            continue;
          }
          record.listenAddrs = sanitized;
          recordsTouched += 1;
          addrsRemoved += removed;
          dirty = true;
        }
        if (dirty) {
          await writePeerDirectoryFileAtomic(directoryPath, file);
        }
      });
      return { recordsTouched, addrsRemoved };
    },

    async capPeerRecordCount(maxRecords = MAX_PEER_DIRECTORY_RECORDS) {
      let recordsRemoved = 0;
      await withDirectory(async (file) => {
        if (file.records.length <= maxRecords) {
          return;
        }
        file.records.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
        recordsRemoved = file.records.length - maxRecords;
        file.records = file.records.slice(0, maxRecords);
        await writePeerDirectoryFileAtomic(directoryPath, file);
      });
      return { recordsRemoved };
    },

    async mergeInboundDeviceBinding(input) {
      const peerId = input.peerId.trim();
      const pem = input.devicePublicKeyPem;
      const ownerId = input.ownerId?.trim();
      if (!peerId || !pem.trim()) {
        return;
      }
      const deviceId = deriveDeviceId(pem);
      await withDirectory(async (file) => {
        const seenAt = new Date().toISOString();
        const existing =
          file.records.find((r) => r.peerId === peerId) ??
          (ownerId ? file.records.find((r) => r.ownerId === ownerId) : undefined);
        if (existing) {
          existing.peerId = peerId;
          existing.devicePublicKeyPem = pem;
          existing.deviceId = deviceId;
          if (ownerId) {
            existing.ownerId = ownerId;
          }
          existing.lastSeenAt = seenAt;
        } else {
          // Create a new record so callers (e.g. pairDevice) can resolve the
          // freshly-paired device by ownerId without a prior directory entry.
          file.records.push({
            peerId,
            devicePublicKeyPem: pem,
            deviceId,
            ownerId: ownerId ?? peerId,
            listenAddrs: [],
            lastSeenAt: seenAt,
            firstSeenAt: seenAt,
          } as never);
        }
        await writePeerDirectoryFileAtomic(directoryPath, file);
      });
    },

    async ensurePeerFromInboundChat(input) {
      const ownerId = input.ownerId.trim();
      const peerId = input.peerId.trim();
      if (!ownerId || !peerId) {
        return;
      }
      const extra = filterDialableListenAddrs((input.listenAddrs ?? []).map((a) => a.trim()).filter(Boolean));
      await withDirectory(async (file) => {
        const seenAt = new Date().toISOString();
        let existing = file.records.find((r) => r.ownerId === ownerId);
        if (!existing) {
          existing = file.records.find((r) => r.peerId === peerId);
        }
        if (existing) {
          // If we found an existing record by peerId (stub from ensurePeerByPeerId) but
          // ownerId didn't match, update ownerId on the existing record WITHOUT changing
          // peerId or wiping listenAddrs — the stub has the real peerId and the UPnP
          // address that must be preserved.
          const isPeerIdMatch = existing.peerId === peerId;
          if (isPeerIdMatch && existing.ownerId !== ownerId) {
            // Reuse existing record: update ownerId, keep peerId and listenAddrs intact.
            existing.ownerId = ownerId;
            existing.lastSeenAt = seenAt;
            await writePeerDirectoryFileAtomic(directoryPath, file);
            return;
          }
          // Normal case: update both ownerId and peerId.
          existing.ownerId = ownerId;
          existing.peerId = peerId;
          existing.lastSeenAt = seenAt;
          if (extra.length > 0) {
            existing.listenAddrs = filterDialableListenAddrs([...existing.listenAddrs, ...extra]).slice(-8);
          } else {
            existing.listenAddrs = filterDialableListenAddrs(existing.listenAddrs).slice(-8);
          }
          await writePeerDirectoryFileAtomic(directoryPath, file);
          return;
        }
        file.records.push({
          version: "0.1",
          ownerId,
          peerId,
          deviceId: "chat-inbound",
          lastSeenAt: seenAt,
          listenAddrs: extra.slice(-8),
        });
        await writePeerDirectoryFileAtomic(directoryPath, file);
      });
    },

    async ensurePeerByPeerId(input) {
      const peerId = input.peerId.trim();
      if (!peerId) return;
      const extra = filterDialableListenAddrs((input.listenAddrs ?? []).map((a) => a.trim()).filter(Boolean));
      await withDirectory(async (file) => {
        const seenAt = new Date().toISOString();
        const existing = file.records.find((r) => r.peerId === peerId);
        if (existing) {
          existing.lastSeenAt = seenAt;
          if (extra.length > 0) {
            existing.listenAddrs = filterDialableListenAddrs([...existing.listenAddrs, ...extra]).slice(-8);
          }
          await writePeerDirectoryFileAtomic(directoryPath, file);
          return;
        }
        // Create a stub record. ownerId will be filled in by ensurePeerFromInboundChat
        // when the first inbound message arrives with a verified senderPublicKey.
        // Use peerId as a placeholder ownerId (consistent with mergeInboundDeviceBinding).
        file.records.push({
          version: "0.1",
          ownerId: peerId,
          peerId,
          deviceId: "mobile-upnp",
          lastSeenAt: seenAt,
          listenAddrs: extra.slice(-8),
        });
        await writePeerDirectoryFileAtomic(directoryPath, file);
      });
    },
  };
}

function dedupeListenAddrList(addrs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of addrs) {
    const t = a.trim();
    if (!t || seen.has(t)) {
      continue;
    }
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Drop ephemeral TCP source ports captured from inbound connections (not dialable listen addrs). */
function isLikelyEphemeralTcpSnapshot(addr: string): boolean {
  if (!addr.includes("/tcp/")) {
    return false;
  }
  const match = addr.match(/\/tcp\/(\d+)\//);
  if (!match) {
    return false;
  }
  const port = Number(match[1]);
  if (port === 4001 || port === 4002 || port === 4011 || port === 41641) {
    return false;
  }
  return port >= 32768;
}

function filterDialableListenAddrs(addrs: string[]): string[] {
  return dedupeListenAddrList(addrs.filter((a) => !isLikelyEphemeralTcpSnapshot(a)));
}

/** Max dial hints retained per peer row — matches ensurePeerFromInboundChat / bond paths. */
export const MAX_PEER_LISTEN_ADDRS_PER_RECORD = 8;
/** Max peer rows retained on disk — WAN DHT discovery can accumulate thousands of ephemeral peers. */
export const MAX_PEER_DIRECTORY_RECORDS = 500;

function capPeerListenAddrs(addrs: string[], maxPerRecord = MAX_PEER_LISTEN_ADDRS_PER_RECORD): string[] {
  return filterDialableListenAddrs(addrs).slice(-maxPerRecord);
}

export function parseTrustLevel(value: string): TrustRecord["level"] {
  if (value === "direct" || value === "referred" || value === "public" || value === "blocked") {
    return value;
  }

  throw new Error(`Invalid trust level: ${value}`);
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  if (line.length > MAX_JSONL_LINE_CHARS) {
    throw new Error(
      `JSONL record exceeds MAX_JSONL_LINE_CHARS (${MAX_JSONL_LINE_CHARS}): ${basename(path)} (${line.length} chars)`,
    );
  }
  await appendFile(path, line, { mode: 0o600 });
}

/**
 * Append a line to a JSONL file with retention enforcement.
 * Checks file size and entry age, rewriting the file with pruned entries if needed.
 */
async function appendJsonLineWithRetention(
  path: string,
  value: unknown,
  maxSizeBytes: number,
  maxAgeMs: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  // Check current file size in bytes
  let fileSizeBytes = 0;
  try {
    const stats = await (await import("node:fs/promises")).stat(path);
    fileSizeBytes = stats.size;
  } catch {
    // File doesn't exist yet, skip size check
  }

  const line = `${JSON.stringify(value)}\n`;
  const lineBytes = Buffer.byteLength(line, "utf8");
  if (lineBytes > MAX_JSONL_LINE_CHARS) {
    throw new Error(
      `JSONL record exceeds MAX_JSONL_LINE_CHARS (${MAX_JSONL_LINE_CHARS}): ${basename(path)} (${lineBytes} bytes)`,
    );
  }

  // Prune if appending would exceed the size limit.
  // Use a hysteresis threshold (95 % of maxSizeBytes) to avoid a chatty one-entry-per-append
  // cycle when the file is only slightly over the limit. Below the hysteresis threshold we skip
  // pruning even if fileSizeBytes + lineBytes > maxSizeBytes — the next write will re-check.
  const pruneThreshold = Math.floor(maxSizeBytes * 0.95);
  if (fileSizeBytes > pruneThreshold && fileSizeBytes + lineBytes > maxSizeBytes) {
    await pruneJsonlByRetention(path, maxSizeBytes, maxAgeMs);
  }

  await appendFile(path, line, { mode: 0o600 });
}

/**
 * Read a JSONL file, filter out entries older than maxAgeMs, and rewrite.
 * Also truncates if the file is still over maxSizeBytes after age pruning.
 */
async function pruneJsonlByRetention(path: string, maxSizeBytes: number, maxAgeMs: number): Promise<void> {
  const now = Date.now();

  let entries: Array<{ line: string; ageMs: number }> = [];

  try {
    const content = await readFile(path, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const createdAt = obj.createdAt ? new Date(obj.createdAt).getTime() : 0;
        const ageMs = now - createdAt;
        entries.push({ line, ageMs });
      } catch {
        // Keep malformed lines as-is (they'll be filtered by readJsonLines on next read)
        entries.push({ line, ageMs: 0 });
      }
    }
  } catch {
    // File doesn't exist or can't be read — nothing to prune
    return;
  }

  // Filter out expired entries
  const before = entries.length;
  entries = entries.filter((e) => e.ageMs < maxAgeMs);

  if (entries.length === before) {
    // No entries expired, but file is too big — keep newest entries up to size
    entries.sort((a, b) => b.ageMs - a.ageMs);
  }

  // Build new content, keeping newest entries until under size limit.
  // All size comparisons use bytes (Buffer.byteLength) to match stat.size and maxSizeBytes.
  let newContent = "";
  const kept: string[] = [];
  for (const entry of entries) {
    const trialLine = entry.line + "\n";
    const trialBytes = Buffer.byteLength(newContent, "utf8") + Buffer.byteLength(trialLine, "utf8");
    if (trialBytes > maxSizeBytes && kept.length > 0) {
      break;
    }
    newContent += trialLine;
    kept.push(entry.line);
  }

  if (kept.length === entries.length) {
    // Nothing was pruned
    return;
  }

  // Rewrite file with pruned entries
  await writeFile(path, newContent, { mode: 0o600 });
  console.warn(`[local-store] pruned ${before - kept.length} old entries from ${basename(path)} (was ${before}, kept ${kept.length})`);
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

  const lines = contents.split("\n").filter((line) => line.trim().length > 0);
  const parsed: T[] = [];
  let skippedInvalid = 0;
  let skippedOversized = 0;
  for (const line of lines) {
    if (line.length > MAX_JSONL_LINE_CHARS) {
      skippedOversized += 1;
      continue;
    }
    try {
      parsed.push(JSON.parse(line) as T);
    } catch {
      skippedInvalid += 1;
    }
  }
  if (skippedInvalid > 0 || skippedOversized > 0) {
    const parts: string[] = [];
    if (skippedInvalid > 0) {
      parts.push(`${skippedInvalid} invalid JSON`);
    }
    if (skippedOversized > 0) {
      parts.push(`${skippedOversized} oversized (>${MAX_JSONL_LINE_CHARS} chars)`);
    }
    console.warn(`[local-store] skipped ${parts.join(", ")} line(s) in ${basename(path)}`);
  }
  return parsed;
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
  // On Windows, EPERM during read often means the file is locked by another process.
  // Retry with backoff before assuming the file is missing or corrupted.
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return JSON.parse(await readPeerDirectoryRaw(path)) as PeerDirectoryFile;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's an EPERM (file locked) error that we should retry
      if ((lastError as any).code === "EPERM" && attempt < maxAttempts - 1) {
        const delay = 50 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Not EPERM or out of retries — break to recovery logic
      break;
    }
  }

  // File read failed (EPERM after retries or other error) — try recovery
  const err = lastError!;
  if ((err as any).code !== "ENOENT") {
    console.warn(`[peer-directory] read failed (${(err as any).code}), attempting recovery: ${err.message}`);
  }

  // Attempt recovery from corrupted file
  const recoveryResult = await tryRecoverPeerDirectory(path);
  if (recoveryResult) {
    return recoveryResult;
  }

  // Could not recover — return empty directory rather than losing data in memory
  // The file on disk is either missing or unrecoverable; next write will recreate it
  console.warn(`[peer-directory] could not recover, returning empty directory`);
  return {
    version: "0.1",
    records: [],
  };
}

/**
 * Attempt to recover a corrupted peer directory by reading raw content
 * and extracting as many valid records as possible.
 */
async function tryRecoverPeerDirectory(path: string): Promise<PeerDirectoryFile | null> {
  try {
    const raw = await readPeerDirectoryRaw(path);
    if (!raw.trim()) {
      return { version: "0.1", records: [] };
    }

    // First, try a simple parse — maybe it's just malformed at the end
    try {
      const parsed = JSON.parse(raw) as PeerDirectoryFile;
      if (parsed && Array.isArray(parsed.records)) {
        return parsed;
      }
    } catch {
      // Not a simple parse — continue with recovery
    }

    // Recovery: try to find a valid records array in the raw content
    // Look for the pattern: {"version":"0.1","records":[...valid json array...]}
    const recordsMatch = raw.match(/"records"\s*:\s*\[([\s\S]*)\]/);
    if (recordsMatch) {
      const recordsStr = recordsMatch[1];
      // Try to extract individual records from the array
      const extractedRecords = extractRecordsFromRawArray(recordsStr);
      if (extractedRecords.length > 0) {
        console.warn(`[peer-directory] recovered ${extractedRecords.length} records from corrupted file`);
        return { version: "0.1", records: extractedRecords };
      }
    }

    // Last resort: look for any individual record objects in the file
    const allRecords = extractAllRecordObjects(raw);
    if (allRecords.length > 0) {
      console.warn(`[peer-directory] extracted ${allRecords.length} records by scanning for objects`);
      return { version: "0.1", records: allRecords };
    }

    return null;
  } catch (recoveryError) {
    console.warn(`[peer-directory] recovery attempt failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
    return null;
  }
}

/**
 * Try to extract valid record objects from a potentially truncated JSON array string.
 */
function extractRecordsFromRawArray(arrayContent: string): PeerDirectoryRecord[] {
  const records: PeerDirectoryRecord[] = [];

  // Match individual record objects: {"version":"0.1","ownerId":"...","peerId":"...",...}
  const recordPattern = /\{[^{}]*"version"\s*:\s*"0\.1"[^{}]*\}/g;
  let match;

  while ((match = recordPattern.exec(arrayContent)) !== null) {
    try {
      const parsed = JSON.parse(match[0]) as PeerDirectoryRecord;
      if (parsed.ownerId && parsed.peerId) {
        records.push(parsed);
      }
    } catch {
      // Not a valid record, skip
    }
  }

  return records;
}

/**
 * Scan raw content for any record-like objects and try to parse them.
 */
function extractAllRecordObjects(raw: string): PeerDirectoryRecord[] {
  const records: PeerDirectoryRecord[] = [];
  const seen = new Set<string>();

  // Match any object that has ownerId and peerId fields
  const objectPattern = /\{[^{}]*"ownerId"[^{}]*"peerId"[^{}]*\}/g;
  let match;

  while ((match = objectPattern.exec(raw)) !== null) {
    const objStr = match[0];
    if (seen.has(objStr)) continue;
    seen.add(objStr);

    try {
      const parsed = JSON.parse(objStr) as PeerDirectoryRecord;
      if (parsed.ownerId && parsed.peerId) {
        records.push(parsed);
      }
    } catch {
      // Not a valid record, skip
    }
  }

  return records;
}

async function writePeerDirectoryFile(path: string, file: PeerDirectoryFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = JSON.stringify(file, null, 2) + "\n";
  // Verify the content is valid JSON before writing
  JSON.parse(content);
  await writeFile(path, content, { mode: 0o600 });
}

/**
 * Atomic write: writes to temp file then renames to target.
 * On Windows EPERM, retries with backoff then falls back to direct write.
 */
async function writePeerDirectoryFileAtomic(path: string, file: PeerDirectoryFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = JSON.stringify(file, null, 2) + "\n";
  // Verify the content is valid JSON before writing
  JSON.parse(content);

  // Try atomic write with multiple retries and exponential backoff
  const maxAttempts = 5;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tmpPath = `${path}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    try {
      await writeFile(tmpPath, content, { mode: 0o600 });
      await rename(tmpPath, path);
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if ((lastError as any).code === "EPERM" && attempt < maxAttempts - 1) {
        // On Windows EPERM, wait with exponential backoff before retry
        const delay = 50 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // If not EPERM or out of retries, fall through to fallback
      break;
    }
  }

  // Fallback: direct write if atomic rename keeps failing (accepts small corruption risk)
  if ((lastError as any)?.code === "EPERM") {
    console.warn(`[peer-directory] atomic write failed, falling back to direct write: ${lastError?.message ?? "unknown error"}`);
    try {
      await writeFile(path, content, { mode: 0o600 });
      return;
    } catch (fallbackError) {
      console.warn(`[peer-directory] direct write also failed: ${fallbackError}`);
    }
  }

  // Re-throw original error if we couldn't fall back
  throw lastError;
}

export interface HumanProfileStore {
  loadHumanProfile(): Promise<HumanProfilePayload | undefined>;
  saveHumanProfile(profile: HumanProfilePayload): Promise<void>;
}

export function createHumanProfileStore(profileDir: string): HumanProfileStore {
  const path = join(profileDir, HUMAN_PROFILE_FILE);

  return {
    async loadHumanProfile(): Promise<HumanProfilePayload | undefined> {
      try {
        return JSON.parse(await readFile(path, "utf8")) as HumanProfilePayload;
      } catch (error) {
        if (isMissingFileError(error)) {
          return undefined;
        }
        throw error;
      }
    },

    async saveHumanProfile(profile: HumanProfilePayload): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
    },
  };
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
export * from "./connectivity-stage-d.js";
export * from "./wan-connectivity-axes.js";
export * from "./jsonl-query-index.js";
export * from "./storage-gate.js";
export { AUDIT_QUERY_INDEX_FILE, ACTIVITY_QUERY_INDEX_FILE } from "./storage-gate.js";
export * from "./chat-log-store.js";
export * from "./chat-room-store.js";
export * from "./chat-room-pending-sync-store.js";
export * from "./chat-room-pending-message-store.js";
export * from "./chat-draft-store.js";
export * from "./auto-reply-limit-store.js";
export * from "./capability-manifest-store.js";
export * from "./session-token-store.js";
export * from "./device-authorization-store.js";
export * from "./agent-identity-store.js";
export * from "./agent-activity-store.js";
export * from "./contact-owner-key-store.js";
export * from "./reputation-anchor-store.js";
export * from "./multihop-discovery-store.js";
export * from "./agent-card-store.js";
export * from "./commerce-receipt-store.js";
export * from "./peer-profile-cache.js";
export * from "./social-proxy-store.js";
export * from "./document-acquisition-store.js";
export * from "./capability-provider-job-store.js";
export * from "./task-results-store.js";
export * from "./company-invite-store.js";
export * from "./fleet-manifest-store.js";
export * from "./chain-reports-store.js";
export * from "./cost-rollup-store.js";
