export interface RelayArgs {
  profileDir: string;
  listen: string[];
  advertiseAddrs: string[];
  bootstrapPeers: string[];
  enableDht: boolean;
  dhtClientMode: boolean;
  httpPort: number | null;
  enableRendezvous: boolean;
  wsAuthToken: string;
  /**
   * Public-mode presets for the circuit-relay-v2 server config. When true,
   * applies production values (256 reservations, 1 MiB data, 30 min
   * duration, 60 s hop timeout) unless any of the individual
   * `--relay-*` CLI args / `ENVOYMESH_RELAY_*` env vars override them.
   *
   * Why a "public" preset instead of just bigger defaults: the
   * `circuitRelayServer()` call has libp2p-defaults (max 15 reservations,
   * 2 min TTL, 128 KiB) that target an embedded use case. A community
   * relay needs much higher limits, but a developer running a local
   * relay for tests wants the small defaults. The preset is the
   * opt-in to "I'm serving public traffic."
   */
  relayPublicMode: boolean;
  /** Override `maxReservations` on the circuit-relay-v2 server. */
  relayMaxReservations: number | null;
  /** Override `reservationTtl` (ms) on the circuit-relay-v2 server. */
  relayReservationTtlMs: number | null;
  /** Override `defaultDataLimit` (bytes) on the circuit-relay-v2 server. */
  relayDefaultDataLimitBytes: number | null;
  /** Override `defaultDurationLimit` (ms) on the circuit-relay-v2 server. */
  relayDefaultDurationLimitMs: number | null;
  /** Override `hopTimeout` (ms) on the circuit-relay-v2 server. */
  relayHopTimeoutMs: number | null;
  /** Override `maxOutboundStopStreams` on the circuit-relay-v2 server. */
  relayMaxOutboundStopStreams: number | null;
  /** Admin UI / sensitive HTTP Basic Auth username. Default: admin. */
  adminUser: string;
  /** Admin UI / sensitive HTTP Basic Auth password. Default: envoymesh123456. */
  adminPassword: string;
  /** In-memory log ring capacity. Default 2000. */
  logMaxLines: number;
  /** Rotate relay.log when it exceeds this many bytes. Default 10 MiB. */
  logMaxBytes: number;
  /** Delete rotated log files older than this many days. Default 7. */
  logRetainDays: number;
  /** Phase 48C — A2A Agent Card Bridge. When true, the relay publishes
   *  an A2A v1.0 Agent Card at /.well-known/agent-card.json so external
   *  A2A clients (LangChain, Salesforce, etc.) can discover the agent.
   *  Default: false. */
  a2aBridgeEnabled: boolean;
  /** Public gateway URL where the A2A JSON-RPC endpoint is reachable
   *  (e.g. "https://relay.example.com:15432"). Used as the URL field
   *  in supportedInterfaces. If unset, falls back to the relay's
   *  HTTP host:port. */
  a2aBridgeGatewayUrl: string | null;
}

/**
 * Public-mode defaults for a community relay. These are the values a
 * well-run public relay should run with — much higher than the libp2p
 * defaults, which target an embedded use case (15 reservations, 2 min
 * TTL, 128 KiB data, 2 min duration, 30 s hop).
 *
 * Why these specific values (vs. the libp2p defaults):
 *
 * - **maxReservations = 1024** — the libp2p default (15) is fine for an
 *   embedded process but fills up immediately for a public relay. 1024
 *   covers ~1k active users with reservations; the memory cost is
 *   trivial (~200 KiB for the entire store).
 * - **reservationTtl = 30 min** — at 1024 reservations, a 10-min TTL
 *   means ~1.7 renewals/sec hitting the relay. 30 min drops that to
 *   ~0.6/sec, ~3× less load. The trade-off: stale reservations hold
 *   their slot longer after a peer disconnects abruptly, but the
 *   `connection:close` event handler clears them in libp2p.
 * - **defaultDataLimit = 4 MiB** — covers a chat message with a few
 *   small image attachments. 1 MiB was tight for image sharing.
 * - **defaultDurationLimit = 60 min** — long chat sessions shouldn't
 *   get cut off mid-conversation. 30 min was OK but margin is cheap.
 * - **hopTimeout = 90 s** — matches the client-side
 *   `HINT_DIAL_TIMEOUT_MS = 30 s` plus a margin for slow cross-region
 *   paths where the reservation handshake piggybacks on the dial.
 *   60 s was already an improvement over libp2p's 30 s default; 90 s
 *   leaves more headroom for really slow paths without making failure
 *   detection painfully slow.
 * - **maxOutboundStopStreams = 1024** — each inbound relayed connection
 *   uses one STOP stream. Matching the reservation count means a peer
 *   with a reservation can actually be reached (vs. the libp2p default
 *   of 300, which would cap concurrent relayed connections at 300 even
 *   with 1024 active reservations — i.e. 724 of those reservations
 *   would be useless for reaching their holder).
 */
export const PUBLIC_RELAY_V2_DEFAULTS = Object.freeze({
  maxReservations: 1024,
  reservationTtlMs: 30 * 60_000, // 30 minutes
  defaultDataLimitBytes: 4 * 1024 * 1024, // 4 MiB
  defaultDurationLimitMs: 60 * 60_000, // 60 minutes
  hopTimeoutMs: 90_000, // 90 seconds
  maxOutboundStopStreams: 1024, // matches maxReservations
});

function parsePositiveInt(name: string, raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

function parseBoolean(name: string, raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean (1/0/true/false), got "${raw}"`);
}

export function parseRelayArgs(argv: string[]): RelayArgs {
  argv = normalizeWin32Argv(argv);
  const args: RelayArgs = {
    profileDir: "./data/relay",
    listen: ["/ip4/0.0.0.0/tcp/4001"],
    advertiseAddrs: [],
    bootstrapPeers: [],
    enableDht: true,
    dhtClientMode: true,
    httpPort: 15432,
    enableRendezvous: true,
    wsAuthToken: "",
    relayPublicMode: false,
    relayMaxReservations: null,
    relayReservationTtlMs: null,
    relayDefaultDataLimitBytes: null,
    relayDefaultDurationLimitMs: null,
    relayHopTimeoutMs: null,
    relayMaxOutboundStopStreams: null,
    adminUser: "admin",
    adminPassword: "envoymesh123456",
    logMaxLines: 2000,
    logMaxBytes: 10 * 1024 * 1024,
    logRetainDays: 7,
    a2aBridgeEnabled: false,
    a2aBridgeGatewayUrl: null,
  };

  // Apply environment variables FIRST. CLI args override them below.
  // The order is the conventional "most specific wins" — explicit CLI
  // flags trump ambient env vars, which in turn trump the hard-coded
  // defaults. Flipping this order (env after CLI) is a silent
  // precedence inversion operators hit when they set the same var in
  // both their .env and the systemd unit.
  applyEnvVars(args);

  /** Set when CLI explicitly chose public vs private (blocks advertise auto). */
  let publicModeFromCli: "public" | "private" | undefined;

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
    } else if (arg === "--dht-server") {
      args.enableDht = true;
      args.dhtClientMode = false;
    } else if (arg === "--dht-client") {
      args.enableDht = true;
      args.dhtClientMode = true;
    } else if (arg === "--no-rendezvous") {
      args.enableRendezvous = false;
    } else if (arg === "--ws-auth-token") {
      args.wsAuthToken = getValue(argv, ++i, arg);
    } else if (arg === "--http-port") {
      const port = parseInt(getValue(argv, ++i, arg), 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${port}. Must be between 1 and 65535`);
      }
      args.httpPort = port;
    } else if (arg === "--relay-public-mode") {
      publicModeFromCli = "public";
      args.relayPublicMode = true;
    } else if (arg === "--relay-private-mode") {
      // Opt out of advertise-addr → public-mode auto-enable (LAN / test relays).
      publicModeFromCli = "private";
      args.relayPublicMode = false;
    } else if (arg === "--relay-max-reservations") {
      args.relayMaxReservations = parsePositiveInt(
        "--relay-max-reservations",
        getValue(argv, ++i, arg),
      );
    } else if (arg === "--relay-reservation-ttl-ms") {
      args.relayReservationTtlMs = parsePositiveInt(
        "--relay-reservation-ttl-ms",
        getValue(argv, ++i, arg),
      );
    } else if (arg === "--relay-default-data-limit-bytes") {
      args.relayDefaultDataLimitBytes = parsePositiveInt(
        "--relay-default-data-limit-bytes",
        getValue(argv, ++i, arg),
      );
    } else if (arg === "--relay-default-duration-limit-ms") {
      args.relayDefaultDurationLimitMs = parsePositiveInt(
        "--relay-default-duration-limit-ms",
        getValue(argv, ++i, arg),
      );
    } else if (arg === "--relay-hop-timeout-ms") {
      args.relayHopTimeoutMs = parsePositiveInt(
        "--relay-hop-timeout-ms",
        getValue(argv, ++i, arg),
      );
    } else if (arg === "--relay-max-outbound-stop-streams") {
      args.relayMaxOutboundStopStreams = parsePositiveInt(
        "--relay-max-outbound-stop-streams",
        getValue(argv, ++i, arg),
      );
    } else if (arg === "--admin-user") {
      args.adminUser = getValue(argv, ++i, arg);
    } else if (arg === "--admin-password") {
      args.adminPassword = getValue(argv, ++i, arg);
    } else if (arg === "--log-max-lines") {
      args.logMaxLines = parsePositiveInt("--log-max-lines", getValue(argv, ++i, arg)) ?? args.logMaxLines;
    } else if (arg === "--log-max-bytes") {
      args.logMaxBytes = parsePositiveInt("--log-max-bytes", getValue(argv, ++i, arg)) ?? args.logMaxBytes;
    } else if (arg === "--log-retain-days") {
      args.logRetainDays = parsePositiveInt("--log-retain-days", getValue(argv, ++i, arg)) ?? args.logRetainDays;
    } else if (arg === "--a2a-bridge") {
      args.a2aBridgeEnabled = true;
    } else if (arg === "--a2a-gateway-url") {
      const rawUrl = getValue(argv, ++i, arg);
      // Validate the URL — operators are warned (not rejected) on parse
      // failure so a typo at startup doesn't crash a long-running relay.
      try {
        const u = new URL(rawUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          throw new Error(`unsupported scheme "${u.protocol}"`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[relay] --a2a-gateway-url is not a valid http(s) URL: ${msg}`);
      }
      args.a2aBridgeGatewayUrl = rawUrl;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  // WAN relays always advertise a public dialable base. Auto-enable community
  // circuit-relay-v2 presets so operators cannot forget --relay-public-mode
  // (the #1 reason cn-relay looked "discovery-only"). Explicit CLI/env wins.
  if (
    publicModeFromCli === undefined &&
    process.env.ENVOYMESH_RELAY_PUBLIC_MODE === undefined &&
    args.advertiseAddrs.length > 0
  ) {
    args.relayPublicMode = true;
  }

  // Public relays auto-switch to DHT server mode. The relay is always-online,
  // has a stable peer ID, and is publicly reachable — ideal DHT routing node.
  // Server mode means the relay stores routing records for other peers, making
  // discovery (capability topics, findPeer) work even when home nodes go offline.
  // Private/LAN relays stay in client mode (they may not be reliably reachable).
  if (args.relayPublicMode && args.enableDht && args.dhtClientMode) {
    args.dhtClientMode = false;
    console.log("[relay] DHT: auto-switched to SERVER mode (public relay)");
  }

  return args;
}

/**
 * Apply environment variables to the `RelayArgs` object. Extracted from
 * `parseRelayArgs` so the precedence (env, then CLI) is obvious — and so
 * tests can exercise the env-handling path in isolation if needed.
 */
function applyEnvVars(args: RelayArgs): void {
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

  const envWsAuthToken = process.env.ENVOYMESH_WS_AUTH_TOKEN?.trim();
  if (envWsAuthToken) {
    args.wsAuthToken = envWsAuthToken;
  }

  if (process.env.ENVOYMESH_RELAY_PUBLIC_MODE !== undefined) {
    args.relayPublicMode = parseBoolean(
      "ENVOYMESH_RELAY_PUBLIC_MODE",
      process.env.ENVOYMESH_RELAY_PUBLIC_MODE,
    );
  }
  if (process.env.ENVOYMESH_RELAY_MAX_RESERVATIONS !== undefined) {
    args.relayMaxReservations = parsePositiveInt(
      "ENVOYMESH_RELAY_MAX_RESERVATIONS",
      process.env.ENVOYMESH_RELAY_MAX_RESERVATIONS,
    );
  }
  if (process.env.ENVOYMESH_RELAY_RESERVATION_TTL_MS !== undefined) {
    args.relayReservationTtlMs = parsePositiveInt(
      "ENVOYMESH_RELAY_RESERVATION_TTL_MS",
      process.env.ENVOYMESH_RELAY_RESERVATION_TTL_MS,
    );
  }
  if (process.env.ENVOYMESH_RELAY_DEFAULT_DATA_LIMIT_BYTES !== undefined) {
    args.relayDefaultDataLimitBytes = parsePositiveInt(
      "ENVOYMESH_RELAY_DEFAULT_DATA_LIMIT_BYTES",
      process.env.ENVOYMESH_RELAY_DEFAULT_DATA_LIMIT_BYTES,
    );
  }
  if (process.env.ENVOYMESH_RELAY_DEFAULT_DURATION_LIMIT_MS !== undefined) {
    args.relayDefaultDurationLimitMs = parsePositiveInt(
      "ENVOYMESH_RELAY_DEFAULT_DURATION_LIMIT_MS",
      process.env.ENVOYMESH_RELAY_DEFAULT_DURATION_LIMIT_MS,
    );
  }
  if (process.env.ENVOYMESH_RELAY_HOP_TIMEOUT_MS !== undefined) {
    args.relayHopTimeoutMs = parsePositiveInt(
      "ENVOYMESH_RELAY_HOP_TIMEOUT_MS",
      process.env.ENVOYMESH_RELAY_HOP_TIMEOUT_MS,
    );
  }
  if (process.env.ENVOYMESH_RELAY_MAX_OUTBOUND_STOP_STREAMS !== undefined) {
    args.relayMaxOutboundStopStreams = parsePositiveInt(
      "ENVOYMESH_RELAY_MAX_OUTBOUND_STOP_STREAMS",
      process.env.ENVOYMESH_RELAY_MAX_OUTBOUND_STOP_STREAMS,
    );
  }
  const envAdminUser = process.env.ENVOYMESH_RELAY_ADMIN_USER?.trim();
  if (envAdminUser) {
    args.adminUser = envAdminUser;
  }
  // Use .trim() + truthiness like the user env, so an empty env var
  // (common in shell scripting) doesn't silently disable the admin UI.
  const envAdminPassword = process.env.ENVOYMESH_RELAY_ADMIN_PASSWORD?.trim();
  if (envAdminPassword) {
    args.adminPassword = envAdminPassword;
  }
  if (process.env.ENVOYMESH_RELAY_LOG_MAX_LINES !== undefined) {
    args.logMaxLines =
      parsePositiveInt("ENVOYMESH_RELAY_LOG_MAX_LINES", process.env.ENVOYMESH_RELAY_LOG_MAX_LINES) ??
      args.logMaxLines;
  }
  if (process.env.ENVOYMESH_RELAY_LOG_MAX_BYTES !== undefined) {
    args.logMaxBytes =
      parsePositiveInt("ENVOYMESH_RELAY_LOG_MAX_BYTES", process.env.ENVOYMESH_RELAY_LOG_MAX_BYTES) ??
      args.logMaxBytes;
  }
  if (process.env.ENVOYMESH_RELAY_LOG_RETAIN_DAYS !== undefined) {
    args.logRetainDays =
      parsePositiveInt(
        "ENVOYMESH_RELAY_LOG_RETAIN_DAYS",
        process.env.ENVOYMESH_RELAY_LOG_RETAIN_DAYS,
      ) ?? args.logRetainDays;
  }
  if (process.env.ENVOYMESH_A2A_BRIDGE !== undefined) {
    args.a2aBridgeEnabled = parseBoolean(
      "ENVOYMESH_A2A_BRIDGE",
      process.env.ENVOYMESH_A2A_BRIDGE,
    );
  }
  const envA2aGateway = process.env.ENVOYMESH_A2A_GATEWAY_URL?.trim();
  if (envA2aGateway) {
    args.a2aBridgeGatewayUrl = envA2aGateway;
  }
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
                         Also auto-enables --relay-public-mode unless
                         --relay-private-mode or ENVOYMESH_RELAY_PUBLIC_MODE=0.
                         Env: ENVOYMESH_ADVERTISE_ADDRS (comma-separated)
  --bootstrap <addr>    Bootstrap peer multiaddr or domain. Repeatable.
                         If domain (e.g., relay.example.com), will query /info
                         to get full multiaddr with peer ID.
                         Env: ENVOYMESH_BOOTSTRAP_PEERS (comma-separated)
  --no-dht              Disable DHT discovery.
  --dht-server          Force DHT server mode (relay stores routing records for other peers).
                         Default for public relays (auto-enabled with --advertise-addr).
                         Makes discovery work even when home nodes go offline.
  --dht-client          Force DHT client mode (relay can query but doesn't serve records).
                         Use for private/LAN relays that may not be reliably reachable.
  --no-rendezvous       Disable rendezvous capability registry.
  --ws-auth-token <token>  Shared token for /ws/client auth. When set, clients
                           must pass ?token=<token> in the WebSocket URL.
                           Env: ENVOYMESH_WS_AUTH_TOKEN
  --http-port <port>    HTTP info endpoint port. Default: 15432 (optional).
                         Returns {peerId, addrs} at /info and OK at /health
  --admin-user <name>   Basic Auth username for /admin UI + sensitive JSON.
                         Default: admin. Env: ENVOYMESH_RELAY_ADMIN_USER
  --admin-password <pw> Admin Basic Auth password.
                         Default: envoymesh123456. Env: ENVOYMESH_RELAY_ADMIN_PASSWORD
                         Change these in production.
  --log-max-lines <n>   In-memory log ring size for /admin. Default: 2000
                         Env: ENVOYMESH_RELAY_LOG_MAX_LINES
  --log-max-bytes <n>   Rotate profileDir/logs/relay.log at this size. Default: 10MiB
                         Env: ENVOYMESH_RELAY_LOG_MAX_BYTES
  --log-retain-days <n> Delete rotated logs older than N days. Default: 7
                         Env: ENVOYMESH_RELAY_LOG_RETAIN_DAYS
  --relay-public-mode   Apply community-relay presets to circuit-relay-v2
                         server config (1024 reservations, 4 MiB data, 30 min
                         TTL, 90 s hop timeout). Auto-on when --advertise-addr
                         is set. Env: ENVOYMESH_RELAY_PUBLIC_MODE (1/0)
  --relay-private-mode  Keep libp2p embedded defaults even with --advertise-addr
                         (15 reservations, 2 min TTL). For LAN/test relays.
  --relay-max-reservations <n>  Override max concurrent reservations.
                         Env: ENVOYMESH_RELAY_MAX_RESERVATIONS
  --relay-reservation-ttl-ms <ms>  Override reservation TTL in ms.
                         Env: ENVOYMESH_RELAY_RESERVATION_TTL_MS
  --relay-default-data-limit-bytes <n>  Override per-reservation data limit.
                         Env: ENVOYMESH_RELAY_DEFAULT_DATA_LIMIT_BYTES
  --relay-default-duration-limit-ms <ms>  Override per-reservation duration.
                         Env: ENVOYMESH_RELAY_DEFAULT_DURATION_LIMIT_MS
  --relay-hop-timeout-ms <ms>  Override inbound HOP stream timeout.
                         Env: ENVOYMESH_RELAY_HOP_TIMEOUT_MS
  --relay-max-outbound-stop-streams <n>  Override max simultaneous STOP streams.
                         Env: ENVOYMESH_RELAY_MAX_OUTBOUND_STOP_STREAMS
  --a2a-bridge          Publish A2A v1.0 Agent Card at /.well-known/agent-card.json
                         so external A2A clients (LangChain, Salesforce, etc.)
                         can discover this relay. Default: off.
                         Env: ENVOYMESH_A2A_BRIDGE (1/0)
  --a2a-gateway-url <url>  Public URL where A2A JSON-RPC is reachable.
                         Used as the supportedInterfaces[0].url field.
                         If unset, falls back to http://<host>:<httpPort>.
                         Env: ENVOYMESH_A2A_GATEWAY_URL
  --help, -h            Show this help.

Example:
  # Run a public community relay
  npm run relay:dev -- --relay-public-mode \\
    --advertise-addr /ip4/1.2.3.4/tcp/4001
`);
}
