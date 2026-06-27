import type { Sensitivity } from "@envoymesh/protocol";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  normalizeBootstrapPresetsForContactsOnly,
  type ConnectivityTuning,
} from "@envoymesh/api";
import { mergeBootstrapPresetYamlFiles, type BootstrapPresetRegistry } from "./bootstrap-presets-file.js";
import { loadNodeYamlConfig } from "./node-config.js";
import { applyJoinInviteToNodeArgs } from "./wan-invite.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { DEFAULT_STUN_SERVERS, type StunServer } from "./stun.js";

export interface NodeArgs {
  configPath?: string;
  profileDir: string;
  discoveryProfile: "lan-fast" | "wan-default" | "relay-only" | "contacts-only";
  connectivityStrict: boolean;
  /** Set when CLI/YAML/persisted config explicitly sets mDNS on or off. */
  enableMdnsExplicit: boolean;
  connectivityTuning: ConnectivityTuning;
  bootstrapPresets: string[];
  bootstrapPresetsFiles: string[];
  listen: string[];
  /** Extra dialable base multiaddrs for relay.lookup / relay.peers circuit paths (public IP/DNS). `/p2p/<relayId>` appended if missing. */
  advertiseAddrs: string[];
  enableMdns: boolean;
  enableDht: boolean;
  dhtClientMode?: boolean;
  /** STUN servers for public IP discovery. Each entry is {host, port}. */
  stunServers: StunServer[];
  bootstrapPeers: string[];
  enableRelay: boolean;
  enableRelayServer: boolean;
  enableAutoNat: boolean;
  enableDcutr: boolean;
  enableUpnp: boolean;
  enableQuic: boolean;
  p2pDebug: boolean;
  relayDebugSummary: boolean;
  peerDiscoveryLog: boolean;
  correlationId?: string;
  pingTarget?: string;
  pingMessage?: string;
  signalTarget?: string;
  knowledgeQueryTarget?: string;
  knowledgeQueryText?: string;
  knowledgeQuerySensitivity?: Sensitivity;
  bondRequestTarget?: string;
  bondMessage?: string;
  bondProof?: string;
  bondRequestedLevel?: "direct" | "referred";
  discoveryRequestTarget?: string;
  discoveryTagHashes?: string[];
  discoveryCapabilities?: string[];
  discoveryMaxResults?: number;
  chatTarget?: string;
  chatText?: string;
  taskMandateTarget?: string;
  taskProposeTarget?: string;
  taskCancelTarget?: string;
  reportCreateTarget?: string;
  taskId?: string;
  mandateId?: string;
  taskIntent?: string;
  objective?: string;
  requestedResult?: string;
  reason?: string;
  reportSummary?: string;
  reportMode?: "instant" | "brief" | "silent" | "approval";
  mandateExpiresAt?: string;
  taskExpiresAt?: string;
  closeOnFirstCompletedResult?: boolean;
  collectCompletedResults?: number;
  cancelForwardPeers?: string[];
  cancelRelayHops?: number;
  dataSendTarget?: string;
  dataRelativePath?: string;
  pairRequestTarget?: string;
  pairNote?: string;
  relayPeersQueryTarget?: string;
  autoRelayPeersQuery: boolean;
  humanProfileDisplayName?: string;
  humanProfileUsername?: string;
  humanProfileBio?: string;
  humanProfileGender?: string;
  humanProfileHobbies: string[];
  humanProfileKnowledge: string[];
  humanProfileUpdate: boolean;
}

export function parseNodeArgs(argv: string[]): NodeArgs {
  argv = normalizeWin32NpmArgv(argv);
  const args: NodeArgs = {
    profileDir: "./data/default",
    discoveryProfile: "wan-default",
    connectivityStrict: false,
    enableMdnsExplicit: false,
    connectivityTuning: {},
    bootstrapPresets: [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
    bootstrapPresetsFiles: [],
    listen: ["/ip4/0.0.0.0/tcp/4001"],
    advertiseAddrs: [],
    enableMdns: true,
    enableDht: false,
    stunServers: [...DEFAULT_STUN_SERVERS],
    bootstrapPeers: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
    enableRelay: false,
    enableRelayServer: false,
    enableAutoNat: false,
    enableDcutr: false,
    enableUpnp: false,
    enableQuic: false,
    p2pDebug: false,
    relayDebugSummary: false,
    peerDiscoveryLog: false,
    discoveryTagHashes: [],
    discoveryCapabilities: [],
    autoRelayPeersQuery: false,
    humanProfileHobbies: [],
    humanProfileKnowledge: [],
    humanProfileUpdate: false,
  };
  applyConfigFileArgs(args, argv);
  applyEnvironmentArgs(args);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--config") {
      index += 1;
      continue;
    } else if (arg === "--join-invite") {
      applyJoinInviteToNodeArgs(args, readValue(argv, ++index, arg));
      continue;
    } else if (arg === "--profile") {
      args.profileDir = readValue(argv, ++index, arg);
    } else if (arg === "--discovery-profile") {
      args.discoveryProfile = parseDiscoveryProfile(readValue(argv, ++index, arg));
    } else if (arg === "--connectivity-strict") {
      args.connectivityStrict = true;
    } else if (arg === "--bootstrap-preset") {
      args.bootstrapPresets.push(parseBootstrapPresetName(readValue(argv, ++index, arg)));
    } else if (arg === "--bootstrap-presets-file") {
      args.bootstrapPresetsFiles.push(readValue(argv, ++index, arg));
    } else if (arg === "--listen") {
      args.listen = [readValue(argv, ++index, arg)];
    } else if (arg === "--advertise-addr") {
      args.advertiseAddrs.push(readValue(argv, ++index, arg));
    } else if (arg === "--no-mdns") {
      args.enableMdns = false;
      args.enableMdnsExplicit = true;
    } else if (arg === "--mdns") {
      args.enableMdns = true;
      args.enableMdnsExplicit = true;
    } else if (arg === "--dht") {
      args.enableDht = true;
    } else if (arg === "--dht-client") {
      args.enableDht = true;
      args.dhtClientMode = true;
    } else if (arg === "--dht-server") {
      args.enableDht = true;
      args.dhtClientMode = false;
    } else if (arg === "--bootstrap") {
      args.bootstrapPeers.push(readValue(argv, ++index, arg));
    } else if (arg === "--relay") {
      args.enableRelay = true;
    } else if (arg === "--relay-server") {
      args.enableRelayServer = true;
    } else if (arg === "--autonat") {
      args.enableAutoNat = true;
    } else if (arg === "--dcutr") {
      args.enableDcutr = true;
    } else if (arg === "--upnp") {
      args.enableUpnp = true;
    } else if (arg === "--no-upnp") {
      args.enableUpnp = false;
    } else if (arg === "--stun-server") {
      const value = readValue(argv, ++index, arg);
      const colonIdx = value.lastIndexOf(":");
      if (colonIdx > 0) {
        const host = value.slice(0, colonIdx);
        const port = parseInt(value.slice(colonIdx + 1)) || 19302;
        args.stunServers.push({ host, port });
      } else {
        args.stunServers.push({ host: value, port: 19302 });
      }
    } else if (arg === "--quic") {
      args.enableQuic = true;
    } else if (arg === "--no-quic") {
      args.enableQuic = false;
    } else if (arg === "--peer-discovery-log") {
      args.peerDiscoveryLog = true;
    } else if (arg === "--p2p-debug") {
      args.p2pDebug = true;
    } else if (arg === "--relay-debug-summary") {
      args.relayDebugSummary = true;
    } else if (arg === "--correlation-id") {
      args.correlationId = readValue(argv, ++index, arg);
    } else if (arg === "--ping") {
      args.pingTarget = readValue(argv, ++index, arg);
    } else if (arg === "--signal") {
      args.signalTarget = readValue(argv, ++index, arg);
    } else if (arg === "--knowledge-query") {
      args.knowledgeQueryTarget = readValue(argv, ++index, arg);
    } else if (arg === "--knowledge-text") {
      args.knowledgeQueryText = readValue(argv, ++index, arg);
    } else if (arg === "--knowledge-sensitivity") {
      args.knowledgeQuerySensitivity = parseSensitivity(readValue(argv, ++index, arg));
    } else if (arg === "--bond-request") {
      args.bondRequestTarget = readValue(argv, ++index, arg);
    } else if (arg === "--bond-message") {
      args.bondMessage = readValue(argv, ++index, arg);
    } else if (arg === "--bond-proof") {
      args.bondProof = readValue(argv, ++index, arg);
    } else if (arg === "--bond-level") {
      args.bondRequestedLevel = parseBondLevel(readValue(argv, ++index, arg));
    } else if (arg === "--discovery-request") {
      args.discoveryRequestTarget = readValue(argv, ++index, arg);
    } else if (arg === "--discovery-tag-hash") {
      args.discoveryTagHashes?.push(readValue(argv, ++index, arg));
    } else if (arg === "--discovery-capability") {
      args.discoveryCapabilities?.push(readValue(argv, ++index, arg));
    } else if (arg === "--discovery-max-results") {
      args.discoveryMaxResults = parsePositiveInteger(readValue(argv, ++index, arg), arg);
    } else if (arg === "--chat") {
      args.chatTarget = readValue(argv, ++index, arg);
    } else if (arg === "--chat-text") {
      args.chatText = readValue(argv, ++index, arg);
    } else if (arg === "--task-mandate") {
      args.taskMandateTarget = readValue(argv, ++index, arg);
    } else if (arg === "--task-propose") {
      args.taskProposeTarget = readValue(argv, ++index, arg);
    } else if (arg === "--task-cancel") {
      args.taskCancelTarget = readValue(argv, ++index, arg);
    } else if (arg === "--report-create") {
      args.reportCreateTarget = readValue(argv, ++index, arg);
    } else if (arg === "--task-id") {
      args.taskId = readValue(argv, ++index, arg);
    } else if (arg === "--mandate-id") {
      args.mandateId = readValue(argv, ++index, arg);
    } else if (arg === "--task-intent") {
      args.taskIntent = readValue(argv, ++index, arg);
    } else if (arg === "--objective") {
      args.objective = readValue(argv, ++index, arg);
    } else if (arg === "--requested-result") {
      args.requestedResult = readValue(argv, ++index, arg);
    } else if (arg === "--reason") {
      args.reason = readValue(argv, ++index, arg);
    } else if (arg === "--report-summary") {
      args.reportSummary = readValue(argv, ++index, arg);
    } else if (arg === "--report-mode") {
      args.reportMode = parseReportMode(readValue(argv, ++index, arg));
    } else if (arg === "--mandate-expires-at") {
      args.mandateExpiresAt = readValue(argv, ++index, arg);
    } else if (arg === "--task-expires-at") {
      args.taskExpiresAt = readValue(argv, ++index, arg);
    } else if (arg === "--close-on-first-completed-result") {
      args.closeOnFirstCompletedResult = true;
    } else if (arg === "--collect-completed-results") {
      args.collectCompletedResults = parsePositiveInteger(readValue(argv, ++index, arg), arg);
    } else if (arg === "--cancel-forward-peer") {
      if (!args.cancelForwardPeers) {
        args.cancelForwardPeers = [];
      }
      args.cancelForwardPeers.push(readValue(argv, ++index, arg));
    } else if (arg === "--cancel-relay-hops") {
      args.cancelRelayHops = parsePositiveInteger(readValue(argv, ++index, arg), arg);
    } else if (arg === "--data-send") {
      args.dataSendTarget = readValue(argv, ++index, arg);
    } else if (arg === "--data-relative-path") {
      args.dataRelativePath = readValue(argv, ++index, arg);
    } else if (arg === "--pair-request") {
      args.pairRequestTarget = readValue(argv, ++index, arg);
    } else if (arg === "--pair-note") {
      args.pairNote = readValue(argv, ++index, arg);
    } else if (arg === "--relay-peers-query") {
      args.relayPeersQueryTarget = readValue(argv, ++index, arg);
    } else if (arg === "--auto-relay-peers-query") {
      args.autoRelayPeersQuery = true;
    } else if (arg === "--human-profile-update") {
      args.humanProfileUpdate = true;
    } else if (arg === "--human-profile-display-name") {
      args.humanProfileDisplayName = readValue(argv, ++index, arg);
    } else if (arg === "--human-profile-username") {
      args.humanProfileUsername = readValue(argv, ++index, arg);
    } else if (arg === "--human-profile-bio") {
      args.humanProfileBio = readValue(argv, ++index, arg);
    } else if (arg === "--human-profile-gender") {
      args.humanProfileGender = readValue(argv, ++index, arg);
    } else if (arg === "--human-profile-hobby") {
      args.humanProfileHobbies.push(readValue(argv, ++index, arg));
    } else if (arg === "--human-profile-knowledge") {
      args.humanProfileKnowledge.push(readValue(argv, ++index, arg));
    } else if (arg === "--message") {
      args.pingMessage = readValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const customPresetRegistry = new Map<string, string[]>();
  mergeBootstrapPresetYamlFiles(args.bootstrapPresetsFiles, customPresetRegistry);
  applyDiscoveryProfileDefaults(args, customPresetRegistry);

  return args;
}

export function printHelp(): void {
  console.log(`Envoy node

Usage:
  npm run node:dev -- [options]

Options:
  --config <path>      Load node options from YAML config file.
  --profile <dir>       Profile directory for Envoy identity. Default: ./data/default (env: ENVOYMESH_PROFILE; useful on Windows if npm eats --flags)
  --discovery-profile <p>  Discovery defaults: lan-fast|wan-default|contacts-only. Env: ENVOYMESH_DISCOVERY_PROFILE
  --connectivity-strict    Fail startup when wan-default bootstrap connectivity cannot be established. Env: ENVOYMESH_CONNECTIVITY_STRICT=1
  --listen <multiaddr>  Listen multiaddr. Default: /ip4/0.0.0.0/tcp/4001
  --advertise-addr <multiaddr>  Reachable relay base address for relay.lookup /p2p-circuit/ paths (public IP or DNS, same TCP port as clients use). Repeatable. Env: ENVOYMESH_ADVERTISE_ADDRS (comma-separated). YAML: discovery.advertiseAddrs. Strongly recommended for --relay-server on WAN/cloud.
  --no-mdns             Disable local mDNS discovery.
  --dht                 Enable DHT discovery.
  --dht-client          Enable DHT in client mode.
  --dht-server          Enable DHT in server-capable mode.
  --bootstrap <addr>    Add a bootstrap peer multiaddr. Repeatable.
                         Env: ENVOYMESH_BOOTSTRAP_PEERS (comma-separated)
  --bootstrap-preset <p> Add managed bootstrap set. Supported: public-libp2p, public-libp2p-am6, public-libp2p-am7, cn-relay
                         Default (wan-default, no explicit bootstrap): all public-libp2p presets plus EnvoyMesh community relay multiaddr.
                         Repeatable. Env: ENVOYMESH_BOOTSTRAP_PRESETS (comma-separated)
  --bootstrap-presets-file <path> Load custom bootstrap preset definitions from YAML. Repeatable.
                         Env: ENVOYMESH_BOOTSTRAP_PRESETS_FILES (comma-separated)
  --join-invite <token> Apply a WAN join-invite token (adds bootstrap peers/presets). See: npm run cli -w @envoymesh/node -- invite
  --relay               Enable circuit relay transport.
  --relay-server        Enable this node as a circuit relay server.
  --autonat             Enable AutoNAT service.
  --stun-server <h:p>  STUN server host:port for public IP discovery (default: stun.l.google.com:19302). Repeatable.
  --dcutr               Enable DCUtR hole punching service.
  --quic                Enable QUIC transport alongside TCP (adds matching /udp/.../quic-v1 listeners). Env: ENVOYMESH_QUIC (1/true/yes or 0/false/no).
  --no-quic             Disable QUIC when set from config or env.
  --peer-discovery-log  Print each libp2p peer discovery to the console ([peer-discovery]). Env: ENVOYMESH_PEER_DISCOVERY_LOG=1
  --p2p-debug           Log libp2p connection lifecycle events to audit as p2p.trace.
  --relay-debug-summary When used with --p2p-debug, print periodic relay connection manager summaries (very chatty). Env: ENVOYMESH_RELAY_DEBUG_SUMMARY=1
  --correlation-id <id> Optional correlation id for outbound ping/signal/A2A envelopes.
  --ping <target>       Send signed system.ping to peer ID, /ip4/.../p2p/... multiaddr, or envoy:owner:... (resolved from LAN peer directory).
  --signal <target>     Send signed certified system.signal to peer ID, multiaddr, or envoy:owner:... (resolved from LAN peer directory).
  --message <text>      Optional ping message.
  --knowledge-query <target>  Send signed knowledge.query (mock payload; use --knowledge-text). Target supports envoy:owner:...
  --knowledge-text <text>    Query string for knowledge.query. Default: mock query.
  --knowledge-sensitivity <s> Optional requestedSensitivity: public, friends, trusted, private.
  --bond-request <target>   Send signed bond.request (use --bond-message / --bond-proof / --bond-level). Target supports envoy:owner:...
  --bond-message <text>     Short note for bond.request.
  --bond-proof <text>       Proof-of-context string for bond.request.
  --bond-level <level>      direct or referred. Default: direct.
  --discovery-request <target>   Send signed discovery.request (repeat --discovery-tag-hash / --discovery-capability). Target supports envoy:owner:...
  --discovery-tag-hash <hash>    Request matches for a hashed discovery topic. Repeatable.
  --discovery-capability <cap>   Request matches by capability string. Repeatable.
  --discovery-max-results <n>    Cap response matches to n (1..20). Default: 5.
  --chat <target>                Send signed chat.message. Target supports envoy:owner:...
  --chat-text <text>             Message body for chat.message.
  --task-mandate <target>   Send a signed task.mandate.
  --task-propose <target>   Send a task.propose with device Proof of Intent.
  --task-cancel <target>    Send a task.cancel.
  --report-create <target>  Send a report.create.
  --task-id <id>            Task ID for A2A task commands.
  --mandate-id <id>         Optional mandate ID. Default: generated.
  --task-intent <text>      Task intent. Default: ad-hoc.
  --objective <text>        Task objective for mandate/proposal.
  --requested-result <text> Requested result for task.propose.
  --reason <text>           Cancellation reason.
  --report-summary <text>   Report summary.
  --report-mode <mode>      Report mode: instant, brief, silent, approval. Default: brief.
  --mandate-expires-at <iso>  Wall-clock mandate expiry (ISO 8601). Default: 24h from creation.
  --task-expires-at <iso>     Optional task.propose-only expiry (ISO 8601).
  --close-on-first-completed-result  Mandate flag: close task after first completed task.result.
  --collect-completed-results <n>   Mandate flag: require n completed task.result (2..32) before closing (ignored if --close-on-first-completed-result).
  --cancel-forward-peer <peerId>  With --task-cancel: relay cancel to this libp2p peer after handling. Repeatable.
  --cancel-relay-hops <n>           With --task-cancel: remaining relay hops (1..16). Required when using --cancel-forward-peer.
  --data-send <target>              After start, send a signed /envoymesh/data/0.1.0 transfer (requires --data-relative-path).
  --data-relative-path <path>     Vault-relative path for --data-send (file must exist under ENVOYMESH_VAULT or ./shared_vault).
  --pair-request <target>         Send a device.pair.request to target peer.
  --pair-note <text>              Optional note for device pairing request.
  --relay-peers-query <target>    Ask an EnvoyMesh relay for peers connected through it.
  --auto-relay-peers-query        Periodically query bootstrap peers for relay-connected peers.
  --human-profile-update          Update the human profile (requires at least one --human-profile-* flag).
  --human-profile-display-name <name>  Display name for human profile (max 120 chars).
  --human-profile-bio <text>      Short bio (max 500 chars).
  --human-profile-gender <text>  Gender (max 40 chars).
  --human-profile-hobby <text>   Hobbies/interests. Repeatable (max 20).
  --human-profile-knowledge <text> Knowledge areas. Repeatable (max 50).
`);
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseReportMode(value: string): NodeArgs["reportMode"] {
  if (value === "instant" || value === "brief" || value === "silent" || value === "approval") {
    return value;
  }

  throw new Error(`Invalid report mode: ${value}`);
}

function parseSensitivity(value: string): Sensitivity {
  if (value === "public" || value === "friends" || value === "trusted" || value === "private") {
    return value;
  }

  throw new Error(`Invalid sensitivity: ${value}`);
}

function parseBondLevel(value: string): "direct" | "referred" {
  if (value === "direct" || value === "referred") {
    return value;
  }

  throw new Error(`Invalid bond level: ${value}`);
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseDiscoveryProfile(value: string): NodeArgs["discoveryProfile"] {
  if (
    value === "lan-fast" ||
    value === "wan-default" ||
    value === "relay-only" ||
    value === "contacts-only"
  ) {
    return value;
  }
  throw new Error(`Invalid discovery profile: ${value}`);
}

function parseBootstrapPresetName(value: string): string {
  const trimmed = value.trim();
  if (!/^[-A-Za-z0-9._]{1,64}$/.test(trimmed)) {
    throw new Error(`Invalid bootstrap preset: ${value}`);
  }
  return trimmed;
}

/**
 * On Windows, PowerShell/npm often strip `--long-flag` prefixes so only bare values reach `tsx`
 * (e.g. profile path first, multiaddrs second). If argv has no `--` tokens but starts with a
 * Windows absolute path, reconstruct the flag form so `parseNodeArgs` works.
 */
export function normalizeWin32NpmArgv(argv: string[]): string[] {
  if (argv.length === 0) {
    return argv;
  }
  if (argv.some((a) => a.startsWith("--"))) {
    return argv;
  }
  const first = argv[0];
  if (!first || !/^[A-Za-z]:[/\\]|^\\\\/.test(first)) {
    return argv;
  }
  const out: string[] = ["--profile", first];
  let i = 1;

  if (i < argv.length && argv[i].startsWith("/")) {
    out.push("--listen", argv[i]);
    i += 1;
  }
  if (i < argv.length && (argv[i] === "wan-default" || argv[i] === "lan-fast" || argv[i] === "relay-only" || argv[i] === "contacts-only")) {
    out.push("--discovery-profile", argv[i]);
    i += 1;
  }
  while (i < argv.length && argv[i].startsWith("/")) {
    out.push("--bootstrap", argv[i]);
    i += 1;
  }
  while (i < argv.length) {
    const a = argv[i];
    if (a === "p2p-debug") {
      out.push("--p2p-debug");
      i += 1;
      continue;
    }
    try {
      parseBootstrapPresetName(a);
      out.push("--bootstrap-preset", a);
      i += 1;
    } catch {
      out.push(a);
      i += 1;
    }
  }
  return out;
}

function applyDiscoveryProfileDefaults(args: NodeArgs, customPresetRegistry: BootstrapPresetRegistry): void {
  args.bootstrapPresets = [...new Set(args.bootstrapPresets)];
  if (args.discoveryProfile === "contacts-only" || args.discoveryProfile === "relay-only") {
    args.bootstrapPresets = normalizeBootstrapPresetsForContactsOnly(args.bootstrapPresets);
  }
  for (const preset of args.bootstrapPresets) {
    args.bootstrapPeers = dedupePeers([...args.bootstrapPeers, ...bootstrapPeersForPreset(preset, customPresetRegistry)]);
  }
  if (args.discoveryProfile === "lan-fast") {
    return;
  }
  args.enableRelay = true;
  args.enableAutoNat = true;
  args.enableDcutr = true;
  args.enableUpnp = true;
  if (args.discoveryProfile === "relay-only") {
    args.enableDht = false;
  } else {
    args.enableDht = true;
    // Only set default if not already set by explicit --dht-server/--dht-client flag.
    if (args.dhtClientMode === undefined) {
      args.dhtClientMode = true;
    }
  }
  if ((process.env.ENVOYMESH_CONNECTIVITY_STRICT ?? "").trim() === "1") {
    args.connectivityStrict = true;
  }
}

/** Apply Social/Tauri persisted node-config discovery fields before libp2p starts (CLI `index.ts` path). */
export function applyPersistedDiscoveryConfig(
  args: NodeArgs,
  config: PersistedNodeConfig,
  customPresetRegistry: BootstrapPresetRegistry = new Map(),
): void {
  args.discoveryProfile = config.discoveryProfile;
  if (config.enableMdns !== undefined) {
    args.enableMdns = config.enableMdns;
    args.enableMdnsExplicit = true;
  }
  if (config.maxConnections !== undefined) {
    args.connectivityTuning.maxConnections = config.maxConnections;
  }
  if (config.mdnsIntervalMs !== undefined) {
    args.connectivityTuning.mdnsIntervalMs = config.mdnsIntervalMs;
  }
  if (config.capabilityDiscoveryIntervalMs !== undefined) {
    args.connectivityTuning.capabilityDiscoveryIntervalMs = config.capabilityDiscoveryIntervalMs;
  }
  if (config.lazyCapabilityDiscovery !== undefined) {
    args.connectivityTuning.lazyCapabilityDiscovery = config.lazyCapabilityDiscovery;
  }
  if (config.idleTimerStretch !== undefined) {
    args.connectivityTuning.idleTimerStretch = config.idleTimerStretch;
  }
  if (typeof config.relayEnabled === "boolean") {
    args.enableRelay = config.relayEnabled;
  }
  if (typeof config.relayServerEnabled === "boolean") {
    args.enableRelayServer = config.relayServerEnabled;
  }
  args.bootstrapPresets = [...config.bootstrapPresets];
  args.bootstrapPeers = [...config.bootstrapPeers];
  applyDiscoveryProfileDefaults(args, customPresetRegistry);
}

function applyConfigFileArgs(args: NodeArgs, argv: string[]): void {
  const configPath = readConfigPath(argv);
  if (!configPath) {
    return;
  }
  const config = loadNodeYamlConfig(configPath);
  args.configPath = configPath;
  if (config.profile) {
    args.profileDir = config.profile;
  }
  if (config.listen && config.listen.length > 0) {
    args.listen = config.listen;
  }
  if (!config.discovery) {
    return;
  }
  if (config.discovery.profile) {
    args.discoveryProfile = config.discovery.profile;
  }
  if (typeof config.discovery.connectivityStrict === "boolean") {
    args.connectivityStrict = config.discovery.connectivityStrict;
  }
  if (typeof config.discovery.mdns === "boolean") {
    args.enableMdns = config.discovery.mdns;
  }
  if (typeof config.discovery.dht === "boolean") {
    args.enableDht = config.discovery.dht;
  }
  if (typeof config.discovery.dhtClientMode === "boolean") {
    args.dhtClientMode = config.discovery.dhtClientMode;
  }
  if (config.discovery.bootstrapPresets) {
    args.bootstrapPresets.push(...config.discovery.bootstrapPresets);
  }
  if (config.discovery.bootstrapPresetsFiles) {
    args.bootstrapPresetsFiles.push(...config.discovery.bootstrapPresetsFiles);
  }
  if (config.discovery.bootstrapPeers) {
    args.bootstrapPeers.push(...config.discovery.bootstrapPeers);
  }
  if (config.discovery.advertiseAddrs) {
    args.advertiseAddrs.push(...config.discovery.advertiseAddrs);
  }
  if (config.discovery.stunServers) {
    for (const entry of config.discovery.stunServers) {
      const colonIdx = entry.lastIndexOf(":");
      if (colonIdx > 0) {
        args.stunServers.push({ host: entry.slice(0, colonIdx), port: parseInt(entry.slice(colonIdx + 1)) || 19302 });
      } else {
        args.stunServers.push({ host: entry, port: 19302 });
      }
    }
  }
  if (typeof config.discovery.relay === "boolean") {
    args.enableRelay = config.discovery.relay;
  }
  if (typeof config.discovery.relayServer === "boolean") {
    args.enableRelayServer = config.discovery.relayServer;
  }
  if (typeof config.discovery.autonat === "boolean") {
    args.enableAutoNat = config.discovery.autonat;
  }
  if (typeof config.discovery.dcutr === "boolean") {
    args.enableDcutr = config.discovery.dcutr;
  }
  if (typeof config.discovery.quic === "boolean") {
    args.enableQuic = config.discovery.quic;
  }
  if (typeof config.discovery.p2pDebug === "boolean") {
    args.p2pDebug = config.discovery.p2pDebug;
  }
}

function applyEnvironmentArgs(args: NodeArgs): void {
  const envProfile = (process.env.ENVOYMESH_PROFILE ?? "").trim();
  if (envProfile) {
    args.profileDir = envProfile;
  }

  const envBootstrapPeers = (process.env.ENVOYMESH_BOOTSTRAP_PEERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const envBootstrapPresets = (process.env.ENVOYMESH_BOOTSTRAP_PRESETS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => parseBootstrapPresetName(entry));
  const envBootstrapPresetsFiles = (process.env.ENVOYMESH_BOOTSTRAP_PRESETS_FILES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const envDiscoveryProfile = (process.env.ENVOYMESH_DISCOVERY_PROFILE ?? "").trim();

  if (
    envDiscoveryProfile === "wan-default" ||
    envDiscoveryProfile === "lan-fast" ||
    envDiscoveryProfile === "contacts-only"
  ) {
    args.discoveryProfile = envDiscoveryProfile;
  }
  args.bootstrapPresets.push(...envBootstrapPresets);
  args.bootstrapPresetsFiles.push(...envBootstrapPresetsFiles);
  args.bootstrapPeers.push(...envBootstrapPeers);

  const envQuic = (process.env.ENVOYMESH_QUIC ?? "").trim().toLowerCase();
  if (envQuic === "1" || envQuic === "true" || envQuic === "yes") {
    args.enableQuic = true;
  } else if (envQuic === "0" || envQuic === "false" || envQuic === "no") {
    args.enableQuic = false;
  }

  const envPeerDiscoveryLog = (process.env.ENVOYMESH_PEER_DISCOVERY_LOG ?? "").trim().toLowerCase();
  if (envPeerDiscoveryLog === "1" || envPeerDiscoveryLog === "true" || envPeerDiscoveryLog === "yes") {
    args.peerDiscoveryLog = true;
  }

  const envRelayDebugSummary = (process.env.ENVOYMESH_RELAY_DEBUG_SUMMARY ?? "").trim().toLowerCase();
  if (envRelayDebugSummary === "1" || envRelayDebugSummary === "true" || envRelayDebugSummary === "yes") {
    args.relayDebugSummary = true;
  }

  const envAdvertiseAddrs = (process.env.ENVOYMESH_ADVERTISE_ADDRS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  args.advertiseAddrs.push(...envAdvertiseAddrs);
}

function readConfigPath(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      return readValue(argv, ++index, arg);
    }
  }
  return undefined;
}

function dedupePeers(peers: string[]): string[] {
  return [...new Set(peers)];
}

function publicLibp2pBootstrapPeers(): string[] {
  return [
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq",
    "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf",
  ];
}

function bootstrapPeersForPreset(preset: string, customPresetRegistry: BootstrapPresetRegistry): string[] {
  const custom = customPresetRegistry.get(preset);
  if (custom && custom.length > 0) {
    return custom;
  }
  if (preset === "public-libp2p") {
    return publicLibp2pBootstrapPeers();
  }
  if (preset === "public-libp2p-am6") {
    return ["/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq"];
  }
  if (preset === "public-libp2p-am7") {
    return ["/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf"];
  }
  if (preset === "cn-relay") {
    return [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR];
  }
  throw new Error(`Unknown bootstrap preset: ${preset}`);
}
