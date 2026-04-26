import {
  createLocalTaskStore,
  createLocalTrustStore,
  loadOrCreateNodeProfile,
  parseTrustLevel,
  type ApprovalRequest,
  type AuditEvent,
  type TrustRecord,
} from "@envoymesh/local-store";
import {
  buildVaultIndex,
  DEFAULT_SHARED_VAULT_DIR,
  searchVault,
  type VaultIndex,
} from "@envoymesh/vault";
import { resolve } from "node:path";

export type DeveloperCliCommand =
  | "profile"
  | "peer-list"
  | "trust"
  | "vault-index"
  | "vault-search"
  | "audit"
  | "tasks"
  | "approvals";

export interface DeveloperCliArgs {
  command: DeveloperCliCommand;
  profileDir: string;
  vaultDir: string;
  query?: string;
  limit: number;
  status?: ApprovalRequest["status"];
  approvalAction: "list" | "approve" | "reject";
  approvalId?: string;
  trustAction: "list" | "set" | "remove";
  peerOwnerId?: string;
  trustLevel?: TrustRecord["level"];
  displayName?: string;
  note?: string;
}

export interface DeveloperCliResult {
  exitCode: number;
  lines: string[];
}

export async function runDeveloperCli(argv: string[]): Promise<DeveloperCliResult> {
  const args = parseDeveloperCliArgs(argv);

  if (args.command === "profile") {
    return showProfile(args);
  }

  if (args.command === "audit") {
    return listAuditEvents(args);
  }

  if (args.command === "tasks") {
    return listTasks(args);
  }

  if (args.command === "approvals") {
    return handleApprovals(args);
  }

  if (args.command === "trust") {
    return handleTrust(args);
  }

  if (args.command === "peer-list") {
    return listObservedPeers(args);
  }

  if (args.command === "vault-index") {
    return showVaultIndex(args);
  }

  if (args.command === "vault-search") {
    return searchSharedVault(args);
  }

  throw new Error(`Unhandled command: ${args.command}`);
}

export function parseDeveloperCliArgs(argv: string[]): DeveloperCliArgs {
  const args: DeveloperCliArgs = {
    command: "profile",
    profileDir: "./data/default",
    vaultDir: DEFAULT_SHARED_VAULT_DIR,
    limit: 20,
    approvalAction: "list",
    trustAction: "list",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--profile") {
      args.profileDir = readValue(argv, ++index, arg);
    } else if (arg === "--vault") {
      args.vaultDir = readValue(argv, ++index, arg);
    } else if (arg === "--query") {
      args.query = readValue(argv, ++index, arg);
    } else if (arg === "--limit") {
      args.limit = parsePositiveInteger(readValue(argv, ++index, arg), arg);
    } else if (arg === "--status") {
      args.status = parseApprovalStatus(readValue(argv, ++index, arg));
    } else if (arg === "--level") {
      args.trustLevel = parseTrustLevel(readValue(argv, ++index, arg));
    } else if (arg === "--name") {
      args.displayName = readValue(argv, ++index, arg);
    } else if (arg === "--note") {
      args.note = readValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printDeveloperCliHelp();
      process.exit(0);
    } else if (!arg.startsWith("--") && args.command === "profile") {
      args.command = parseDeveloperCliCommand(arg);
    } else if (!arg.startsWith("--") && args.command === "approvals" && args.approvalAction === "list") {
      args.approvalAction = parseApprovalAction(arg);
    } else if (!arg.startsWith("--") && args.command === "approvals" && !args.approvalId) {
      args.approvalId = arg;
    } else if (!arg.startsWith("--") && args.command === "trust" && args.trustAction === "list") {
      args.trustAction = parseTrustAction(arg);
    } else if (!arg.startsWith("--") && args.command === "trust" && !args.peerOwnerId) {
      args.peerOwnerId = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export function printDeveloperCliHelp(): void {
  console.log(`EnvoyMesh developer CLI

Usage:
  npm run cli -w @envoymesh/node -- <command> [options]

Commands:
  profile        Show owner/device identity summary.
  peer-list      List remote peers observed in audit events.
  trust          List, set, or remove trust records.
  vault-index    Build and summarize the shared vault index.
  vault-search   Search the shared vault metadata/chunks.
  audit          Inspect audit events.
  tasks          Inspect task journal entries.
  approvals      Inspect or update owner approval queue.

Options:
  --profile <dir>   Profile directory. Default: ./data/default
  --vault <dir>     Shared vault directory. Default: shared_vault
  --query <text>    Query for vault-search.
  --limit <n>       Max rows to print. Default: 20
  --status <status> Approval status filter: pending, approved, rejected.
  --level <level>   Trust level: direct, referred, public, blocked.
  --name <text>     Display name for trust records.
  --note <text>     Note for trust records.
`);
}

async function showProfile(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const profile = await loadOrCreateNodeProfile(args.profileDir);

  return ok([
    "Profile",
    `Owner ID: ${profile.owner.ownerId}`,
    `Device ID: ${profile.device.deviceId}`,
    `Device profile: ${profile.deviceCertificate.deviceProfile}`,
    `Capabilities: ${profile.deviceCertificate.capabilities.join(",")}`,
  ]);
}

async function listAuditEvents(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const events = await createLocalTaskStore(args.profileDir).readAuditEvents();

  return ok([
    `Audit events (${events.length})`,
    ...last(events, args.limit).map(formatAuditEvent),
  ]);
}

async function listTasks(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const entries = await createLocalTaskStore(args.profileDir).readTaskJournalEntries();

  return ok([
    `Task journal entries (${entries.length})`,
    ...last(entries, args.limit).map(
      (entry) =>
        `${entry.createdAt} ${entry.taskId} ${entry.eventType}/${entry.state} ${entry.summary}`,
    ),
  ]);
}

async function listApprovals(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const approvals = await createLocalTaskStore(args.profileDir).readApprovalRequests();
  const filtered = args.status
    ? approvals.filter((approval) => approval.status === args.status)
    : approvals;

  return ok([
    `Approval requests (${filtered.length})`,
    ...last(filtered, args.limit).map(formatApprovalRequest),
  ]);
}

async function handleApprovals(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  if (args.approvalAction === "list") {
    return listApprovals(args);
  }

  if (!args.approvalId) {
    throw new Error(`approvals ${args.approvalAction} requires <approval-id>`);
  }

  const status = args.approvalAction === "approve" ? "approved" : "rejected";
  const request = await createLocalTaskStore(args.profileDir).updateApprovalRequestStatus(
    args.approvalId,
    status,
  );

  return ok([
    `Approval ${status}`,
    formatApprovalRequest(request),
  ]);
}

async function handleTrust(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const store = createLocalTrustStore(args.profileDir);

  if (args.trustAction === "list") {
    const records = await store.listTrustRecords();

    return ok([
      `Trust records (${records.length})`,
      ...records.slice(0, args.limit).map(formatTrustRecord),
    ]);
  }

  if (!args.peerOwnerId) {
    throw new Error(`trust ${args.trustAction} requires <peer-owner-id>`);
  }

  if (args.trustAction === "remove") {
    const removed = await store.removeTrustRecord(args.peerOwnerId);

    return ok([
      "Trust record removed",
      formatTrustRecord(removed),
    ]);
  }

  if (!args.trustLevel) {
    throw new Error("trust set requires --level <direct|referred|public|blocked>");
  }

  const record = await store.setTrustRecord({
    peerOwnerId: args.peerOwnerId,
    level: args.trustLevel,
    displayName: args.displayName,
    note: args.note,
  });

  return ok([
    "Trust record saved",
    formatTrustRecord(record),
  ]);
}

async function listObservedPeers(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const events = await createLocalTaskStore(args.profileDir).readAuditEvents();
  const byPeer = new Map<string, { count: number; lastSeenAt: string }>();

  for (const event of events) {
    if (!event.remotePeerId) {
      continue;
    }

    const current = byPeer.get(event.remotePeerId);
    byPeer.set(event.remotePeerId, {
      count: (current?.count ?? 0) + 1,
      lastSeenAt: maxIsoDate(current?.lastSeenAt, event.createdAt),
    });
  }

  const peers = [...byPeer.entries()]
    .sort((left, right) => right[1].lastSeenAt.localeCompare(left[1].lastSeenAt))
    .slice(0, args.limit);

  return ok([
    `Observed peers (${byPeer.size})`,
    ...peers.map(([peerId, summary]) => `${summary.lastSeenAt} ${peerId} messages=${summary.count}`),
  ]);
}

async function showVaultIndex(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const index = await buildVaultIndexForCli(args);

  return ok([
    `Vault: ${index.rootDir}`,
    `Documents: ${index.documents.length}`,
    `Chunks: ${index.chunks.length}`,
    ...index.documents
      .slice(0, args.limit)
      .map((document) => `${document.relativePath} bytes=${document.byteLength} chunks=${countChunks(index, document.documentId)}`),
  ]);
}

async function searchSharedVault(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  if (!args.query) {
    throw new Error("vault-search requires --query <text>");
  }

  const index = await buildVaultIndexForCli(args);
  const results = searchVault(index, args.query, { limit: args.limit });

  return ok([
    `Vault search results (${results.length})`,
    ...results.map(
      (result) =>
        `${result.score} ${result.document.relativePath}#${result.chunk.index} matches=${result.matches.join(",")}`,
    ),
  ]);
}

function buildVaultIndexForCli(args: DeveloperCliArgs): Promise<VaultIndex> {
  return buildVaultIndex({
    rootDir: resolve(args.vaultDir),
  });
}

function formatAuditEvent(event: AuditEvent): string {
  const intent = event.intent ? ` intent=${event.intent}` : "";
  const task = event.taskId ? ` task=${event.taskId}` : "";
  const remote = event.remotePeerId ? ` remote=${event.remotePeerId}` : "";

  return `${event.createdAt} ${event.type} outcome=${event.outcome}${intent}${task}${remote} ${event.summary}`;
}

function formatApprovalRequest(request: ApprovalRequest): string {
  const mandate = request.mandateId ? ` mandate=${request.mandateId}` : "";

  return `${request.createdAt} ${request.approvalId} status=${request.status} task=${request.taskId}${mandate} action=${request.requestedAction} ${request.reason}`;
}

function formatTrustRecord(record: TrustRecord): string {
  const name = record.displayName ? ` name="${record.displayName}"` : "";
  const note = record.note ? ` note="${record.note}"` : "";

  return `${record.updatedAt} ${record.peerOwnerId} level=${record.level}${name}${note}`;
}

function countChunks(index: VaultIndex, documentId: string): number {
  return index.chunks.filter((chunk) => chunk.documentId === documentId).length;
}

function last<T>(values: T[], limit: number): T[] {
  return values.slice(Math.max(values.length - limit, 0));
}

function maxIsoDate(left: string | undefined, right: string): string {
  if (!left) {
    return right;
  }

  return left.localeCompare(right) > 0 ? left : right;
}

function ok(lines: string[]): DeveloperCliResult {
  return {
    exitCode: 0,
    lines,
  };
}

function parseDeveloperCliCommand(value: string): DeveloperCliCommand {
  if (
    value === "profile" ||
    value === "peer-list" ||
    value === "trust" ||
    value === "vault-index" ||
    value === "vault-search" ||
    value === "audit" ||
    value === "tasks" ||
    value === "approvals"
  ) {
    return value;
  }

  throw new Error(`Unknown command: ${value}`);
}

function parseApprovalAction(value: string): DeveloperCliArgs["approvalAction"] {
  if (value === "list" || value === "approve" || value === "reject") {
    return value;
  }

  throw new Error(`Unknown approvals action: ${value}`);
}

function parseTrustAction(value: string): DeveloperCliArgs["trustAction"] {
  if (value === "list" || value === "set" || value === "remove") {
    return value;
  }

  throw new Error(`Unknown trust action: ${value}`);
}

function parseApprovalStatus(value: string): ApprovalRequest["status"] {
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }

  throw new Error(`Invalid approval status: ${value}`);
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}
