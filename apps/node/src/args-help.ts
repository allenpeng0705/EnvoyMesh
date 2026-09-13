/**
 * The `--help` text for the node CLI.
 *
 * Its own module because `args.ts` reached the 800-line hard cap the moment the
 * shared-home default was added to it (802 lines): the Codex LOC rule says add new
 * functionality in a new module rather than extend an oversized one, and the
 * allowlist is for pre-existing v1.x modules, not for growth. 85 lines of static
 * help text is the cleanest thing to lift out — it has no dependencies at all.
 *
 * Keep `--profile` accurate: it described `./data/default` until the shared root
 * replaced it (design: docs/envoymesh-multi-product-design.md §4).
 */
export function printHelp(): void {
  console.log(`Envoy node

Usage:
  npm run node:dev -- [options]

Options:
  --config <path>      Load node options from YAML config file.
  --profile <dir>       Profile directory for Envoy identity. Default: the shared EnvoyMesh home
                        (macOS ~/Library/Application Support/EnvoyMesh; Windows %LOCALAPPDATA%\\EnvoyMesh).
                        Env: ENVOYMESH_HOME (the whole home) or ENVOYMESH_PROFILE (this directory);
                        the flag also exists because npm eats --flags on Windows.
  --discovery-profile <p>  Discovery defaults: lan-fast|wan-default|contacts-only. Env: ENVOYMESH_DISCOVERY_PROFILE
  --connectivity-strict    Fail startup when wan-default bootstrap connectivity cannot be established. Env: ENVOYMESH_CONNECTIVITY_STRICT=1
  --listen <multiaddr>  Listen multiaddr. Default: /ip4/0.0.0.0/tcp/0
  --advertise-addr <multiaddr>  Reachable relay base address for relay.lookup /p2p-circuit/ paths (public IP or DNS, same TCP port as clients use). Repeatable. Env: ENVOYMESH_ADVERTISE_ADDRS (comma-separated). YAML: discovery.advertiseAddrs. Strongly recommended for --relay-server on WAN/cloud.
  --no-mdns             Disable local mDNS discovery.
  --dht                 Enable DHT discovery.
  --dht-client          Enable DHT in client mode.
  --dht-server          Enable DHT in server-capable mode.
  --bootstrap <addr>    Add a bootstrap peer multiaddr. Repeatable.
                         Env: ENVOYMESH_BOOTSTRAP_PEERS (comma-separated)
  --bootstrap-preset <p> Add managed bootstrap set. Supported: public-libp2p, public-libp2p-am6, public-libp2p-am7, cn-relay, us-relay
                         Default (wan-default, no explicit bootstrap): all public-libp2p presets plus EnvoyMesh community relay multiaddr.
                         Repeatable. Env: ENVOYMESH_BOOTSTRAP_PRESETS (comma-separated)
  --bootstrap-presets-file <path> Load custom bootstrap preset definitions from YAML. Repeatable.
                         Env: ENVOYMESH_BOOTSTRAP_PRESETS_FILES (comma-separated)
  --join-invite <token> Apply a WAN join-invite token (bootstrap relays + dial seeds). See: npm run cli -w @envoymesh/node -- invite
  --relay               Enable circuit relay transport.
  --relay-server        Enable this node as a circuit relay server.
  --relay-reservation   Force a circuit-relay-v2 reservation on each configured relay at startup so /p2p-circuit/ dials reach this node. Default when --relay is set. Disable with --no-relay-reservation. Env: ENVOYMESH_RELAY_RESERVATION (1/true or 0/false).
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
