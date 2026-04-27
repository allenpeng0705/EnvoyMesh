import type { Sensitivity } from "@envoymesh/protocol";
import { loadNodeYamlConfig } from "./node-config.js";

export interface NodeArgs {
  configPath?: string;
  profileDir: string;
  discoveryProfile: "lan-fast" | "wan-default";
  connectivityStrict: boolean;
  bootstrapPresets: BootstrapPreset[];
  listen: string[];
  enableMdns: boolean;
  enableDht: boolean;
  dhtClientMode?: boolean;
  bootstrapPeers: string[];
  enableRelay: boolean;
  enableRelayServer: boolean;
  enableAutoNat: boolean;
  enableDcutr: boolean;
  p2pDebug: boolean;
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
}

export function parseNodeArgs(argv: string[]): NodeArgs {
  const args: NodeArgs = {
    profileDir: "./data/default",
    discoveryProfile: "lan-fast",
    connectivityStrict: false,
    bootstrapPresets: [],
    listen: ["/ip4/0.0.0.0/tcp/0"],
    enableMdns: true,
    enableDht: false,
    bootstrapPeers: [],
    enableRelay: false,
    enableRelayServer: false,
    enableAutoNat: false,
    enableDcutr: false,
    p2pDebug: false,
    discoveryTagHashes: [],
    discoveryCapabilities: [],
  };
  applyConfigFileArgs(args, argv);
  applyEnvironmentArgs(args);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--config") {
      index += 1;
      continue;
    } else if (arg === "--profile") {
      args.profileDir = readValue(argv, ++index, arg);
    } else if (arg === "--discovery-profile") {
      args.discoveryProfile = parseDiscoveryProfile(readValue(argv, ++index, arg));
    } else if (arg === "--connectivity-strict") {
      args.connectivityStrict = true;
    } else if (arg === "--bootstrap-preset") {
      args.bootstrapPresets.push(parseBootstrapPreset(readValue(argv, ++index, arg)));
    } else if (arg === "--listen") {
      args.listen = [readValue(argv, ++index, arg)];
    } else if (arg === "--no-mdns") {
      args.enableMdns = false;
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
    } else if (arg === "--p2p-debug") {
      args.p2pDebug = true;
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
    } else if (arg === "--message") {
      args.pingMessage = readValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  applyDiscoveryProfileDefaults(args);

  return args;
}

export function printHelp(): void {
  console.log(`Envoy node

Usage:
  npm run node:dev -- [options]

Options:
  --config <path>      Load node options from YAML config file.
  --profile <dir>       Profile directory for Envoy identity. Default: ./data/default
  --discovery-profile <p>  Discovery defaults: lan-fast|wan-default. Env: ENVOYMESH_DISCOVERY_PROFILE
  --connectivity-strict    Fail startup when wan-default bootstrap connectivity cannot be established. Env: ENVOYMESH_CONNECTIVITY_STRICT=1
  --listen <multiaddr>  Listen multiaddr. Default: /ip4/0.0.0.0/tcp/0
  --no-mdns             Disable local mDNS discovery.
  --dht                 Enable DHT discovery.
  --dht-client          Enable DHT in client mode.
  --dht-server          Enable DHT in server-capable mode.
  --bootstrap <addr>    Add a bootstrap peer multiaddr. Repeatable.
                         Env: ENVOYMESH_BOOTSTRAP_PEERS (comma-separated)
  --bootstrap-preset <p> Add managed bootstrap set. Supported: public-libp2p, public-libp2p-am6, public-libp2p-am7
                         Repeatable. Env: ENVOYMESH_BOOTSTRAP_PRESETS (comma-separated)
  --relay               Enable circuit relay transport.
  --relay-server        Enable this node as a circuit relay server.
  --autonat             Enable AutoNAT service.
  --dcutr               Enable DCUtR hole punching service.
  --p2p-debug           Log libp2p connection lifecycle events to audit as p2p.trace.
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
  if (value === "lan-fast" || value === "wan-default") {
    return value;
  }
  throw new Error(`Invalid discovery profile: ${value}`);
}

type BootstrapPreset = "public-libp2p" | "public-libp2p-am6" | "public-libp2p-am7";

function parseBootstrapPreset(value: string): BootstrapPreset {
  if (value === "public-libp2p" || value === "public-libp2p-am6" || value === "public-libp2p-am7") {
    return value;
  }
  throw new Error(`Invalid bootstrap preset: ${value}`);
}

function applyDiscoveryProfileDefaults(args: NodeArgs): void {
  for (const preset of args.bootstrapPresets) {
    args.bootstrapPeers = dedupePeers([...args.bootstrapPeers, ...bootstrapPeersForPreset(preset)]);
  }
  if (args.discoveryProfile === "lan-fast") {
    return;
  }
  args.enableDht = true;
  args.dhtClientMode = true;
  args.enableRelay = true;
  args.enableAutoNat = true;
  args.enableDcutr = true;
  if ((process.env.ENVOYMESH_CONNECTIVITY_STRICT ?? "").trim() === "1") {
    args.connectivityStrict = true;
  }
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
  if (config.discovery.bootstrapPeers) {
    args.bootstrapPeers.push(...config.discovery.bootstrapPeers);
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
  if (typeof config.discovery.p2pDebug === "boolean") {
    args.p2pDebug = config.discovery.p2pDebug;
  }
}

function applyEnvironmentArgs(args: NodeArgs): void {
  const envBootstrapPeers = (process.env.ENVOYMESH_BOOTSTRAP_PEERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const envBootstrapPresets = (process.env.ENVOYMESH_BOOTSTRAP_PRESETS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => parseBootstrapPreset(entry));
  const envDiscoveryProfile = (process.env.ENVOYMESH_DISCOVERY_PROFILE ?? "").trim();

  if (envDiscoveryProfile === "wan-default") {
    args.discoveryProfile = envDiscoveryProfile;
  } else if (envDiscoveryProfile === "lan-fast") {
    args.discoveryProfile = envDiscoveryProfile;
  }
  args.bootstrapPresets.push(...envBootstrapPresets);
  args.bootstrapPeers.push(...envBootstrapPeers);
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

function bootstrapPeersForPreset(preset: BootstrapPreset): string[] {
  if (preset === "public-libp2p") {
    return publicLibp2pBootstrapPeers();
  }
  if (preset === "public-libp2p-am6") {
    return ["/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq"];
  }
  return ["/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf"];
}
