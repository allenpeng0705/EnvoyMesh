export interface RelayArgs {
  profileDir: string;
  listen: string[];
  advertiseAddrs: string[];
  bootstrapPeers: string[];
  enableDht: boolean;
  dhtClientMode: boolean;
  httpPort: number | null;
}

export function parseRelayArgs(argv: string[]): RelayArgs {
  argv = normalizeWin32Argv(argv);
  const args: RelayArgs = {
    profileDir: "./data/relay",
    listen: ["/ip4/0.0.0.0/tcp/0"],
    advertiseAddrs: [],
    bootstrapPeers: [],
    enableDht: true,
    dhtClientMode: true,
    httpPort: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--profile") {
      args.profileDir = getValue(argv, ++i, arg);
    } else if (arg === "--listen") {
      args.listen = [getValue(argv, ++i, arg)];
    } else if (arg === "--advertise-addr") {
      args.advertiseAddrs.push(getValue(argv, ++i, arg));
    } else if (arg === "--bootstrap") {
      args.bootstrapPeers.push(getValue(argv, ++i, arg));
    } else if (arg === "--no-dht") {
      args.enableDht = false;
    } else if (arg === "--http-port") {
      const port = parseInt(getValue(argv, ++i, arg), 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${port}. Must be between 1 and 65535`);
      }
      args.httpPort = port;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  // Apply environment variables
  const envProfile = process.env.ENVOYMESH_PROFILE?.trim();
  if (envProfile) {
    args.profileDir = envProfile;
  }

  const envBootstrap = process.env.ENVOYMESH_BOOTSTRAP_PEERS ?? "";
  if (envBootstrap) {
    args.bootstrapPeers.push(
      ...envBootstrap.split(",").map((s) => s.trim()).filter(Boolean)
    );
  }

  const envAdvertise = process.env.ENVOYMESH_ADVERTISE_ADDRS ?? "";
  if (envAdvertise) {
    args.advertiseAddrs.push(
      ...envAdvertise.split(",").map((s) => s.trim()).filter(Boolean)
    );
  }

  return args;
}

function getValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function normalizeWin32Argv(argv: string[]): string[] {
  if (argv.length === 0) return argv;
  if (argv.some((a) => a.startsWith("--"))) return argv;

  const first = argv[0];
  if (!first || !/^[A-Za-z]:[/\\]|^\\\\/.test(first)) return argv;

  const out: string[] = ["--profile", first];
  let i = 1;
  if (i < argv.length && argv[i].startsWith("/")) {
    out.push("--listen", argv[i]);
    i++;
  }
  while (i < argv.length && argv[i].startsWith("/")) {
    out.push("--bootstrap", argv[i]);
    i++;
  }
  return out;
}

function printHelp(): void {
  console.log(`EnvoyMesh Relay Server

Usage:
  npm run relay:dev -- [options]

Options:
  --profile <dir>       Profile directory for relay identity. Default: ./data/relay
                         Env: ENVOYMESH_PROFILE
  --listen <multiaddr>  Listen multiaddr. Default: /ip4/0.0.0.0/tcp/0
  --advertise-addr <addr>  Public reachable address (required for WAN relays).
                         Env: ENVOYMESH_ADVERTISE_ADDRS (comma-separated)
  --bootstrap <addr>    Bootstrap peer multiaddr or domain. Repeatable.
                         If domain (e.g., relay.example.com), will query /info
                         to get full multiaddr with peer ID.
                         Env: ENVOYMESH_BOOTSTRAP_PEERS (comma-separated)
  --no-dht              Disable DHT discovery.
  --http-port <port>    Enable HTTP info endpoint on this port (optional).
                         Returns {peerId, addrs} at /info and OK at /health
  --help, -h            Show this help.

Example:
  # Run relay server with public IP
  npm run relay:dev -- --profile ./data/relay1 --advertise-addr /ip4/1.2.3.4/tcp/4001

  # Run with bootstrap peers
  npm run relay:dev -- --bootstrap /ip4/1.2.3.4/tcp/4001/p2p/Qm...
`);
}