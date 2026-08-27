import {
  analyzeConnectivityStageD,
  analyzeWanConnectivityAxes,
  buildMorningReportDigest,
  createLocalTaskStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
  loadOrCreateNodeProfile,
  measureStorageGate,
  parseTrustLevel,
  type ApprovalRequest,
  type AuditEvent,
  type TrustRecord,
} from "@envoymesh/local-store";
import {
  listPeersBridge,
  relayStatusBridge,
  type BClassRelaySnapshot,
  type BClassRelayStatusDeps,
  type BClassPeerListDeps,
} from "@envoymesh/envoy-harness-adapter";
import {
  assertPathInsideVault,
  buildVaultIndex,
  DEFAULT_SHARED_VAULT_DIR,
  searchVault,
  writeVaultContentManifestFile,
  type VaultIndex,
} from "@envoymesh/vault";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { decodeWanJoinInviteV1, encodeWanJoinInviteV1, type WanJoinInviteV1 } from "./wan-invite.js";
import { createDiscoverySeedStore } from "./discovery-seed-store.js";
import { createNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import {
  formatCapabilityDiscoveryRows,
  formatDiscoverySeedRows,
  formatPeerDiscoveryRows,
} from "./discovery-report.js";
import { formatConnectivityRichPanel } from "./connectivity-status-rich.js";
import {
  IPFSInteropRecipeV1Id,
  kuboIpfsAddFileInteropRecipeV1,
  ipfsInteropRecipeV1CliTemplate,
} from "./kubo-ipfs-export.js";
import { ensureKuboIpfsReady } from "./kubo-ipfs-engine.js";
import {
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  heliaUnixfsAddFileInteropRecipeV1,
  heliaUnixfsExportRecipeV1Description,
} from "./helia-ipfs-export.js";
import { formatWanSignOffEvidenceReport } from "@envoymesh/api";
import { formatWanTwoNatOperatorChecklist } from "@envoymesh/api";
import { execSync } from "node:child_process";

export type IpfsFingerprintEngine = "kubo" | "helia";

export type DeveloperCliCommand =
  | "profile"
  | "peer-list"
  | "trust"
  | "vault-index"
  | "vault-search"
  | "vault-manifest"
  | "vault-ipfs-fingerprint"
  | "audit"
  | "tasks"
  | "approvals"
  | "connectivity-status"
  | "connectivity-signoff"
  | "relay-status"
  | "morning-report"
  | "discover-topic"
  | "storage-gate"
  | "pairing"
  | "smoke-checklist"
  | "invite"
  | "model-config";

export interface DeveloperCliArgs {
  command: DeveloperCliCommand;
  profileDir: string;
  vaultDir: string;
  query?: string;
  limit: number;
  auditCorrelationId?: string;
  includeP2pTraceInAudit: boolean;
  status?: ApprovalRequest["status"];
  approvalAction: "list" | "approve" | "reject";
  approvalId?: string;
  pairingAction: "list" | "approve" | "reject" | "retry" | "timeline";
  pairingIdOrPeer?: string;
  trustAction: "list" | "set" | "remove";
  peerOwnerId?: string;
  trustLevel?: TrustRecord["level"];
  displayName?: string;
  note?: string;
  manifestOutputPath?: string;
  /** vault-ipfs-fingerprint: arbitrary file resolved against cwd unless absolute */
  ipfsFingerprintFile?: string;
  /** vault-ipfs-fingerprint: path under --vault (requires --vault) */
  vaultRelativePath?: string;
  /** vault-ipfs-fingerprint: export engine (default kubo). */
  ipfsFingerprintEngine?: IpfsFingerprintEngine;
  machineAName?: string;
  machineBName?: string;
  outputFormat?: "text" | "json";
  pairingStatusFilter?: "pending" | "approved" | "rejected" | "deferred" | "approved_remote";
  pairingQuery?: string;
  inviteAction?: "encode" | "decode";
  inviteBootstrapPeers?: string[];
  inviteBootstrapPresets?: string[];
  inviteTargetPeerId?: string;
  inviteTargetMultiaddrs?: string[];
  inviteExpiresAt?: string;
  inviteNote?: string;
  inviteToken?: string;
  /** connectivity-status only: prepend ASCII Stage D snapshot panel */
  connectivityRich?: boolean;
  /** connectivity-signoff: format physical two-NAT ledger row */
  connectivitySignoffPhysicalTwoNat?: boolean;
  connectivitySignoffChecklist?: boolean;
  connectivitySignoffComplete?: boolean;
  relayAddr?: string;
  operator?: string;
  natAPeer?: string;
  natBPeer?: string;
  chatVerified?: boolean;
  automatedOk?: boolean;
  /** discover-topic: DHT capability topic string */
  topic?: string;
  /** audit / storage-gate: ISO timestamp lower bound (inclusive) */
  sinceIso?: string;
  /** audit: ISO timestamp upper bound (exclusive) */
  untilIso?: string;
}

export interface DeveloperCliResult {
  exitCode: number;
  lines: string[];
}

/**
 * Windows often runs npm lifecycle scripts via `cmd.exe`, which can drop `--foo` flags before they reach Node.
 * Common mangling: `connectivity-status --profile C:\\path --rich` becomes `connectivity-status C:\\path`.
 * Recover stable `--profile` / `--rich` tokens when we see unmistakable patterns.
 */
export function normalizeDeveloperCliArgv(argv: string[]): string[] {
  if (argv.length === 0 || argv[0] !== "connectivity-status") {
    return argv;
  }

  let a = [...argv];

  const looksLikeProfileDir = (token: string): boolean => {
    if (token === "rich") return false;
    if (/^[a-zA-Z]:[\\/]/.test(token)) return true;
    if (token.includes("\\") || token.includes("/")) return true;
    if (token.startsWith(".")) return true;
    return false;
  };

  // connectivity-status [bare profile path]
  if (a.length >= 2 && !a[1].startsWith("-")) {
    if (a[1] === "rich") {
      a.splice(1, 1, "--rich");
    } else if (looksLikeProfileDir(a[1])) {
      a.splice(1, 0, "--profile");
    }
  }

  const profileIdx = a.indexOf("--profile");
  if (profileIdx >= 0 && profileIdx + 2 < a.length && a[profileIdx + 2] === "rich") {
    a = [...a];
    a[profileIdx + 2] = "--rich";
  }

  return a;
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

  if (args.command === "connectivity-status") {
    return showConnectivityStatus(args);
  }

  if (args.command === "connectivity-signoff") {
    return showConnectivitySignoff(args);
  }

  if (args.command === "relay-status") {
    return showRelayStatus(args);
  }

  if (args.command === "pairing") {
    return handlePairing(args);
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

  if (args.command === "vault-manifest") {
    return writeVaultManifest(args);
  }

  if (args.command === "vault-ipfs-fingerprint") {
    return fingerprintVaultFileIpfsInterop(args);
  }

  if (args.command === "morning-report") {
    return showMorningReport(args);
  }

  if (args.command === "discover-topic") {
    return showDiscoverTopicAudit(args);
  }

  if (args.command === "storage-gate") {
    return showStorageGate(args);
  }

  if (args.command === "smoke-checklist") {
    return generateSmokeChecklist(args);
  }

  if (args.command === "invite") {
    return handleInvite(args);
  }

  if (args.command === "model-config") {
    return showModelConfig(args);
  }

  throw new Error(`Unhandled command: ${args.command}`);
}

export function parseDeveloperCliArgs(rawArgv: string[]): DeveloperCliArgs {
  const argv = normalizeDeveloperCliArgv(rawArgv);
  const args: DeveloperCliArgs = {
    command: "profile",
    profileDir: "./data/default",
    vaultDir: DEFAULT_SHARED_VAULT_DIR,
    limit: 20,
    includeP2pTraceInAudit: false,
    approvalAction: "list",
    pairingAction: "list",
    trustAction: "list",
    outputFormat: "text",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--profile") {
      args.profileDir = readValue(argv, ++index, arg);
    } else if (arg === "--vault") {
      args.vaultDir = readValue(argv, ++index, arg);
    } else if (arg === "--query") {
      const value = readValue(argv, ++index, arg);
      if (args.command === "pairing") {
        args.pairingQuery = value;
      } else {
        args.query = value;
      }
    } else if (arg === "--limit") {
      args.limit = parsePositiveInteger(readValue(argv, ++index, arg), arg);
    } else if (arg === "--audit-correlation") {
      args.auditCorrelationId = readValue(argv, ++index, arg);
    } else if (arg === "--include-p2p-trace") {
      args.includeP2pTraceInAudit = true;
    } else if (arg === "--status") {
      const value = readValue(argv, ++index, arg);
      if (args.command === "pairing") {
        args.pairingStatusFilter = parsePairingTimelineStatus(value);
      } else {
        args.status = parseApprovalStatus(value);
      }
    } else if (arg === "--level") {
      args.trustLevel = parseTrustLevel(readValue(argv, ++index, arg));
    } else if (arg === "--name") {
      args.displayName = readValue(argv, ++index, arg);
    } else if (arg === "--note") {
      args.note = readValue(argv, ++index, arg);
    } else if (arg === "--output") {
      args.manifestOutputPath = readValue(argv, ++index, arg);
    } else if (arg === "--file") {
      args.ipfsFingerprintFile = readValue(argv, ++index, arg);
    } else if (arg === "--relative-path") {
      args.vaultRelativePath = readValue(argv, ++index, arg);
    } else if (arg === "--engine") {
      args.ipfsFingerprintEngine = parseIpfsFingerprintEngine(readValue(argv, ++index, arg));
    } else if (arg === "--format") {
      args.outputFormat = parseOutputFormat(readValue(argv, ++index, arg));
    } else if (arg === "--rich") {
      args.connectivityRich = true;
    } else if (arg === "--physical-two-nat") {
      args.connectivitySignoffPhysicalTwoNat = true;
    } else if (arg === "--checklist") {
      args.connectivitySignoffChecklist = true;
    } else if (arg === "--complete") {
      args.connectivitySignoffComplete = true;
    } else if (arg === "--relay-addr") {
      args.relayAddr = readValue(argv, ++index, arg);
    } else if (arg === "--operator") {
      args.operator = readValue(argv, ++index, arg);
    } else if (arg === "--nat-a-peer") {
      args.natAPeer = readValue(argv, ++index, arg);
    } else if (arg === "--nat-b-peer") {
      args.natBPeer = readValue(argv, ++index, arg);
    } else if (arg === "--chat-verified") {
      args.chatVerified = true;
    } else if (arg === "--automated-ok") {
      args.automatedOk = true;
    } else if (arg === "--machine-a") {
      args.machineAName = readValue(argv, ++index, arg);
    } else if (arg === "--machine-b") {
      args.machineBName = readValue(argv, ++index, arg);
    } else if (arg === "--bootstrap-peer") {
      if (!args.inviteBootstrapPeers) {
        args.inviteBootstrapPeers = [];
      }
      args.inviteBootstrapPeers.push(readValue(argv, ++index, arg));
    } else if (arg === "--invite-bootstrap-preset") {
      if (!args.inviteBootstrapPresets) {
        args.inviteBootstrapPresets = [];
      }
      args.inviteBootstrapPresets.push(readValue(argv, ++index, arg));
    } else if (arg === "--invite-target-peer") {
      args.inviteTargetPeerId = readValue(argv, ++index, arg);
    } else if (arg === "--invite-target-multiaddr") {
      if (!args.inviteTargetMultiaddrs) {
        args.inviteTargetMultiaddrs = [];
      }
      args.inviteTargetMultiaddrs.push(readValue(argv, ++index, arg));
    } else if (arg === "--invite-expires-at") {
      args.inviteExpiresAt = readValue(argv, ++index, arg);
    } else if (arg === "--invite-note") {
      args.inviteNote = readValue(argv, ++index, arg);
    } else if (arg === "--invite-token") {
      args.inviteToken = readValue(argv, ++index, arg);
    } else if (arg === "--topic") {
      args.topic = readValue(argv, ++index, arg);
    } else if (arg === "--since") {
      args.sinceIso = readValue(argv, ++index, arg);
    } else if (arg === "--until") {
      args.untilIso = readValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printDeveloperCliHelp();
      process.exit(0);
    } else if (!arg.startsWith("--") && args.command === "profile") {
      args.command = parseDeveloperCliCommand(arg);
    } else if (!arg.startsWith("--") && args.command === "approvals" && args.approvalAction === "list") {
      args.approvalAction = parseApprovalAction(arg);
    } else if (!arg.startsWith("--") && args.command === "approvals" && !args.approvalId) {
      args.approvalId = arg;
    } else if (!arg.startsWith("--") && args.command === "pairing" && args.pairingAction === "list") {
      args.pairingAction = parsePairingAction(arg);
    } else if (!arg.startsWith("--") && args.command === "pairing" && !args.pairingIdOrPeer) {
      args.pairingIdOrPeer = arg;
    } else if (!arg.startsWith("--") && args.command === "trust" && args.trustAction === "list") {
      args.trustAction = parseTrustAction(arg);
    } else if (!arg.startsWith("--") && args.command === "trust" && !args.peerOwnerId) {
      args.peerOwnerId = arg;
    } else if (!arg.startsWith("--") && args.command === "invite" && !args.inviteAction) {
      args.inviteAction = parseInviteAction(arg);
    } else if (!arg.startsWith("--") && args.command === "invite" && args.inviteAction === "decode" && !args.inviteToken) {
      args.inviteToken = arg;
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

Windows/cmd.exe note: npm may strip "--profile" before tsx sees args — put the profile directory immediately after connectivity-status as a bare path. If "--rich" vanishes but --profile survives, a trailing token rich after the profile path is treated as --rich.

Commands:
  profile        Show owner/device identity summary.
  peer-list      List remote peers observed in audit events.
  trust          List, set, or remove trust records.
  vault-index    Build and summarize the shared vault index.
  vault-search   Search the shared vault metadata/chunks.
  vault-manifest Write a content-addressed vault manifest JSON (--output).
  vault-ipfs-fingerprint Print IPFS root CID for a file (Kubo or Helia interop recipe v1).
  audit          Inspect audit events.
  tasks          Inspect task journal entries.
  approvals      Inspect or update owner approval queue.
  connectivity-status Show discovery/connectivity diagnostics: persisted node-config (discovery profile, bootstrap
                        preset ids, explicit bootstrap peer count, relay flags), audit summaries plus discovered peer ids,
                         capability-topic traces, and persisted discovery-seeds.json rows.
  connectivity-signoff Print WAN sign-off ledger row + checklist for docs/wan-connectivity-signoff.md.
  pairing        Pairing-focused queue/actions (list/approve/reject/retry/timeline).
  relay-status   Show local relay manager snapshot from runtime audit events.
  morning-report Show ranked discovery digest.
  discover-topic  Show audit + seeds for a DHT capability topic (--topic). Live query: Social Search or RPC.
  storage-gate    Measure audit JSONL size and query latency vs sqlite-adoption.md §2 triggers.
  smoke-checklist Generate a multi-machine validation checklist.
  invite         WAN join-invite helpers (encode/decode).

Options:
  --profile <dir>   Profile directory. Default: ./data/default
  --vault <dir>     Shared vault directory. Default: shared_vault
  --query <text>    Query for vault-search.
  --topic <text>    Capability topic for discover-topic.
  --since <iso>     Time lower bound for audit listings and storage-gate benchmark window.
  --until <iso>     Time upper bound (exclusive) for audit listings.
  --limit <n>       Max rows to print. Default: 20
  --audit-correlation <id>  Only show audit rows matching correlationId/taskId (substring match).
  --include-p2p-trace         Include p2p.trace rows in audit listings (hidden by default).
  --status <status> Approval status filter: pending, approved, rejected.
                   Pairing status filter when command is pairing: pending, approved, rejected, deferred, approved_remote.
  --level <level>   Trust level: direct, referred, public, blocked.
  --name <text>     Display name for trust records.
  --note <text>     Note for trust records.
  --file <path>     vault-ipfs-fingerprint: file to fingerprint (alternative to --relative-path).
  --relative-path <vaultRel> vault-ipfs-fingerprint: vault-relative file path (--vault).
  --engine <kubo|helia> vault-ipfs-fingerprint: export engine. Default: kubo
  --output <path>   Output file path (required for vault-manifest; optional for pairing timeline / smoke-checklist).
  --format <text|json> Output format (pairing timeline and relay-status).
  --rich           connectivity-status only: print ASCII Stage D snapshot panel above the usual summary.
  --physical-two-nat connectivity-signoff only: format physical two-NAT §4 ledger row.
  --checklist      connectivity-signoff only: print two-NAT operator checklist.
  --complete       connectivity-signoff only: format completed physical two-NAT ledger row.
  --relay-addr <multiaddr> connectivity-signoff: include relay multiaddr in notes.
  --operator <name> connectivity-signoff: operator column (default @operator).
  --nat-a-peer <id> connectivity-signoff: NAT client A peer id evidence.
  --nat-b-peer <id> connectivity-signoff: NAT client B peer id evidence.
  --chat-verified  connectivity-signoff --complete: mark manual chat verified.
  --automated-ok   connectivity-signoff --complete: mark automated baseline ok.
  --machine-a <name> Machine A label for smoke-checklist. Default: machine-a
  --machine-b <name> Machine B label for smoke-checklist. Default: machine-b

Invite (command: invite encode|decode):
  --bootstrap-peer <multiaddr>           Repeatable. Required for encode.
  --invite-bootstrap-preset <name>       Repeatable. Optional preset names for encode.
  --invite-target-peer <peerId>        Optional libp2p peer id for encode.
  --invite-target-multiaddr <multiaddr>  Repeatable. Optional dial hints for encode.
  --invite-expires-at <iso>              Optional ISO-8601 expiry for encode.
  --invite-note <text>                   Optional note for encode.
  --invite-token <token>                 Required for decode (unless token is passed as sole positional arg).
`);
}

async function handleInvite(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  if (!args.inviteAction) {
    throw new Error("invite requires encode|decode");
  }

  if (args.inviteAction === "encode") {
    const peers = args.inviteBootstrapPeers ?? [];
    if (peers.length === 0) {
      throw new Error("invite encode requires at least one --bootstrap-peer <multiaddr>");
    }

    const invite: WanJoinInviteV1 = {
      v: 1,
      createdAt: new Date().toISOString(),
      expiresAt: args.inviteExpiresAt,
      note: args.inviteNote,
      targetPeerId: args.inviteTargetPeerId,
      targetMultiaddrs: args.inviteTargetMultiaddrs,
      bootstrapPeers: peers,
      bootstrapPresets: args.inviteBootstrapPresets ?? [],
    };

    const token = encodeWanJoinInviteV1(invite);
    return ok([
      "WAN join-invite (v1)",
      `token=${token}`,
      "",
      "Start a node with:",
      `  npm run dev -w @envoymesh/node -- --join-invite "${token}"`,
    ]);
  }

  const token = args.inviteToken?.trim();
  if (!token) {
    throw new Error("invite decode requires --invite-token <token>");
  }

  const decoded = decodeWanJoinInviteV1(token);
  return ok(["WAN join-invite (decoded)", JSON.stringify(decoded, null, 2)]);
}

async function showModelConfig(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const configStore = createNodeConfigStore(args.profileDir);
  const config = await configStore.load();

  if (!config) {
    return ok(["Model config: not initialized (no node-config.json found)"]);
  }

  const mp = config.modelProviders;
  const lines = [
    "Model provider configuration",
    `  mode           ${mp.mode}`,
    mp.endpoint ? `  endpoint       ${mp.endpoint}` : null,
    mp.modelName ? `  modelName      ${mp.modelName}` : null,
    mp.apiKey ? `  apiKey         ${mp.apiKey.slice(0, 8)}...` : null,
    mp.requireApprovalForCloud !== undefined ? `  requireApprovalForCloud  ${mp.requireApprovalForCloud}` : null,
  ].filter(Boolean) as string[];

  return ok(lines);
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
  const store = createLocalTaskStore(args.profileDir);
  const events = await store.queryAuditEvents({
    since: args.sinceIso,
    until: args.untilIso,
    limit: Math.max(args.limit * 5, 500),
  });
  const filtered = filterAuditEventsForDeveloperView(args, events);

  return ok([
    `Audit events (${filtered.length} queried${args.sinceIso || args.untilIso ? ", time-filtered" : ""})`,
    ...last(filtered, args.limit).map(formatAuditEvent),
  ]);
}

async function showStorageGate(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const store = createLocalTaskStore(args.profileDir);
  const report = await measureStorageGate({
    profileDir: args.profileDir,
    readAuditEvents: () => store.readAuditEvents(),
    queryAuditIndex: (params) => store.queryAuditEvents(params),
    sinceIso: args.sinceIso,
  });

  if (args.outputFormat === "json") {
    return ok([JSON.stringify(report, null, 2)]);
  }

  return ok([
    `Storage gate: ${report.recommendation}`,
    `Profile: ${report.profileDir}`,
    `Measured: ${report.measuredAt}`,
    ...report.files.map((file) => `${file.path}: ${file.exists ? `${file.bytes} bytes` : "missing"}`),
    `Audit rows: ${report.benchmark.auditRowCount}; index rows: ${report.benchmark.indexRowCount}`,
    `Full audit read: ${report.benchmark.fullAuditReadMs.toFixed(1)} ms`,
    `Indexed 90-day tail query: ${report.benchmark.indexedAuditQueryMs.toFixed(1)} ms`,
    `SQLite triggers met: ${report.sqliteTriggersMet ? "yes" : "no"}`,
    ...(report.triggerReasons.length > 0
      ? report.triggerReasons.map((reason) => `  trigger: ${reason}`)
      : ["  triggers: none (stay on JSONL + secondary index)"]),
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

async function handlePairing(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const store = createLocalTaskStore(args.profileDir);
  const approvals = await store.readApprovalRequests();
  const pairingApprovals = approvals.filter((approval) => approval.taskId.startsWith("pairing:"));

  if (args.pairingAction === "list") {
    const filtered = filterPairingRows(pairingApprovals, args.pairingStatusFilter, args.pairingQuery);
    return ok([
      `Pairing approvals (${filtered.length})`,
      ...last(filtered, args.limit).map(formatApprovalRequest),
    ]);
  }

  if (args.pairingAction === "timeline") {
    const auditEvents = await store.readAuditEvents();
    const timeline = filterPairingTimelineRows(
      summarizePairingTimelineRows(pairingApprovals, auditEvents),
      args.pairingStatusFilter,
      args.pairingQuery,
    );
    if (args.outputFormat === "json") {
      const payload = JSON.stringify(timeline, null, 2);
      if (args.manifestOutputPath) {
        const { mkdir, writeFile } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        const path = resolve(args.manifestOutputPath);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${payload}\n`, { mode: 0o600 });
        return ok([`Wrote pairing timeline JSON to ${path}`]);
      }
      return ok(payload.split("\n"));
    }
    const lines = [
      `Pairing timeline (${timeline.length})`,
      ...last(timeline, args.limit).map((row) =>
        `${row.createdAt} request=${row.requestId} status=${row.status}${row.remotePeerId ? ` peer=${row.remotePeerId}` : ""} ${row.summary}`,
      ),
    ];
    if (args.manifestOutputPath) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      const path = resolve(args.manifestOutputPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
      return ok([`Wrote pairing timeline to ${path}`]);
    }
    return ok(lines);
  }

  if (!args.pairingIdOrPeer) {
    throw new Error(`pairing ${args.pairingAction} requires <approval-id|peer-id>`);
  }

  if (args.pairingAction === "retry") {
    const deferred = (await store.readAuditEvents())
      .filter((event) => event.intent === "device.pair.deferred" && event.remotePeerId === args.pairingIdOrPeer)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok([
      `Pairing retry hint for peer ${args.pairingIdOrPeer}`,
      deferred.length > 0
        ? `Last defer: ${deferred[0].createdAt} ${deferred[0].summary}`
        : "No deferred pairing event found for this peer in local audit.",
      `Run: npm run node:dev -- --profile ${args.profileDir} --pair-request "${args.pairingIdOrPeer}" --pair-note "Retry deferred pairing request"`,
    ]);
  }

  const status = args.pairingAction === "approve" ? "approved" : "rejected";
  const request = await store.updateApprovalRequestStatus(args.pairingIdOrPeer, status);
  if (!request.taskId.startsWith("pairing:")) {
    throw new Error(`Approval ${args.pairingIdOrPeer} is not a pairing request`);
  }
  return ok([
    `Pairing ${status}`,
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

/**
 * Phase 8 / Step 3 — `peer-list` is now canonical in the
 * bridge (`listPeersBridge` in
 * `@envoymesh/envoy-harness-adapter`). The CLI is a thin
 * wrapper that builds the deps from the profile dir and
 * delegates. The bridge's text format matches the
 * pre-Step-3 output line-for-line (the existing test
 * snapshot still passes).
 */
async function listObservedPeers(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const deps: BClassPeerListDeps = {
    readAuditEvents: () =>
      createLocalTaskStore(args.profileDir).readAuditEvents(),
    includeP2pTraceInAudit: args.includeP2pTraceInAudit === true,
    limit: args.limit,
  };
  const result = await listPeersBridge(deps);
  return ok(result.text.split("\n"));
}

function formatPersistedDiscoveryConfigLine(config: PersistedNodeConfig | undefined): string {
  if (!config) {
    return "Persisted node-config: (none — no node-config.json on disk; runtime may use CLI/env defaults until saved)";
  }
  const presets =
    config.bootstrapPresets.length > 0 ? config.bootstrapPresets.join(",") : "(empty — may resolve to CLI defaults)";
  const nPeers = config.bootstrapPeers?.length ?? 0;
  return `Persisted node-config: discoveryProfile=${config.discoveryProfile} bootstrapPresets=${presets} explicitBootstrapPeers=${nPeers} relay=${config.relayEnabled} relayServer=${config.relayServerEnabled}`;
}

async function showConnectivityStatus(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const [events, persisted] = await Promise.all([
    createLocalTaskStore(args.profileDir).readAuditEvents(),
    createNodeConfigStore(args.profileDir).load(),
  ]);
  const analysis = analyzeConnectivityStageD(events);
  const axes = analyzeWanConnectivityAxes(events);
  const traces = events.filter((event) => event.type === "p2p.trace");
  const warningEvents = traces.filter((event) => event.protocol === "connectivity.warning");
  const discoveredEvents = traces.filter((event) => event.protocol === "peer.discovery");
  const bootstrapFail = traces.filter((event) => event.protocol === "connectivity.bootstrap.fail");
  const reprobeFail = traces.filter((event) => event.protocol === "connectivity.reprobe.fail");

  const peerRows = formatPeerDiscoveryRows(events, 25);
  const capabilityRows = formatCapabilityDiscoveryRows(events, 12);
  const seedRecords = await createDiscoverySeedStore(args.profileDir).listSeedRecords();

  const persistedLine = formatPersistedDiscoveryConfigLine(persisted);

  const denseLine = `profile=${analysis.discoveryProfile} bootstrapPeers=${analysis.bootstrapPeerCount} discoveredPeers=${analysis.discoveredPeerCount} relayDiscoveries=${analysis.relayDiscoveryCount} bootstrapOk=${analysis.bootstrapProbeSuccessCount} bootstrapFail=${analysis.bootstrapProbeFailureCount} reprobeOk=${analysis.reprobeOkCount} reprobeFail=${analysis.reprobeFailCount} warnings=${analysis.warningCount}`;

  const sections: string[] = [];
  if (args.connectivityRich) {
    sections.push(...formatConnectivityRichPanel(analysis), "");
  }

  sections.push(
    "Connectivity status",
    persistedLine,
    denseLine,
    analysis.lastCheckpointAt ? `lastCheckpoint=${analysis.lastCheckpointAt}` : "lastCheckpoint=none",
    "",
    "WAN connectivity axes:",
    `  bootstrap=${axes.bootstrapReachability.state} — ${axes.bootstrapReachability.explanation}`,
    `  relay=${axes.relayAvailability.state} — ${axes.relayAvailability.explanation}`,
    `  punch=${axes.holePunch.state} — ${axes.holePunch.explanation}`,
    `  policy=${axes.policyBlock.state} — ${axes.policyBlock.explanation}`,
    "",
    ...last(bootstrapFail, 5).map((event) => `bootstrapFail ${event.createdAt} ${event.summary}`),
    ...last(reprobeFail, 5).map((event) => `reprobeFail ${event.createdAt} ${event.summary}`),
    ...last(warningEvents, 5).map((event) => `warning ${event.createdAt} ${event.summary}`),
    "",
    "Libp2p peers reported in audit (latest event per peer id):",
    ...(peerRows.length > 0 ? peerRows : ["  (none yet)"]),
  );

  if (capabilityRows.length > 0) {
    sections.push("", "Capability / topic discovery traces:", ...capabilityRows);
  }

  sections.push(
    "",
    "Persisted discovery seeds (discovery-seeds.json):",
    ...formatDiscoverySeedRows(seedRecords, 15),
    "",
    discoveredEvents.length === 0
      ? "hint: no peers discovered yet; verify subnet/firewall and add --bootstrap peers for wan-default."
      : "hint: validate end-to-end with signal/ping/chat once you recognize peer ids above.",
  );

  return ok(sections);
}

async function showConnectivitySignoff(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const events = await createLocalTaskStore(args.profileDir).readAuditEvents();
  const stageD = analyzeConnectivityStageD(events);
  const axes = analyzeWanConnectivityAxes(events);
  let commitSha = "unknown";
  try {
    commitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    /* optional outside git checkout */
  }

  if (args.connectivitySignoffChecklist) {
    return ok(
      formatWanTwoNatOperatorChecklist({
        relayAddr: args.relayAddr,
        natAPeerId: args.natAPeer,
        natBPeerId: args.natBPeer,
        operator: args.operator,
        chatVerified: args.chatVerified,
        automatedBaselineOk: args.automatedOk,
      }).split("\n"),
    );
  }

  const complete = args.connectivitySignoffComplete === true;
  const report = formatWanSignOffEvidenceReport({
    commitSha,
    operator: args.operator ?? "@operator",
    relayAddr: args.relayAddr,
    peerId: args.natAPeer && args.natBPeer ? `${args.natAPeer}↔${args.natBPeer}` : args.natAPeer,
    physicalTwoNat: args.connectivitySignoffPhysicalTwoNat === true || complete,
    relaySignOff: complete && args.chatVerified ? "ok" : args.connectivitySignoffPhysicalTwoNat ? "pending" : "partial",
    dcutrSignOff: "n/a",
    quicSignOff: "n/a",
    notes: complete
      ? [
          args.relayAddr ? `relay=${args.relayAddr}` : null,
          args.natAPeer ? `natA=${args.natAPeer}` : null,
          args.natBPeer ? `natB=${args.natBPeer}` : null,
          args.automatedOk ? "wan-relay-signoff-e2e green" : null,
          args.chatVerified ? "manual two-NAT signed chat verified" : null,
        ]
          .filter(Boolean)
          .join("; ")
      : undefined,
    diagnostics: {
      nodeOnline: false,
      stageD,
      axes,
    },
  });

  return ok(report.split("\n"));
}

/**
 * Phase 8 / Step 3 — `relay-status` is now canonical in
 * the bridge (`relayStatusBridge`). The CLI is a thin
 * wrapper that builds the deps from the profile dir +
 * provides a `buildSnapshot` callback that wraps the
 * local-store's `buildRelayManagerSnapshot`. The
 * bridge's text format matches the pre-Step-3 output
 * line-for-line (the existing test snapshot still
 * passes).
 */
async function showRelayStatus(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const profileDir = args.profileDir;
  const deps: BClassRelayStatusDeps = {
    readAuditEvents: () => createLocalTaskStore(profileDir).readAuditEvents(),
    loadProfile: () => loadOrCreateNodeProfile(profileDir) as unknown as Promise<unknown>,
    buildSnapshot: ({ profile, auditEvents }) => {
      // The host owns the snapshot format — the
      // local-store's `buildRelayManagerSnapshot` reads
      // the profile + audit log and returns the typed
      // `RelayManagerSnapshot`. The bridge formats it
      // (text + JSON). The wrapper here bridges the
      // two: the host builds, the bridge formats.
      // (Lazy-imported to avoid a circular dep at module
      // top — `developer-cli.ts` already imports from
      // `@envoymesh/local-store`, but `buildRelayManagerSnapshot`
      // is in the same barrel and the type-cast below
      // would be cleaner with the explicit import. The
      // dynamic import keeps the refactor atomic.)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { buildRelayManagerSnapshot } = require("@envoymesh/local-store") as typeof import("@envoymesh/local-store");
      return buildRelayManagerSnapshot({
        profile: profile as Parameters<typeof buildRelayManagerSnapshot>[0]["profile"],
        auditEvents: auditEvents as unknown as Parameters<typeof buildRelayManagerSnapshot>[0]["auditEvents"],
      }) as BClassRelaySnapshot | null | undefined;
    },
    limit: args.limit,
  };
  const result = await relayStatusBridge(deps);
  if (args.outputFormat === "json") {
    return ok([result.json]);
  }
  return ok(result.text.split("\n"));
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

async function showMorningReport(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const taskStore = createLocalTaskStore(args.profileDir);
  const trustStore = createLocalTrustStore(args.profileDir);
  const peerStore = createLocalPeerDirectoryStore(args.profileDir);
  const [trustRecords, peerRecords, discoveryEvents] = await Promise.all([
    trustStore.listTrustRecords(),
    peerStore.listPeerRecords(),
    taskStore.readDiscoveryEvents(),
  ]);
  const digest = buildMorningReportDigest({
    trustRecords,
    peerDirectoryRecords: peerRecords,
    discoveryEvents,
    limit: args.limit,
  });
  return ok([
    `Morning report (${digest.length})`,
    ...digest.map(
      (entry) =>
        `score=${entry.score} owner=${entry.ownerId} trust=${entry.trustLevel} peer=${entry.peerId ?? "-"} matches=${entry.discoveryMatchCount} ${entry.reason}`,
    ),
  ]);
}

async function showDiscoverTopicAudit(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const topic = args.topic?.trim();
  if (!topic) {
    throw new Error("discover-topic requires --topic <capability-topic>");
  }
  const events = await createLocalTaskStore(args.profileDir).readAuditEvents();
  const capabilityRows = formatCapabilityDiscoveryRows(events, args.limit).filter((row) =>
    row.includes(`topic=${topic}`),
  );
  const seedRecords = await createDiscoverySeedStore(args.profileDir).listSeedRecords();
  const topicSeeds = seedRecords.filter((record) => record.source === "capability-topic").slice(0, args.limit);

  return ok([
    `Discover topic (audit tail): ${topic}`,
    "hint: live DHT query requires a running node — use Social Search (By Topic) or JSON-RPC discoverCapabilityTopic.",
    "",
    ...(capabilityRows.length > 0 ? capabilityRows : [`  (no discovery.capability.* audit rows for topic=${topic})`]),
    "",
    "Persisted capability-topic seeds:",
    ...formatDiscoverySeedRows(topicSeeds, args.limit),
  ]);
}

function buildVaultIndexForCli(args: DeveloperCliArgs): Promise<VaultIndex> {
  return buildVaultIndex({
    rootDir: resolve(args.vaultDir),
  });
}

async function writeVaultManifest(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const outputPath = args.manifestOutputPath;
  if (!outputPath) {
    throw new Error("vault-manifest requires --output <path>");
  }

  const manifest = await writeVaultContentManifestFile(resolve(args.vaultDir), resolve(outputPath));
  return ok([
    `Wrote manifest version=${manifest.version} documents=${manifest.documents.length} to ${resolve(outputPath)}`,
  ]);
}

function normalizeVaultRelativePathForInterop(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

async function fingerprintVaultFileIpfsInterop(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  if (args.ipfsFingerprintFile && args.vaultRelativePath) {
    throw new Error("vault-ipfs-fingerprint: specify either --file or --relative-path, not both");
  }

  const vaultRootResolved = resolve(args.vaultDir);
  let absFilePath: string;

  if (args.ipfsFingerprintFile) {
    absFilePath = resolve(args.ipfsFingerprintFile);
  } else if (args.vaultRelativePath) {
    const rel = normalizeVaultRelativePathForInterop(args.vaultRelativePath);
    absFilePath = resolve(vaultRootResolved, rel);
    assertPathInsideVault(vaultRootResolved, absFilePath);
  } else {
    throw new Error(
      "vault-ipfs-fingerprint requires --file <path> or --relative-path <path> (--vault resolves relative vault paths)",
    );
  }

  try {
    const st = await stat(absFilePath);
    if (!st.isFile()) {
      throw new Error(`vault-ipfs-fingerprint expects a regular file (${absFilePath})`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`vault-ipfs-fingerprint: file not found (${absFilePath})`);
    }
    throw err;
  }

  const engine = args.ipfsFingerprintEngine ?? "kubo";

  if (engine === "helia") {
    const outcome = await heliaUnixfsAddFileInteropRecipeV1(absFilePath);
    if (!outcome.ok || !outcome.cid) {
      const hint = outcome.errorHint ?? "Helia UnixFS export failed";
      const detail = outcome.stderr?.trim() ? `\n${outcome.stderr.trim()}` : "";
      throw new Error(`${hint}${detail}`);
    }

    return ok([
      `ipfsInteropRecipe=${HELIA_UNIXFS_EXPORT_RECIPE_V1_ID}`,
      `heliaVersion=${outcome.heliaVersion}`,
      `recipe=${heliaUnixfsExportRecipeV1Description()}`,
      `engine=helia`,
      `file=${absFilePath}`,
      `cid=${outcome.cid}`,
    ]);
  }

  await ensureKuboIpfsReady({ profileDir: args.profileDir });

  const outcome = kuboIpfsAddFileInteropRecipeV1(absFilePath, args.profileDir);
  if (!outcome.ok || !outcome.cid) {
    const hint = outcome.errorHint ?? `ipfs add failed (exit)`;
    const detail = outcome.stderr.trim() ? `\n${outcome.stderr.trim()}` : "";
    throw new Error(`${hint}${detail}`);
  }

  const invokedRecipe = `${ipfsInteropRecipeV1CliTemplate().replace("<absoluteFile>", absFilePath)}`;

  return ok([
    `ipfsInteropRecipe=${IPFSInteropRecipeV1Id}`,
    `kuboVersion=${outcome.kuboVersion}`,
    `recipe=${invokedRecipe}`,
    `engine=kubo`,
    `file=${absFilePath}`,
    `cid=${outcome.cid}`,
  ]);
}

async function generateSmokeChecklist(args: DeveloperCliArgs): Promise<DeveloperCliResult> {
  const machineA = args.machineAName ?? "machine-a";
  const machineB = args.machineBName ?? "machine-b";
  const suffix = Date.now().toString(36);
  const corrSignal = `smoke-signal-${suffix}`;
  const corrPing = `smoke-ping-${suffix}`;
  const corrChat = `smoke-chat-${suffix}`;
  const corrTask = `smoke-task-${suffix}`;
  const lines = [
    "# EnvoyMesh Multi-Machine Smoke Checklist",
    "",
    "## Setup",
    `- [ ] On ${machineA}, run \`npm run node:dev -- --profile ./data/${machineA} --listen /ip4/0.0.0.0/tcp/0 --p2p-debug\``,
    `- [ ] On ${machineB}, run \`npm run node:dev -- --profile ./data/${machineB} --listen /ip4/0.0.0.0/tcp/0 --p2p-debug\``,
    "- [ ] Copy each node's printed multiaddr.",
    "",
    "## Pairing",
    `- [ ] On ${machineB}, send pairing request: \`npm run node:dev -- --profile ./data/${machineB} --pair-request \"<${machineA}-multiaddr>\" --pair-note \"pairing smoke\"\``,
    `- [ ] On ${machineA}, open dashboard with \`ENVOYMESH_PROFILE=./data/${machineA} npm run desktop:dev\` and approve pending pairing.`,
    `- [ ] On ${machineB}, verify pairing audit: \`npm run cli -w @envoymesh/node -- audit --profile ./data/${machineB} --limit 40\``,
    "",
    "## Correlated transport probes (auto-generated correlation IDs)",
    `- [ ] ${machineA} signal ${machineB}: \`npm run node:dev -- --profile ./data/${machineA} --signal "<${machineB}-multiaddr>" --correlation-id "${corrSignal}"\``,
    `- [ ] ${machineB} ping ${machineA}: \`npm run node:dev -- --profile ./data/${machineB} --ping "<${machineA}-multiaddr>" --correlation-id "${corrPing}"\``,
    "",
    "## Messaging And Task Flow",
    `- [ ] Send chat from ${machineB} to ${machineA}: \`npm run node:dev -- --profile ./data/${machineB} --chat "<${machineA}-multiaddr>" --chat-text "smoke hello" --correlation-id "${corrChat}"\``,
    `- [ ] Send task.propose from ${machineB} to ${machineA}: \`npm run node:dev -- --profile ./data/${machineB} --task-propose "<${machineA}-multiaddr>" --task-id smoke-task-1 --objective "smoke objective" --requested-result "smoke result" --correlation-id "${corrTask}"\``,
    `- [ ] Verify ${machineA} task journal and audit show handled events.`,
    "",
    "## Data Path",
    `- [ ] Add a file under ${machineB}'s vault and send with \`--data-send\`.`,
    `- [ ] Verify file appears in ${machineA}'s vault and audit has sync.state/data summary.`,
    "",
    "## Dashboard Validation",
    `- [ ] Dashboard shows pairing queue history, deferred peers (if any), and retry controls.`,
    "- [ ] Dashboard shows chat trail, task events, and latest audit rows.",
  ];

  if (args.manifestOutputPath) {
    const path = resolve(args.manifestOutputPath);
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
    return ok([`Wrote smoke checklist to ${path}`]);
  }

  return ok(lines);
}

function formatAuditEvent(event: AuditEvent): string {
  const intent = event.intent ? ` intent=${event.intent}` : "";
  const task = event.taskId ? ` task=${event.taskId}` : "";
  const remote = event.remotePeerId ? ` remote=${event.remotePeerId}` : "";
  const correlation = event.correlationId ? ` correlation=${event.correlationId}` : "";
  const direction = event.direction ? ` direction=${event.direction}` : "";
  const verification = event.verificationStatus ? ` verify=${event.verificationStatus}` : "";
  const latency = typeof event.latencyMs === "number" ? ` latencyMs=${event.latencyMs}` : "";
  const protocol = event.protocol ? ` protocol=${event.protocol}` : "";

  return `${event.createdAt} ${event.type} outcome=${event.outcome}${intent}${task}${correlation}${direction}${verification}${latency}${protocol}${remote} ${event.summary}`;
}

function filterAuditEventsForDeveloperView(args: DeveloperCliArgs, events: AuditEvent[]): AuditEvent[] {
  const correlationNeedle = args.auditCorrelationId?.trim();
  return events.filter((event) => {
    if (!args.includeP2pTraceInAudit && event.type === "p2p.trace") {
      return false;
    }

    if (!correlationNeedle) {
      return true;
    }

    const haystack = `${event.correlationId ?? ""}\n${event.taskId ?? ""}`;
    return haystack.includes(correlationNeedle);
  });
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

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length > 0 ? entries.map(([key, value]) => `${key}:${value}`).join(",") : "-";
}

function parseDeveloperCliCommand(value: string): DeveloperCliCommand {
  if (
    value === "profile" ||
    value === "peer-list" ||
    value === "trust" ||
    value === "vault-index" ||
    value === "vault-search" ||
    value === "vault-manifest" ||
    value === "vault-ipfs-fingerprint" ||
    value === "audit" ||
    value === "tasks" ||
    value === "approvals" ||
    value === "connectivity-status" ||
    value === "connectivity-signoff" ||
    value === "relay-status" ||
    value === "pairing" ||
    value === "morning-report" ||
    value === "discover-topic" ||
    value === "storage-gate" ||
    value === "smoke-checklist" ||
    value === "invite" ||
    value === "model-config"
  ) {
    return value;
  }

  throw new Error(`Unknown command: ${value}`);
}

function parseInviteAction(value: string): "encode" | "decode" {
  if (value === "encode" || value === "decode") {
    return value;
  }
  throw new Error(`Unknown invite action: ${value}`);
}

function parseApprovalAction(value: string): DeveloperCliArgs["approvalAction"] {
  if (value === "list" || value === "approve" || value === "reject") {
    return value;
  }

  throw new Error(`Unknown approvals action: ${value}`);
}

function parsePairingAction(value: string): DeveloperCliArgs["pairingAction"] {
  if (value === "list" || value === "approve" || value === "reject" || value === "retry" || value === "timeline") {
    return value;
  }

  throw new Error(`Unknown pairing action: ${value}`);
}

function parseOutputFormat(value: string): DeveloperCliArgs["outputFormat"] {
  if (value === "text" || value === "json") {
    return value;
  }
  throw new Error(`Invalid format: ${value}`);
}

function parseIpfsFingerprintEngine(value: string): IpfsFingerprintEngine {
  if (value === "kubo" || value === "helia") {
    return value;
  }
  throw new Error(`Invalid --engine value: ${value} (expected kubo or helia)`);
}

function parsePairingTimelineStatus(value: string): DeveloperCliArgs["pairingStatusFilter"] {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "deferred" ||
    value === "approved_remote"
  ) {
    return value;
  }
  throw new Error(`Invalid pairing status: ${value}`);
}

function summarizePairingTimelineRows(approvals: ApprovalRequest[], auditEvents: AuditEvent[]) {
  const rows: Array<{
    requestId: string;
    status: "pending" | "approved" | "rejected" | "deferred" | "approved_remote";
    createdAt: string;
    summary: string;
    remotePeerId?: string;
  }> = [];

  for (const approval of approvals) {
    if (!approval.taskId.startsWith("pairing:")) {
      continue;
    }
    rows.push({
      requestId: approval.taskId.slice("pairing:".length),
      status: approval.status,
      createdAt: approval.createdAt,
      summary: approval.reason.split("\nPAIRING_CONTEXT:")[0],
    });
  }

  for (const event of auditEvents) {
    if (
      event.intent !== "device.pair.request" &&
      event.intent !== "device.pair.approve" &&
      event.intent !== "device.pair.deferred"
    ) {
      continue;
    }
    const matched = event.summary.match(/request ([A-Za-z0-9:_-]+)/);
    rows.push({
      requestId: matched?.[1] ?? "unknown",
      status:
        event.intent === "device.pair.deferred"
          ? "deferred"
          : event.intent === "device.pair.approve"
            ? "approved_remote"
            : "pending",
      createdAt: event.createdAt,
      summary: event.summary,
      remotePeerId: event.remotePeerId,
    });
  }

  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function filterPairingRows(
  approvals: ApprovalRequest[],
  statusFilter: DeveloperCliArgs["pairingStatusFilter"],
  query: string | undefined,
): ApprovalRequest[] {
  const needle = query?.trim().toLowerCase();
  return approvals.filter((approval) => {
    if (statusFilter && approval.status !== statusFilter) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const haystack = `${approval.taskId}\n${approval.reason}\n${approval.peerOwnerId ?? ""}\n${approval.peerDeviceId ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function filterPairingTimelineRows(
  rows: ReturnType<typeof summarizePairingTimelineRows>,
  statusFilter: DeveloperCliArgs["pairingStatusFilter"],
  query: string | undefined,
) {
  const needle = query?.trim().toLowerCase();
  return rows.filter((row) => {
    if (statusFilter && row.status !== statusFilter) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const haystack = `${row.requestId}\n${row.summary}\n${row.remotePeerId ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });
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
