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
  pingTarget?: string;
  pingMessage?: string;
  signalTarget?: string;
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
    } else if (arg === "--ping") {
      args.pingTarget = readValue(argv, ++index, arg);
    } else if (arg === "--signal") {
      args.signalTarget = readValue(argv, ++index, arg);
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
  --ping <target>       Send signed system.ping to a peer ID or /ip4/.../p2p/... multiaddr.
  --signal <target>     Send signed certified system.signal to a peer ID or multiaddr.
  --message <text>      Optional ping message.
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
