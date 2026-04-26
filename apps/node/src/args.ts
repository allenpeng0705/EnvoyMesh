import type { Sensitivity } from "@envoymesh/protocol";

export interface NodeArgs {
  profileDir: string;
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
}

export function parseNodeArgs(argv: string[]): NodeArgs {
  const args: NodeArgs = {
    profileDir: "./data/default",
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

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--profile") {
      args.profileDir = readValue(argv, ++index, arg);
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
    } else if (arg === "--message") {
      args.pingMessage = readValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export function printHelp(): void {
  console.log(`Envoy node

Usage:
  npm run node:dev -- [options]

Options:
  --profile <dir>       Profile directory for Envoy identity. Default: ./data/default
  --listen <multiaddr>  Listen multiaddr. Default: /ip4/0.0.0.0/tcp/0
  --no-mdns             Disable local mDNS discovery.
  --dht                 Enable DHT discovery.
  --dht-client          Enable DHT in client mode.
  --dht-server          Enable DHT in server-capable mode.
  --bootstrap <addr>    Add a bootstrap peer multiaddr. Repeatable.
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
