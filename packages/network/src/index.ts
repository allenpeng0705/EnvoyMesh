import { noise } from "@chainsafe/libp2p-noise";
import { fromString } from "uint8arrays";
import { yamux } from "@chainsafe/libp2p-yamux";
import { autoNAT } from "@libp2p/autonat";
import { bootstrap } from "@libp2p/bootstrap";
import { circuitRelayServer, circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { dcutr } from "@libp2p/dcutr";
import { identify, identifyPush } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import { mdns } from "@libp2p/mdns";
import { ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { byteStream } from "@libp2p/utils";
import { KEEP_ALIVE, FaultTolerance, type RoutingOptions, type TopologyFilter, type PeerId as Libp2pPeerId } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { CHAT_DELIVERY_ACK_TIMEOUT_MS } from "@envoymesh/protocol";
import { multiaddr as ma, type Multiaddr } from "@multiformats/multiaddr";
import type { CID } from "multiformats/cid";
import { createLibp2p, type Libp2p } from "libp2p";
import type { Uint8ArrayList } from "uint8arraylist";
import net from "node:net";
import { decodeEnvelope, encodeEnvelope } from "./codec.js";
import {
  buildConfiguredRelayCircuitListenAddrs,
  buildRelayAdvertisedMultiaddrs,
  filterMultiaddrsToPreferredRelays,
  peerIdFromRelayMultiaddr,
} from "./relay-listen-addrs.js";
import {
  encodeDataTransferBody,
  MAX_DATA_INBOUND_BYTES,
  parseInboundDataTransferBody,
  parseVoucherJsonObject,
  readAllFromByteStream,
} from "./data-framing.js";

/**
 * Topology filter that blocks AutoRelay discovery for peers outside the
 * configured EnvoyMesh relay allowlist (when that list is non-empty).
 */
function createPreferredRelayDiscoveryFilter(
  getPreferred: () => readonly string[],
): TopologyFilter {
  const seen = new Set<string>();
  return {
    has(peerId: Libp2pPeerId): boolean {
      const id = peerId.toString();
      const preferred = getPreferred();
      if (preferred.length > 0 && !preferred.includes(id)) {
        return true;
      }
      return seen.has(id);
    },
    add(peerId: Libp2pPeerId): void {
      seen.add(peerId.toString());
    },
    remove(peerId: Libp2pPeerId): void {
      seen.delete(peerId.toString());
    },
  };
}

/**
 * Defense-in-depth cap on inbound envelope bytes for chat and message protocols.
 * `apps/node/src/inbound-guard.ts` enforces a finer-grained cap (default 64 KiB,
 * 1 MiB for profile.*) before Zod parse, but the Diplomat layer rejects
 * oversized streams first to avoid OOM on a single buffer.
 */
export const MAX_INBOUND_ENVELOPE_BYTES = 1 * 1024 * 1024;
import {
  CLIENT_PROXY_PROTOCOL,
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  ENVOY_MESSAGE_PROTOCOL,
} from "./protocols.js";
import { cidForCapabilityTopic } from "./capability-topic-cid.js";
import {
  createSignedCapabilityTopicRecord,
  verifySignedCapabilityTopicRecord,
  encodeCapabilityTopicRecordToMultiaddr,
} from "./capability-topic.js";
import { expandListenAddressesWithQuic } from "./quic-listen.js";
import {
  DEFAULT_CLIENT_MAX_CONNECTIONS,
  DEFAULT_MDNS_INTERVAL_MS,
  PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD,
  PRUNE_EXCESS_SWARM_MAX_PEERS,
  scanLibp2pConnectionsFlat,
  scanLibp2pConnectionsMap,
  type MeshConnectionStats,
} from "./connection-stats.js";

export {
  DEFAULT_CLIENT_MAX_CONNECTIONS,
  DEFAULT_MDNS_INTERVAL_MS,
  PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD,
  PRUNE_EXCESS_SWARM_MAX_PEERS,
  pruneThresholdForMaxConnections,
  scanLibp2pConnectionsFlat,
  scanLibp2pConnectionsMap,
  type MeshConnectionStats,
} from "./connection-stats.js";

/** Prefix `keep-alive-*` triggers libp2p reconnect-on-disconnect queue for bonded contacts */
const CONTACT_KEEP_ALIVE_PEER_TAG = `${KEEP_ALIVE}-envoymesh-contact`;

/** Tag prefix used to keep relay peer IDs connected across churn. */
const RELAY_KEEP_ALIVE_PEER_TAG = `${KEEP_ALIVE}-envoymesh-relay`;

/** True when reconnect-queue schedules redials after disconnect (any peer-store tag prefixed with KEEP_ALIVE, same rule as libp2p reconnect queue). */
export function peerTagsTriggerReconnectQueue(tagNames: Iterable<string>): boolean {
  for (const name of tagNames) {
    if (typeof name === "string" && name.startsWith(KEEP_ALIVE)) {
      return true;
    }
  }
  return false;
}

/** Envoy tag name merged by {@link EnvoyMesh.tagContactForPersistentReachability}. */
export function getEnvoyContactKeepAlivePeerTagName(): string {
  return CONTACT_KEEP_ALIVE_PEER_TAG;
}

/**
 * Compute the re-warm delay for the reservation health loop after N consecutive
 * failures. Pure (unit-testable). Returns `lostMs` until failures exceed
 * `threshold`, then `lostMs × 2^(failures - threshold)` capped at `maxMs`.
 *
 * Rationale: a dead relay doesn't need a 30s dial attempt every 15s forever.
 * After ~1 minute of sustained failure, stretch the cadence so the node stops
 * hammering it. Reset to 0 immediately on any successful reservation (the
 * caller's responsibility). See docs/connectivity-internals-and-design.md M1.
 */
export function computeReservationBackoffDelay(input: {
  consecutiveReWarmFailures: number;
  threshold: number;
  lostMs: number;
  maxMs: number;
}): number {
  const { consecutiveReWarmFailures, threshold, lostMs, maxMs } = input;
  if (consecutiveReWarmFailures <= threshold) return lostMs;
  const exp = consecutiveReWarmFailures - threshold;
  return Math.min(lostMs * 2 ** exp, maxMs);
}

/**
 * When libp2p still reports a connection as open, `newStream` can hang or fail after NAT sleep,
 * idle TCP half-open state, or relay path expiry (often seen on Windows). We time out and force a fresh dial.
 *
 * Relay `/p2p-circuit` connections often carry `connection.limits` (Circuit Relay v2 "limited" conns).
 * `newStream()` / `dialProtocol()` throw `LimitedConnectionError` unless
 * `runOnLimitedConnection: true`. Envoy message/chat/data handlers are
 * registered with that flag, and outbound circuit dials/reuse pass it too.
 */
const NEW_STREAM_ON_OPEN_CONNECTION_TIMEOUT_MS = 15_000;
/** Fail fast when reusing an existing chat stream (stale direct TCP is common on LAN). */
const BONDED_CHAT_STREAM_REUSE_TIMEOUT_MS = 4_000;
/**
 * Per-hint dial cap when iterating multiaddrs.
 *
 * History:
 *   3_500ms  — original; fired before TCP+Noise+Yamux on cross-region
 *              dials, marking every multiaddr unreachable.
 *   15_000ms — first bump; matched libp2p's own default dialTimeout.
 *              Still too tight for the community relay at 47.93.11.212
 *              where the circuit-relay-v2 reservation handshake
 *              competes for the same budget.
 *   30_000ms — prior; still lost to wan-default dial-queue congestion on
 *              Windows first-launch sponsor bond.
 *   45_000ms — current; matches bond.request public-circuit AbortSignal
 *              and libp2p connectionManager dialTimeout.
 *
 * Multiaddr iteration within a single `sendChat` still falls through to
 * the next hint on this timeout, so a slow hint doesn't block the whole
 * send — it just gets skipped.
 *
 * The companion libp2p knobs in `createLibp2p({ connectionManager })` —
 * `dialTimeout` and `addressDialTimeout` — must move in lockstep with
 * this constant or the libp2p-level dial can still cap at the lower
 * value and override our per-hint race.
 */
const HINT_DIAL_TIMEOUT_MS = 45_000;
/** Short budget for private LAN TCP when same-subnet LAN-first is enabled. */
const PRIVATE_LAN_HINT_DIAL_TIMEOUT_MS = 3_000;
/** Cap ephemeral (≥32768) private LAN attempts before falling through to circuits. */
const MAX_EPHEMERAL_PRIVATE_LAN_DIALS = 2;
/** Faster fail for high-port LAN dials (tcp/0 listeners + stale inbound snapshots). */
const EPHEMERAL_PRIVATE_LAN_HINT_DIAL_TIMEOUT_MS = 1_000;

/**
 * circuit-relay-v2 reservation-protocol timeout.
 *
 * Distinct from `HINT_DIAL_TIMEOUT_MS` (which caps the raw TCP dial to
 * the relay) — this caps the **multi-step reservation handshake** that
 * runs over the dialed connection: the relay confirms it has a slot,
 * returns reservation limits (TTL, data/duration caps), and the client
 * acks. Defaults to **5_000ms** in `@libp2p/circuit-relay-v2`, which is
 * too tight for slow cross-region paths — the dial completes, the
 * handshake starts, and the reservation times out 5s in before the
 * multi-step protocol finishes.
 *
 * Set to match `HINT_DIAL_TIMEOUT_MS` so the two budgets agree: the
 * dial gives the connection, the reservation gives the slot. With
 * this at 5_000 and `HINT_DIAL_TIMEOUT_MS` at 45_000, a slow relay
 * would dial successfully then fail reservation long before the dial
 * timeout ever fires — the user sees `relay=PENDING` and the
 * readiness summary's "no reservation yet" warning without any
 * obvious reason.
 */
const RELAY_RESERVATION_TIMEOUT_MS = 60_000;

function streamReuseTimeoutMs(protocol: string): number {
  return protocol === ENVOY_CHAT_PROTOCOL
    ? BONDED_CHAT_STREAM_REUSE_TIMEOUT_MS
    : NEW_STREAM_ON_OPEN_CONNECTION_TIMEOUT_MS;
}

function connectionInfoFromRemoteAddr(remoteAddr: string): {
  connected: boolean;
  direct: boolean;
  relayPeerId?: string;
} {
  if (remoteAddr.includes("/p2p-circuit/")) {
    const relayMatch = remoteAddr.match(/p2p-circuit\/p2p\/([^/]+)\/p2p\//);
    return { connected: true, direct: false, relayPeerId: relayMatch?.[1] };
  }
  return { connected: true, direct: true };
}

function promiseWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface InboundMeshMessage {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  protocol: string;
  /** Remote end of the libp2p connection (often includes `/p2p-circuit/` for relay paths). */
  remoteAddr?: string;
  /**
   * Inbound control streams only: send one signed reply on the same libp2p stream (required for
   * NAT clients that are not dialable for reverse opens after the client closes its write half).
   */
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
}

export type MeshMessageHandler = (message: InboundMeshMessage) => Promise<void>;

export interface DiscoveredMeshPeer {
  peerId: string;
  multiaddrs: string[];
}

export type MeshPeerDiscoveryHandler = (peer: DiscoveredMeshPeer) => void | Promise<void>;

export interface InboundDataTransfer {
  remotePeerId: string;
  voucher: unknown;
  voucherUtf8: Uint8Array;
  chunks: Uint8Array[];
}

export type MeshDataTransferHandler = (message: InboundDataTransfer) => Promise<void> | void;

/** Options for {@link EnvoyMesh.send}, {@link EnvoyMesh.sendChat}, {@link EnvoyMesh.sendDataTransfer}, etc. */
export interface MeshOutboundOptions {
  /**
   * Extra multiaddrs to try (e.g. from `system.signal` in the peer directory) when a bare `/p2p/…`
   * dial does not succeed.
   */
  dialHints?: string[];
  /** When no active connection exists, try relay circuit hints before bare peer-id dials. */
  preferCircuitHints?: boolean;
  /** Skip reusing an existing libp2p connection (redial via hints). */
  forceFreshDial?: boolean;
  /** When a connection exists, open a probe stream instead of trusting connection state alone. */
  verifyConnection?: boolean;
  /** When true, close an existing relay connection and redial direct if LAN hints exist. Default false. */
  upgradeRelayToDirect?: boolean;
  /**
   * Same-subnet LAN-first warm/chat: use a short per-address timeout on private
   * LAN TCP hints and cap ephemeral high-port attempts so dead peer-directory
   * snapshots cannot burn the full dialTimeout before circuit fallthrough.
   */
  sameSubnetLanFirst?: boolean;
  /** Override per-address dial timeout (ms). Default {@link HINT_DIAL_TIMEOUT_MS}. */
  dialTimeoutMs?: number;
  /** Private-LAN timeout when {@link sameSubnetLanFirst} is set. Default 3s. */
  privateLanDialTimeoutMs?: number;
}

/**
 * Optional configuration for the `circuitRelayServer` service that the
 * network stack registers when {@link EnvoyMeshOptions.enableRelayServer} is true.
 *
 * Mirrors the libp2p `CircuitRelayServerInit` + nested `ServerReservationStoreInit`
 * shapes. Pass `undefined` (the default) to use libp2p's defaults
 * (`maxReservations=15`, `reservationTtl=2min`, `defaultDataLimit=128KiB`,
 * `defaultDurationLimit=2min`, `hopTimeout=30s`).
 *
 * Operators running a **public community relay** should override these to
 * reasonable production values (256 reservations, 1 MiB data, 30 min duration,
 * 60 s hop timeout). The defaults are tight because they target an embedded
 * use case, not a community server.
 */
export interface CircuitRelayServerConfig {
  /** Maximum concurrent reservations the relay will grant. Default 15. */
  maxReservations?: number;
  /** Reservation TTL in ms. Default 2 minutes. */
  reservationTtl?: number;
  /** Per-reservation data limit in bytes. Default 128 KiB. */
  defaultDataLimit?: number;
  /** Per-reservation duration limit in ms. Default 2 minutes. */
  defaultDurationLimit?: number;
  /** Time allowed for an inbound HOP stream to complete. Default 30 s. */
  hopTimeout?: number;
  /**
   * Maximum simultaneous inbound HOP streams. Leave undefined for the
   * libp2p default (currently unbounded).
   */
  maxInboundHopStreams?: number;
  /**
   * Maximum simultaneous outbound STOP streams. Default 300.
   * Inbound relayed connections use one STOP stream each.
   */
  maxOutboundStopStreams?: number;
}

/** Client-side circuit-relay reservation chip for operators / Settings UI. */
export type RelayReservationState = "off" | "pending" | "reserved" | "failed";

export interface RelayReservationStatus {
  state: RelayReservationState;
  /** True when at least one preferred/configured relay currently holds a slot. */
  live: boolean;
  /** True if a reservation succeeded at least once this process. */
  everReserved: boolean;
  /** Configured/preferred relay peer IDs (allowlist). */
  relayPeerIds: string[];
  /** Subset of {@link relayPeerIds} with a live slot right now. */
  liveRelayPeerIds: string[];
  lastError?: string;
  lastReservedAt?: string;
  /**
   * Consecutive failed re-warm cycles (resets to 0 on success). When this
   * stays >0 for a while, the configured relay(s) are effectively down — the
   * UI surfaces a "Relay unreachable" warning so operators know WAN discovery
   * and cross-NAT reachability are degraded. See M2.
   */
  failureStreak: number;
  checkedAt: string;
}

export interface EnvoyMeshOptions {
  listen?: string[];
  /**
   * Extra multiaddrs to append to libp2p’s announced addresses (Identify, DHT, etc.).
   * Use when listening on `0.0.0.0` but peers must dial a stable public IP or DNS multiaddr.
   * Mapped to libp2p `addresses.appendAnnounce`. Invalid strings are skipped with a warning.
   */
  advertiseAddrs?: string[];
  enableMdns?: boolean;
  mdnsIntervalMs?: number;
  /**
   * libp2p connectionMonitor ping interval (ms). Defaults to 45_000.
   * Longer intervals reduce CPU/network; half-open detection becomes slower.
   */
  connectionMonitorPingIntervalMs?: number;
  enableDht?: boolean;
  dhtClientMode?: boolean;
  dhtProtocol?: string;
  bootstrapPeers?: string[];
  bootstrapTimeoutMs?: number;
  enableRelay?: boolean;
  enableRelayServer?: boolean;
  /**
   * EnvoyMesh relay bases (e.g. community cn-relay multiaddrs). When non-empty
   * and `enableRelay` is true, the mesh listens on `<base>/p2p-circuit` for
   * each instead of bare `/p2p-circuit`. Bare `/p2p-circuit` starts libp2p
   * AutoRelay discovery against every HOP peer (including public IPFS
   * bootstraps), which advertises circuits joiners never dial.
   */
  configuredRelayAddrs?: string[];
  /**
   * Tuning for the `circuitRelayServer` service. Only consulted when
   * `enableRelayServer` is true. Public/community relays should override
   * the libp2p defaults — they target an embedded use case.
   */
  circuitRelayServer?: CircuitRelayServerConfig;
  enableAutoNat?: boolean;
  enableDcutr?: boolean;
  /** When true, register the QUIC transport and add matching `/udp/.../quic-v1` listeners for each TCP listen address. */
  enableQuic?: boolean;
  /**
   * When true, register the WebSocket transport (browser-compatible).
   * Mobile/browser nodes should enable this along with {@link browserMode}.
   */
  enableWebSocketTransport?: boolean;
  /**
   * Browser-friendly mode: uses WebSocket/WebRTC transports instead of TCP,
   * skips autoNAT/dcutr (not needed in browser), and uses relay for inbound.
   */
  browserMode?: boolean;
  /**
   * Pre-loaded libp2p Ed25519 private key. Required in environments where file
   * I/O is unavailable (browsers, Capacitor WebView). The caller is
   * responsible for loading or generating the key — see
   * `apps/node/src/libp2p-key-loader.ts` for a file-backed implementation.
   */
  libp2pPrivateKey?: import("@libp2p/interface").PrivateKey;
  enableP2pDebug?: boolean;
  /**
   * Log `[reachability] …` on `peer:disconnect` (peer store tags, reconnect-queue eligibility) and
   * `peer:reconnect-failure` when libp2p exhausts KEEP_ALIVE redials. Does not imply full {@link enableP2pDebug}.
   */
  enableReachabilityLog?: boolean;
  /**
   * When true with enableP2pDebug, periodically print `[relay-debug] SUMMARY: ...` from the relay connection scan.
   * Defaults false because the summary is very chatty during idle relays.
   */
  enableRelayDebugSummary?: boolean;
  onP2pDebug?: (event: P2pDebugEvent) => void;
  /**
   * Path to a protobuf-serialized libp2p Ed25519 private key. If the file is missing, it is created on first {@link EnvoyMesh.start}.
   * When omitted, libp2p generates a new ephemeral identity each process start (Peer ID changes every restart).
   */
  libp2pPrivateKeyPath?: string;
  /**
   * libp2p connection-manager cap. Defaults to {@link DEFAULT_CLIENT_MAX_CONNECTIONS} for client
   * nodes; relay-server nodes stay uncapped unless set explicitly.
   */
  maxConnections?: number;
  /**
   * When enabled, a libp2p `connectionGater` blocks outbound dials to peers
   * NOT in the set returned by {@link allowedDialPeerIds}. This is
   * defense-in-depth for quietWan / DHT-off modes: even if some path
   * (bootstrap, identify) introduces an anonymous peer, the gater refuses the
   * dial at the libp2p layer before it opens a connection. Default OFF — must
   * never be set on relay servers (would break circuit hopping from arbitrary
   * peers). See docs/connectivity-internals-and-design.md Solution A2.
   */
  strictDialPolicy?: boolean;
  /**
   * Callback returning the current set of peer IDs that {@link strictDialPolicy}
   * permits dialing. Evaluated on every dial attempt so it stays dynamic as
   * bonds form and discovery seeds arrive. Should include: configured relays,
   * bonded contacts, mDNS/relay-roster discovered peers. When it returns
   * undefined, ALL peers are allowed (gater effectively disabled for that dial).
   */
  allowedDialPeerIds?: () => Set<string> | undefined;
}

export interface CapabilityTopicProviderRecord {
  peerId: string;
  multiaddrs: string[];
  routing?: string;
  /** Present when the provider's capability topic announcement included a signed record and verification succeeded. */
  signedRecord?: import("@envoymesh/protocol").SignedCapabilityTopicRecord;
  /** Present when a signed record was found but verification failed (so caller knows it exists but is invalid). */
  signedRecordInvalid?: true;
}

export type P2pDebugEvent =
  | { kind: "peer:connect"; remotePeerId: string }
  | { kind: "peer:disconnect"; remotePeerId: string }
  | { kind: "connection:open"; remotePeerId: string; direction: "inbound" | "outbound" }
  | { kind: "connection:close"; remotePeerId: string }
  | { kind: "stream:open"; remotePeerId: string; protocol: string; direction: "inbound" | "outbound" }
  | { kind: "stream:close"; remotePeerId: string; protocol: string; direction: "inbound" | "outbound" };

export interface EnvoyMeshPeerDiscoveryService {
  addEventListener(
    type: "peer:discovery",
    handler: (event: { detail: { id: { toString(): string }; multiaddrs?: Array<{ toString(): string }> } }) => void,
  ): void;
}

/**
 * Convert the user-facing {@link CircuitRelayServerConfig} into the libp2p
 * `CircuitRelayServerInit` shape. Filters out undefined fields so the libp2p
 * default kicks in for any unset value — easier to reason about than passing
 * `undefined` into nested objects.
 */
function buildCircuitRelayServerInit(
  config: CircuitRelayServerConfig | undefined,
): Record<string, unknown> {
  if (!config) return {};
  const reservations: Record<string, unknown> = {};
  if (config.maxReservations !== undefined) reservations.maxReservations = config.maxReservations;
  if (config.reservationTtl !== undefined) reservations.reservationTtl = config.reservationTtl;
  if (config.defaultDataLimit !== undefined) {
    // libp2p's ReservationStore expects a bigint, not a number.
    reservations.defaultDataLimit = BigInt(config.defaultDataLimit);
  }
  if (config.defaultDurationLimit !== undefined) {
    reservations.defaultDurationLimit = config.defaultDurationLimit;
  }
  const init: Record<string, unknown> = {};
  if (Object.keys(reservations).length > 0) init.reservations = reservations;
  if (config.hopTimeout !== undefined) init.hopTimeout = config.hopTimeout;
  if (config.maxInboundHopStreams !== undefined) init.maxInboundHopStreams = config.maxInboundHopStreams;
  if (config.maxOutboundStopStreams !== undefined) init.maxOutboundStopStreams = config.maxOutboundStopStreams;
  return init;
}

/** Exported for testing. */
export const __testing = { buildCircuitRelayServerInit };

export class EnvoyMesh {
  private readonly handlers = new Set<MeshMessageHandler>();
  private readonly dataHandlers = new Set<MeshDataTransferHandler>();
  private readonly peerDiscoveryHandlers = new Set<MeshPeerDiscoveryHandler>();
  private readonly peerDisconnectHandlers = new Set<(peerId: string) => void>();
  private readonly peerConnectHandlers = new Set<MeshPeerDiscoveryHandler>();
  private relayDebugTimer?: ReturnType<typeof setInterval>;
  private node?: Libp2p;
  /** Additional announce addresses discovered at runtime (e.g. via STUN or relay observed addr). */
  private readonly _appendAnnounce: string[] = [];
  private reachabilityLogHandlers?: {
    disconnect: (event: unknown) => void;
    reconnectFailure?: (event: unknown) => void;
  };
  /** libp2p circuit-relay-v2 event handlers installed at start(), torn down at stop(). */
  private relayLoggingHandlers?: {
    reservation: (event: unknown) => void;
    reservationError: (event: unknown) => void;
    advertSuccess: (event: unknown) => void;
    advertError: (event: unknown) => void;
  };
  /** Track whether we've ever successfully reserved a relay slot. Used to log a startup summary. */
  private relayEverReserved = false;
  private relayEverAdvertised = false;
  /** Peer IDs of relays that have granted us a reservation this process. */
  private lastReservedRelayPeerIds: string[] = [];
  /**
   * Configured EnvoyMesh relay peer IDs (from reservation health warmup).
   * When non-empty, UI / mesh-ready / hasLiveRelayReservation() only count
   * slots on these peers — AutoRelay may still reserve on public IPFS hops,
   * but those must not show as RESERVED for WAN invite / auto-bond.
   */
  private preferredRelayPeerIds: string[] = [];
  private lastReservedAt: string | undefined;
  private lastReservationError: string | undefined;
  /**
   * Consecutive failed re-warm cycles in the reservation health loop. Surfaced
   * via RelayReservationStatus so the UI can distinguish a transient blip from
   * a sustained outage (M2). Reset to 0 on any successful reservation.
   */
  private reservationFailureStreak = 0;
  private reservationHealthTimer?: ReturnType<typeof setTimeout>;
  private reservationHealthDisconnectUnsub?: () => void;
  private reservationHealthRunning = false;
  private reservationHealthRelayAddrs: string[] = [];
  /** Bumped on stop so adaptive scheduleNext loops exit. */
  private reservationHealthGeneration = 0;
  /**
   * The circuit-relay-v2 server config that was passed to {@link EnvoyMesh}.
   * Captured here so observability endpoints (`/version`, `/reservations`) can
   * surface the active limits without re-reading the options object.
   */
  private readonly circuitRelayServerConfig: CircuitRelayServerConfig | undefined;

  constructor(private readonly options: EnvoyMeshOptions = {}) {
    this.circuitRelayServerConfig = options.circuitRelayServer;
  }

  async start(): Promise<void> {
    if (this.node) {
      return;
    }

    const advancedConnectivityEnabled = this.isAdvancedConnectivityEnabled();

    const browserMode = this.options.browserMode === true;
    const enableWebSocket = this.options.enableWebSocketTransport === true || browserMode;

    const baseListen = this.options.listen ?? (browserMode ? [] : ["/ip4/0.0.0.0/tcp/0"]);
    let listenAddrs =
      this.options.enableQuic === true && !browserMode ? expandListenAddressesWithQuic(baseListen) : [...baseListen];

    // Circuit relay v2: prefer listening on configured EnvoyMesh relays
    // (`<relay>/p2p-circuit`) so AutoRelay does not hunt public IPFS HOP
    // peers. Bare `/p2p-circuit` remains the fallback when no configured
    // relays are known (e.g. browser / unconfigured clients).
    if ((this.options.enableRelay || browserMode) && !this.options.enableRelayServer) {
      const configuredListen = buildConfiguredRelayCircuitListenAddrs(
        this.options.configuredRelayAddrs ?? [],
      );
      if (configuredListen.length > 0) {
        for (const a of configuredListen) {
          if (!listenAddrs.includes(a)) listenAddrs.push(a);
        }
        const preferred = configuredListen
          .map((a) => peerIdFromRelayMultiaddr(a.replace(/\/p2p-circuit$/, "")))
          .filter((id): id is string => Boolean(id));
        this.preferredRelayPeerIds = preferred;
        console.log(
          `[p2p] circuit listen on ${configuredListen.length} configured relay(s) — AutoRelay discovery suppressed for other HOP peers`,
        );
      } else if (!listenAddrs.includes("/p2p-circuit")) {
        listenAddrs = [...listenAddrs, "/p2p-circuit"];
      }
    }

    for (const raw of this.options.advertiseAddrs ?? []) {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) continue;
      try {
        ma(s);
        this._appendAnnounce.push(s);
      } catch {
        console.warn(`[p2p] skipping invalid advertise multiaddr: ${raw}`);
      }
    }
    if (this._appendAnnounce.length > 0) {
      console.log(`[p2p] appendAnnounce: ${this._appendAnnounce.join(", ")}`);
    }

    const quicTransportFactory = this.options.enableQuic ? await this.loadQuicTransport() : undefined;

    const libp2pPrivateKey = this.options.libp2pPrivateKey;
    if (libp2pPrivateKey && this.options.enableP2pDebug) {
      console.log(`[p2p] libp2p private key supplied by caller`);
    }

    const maxConnections =
      this.options.maxConnections ??
      (this.options.enableRelayServer ? undefined : DEFAULT_CLIENT_MAX_CONNECTIONS);
    if (maxConnections != null && this.options.enableP2pDebug) {
      console.log(`[p2p] connectionManager.maxConnections=${maxConnections}`);
    }

    this.node = await createLibp2p({
      ...(libp2pPrivateKey != null ? { privateKey: libp2pPrivateKey } : {}),
      // Configured `/p2p-circuit` listen addrs dial the relay at startup. A
      // transient ECONNRESET / EncryptionFailedError on cn-relay must not
      // abort the whole node — reservation health re-warms afterward.
      transportManager: {
        faultTolerance: FaultTolerance.NO_FATAL,
      },
      // Optional strict dial policy (A2): block outbound dials to peers not in
      // the allow-set. Defense-in-depth for quietWan / DHT-off modes — stops
      // anonymous DHT peers at the libp2p layer before a connection opens.
      // Default off; MUST NOT be enabled on relay servers (would break hops).
      ...(this.options.strictDialPolicy && this.options.allowedDialPeerIds
        ? {
            connectionGater: {
              denyDialPeer: (peerId: { toString(): string }): boolean => {
                const allowed = this.options.allowedDialPeerIds?.();
                // No allow-set → allow all (gater effectively disabled).
                if (!allowed || allowed.size === 0) return false;
                return !allowed.has(peerId.toString());
              },
            },
          }
        : {}),
      connectionMonitor: {
        pingInterval: this.options.connectionMonitorPingIntervalMs ?? 45_000,
        abortConnectionOnPingFailure: false,
      },
      connectionManager: {
        ...(maxConnections != null ? { maxConnections } : {}),
        reconnectRetries: 10,
        reconnectRetryInterval: 5000,
        reconnectBackoffFactor: 1.5,
        maxParallelReconnects: 10,
        // Bumped from 15s/10s → 30s → 45s in lockstep with WAN bond.request
        // public-circuit dials (deliverCallEnvelopeViaRuntime). The libp2p-level
        // dialTimeout is the hard ceiling for any single multiaddr dial; the
        // app-level AbortSignal is the soft ceiling. Keeping them aligned
        // ensures a congested wan-default dial queue can still complete a
        // circuit CONNECT before we give up.
        dialTimeout: 45_000,
        addressDialTimeout: 45_000,
      },
      addresses: {
        listen: listenAddrs,
        ...(this._appendAnnounce.length > 0 ? { appendAnnounce: this._appendAnnounce } : {}),
      },
      transports: [
        ...(browserMode ? [] : [tcp()]),
        ...(enableWebSocket ? [webSockets()] : []),
        ...(this.options.enableRelay || this.options.enableRelayServer || browserMode
          ? [
              circuitRelayTransport({
                reservationCompletionTimeout: RELAY_RESERVATION_TIMEOUT_MS,
                discoveryFilter: createPreferredRelayDiscoveryFilter(
                  () => this.preferredRelayPeerIds,
                ),
              }),
            ]
          : []),
        ...(quicTransportFactory && !browserMode ? [quicTransportFactory()] : []),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: this.createPeerDiscoveryServices(),
      services: advancedConnectivityEnabled
        ? {
            ping: ping(),
            identify: identify(),
            identifyPush: identifyPush(),
            ...(this.options.enableDht
              ? {
                  dht: kadDHT({
                    clientMode: this.options.dhtClientMode,
                    protocol: this.options.dhtProtocol,
                  }),
                }
              : {}),
            ...(this.options.enableRelayServer
              ? {
                  relay: circuitRelayServer(buildCircuitRelayServerInit(this.options.circuitRelayServer)),
                }
              : {}),
            ...(this.options.enableAutoNat && !browserMode ? { autoNAT: autoNAT() } : {}),
            ...(this.options.enableDcutr && !browserMode ? { dcutr: dcutr() } : {}),
          }
        : undefined,
    });

    this.attachPeerDiscovery(this.node);

    await this.installEnvelopeInboundHandler(ENVOY_MESSAGE_PROTOCOL);
    await this.installEnvelopeInboundHandler(ENVOY_CHAT_PROTOCOL);

    // Subscribe to libp2p circuit-relay-v2 events so operators can see
    // whether we successfully reserved a slot on a relay hop (inbound
    // reachability) and whether the relay advertised our address. Without
    // these logs, a stuck DHT + no relay reservation is indistinguishable
    // from "everything is fine" in the existing log stream.
    this.installRelayLogging();

    await this.node.handle(
      ENVOY_DATA_PROTOCOL,
      async (stream: any, connection: any) => {
      const remotePeerId = connection.remotePeer.toString();
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol: ENVOY_DATA_PROTOCOL,
        direction: "inbound",
      });

      try {
        const streamIo = byteStream(stream);
        const bytes = await readAllFromByteStream(streamIo, MAX_DATA_INBOUND_BYTES);
        if (bytes.byteLength === 0) {
          console.warn(
            `[data transfer] inbound stream empty from ${remotePeerId.slice(0, 12)}…`,
          );
          return;
        }
        const { voucherUtf8, chunks } = parseInboundDataTransferBody(bytes);
        const voucher = parseVoucherJsonObject(voucherUtf8);
        await this.dispatchData({
          remotePeerId,
          voucher,
          voucherUtf8,
          chunks,
        });
      } catch (error) {
        console.error("EnvoyMesh inbound data stream failed", error);
      } finally {
        this.emitP2pDebug({
          kind: "stream:close",
          remotePeerId,
          protocol: ENVOY_DATA_PROTOCOL,
          direction: "inbound",
        });
      }
    },
      { runOnLimitedConnection: true },
    );

    // node.start() starts all transports including circuit-relay-v2. When relay
    // is enabled, the relay transport may try to reach configured relay servers
    // during startup. If those servers are slow, each dial attempt
    // blocks for dialTimeout (30 s after the recent bump).  Without an
    // overall timeout, the entire start() can hang for minutes, keeping
    // the Social UI in "Connecting…" forever.
    //
    // A 60 s deadline gives the relay transport ~2 full dialTimeout cycles
    // (30 s) plus headroom for TCP + QUIC listen, DHT bootstrap, and the
    // relay auto-reservation handshake.  If it still hasn't finished, we
    // continue — the node is functional for direct P2P, and relay
    // connectivity will be established asynchronously when possible.
    const NODE_START_DEADLINE_MS = 60_000;
    try {
      await promiseWithTimeout(
        Promise.resolve(this.node.start()),
        NODE_START_DEADLINE_MS,
        "libp2p node.start",
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[network] node.start did not finish within ${NODE_START_DEADLINE_MS}ms (${msg}). ` +
        "The node is functional for direct P2P; relay connectivity will follow asynchronously.",
      );
    }

    this.attachP2pDebug(this.node);
    this.attachReachabilityObservability(this.node);

    // Fire-and-forget startup diagnostics. Don't await — these are
    // operator-visibility probes, not on the critical path. The relay
    // reservation + DHT bootstrap complete asynchronously in the
    // background, and the readiness summary reflects whatever state
    // we've reached by the time it runs (~50-200ms after start()).
    void this.probeBootstrapPeers();
    this.warnOnAdvertisedPortMismatch();
    // Defer the readiness summary by 200ms so any synchronous
    // relay:reservation events that fired during start() get a chance
    // to flip relayEverReserved first.
    setTimeout(() => this.logDiscoveryReadiness(), 200).unref?.();
  }

  async stop(): Promise<void> {
    if (!this.node) {
      return;
    }

    if (this.relayDebugTimer) {
      clearInterval(this.relayDebugTimer);
      this.relayDebugTimer = undefined;
    }
    // Surface the relay state at shutdown so an operator tailing the
    // log can see whether the node ever got inbound reachability while
    // it was up. No reservation after a reasonable startup window is
    // a strong signal that DHT bootstrap + relay connection both failed.
    // Only emit when relay was actually enabled — otherwise it's just
    // noise (e.g. relay-disabled tests, browser mode).
    const relayEnabled =
      this.options.enableRelay ||
      this.options.enableRelayServer ||
      // browserMode defaults to true when listen addrs is empty; we
      // can't read it here directly, but the absence of `node` is a
      // safe proxy. The presence of relay:reservation handlers is the
      // real signal.
      this.relayLoggingHandlers !== undefined;
    if (relayEnabled && !this.relayEverReserved) {
      console.warn(
        `[p2p] stop(): node NEVER reserved a relay slot during this run. ` +
        `Other peers cannot dial this node inbound via /p2p-circuit/. ` +
        `Check [relay] reservation lines above for the failure cause.`,
      );
    } else if (relayEnabled && !this.relayEverAdvertised) {
      console.warn(
        `[p2p] stop(): relay reservation OK but address never ADVERTISED through relay. ` +
        `Peers that haven't learned our address another way cannot findPeer(thisNode).`,
      );
    }
    this.detachRelayLogging();
    this.detachReachabilityObservability();
    this.stopRelayReservationHealthLoop();
    await this.node.stop();
    this.node = undefined;
    this.relayEverReserved = false;
    this.relayEverAdvertised = false;
    this.lastReservedRelayPeerIds = [];
    this.lastReservedAt = undefined;
    this.lastReservationError = undefined;
  }

  get peerId(): string {
    return this.requireNode().peerId.toString();
  }

  get multiaddrs(): string[] {
    return this.requireNode()
      .getMultiaddrs()
      .map((addr) => addr.toString());
  }

  /**
   * Multiaddrs safe to advertise via relay.checkin / WAN invite / provideSelf.
   * When configured EnvoyMesh relays are known, strips `/p2p-circuit/` paths
   * whose hop is not in that allowlist (AutoRelay public IPFS circuits).
   * Circuits are included only for usable reservations (store ∩ open TCP),
   * rewritten onto public preferred relay bases when libp2p only exposes
   * loopback/RFC1918 hop views.
   */
  getRelayAdvertisedMultiaddrs(): string[] {
    const filtered = filterMultiaddrsToPreferredRelays(
      this.multiaddrs,
      this.preferredRelayPeerIds,
    );
    // Prefer health-loop bases (always set after warmAndWatch). Fall back to
    // construct-time configured relays so a checkin that races the health
    // loop still rewrites private hop views onto a public dial base.
    const preferredRelayBases =
      this.reservationHealthRelayAddrs.length > 0
        ? this.reservationHealthRelayAddrs
        : (this.options.configuredRelayAddrs ?? []);
    return buildRelayAdvertisedMultiaddrs({
      listenAddrs: filtered,
      preferredRelayBases,
      usableRelayPeerIds: this.listUsableRelayPeerIds(),
      selfPeerId: this.node ? this.peerId : undefined,
    });
  }

  /** Dialable multiaddrs from the libp2p peer store (includes mDNS-learned LAN paths). */
  async getPeerStoreDialHints(
    peerIdStr: string,
    opts?: { allowEphemeralPrivateLan?: boolean },
  ): Promise<string[]> {
    const idStr = peerIdStr.trim();
    if (!idStr || !this.node) {
      return [];
    }
    try {
      const peerData = await this.requireNode().peerStore.get(peerIdFromString(idStr));
      const out: string[] = [];
      for (const entry of peerData.addresses ?? []) {
        const raw = entry.multiaddr?.toString?.()?.trim();
        if (raw) {
          // Circuits belong in discovery seeds (relay.lookup); peerstore copies are often stale → NO_RESERVATION.
          if (raw.includes("/p2p-circuit/")) {
            continue;
          }
          out.push(raw);
        }
      }
      return filterUsableOutboundPeerDialHints(out, idStr, opts);
    } catch {
      return [];
    }
  }

  /** Drop libp2p auto-learned ephemeral observed addrs; keep only filtered direct dial paths. */
  async scrubPeerStoreDialHints(peerIdStr: string, extraAddrs: readonly string[] = []): Promise<string[]> {
    const idStr = peerIdStr.trim();
    if (!idStr || idStr.startsWith("envoy_") || !this.node) {
      return [];
    }
    const existingGood = await this.getPeerStoreDialHints(idStr);
    const replacement = filterUsableOutboundPeerDialHints(
      [
        ...existingGood,
        ...extraAddrs.filter((a) => !a.includes("/p2p-circuit/")),
      ],
      idStr,
    );
    // Do NOT overwrite the peer store with an empty list: in-process two-
    // node tests listen on 127.0.0.1, which the outbound hint filter strips
    // as "unroutable". Without this guard, the first `scrubPeerStoreDialHints`
    // call empties the peer store and the next `dial(peerId)` (via libp2p's
    // connection manager) fails with "no valid addresses" — even though the
    // dial target was supplied as a `dialHint` on the call site.  Leaving the
    // peer store untouched when the filter empties is safer: the existing
    // addresses are still there, the dialer can resolve to them, and any
    // truly-stale snapshot addrs (the original reason for the scrub) are
    // harmless because `getConnections()` reuse short-circuits before the
    // peer store lookup.
    if (replacement.length === 0) {
      return [];
    }
    try {
      await this.requireNode().peerStore.patch(peerIdFromString(idStr), {
        multiaddrs: replacement.map((a) => ma(a)),
      });
    } catch {
      /* best-effort */
    }
    return replacement;
  }

  /**
   * Replace libp2p peer-store dial addrs with filtered direct multiaddrs (drops stale circuits + ephemeral inbound snapshots).
   */
  async mergePeerStoreDialHints(peerIdStr: string, addrs: readonly string[]): Promise<void> {
    const idStr = peerIdStr.trim();
    if (!idStr || idStr.startsWith("envoy_") || !this.node) {
      return;
    }
    const existingGood = await this.getPeerStoreDialHints(idStr);
    const merged = filterUsableOutboundPeerDialHints(
      [...existingGood, ...addrs.filter((a) => !a.includes("/p2p-circuit/"))],
      idStr,
    );
    if (merged.length === 0) {
      return;
    }
    try {
      await this.requireNode().peerStore.patch(peerIdFromString(idStr), {
        multiaddrs: merged.map((a) => ma(a)),
      });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Mark a bonded contact's libp2p dial id for persistent reachability (libp2p KEEP_ALIVE + reconnect-queue).
   * Call when bonds settle and after outbound chat so NAT/relay idle drops trigger automatic redials.
   */
  async tagContactForPersistentReachability(libp2pPeerId: string): Promise<void> {
    const idStr = libp2pPeerId.trim();
    if (!idStr || idStr.startsWith("envoy_")) return;
    await this.requireNode().peerStore.merge(peerIdFromString(idStr), {
      tags: { [CONTACT_KEEP_ALIVE_PEER_TAG]: { value: 100 } },
    });
  }

  /** Undo {@link tagContactForPersistentReachability} (bond revoked/blocked). */
  async untagContactForPersistentReachability(libp2pPeerId: string): Promise<void> {
    const idStr = libp2pPeerId.trim();
    if (!idStr || idStr.startsWith("envoy_")) return;
    await this.requireNode().peerStore.merge(peerIdFromString(idStr), {
      tags: { [CONTACT_KEEP_ALIVE_PEER_TAG]: undefined },
    });
  }

  /**
   * Mark a relay peer as persistently reachable (libp2p KEEP_ALIVE +
   * reconnect-queue). Use when the relay is observed providing a working
   * `/p2p-circuit/` reservation so the connection survives churn and
   * cross-NAT reachability remains stable.
   */
  async tagRelayForPersistentReachability(relayPeerId: string): Promise<void> {
    const idStr = relayPeerId.trim();
    if (!idStr || idStr.startsWith("envoy_")) return;
    await this.requireNode().peerStore.merge(peerIdFromString(idStr), {
      tags: { [RELAY_KEEP_ALIVE_PEER_TAG]: { value: 100 } },
    });
  }

  /** Undo {@link tagRelayForPersistentReachability}. */
  async untagRelayForPersistentReachability(relayPeerId: string): Promise<void> {
    const idStr = relayPeerId.trim();
    if (!idStr || idStr.startsWith("envoy_")) return;
    await this.requireNode().peerStore.merge(peerIdFromString(idStr), {
      tags: { [RELAY_KEEP_ALIVE_PEER_TAG]: undefined },
    });
  }

  /** Whether a relay peer is currently tagged for persistent reachability. */
  hasRelayKeepAliveTag(relayPeerId: string): boolean {
    const idStr = relayPeerId.trim();
    if (!idStr) return false;
    try {
      const peer = (this.requireNode().peerStore as unknown as { get: (id: unknown) => { tags?: Record<string, unknown> } }).get(
        peerIdFromString(idStr),
      );
      const tagNames = Object.keys(peer?.tags ?? {});
      return tagNames.includes(RELAY_KEEP_ALIVE_PEER_TAG);
    } catch {
      return false;
    }
  }

  /** Live libp2p connection-manager snapshot (open connections only). */
  getConnectionStats(): MeshConnectionStats {
    if (!this.node) {
      return {
        totalPeerIds: 0,
        totalConnections: 0,
        circuitPeerIds: [],
        circuitConnections: 0,
        connectedPeerIds: [],
      };
    }

    try {
      const node = this.node as Libp2p & {
        getConnections?: () => Array<{ status?: string; remoteAddr?: { toString?: () => string }; remotePeer?: { toString?: () => string } }>;
        getDialQueue?: () => unknown[];
      };
      const flat = node.getConnections?.();
      const stats =
        flat != null
          ? scanLibp2pConnectionsFlat(flat)
          : scanLibp2pConnectionsMap(
              (this.node as { connectionManager?: { getConnectionsMap?: () => Map<string, unknown[]> } })
                .connectionManager?.getConnectionsMap?.() as Map<string, { status?: string; remoteAddr?: { toString?: () => string }; remotePeer?: { toString?: () => string } }[]> | undefined,
            );
      const dialQueueLength = node.getDialQueue?.().length;
      if (dialQueueLength != null) {
        stats.dialQueueLength = dialQueueLength;
      }
      return stats;
    } catch {
      return {
        totalPeerIds: 0,
        totalConnections: 0,
        circuitPeerIds: [],
        circuitConnections: 0,
        connectedPeerIds: [],
      };
    }
  }

  /**
   * Returns peer IDs with at least one open `/p2p-circuit` connection (relay paths or relay-server clients).
   */
  getConnectedRelayPeerIds(): string[] {
    const result = this.getConnectionStats().circuitPeerIds;
    if (this.options.enableP2pDebug) {
      console.log(`[relay-tracked] getConnectedRelayPeerIds returning: ${JSON.stringify(result)}`);
    }
    return result;
  }

  /**
   * Returns true when the local circuit-relay-v2 client currently holds at
   * least one live reservation (preferred), or — when the live store cannot
   * be queried — when a reservation has ever succeeded this process.
   *
   * Prefer {@link hasLiveRelayReservation} / {@link getRelayReservationStatus}
   * when you need to distinguish "ever" vs "still live".
   */
  hasRelayReservation(): boolean {
    const live = this.hasLiveRelayReservation();
    if (live) return true;
    // If we can query the store and know which relays we reserved, a miss
    // means the slot is gone — do not trust the sticky flag.
    if (this.getClientHasReservationFn() && this.lastReservedRelayPeerIds.length > 0) {
      return false;
    }
    return this.relayEverReserved;
  }

  /**
   * True when a preferred/configured relay has a **usable** reservation:
   * libp2p's reservation store reports a live slot **and** there is an open
   * connection to that relay peer. The store flag alone can go stale after
   * TCP drop (evicted only at TTL), which previously made auto-bond / UI
   * report `liveReservation=true` while circuits were already dead.
   *
   * When {@link preferredRelayPeerIds} is set (configured EnvoyMesh relays),
   * only those peers count — unless `relayPeerIds` is passed explicitly.
   */
  hasLiveRelayReservation(relayPeerIds?: readonly string[]): boolean {
    return this.listUsableRelayPeerIds(relayPeerIds).length > 0;
  }

  /**
   * Preferred/configured relay peer IDs that the reservation store currently
   * marks as reserved (no open-connection cross-check). Prefer
   * {@link listUsableRelayPeerIds} for readiness / dial gating.
   */
  listLivePreferredRelayPeerIds(relayPeerIds?: readonly string[]): string[] {
    const hasReservation = this.getClientHasReservationFn();
    if (!hasReservation) return [];
    const candidates = this.resolveReservationCheckPeerIds(relayPeerIds);
    const live: string[] = [];
    const seen = new Set<string>();
    for (const id of candidates) {
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      try {
        if (hasReservation(peerIdFromString(trimmed))) live.push(trimmed);
      } catch {
        /* ignore invalid peer ids */
      }
    }
    return live;
  }

  /**
   * Relay peer IDs with both a store-live reservation and an open libp2p
   * connection. Used by reservation health, mesh readiness, and status UI.
   */
  listUsableRelayPeerIds(relayPeerIds?: readonly string[]): string[] {
    const reservedIds = this.listLivePreferredRelayPeerIds(relayPeerIds);
    if (reservedIds.length === 0) return [];
    const connectedIds = new Set(this.getConnectedPeerIds());
    return reservedIds.filter((id) => connectedIds.has(id));
  }

  /** Configured / preferred EnvoyMesh relay peer IDs (may be empty). */
  getPreferredRelayPeerIds(): string[] {
    return [...this.preferredRelayPeerIds];
  }

  /** True when every preferred/configured relay currently has a usable slot. */
  hasAllPreferredRelayReservations(relayPeerIds?: readonly string[]): boolean {
    const candidates = this.resolveReservationCheckPeerIds(relayPeerIds);
    if (candidates.length === 0) return this.hasLiveRelayReservation();
    return this.listUsableRelayPeerIds(candidates).length === candidates.length;
  }

  /**
   * Peer IDs to query in the reservation store.
   * Prefer explicit args → configured/preferred relays → any last-reserved.
   */
  private resolveReservationCheckPeerIds(relayPeerIds?: readonly string[]): string[] {
    if (relayPeerIds && relayPeerIds.length > 0) {
      return [...relayPeerIds];
    }
    if (this.preferredRelayPeerIds.length > 0) {
      return [...this.preferredRelayPeerIds];
    }
    return [...this.lastReservedRelayPeerIds];
  }

  /**
   * Operator / UI snapshot of circuit-relay reservation health.
   * `state` is the chip value: off | pending | reserved | failed.
   *
   * When configured EnvoyMesh relays are known, RESERVED means a live slot
   * on one of those peers — not an AutoRelay reservation on a random public hop.
   */
  getRelayReservationStatus(): RelayReservationStatus {
    const enableRelay = this.options.enableRelay === true || this.options.browserMode === true;
    const enableServer = this.options.enableRelayServer === true;
    const empty = (): RelayReservationStatus => ({
      state: "off",
      live: false,
      everReserved: false,
      relayPeerIds: [],
      liveRelayPeerIds: [],
      failureStreak: 0,
      checkedAt: new Date().toISOString(),
    });
    if (!enableRelay && !enableServer) {
      return empty();
    }
    // Relay servers hold *other* peers' reservations; this status is for
    // client-side inbound reachability via /p2p-circuit/.
    if (enableServer && !enableRelay) {
      return empty();
    }
    const checkIds = this.resolveReservationCheckPeerIds();
    // Status "RESERVED" means usable (store ∩ open connection), not a stale
    // store flag after the relay TCP session has already dropped.
    const liveRelayPeerIds = this.listUsableRelayPeerIds(checkIds);
    const live = liveRelayPeerIds.length > 0;
    const allLive =
      checkIds.length > 0 ? liveRelayPeerIds.length === checkIds.length : live;
    const relayPeerIds =
      this.preferredRelayPeerIds.length > 0
        ? [...this.preferredRelayPeerIds]
        : [...this.lastReservedRelayPeerIds];
    const everOnPreferred =
      this.preferredRelayPeerIds.length > 0
        ? this.preferredRelayPeerIds.some((id) => this.lastReservedRelayPeerIds.includes(id))
        : this.relayEverReserved;
    const partialHint =
      live && !allLive && relayPeerIds.length > 1
        ? `Partial reservation ${liveRelayPeerIds.length}/${relayPeerIds.length} configured relays — re-warming missing hops.`
        : undefined;
    if (live) {
      return {
        state: "reserved",
        live: true,
        everReserved: true,
        relayPeerIds,
        liveRelayPeerIds,
        lastReservedAt: this.lastReservedAt,
        lastError: partialHint,
        failureStreak: this.reservationFailureStreak,
        checkedAt: new Date().toISOString(),
      };
    }
    if (this.lastReservationError && !everOnPreferred) {
      return {
        state: "failed",
        live: false,
        everReserved: false,
        relayPeerIds,
        liveRelayPeerIds,
        lastError: this.lastReservationError,
        failureStreak: this.reservationFailureStreak,
        checkedAt: new Date().toISOString(),
      };
    }
    if (everOnPreferred && !live) {
      return {
        state: "failed",
        live: false,
        everReserved: true,
        relayPeerIds,
        liveRelayPeerIds,
        lastError:
          this.lastReservationError ??
          (this.preferredRelayPeerIds.length > 0
            ? "No live reservation on configured EnvoyMesh relay(s) — re-warming (AutoRelay public hops do not count)."
            : "Reservation was granted earlier but is no longer live in the local store — re-warming."),
        lastReservedAt: this.lastReservedAt,
        failureStreak: this.reservationFailureStreak,
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      state: "pending",
      live: false,
      everReserved: everOnPreferred,
      relayPeerIds,
      liveRelayPeerIds,
      lastError: this.lastReservationError,
      failureStreak: this.reservationFailureStreak,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Periodically re-check live reservation and re-run
   * eagerConnect + requestRelayReservation when any configured hop is missing.
   * Also re-warms shortly after a configured relay peer disconnects.
   *
   * Uses an adaptive interval: faster while pending/partial/failed; slower
   * only when *all* preferred relays hold a live slot.
   */
  /**
   * Compute the next re-warm delay when the reservation health loop has been
   * failing. Returns `lostMs` while failures are below the threshold (no
   * backoff yet); returns exponentially-stretched delays (lostMs × 2^exp,
   * capped at maxMs) once failures exceed the threshold.
   *
   * Exported pure so the backoff math is unit-testable without spinning up a
   * real libp2p node + dead relay (which needs ~30s × N cycles).
   * See docs/connectivity-internals-and-design.md Part VIII (M1).
   */
  startRelayReservationHealthLoop(
    relayMultiaddrs: readonly string[],
    options?: {
      intervalMs?: number;
      pendingIntervalMs?: number;
      lostIntervalMs?: number;
      /** Consecutive failed re-warms before exponential backoff kicks in. Default 4. */
      sustainedFailureBackoffThreshold?: number;
      /** Max delay between re-warms during sustained failure. Default 5 min. */
      sustainedFailureBackoffMaxMs?: number;
    },
  ): () => void {
    this.stopRelayReservationHealthLoop();
    const addrs = [...new Set(relayMultiaddrs.map((a) => a.trim()).filter(Boolean))];
    this.reservationHealthRelayAddrs = addrs;
    if (addrs.length === 0) {
      this.preferredRelayPeerIds = [];
      return () => undefined;
    }
    const healthyMs = options?.intervalMs ?? 5 * 60_000;
    const pendingMs = options?.pendingIntervalMs ?? 45_000;
    const lostMs = options?.lostIntervalMs ?? 15_000;
    // Backoff knobs (test-configurable; see M1 E2E test).
    const sustainedFailureBackoffThreshold = options?.sustainedFailureBackoffThreshold ?? 4;
    const sustainedFailureBackoffMaxMs = options?.sustainedFailureBackoffMaxMs ?? 5 * 60_000;
    const generation = ++this.reservationHealthGeneration;
    const relayPeerIds = addrs
      .map((a) => {
        const m = a.match(/\/p2p\/([^/]+)$/);
        return m?.[1];
      })
      .filter((id): id is string => Boolean(id));
    this.preferredRelayPeerIds = [...relayPeerIds];

    const missingRelayAddrs = (): string[] => {
      const liveIds = new Set(this.listUsableRelayPeerIds(relayPeerIds));
      if (liveIds.size === relayPeerIds.length) return [];
      return addrs.filter((a) => {
        const m = a.match(/\/p2p\/([^/]+)$/);
        const id = m?.[1];
        return Boolean(id) && !liveIds.has(id!);
      });
    };

    // Track consecutive failed re-warm cycles so we can back off when a relay
    // stays down. Without this the loop re-warms every `lostMs` (15s) forever —
    // each attempt a 30s dial that fails. After ~1 minute of sustained failure
    // we stretch the cadence exponentially (capped) to stop hammering a dead
    // relay. Reset to 0 immediately on any successful reservation.
    // See docs/connectivity-internals-and-design.md Part VIII (M1).
    let consecutiveReWarmFailures = 0;

    const tick = async (reason: string): Promise<void> => {
      if (this.reservationHealthRunning || !this.node) return;
      const missing = missingRelayAddrs();
      if (missing.length === 0) {
        consecutiveReWarmFailures = 0;
        this.reservationFailureStreak = 0;
        return;
      }
      this.reservationHealthRunning = true;
      try {
        console.log(
          `[p2p] relay reservation health (${reason}): missing ${missing.length}/${addrs.length} preferred hop(s) — re-warming`,
        );
        await this.eagerConnectToRelays(missing, { timeoutMs: 30_000 });
        const resv = await this.requestRelayReservation(missing);
        console.log(
          `[p2p] relay reservation health (${reason}): reserved=${resv.reserved} failed=${resv.failed}` +
            (resv.failures.length > 0 ? ` failures=${JSON.stringify(resv.failures)}` : ""),
        );
        const usable = this.listUsableRelayPeerIds(relayPeerIds);
        if (resv.failed > 0 && resv.reserved === 0 && usable.length === 0) {
          this.lastReservationError = resv.failures[0] ?? "reservation health re-warm failed";
          consecutiveReWarmFailures += 1;
          this.reservationFailureStreak = consecutiveReWarmFailures;
        } else if (usable.length === relayPeerIds.length) {
          this.lastReservationError = undefined;
          consecutiveReWarmFailures = 0;
          this.reservationFailureStreak = 0;
        } else {
          // Partial recovery — don't increment, but don't reset either.
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.lastReservationError = msg;
        consecutiveReWarmFailures += 1;
        this.reservationFailureStreak = consecutiveReWarmFailures;
        console.warn(`[p2p] relay reservation health (${reason}) threw: ${msg}`);
      } finally {
        this.reservationHealthRunning = false;
      }
    };

    const scheduleNext = (): void => {
      if (this.reservationHealthGeneration !== generation) return;
      // Connection-aware: stale store-only "reserved" must not pin us to the
      // slow healthyMs cadence (would delay re-warm by up to 5 minutes).
      const liveCount = this.listUsableRelayPeerIds(relayPeerIds).length;
      const allLive = liveCount === relayPeerIds.length;
      const anyLive = liveCount > 0;
      let delay = pendingMs;
      if (allLive) {
        delay = healthyMs;
        consecutiveReWarmFailures = 0;
      } else if (anyLive) {
        // Partial multi-home or stale slot: keep trying on the pending cadence.
        delay = pendingMs;
      } else {
        // Zero live reservations — either lost after having them, OR never
        // reserved (cold start against a dead relay). Use lostMs + exponential
        // backoff so we don't hammer forever in either case.
        const backed = computeReservationBackoffDelay({
          consecutiveReWarmFailures,
          threshold: sustainedFailureBackoffThreshold,
          lostMs,
          maxMs: sustainedFailureBackoffMaxMs,
        });
        delay = backed;
        if (backed !== lostMs) {
          console.log(
            `[p2p] relay reservation health: backing off (sustained failure ${consecutiveReWarmFailures} cycles) — next re-warm in ${Math.round(delay / 1000)}s`,
          );
        }
      }
      this.reservationHealthTimer = setTimeout(() => {
        void tick("adaptive").finally(() => {
          scheduleNext();
        });
      }, delay);
    };

    // Caller is expected to warm first; this loop only recovers after
    // expiry / relay restart / disconnect / partial multi-home gaps.
    scheduleNext();

    this.reservationHealthDisconnectUnsub = this.onPeerDisconnect((peerId) => {
      if (!relayPeerIds.includes(peerId)) return;
      // Debounce: wait a few seconds for reconnect, then re-reserve if still missing.
      const disconnectGeneration = this.reservationHealthGeneration;
      setTimeout(() => {
        if (this.reservationHealthGeneration !== disconnectGeneration) return;
        void tick(`disconnect:${peerId.slice(0, 12)}`);
      }, 5_000);
    });

    return () => this.stopRelayReservationHealthLoop();
  }

  stopRelayReservationHealthLoop(): void {
    this.reservationHealthGeneration++;
    if (this.reservationHealthTimer) {
      clearTimeout(this.reservationHealthTimer);
      this.reservationHealthTimer = undefined;
    }
    if (this.reservationHealthDisconnectUnsub) {
      this.reservationHealthDisconnectUnsub();
      this.reservationHealthDisconnectUnsub = undefined;
    }
    this.reservationHealthRelayAddrs = [];
    this.preferredRelayPeerIds = [];
  }

  /** Open libp2p remote peer ids from the connection manager (direct + relay). */
  getConnectedPeerIds(): string[] {
    return this.getConnectionStats().connectedPeerIds;
  }

  /**
   * Locate the circuit-relay-v2 client reservationStore.hasReservation binder.
   */
  private getClientHasReservationFn():
    | ((peerId: ReturnType<typeof peerIdFromString>) => boolean)
    | undefined {
    const node = this.node;
    if (!node) return undefined;
    const transportManager = (node as { components?: { transportManager?: { getTransports?: () => unknown[] } } })
      .components?.transportManager;
    const allTransports = transportManager?.getTransports?.() ?? [];
    for (const t of allTransports as Array<{
      reservationStore?: {
        hasReservation?: (peerId: ReturnType<typeof peerIdFromString>) => boolean;
      };
      [Symbol.toStringTag]?: string;
    }>) {
      if (t[Symbol.toStringTag] === "@libp2p/circuit-relay-v2-transport") {
        if (t.reservationStore?.hasReservation) {
          return t.reservationStore.hasReservation.bind(t.reservationStore);
        }
        break;
      }
    }
    return undefined;
  }

  /**
   * Returns the `circuitRelayServer` config that was passed to this mesh.
   * Operators use this to expose the active v2 server limits on
   * `/version`-style HTTP endpoints without re-deriving them from
   * environment variables. Returns `undefined` when the mesh is in
   * client-only mode (no `enableRelayServer`).
   */
  getCircuitRelayServerConfig(): CircuitRelayServerConfig | undefined {
    return this.circuitRelayServerConfig;
  }

  /**
   * Returns the current number of active circuit-relay-v2 reservations on
   * this node, when running as a relay server. Returns 0 when the mesh is
   * not acting as a relay server, when `start()` has not run, or when
   * libp2p has not yet registered the relay service.
   *
   * Useful for /health and /reservations endpoints so operators can see
   * "is the reservation store filling up?" in real time.
   */
  getCircuitRelayReservationCount(): number {
    const node = this.node;
    if (!node || !this.options.enableRelayServer) return 0;
    const services = node.services as Record<string, unknown> | undefined;
    const relay = services?.relay as { reservations?: { size?: number } } | undefined;
    const size = relay?.reservations?.size;
    return typeof size === "number" ? size : 0;
  }

  /**
   * Snapshot the live circuit-relay-v2 reservation store. Each entry
   * corresponds to a peer that has an active RESERVE on this node.
   *
   * Operators use this to answer "who actually has a reservation on my
   * relay?" without scraping libp2p internals — useful when an
   * /p2p-circuit/ dial keeps failing and we need to know whether the
   * target has a reservation, has expired, or never made one. The
   * returned shape is stable across libp2p versions: `peerId`,
   * `addr` (the multiaddr they registered with, useful for spotting
   * stale LAN / outdated listen addrs), `expireAt` (ms epoch), and
   * `limit` (data/duration limits the relay applied).
   *
   * Returns `[]` when the mesh is not acting as a relay server, when
   * `start()` has not run, or when libp2p has not yet registered the
   * relay service.
   */
  inspectCircuitRelayReservations(): Array<{
    peerId: string;
    addr?: string;
    expireAt: number;
    limit?: { data?: number; duration?: number };
  }> {
    const node = this.node;
    if (!node || !this.options.enableRelayServer) return [];
    const services = node.services as Record<string, unknown> | undefined;
    const relay = services?.relay as
      | {
          reservationStore?: {
            reservations?: {
              entries?: () => IterableIterator<[unknown, { addr?: { toString?: () => string }; expiry?: Date; limit?: { data?: number; duration?: number } }]>;
            };
          };
        }
      | undefined;
    const reservations = relay?.reservationStore?.reservations;
    if (!reservations?.entries) return [];
    const out: Array<{
      peerId: string;
      addr?: string;
      expireAt: number;
      limit?: { data?: number; duration?: number };
    }> = [];
    try {
      for (const [peerId, reservation] of reservations.entries()) {
        let peerIdStr = "";
        try {
          peerIdStr = (peerId as { toString?: () => string })?.toString?.() ?? String(peerId);
        } catch {
          peerIdStr = String(peerId);
        }
        const addrStr = reservation?.addr?.toString?.();
        const expireAt = reservation?.expiry instanceof Date
          ? reservation.expiry.getTime()
          : (typeof reservation?.expiry === "number" ? reservation.expiry : 0);
        const limit = reservation?.limit
          ? {
              ...(typeof reservation.limit.data === "number" ? { data: reservation.limit.data } : {}),
              ...(typeof reservation.limit.duration === "number" ? { duration: reservation.limit.duration } : {}),
            }
          : undefined;
        const entry: { peerId: string; addr?: string; expireAt: number; limit?: { data?: number; duration?: number } } = {
          peerId: peerIdStr,
          expireAt,
        };
        if (addrStr !== undefined) entry.addr = addrStr;
        if (limit) entry.limit = limit;
        out.push(entry);
      }
    } catch {
      // reservations Map API may change; swallow and return what we got
    }
    return out;
  }

  /**
   * Eagerly dial the supplied relay multiaddrs in parallel so this node
   * establishes DIRECT connections to each relay hop as early as possible.
   *
   * Why this exists: libp2p's circuit-relay-v2 client is lazy — it only
   * reserves a slot on a relay when an outbound `/p2p-circuit/` dial is
   * attempted. For a fresh-install sponsor-hello flow the first circuit
   * dial burns the round-trip cost of the reservation AND the relay
   * lookup in one shot, racing the bond.request timeout. Pre-dialing the
   * relay means the reservation is already in place when the sponsor
   * hello fires, so the dial hits a warm circuit.
   *
   * Each dial is best-effort: a single failure does not abort the rest.
   * Returns a summary so callers (startup log, RPC, /health) can show
   * "relays reached: 1/2" without re-deriving from the connection manager.
   *
   * Safe to call before `start()` completes — dials queue on libp2p's
   * connection manager. Safe to call multiple times — libp2p dedupes
   * pending dials to the same peer.
   */
  async eagerConnectToRelays(
    relayMultiaddrs: readonly string[],
    options: { timeoutMs?: number } = {},
  ): Promise<{ attempted: number; connected: number; failed: number; failures: string[] }> {
    const node = this.node;
    if (!node) {
      return { attempted: 0, connected: 0, failed: 0, failures: ["mesh-not-started"] };
    }
    const timeoutMs = options.timeoutMs ?? 10_000;
    const failures: string[] = [];
    let connected = 0;
    let failed = 0;
    const results = await Promise.allSettled(
      relayMultiaddrs.map(async (addr) => {
        // Dial with a tight per-relay timeout — the goal is to confirm
        // reachability, not to maintain the connection (libp2p's
        // connection manager handles the long-term keepalive).
        const c = await Promise.race([
          node.dial(ma(addr)),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("relay-dial-timeout")), timeoutMs),
          ),
        ]);
        return { addr, ok: true as const, conn: c };
      }),
    );
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i];
      const addr = relayMultiaddrs[i];
      if (r.status === "fulfilled") {
        connected += 1;
        if (this.options.enableP2pDebug) {
          console.log(`[p2p] eager relay dial OK: ${addr}`);
        }
      } else {
        failed += 1;
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        failures.push(`${addr}: ${reason}`);
        if (this.options.enableP2pDebug) {
          console.warn(`[p2p] eager relay dial FAILED: ${addr} (${reason})`);
        }
      }
    }
    return { attempted: relayMultiaddrs.length, connected, failed, failures };
  }

  /**
   * Force a circuit-relay-v2 reservation on each of the supplied relay multiaddrs.
   *
   * Why this exists: libp2p's circuit-relay-v2 client is lazy — it only creates
   * a reservation on a connected relay when it perceives an outbound /p2p-circuit/
   * dial *need* (see `@libp2p/circuit-relay-v2` reservation-store.js line ~158:
   * `if (type === 'discovered' && pendingReservations.length === 0) throw HadEnoughRelaysError`).
   * That breaks hub / "always-reachable" nodes that just sit there and wait for
   * inbound traffic — their reservation expires after the TTL and never renews,
   * so peers trying to dial them via /p2p-circuit/ get "NO_RESERVATION" from
   * the relay and the stream is closed.
   *
   * Workaround: bypass the "no need" gate by calling
   * `reservationStore.addRelay(peerId, 'configured')` directly. The `'configured'`
   * type is the manual path that libp2p itself uses for statically-configured
   * relays and skips the pendingReservations check. libp2p's own refresh timer
   * (set in reservation-store.js after the reservation is created) keeps it
   * alive as long as the relay connection is up.
   *
   * The relay connection itself is established by `eagerConnectToRelays`; this
   * method only requests the reservation. Call both in sequence on startup
   * when the node needs to be inbound-reachable via relay.
   *
   * @param relayMultiaddrs full multiaddrs with a /p2p/<relayPeerId> tail
   * @returns per-relay outcome
   */
  async requestRelayReservation(
    relayMultiaddrs: readonly string[],
  ): Promise<{
    attempted: number;
    reserved: number;
    failed: number;
    skipped: number;
    skipReasons: string[];
    failures: string[];
  }> {
    const node = this.node;
    if (!node) {
      return { attempted: 0, reserved: 0, failed: 0, skipped: 0, skipReasons: [], failures: ["mesh-not-started"] };
    }
    // libp2p registers circuit relay transport as a generic `transport-N` via
    // transportManager; there's no `services['@libp2p/...']` entry. Walk the
    // transport list and pick the one whose [Symbol.toStringTag] is
    // '@libp2p/circuit-relay-v2-transport'. `.bind(reservationStore)` is
    // required: extracting the method as a free variable and then calling
    // it loses `this`, so `this.peerId.equals(peerId)` at
    // @libp2p/circuit-relay-v2/src/transport/reservation-store.ts:194 throws
    // "Cannot read properties of undefined (reading 'peerId')".
    const transportManager = (node as { components?: { transportManager?: { getTransports?: () => unknown[] } } })
      .components?.transportManager;
    const allTransports = transportManager?.getTransports?.() ?? [];
    let addRelay: ((peerId: unknown, type: string) => Promise<unknown>) | undefined;
    let hasReservation:
      | ((peerId: ReturnType<typeof peerIdFromString>) => boolean)
      | undefined;
    for (const t of allTransports as Array<{
      reservationStore?: {
        addRelay?: (peerId: unknown, type: string) => Promise<unknown>;
        hasReservation?: (peerId: ReturnType<typeof peerIdFromString>) => boolean;
      };
      [Symbol.toStringTag]?: string;
    }>) {
      if (t[Symbol.toStringTag] === "@libp2p/circuit-relay-v2-transport") {
        if (t.reservationStore?.addRelay) {
          addRelay = t.reservationStore.addRelay.bind(t.reservationStore);
        }
        if (t.reservationStore?.hasReservation) {
          hasReservation = t.reservationStore.hasReservation.bind(t.reservationStore);
        }
        break;
      }
    }
    if (!addRelay) {
      return {
        attempted: relayMultiaddrs.length,
        reserved: 0,
        failed: relayMultiaddrs.length,
        skipped: 0,
        skipReasons: [],
        failures: ["circuit-relay-v2 transport not registered (enableRelay: false?)"],
      };
    }
    const failures: string[] = [];
    let reserved = 0;
    let failed = 0;
    let skipped = 0;
    const skipReasons: string[] = [];
    // How many times to retry an `addRelay` whose reservation did not
    // actually land on the relay. The libp2p `addRelay` can return success
    // before the RESERVE round-trip completes — without retry+verify the
    // client/server state desync leaves the peer looking "reserved" to
    // the local node but unreachable to anyone dialing it via the relay.
    const RESERVATION_VERIFY_ATTEMPTS = 3;
    // How long to wait after addRelay resolves before checking
    // `hasReservation`. The relay processes RESERVE in <100ms in
    // practice; 1s gives a healthy margin without slowing the warmup
    // noticeably.
    const RESERVATION_VERIFY_SETTLE_MS = 1_000;
    // Backoff between verify-retry attempts.
    const RESERVATION_VERIFY_BACKOFF_MS = 2_000;
    // Serialize addRelay across relays. Concurrent RESERVE against two
    // distinct circuit-relay-v2 servers deadlocks in @libp2p/circuit-relay-v2
    // (Promise.allSettled never settles). Sequential multi-home still
    // completes in ~1s per hop and matches Phase 46 multi-relay warmup.
    const results: Array<
      | { status: "fulfilled"; value: { addr: string; ok: boolean; skipped?: boolean; attempts?: number } }
      | { status: "rejected"; reason: unknown }
    > = [];
    for (const addr of relayMultiaddrs) {
      try {
        let parsed: ReturnType<typeof ma>;
        try {
          parsed = ma(addr);
        } catch (err) {
          throw new Error(`invalid multiaddr ${addr}: ${(err as Error).message}`);
        }
        // Only attempt reservation on direct-to-relay multiaddrs. Skip:
        //   - /p2p-circuit/... (target circuit dials, not relay hops)
        //   - bare peer IDs (no transport, no relay to dial)
        // Both shapes would otherwise throw an obscure
        // "Cannot read properties of undefined (reading 'peerId')" deep
        // inside libp2p's addRelay → openConnection.
        if (addr.includes("/p2p-circuit/")) {
          skipped += 1;
          skipReasons.push(`${addr}: contains /p2p-circuit/ (target dial, not a relay)`);
          results.push({ status: "fulfilled", value: { addr, ok: false, skipped: true } });
          continue;
        }
        const p2pComponent = parsed.getComponents().find((c) => c.code === 421);
        const peerIdStr = p2pComponent?.value as string | undefined;
        if (!peerIdStr) {
          skipped += 1;
          skipReasons.push(`${addr}: no /p2p/<relay> tail`);
          results.push({ status: "fulfilled", value: { addr, ok: false, skipped: true } });
          continue;
        }
        const pid = peerIdFromString(peerIdStr);
        // 'configured' bypasses the lazy "no need" gate; libp2p will open the
        // connection if needed and start the refresh timer.
        //
        // Wrap each attempt in verify-then-retry: after addRelay resolves,
        // check the local reservation store. If the reservation is missing
        // (client/server state desync — observed on community relay
        // 47.93.11.212 where the relay log shows CONNECTs but no
        // corresponding RESERVE), retry with backoff. Without this, a
        // "successful" warmup left the peer with `relayRoster=0` and all
        // downstream /p2p-circuit/ dials fail with NO_RESERVATION.
        let settled:
          | { addr: string; ok: true; attempts: number }
          | undefined;
        for (let attempt = 1; attempt <= RESERVATION_VERIFY_ATTEMPTS; attempt += 1) {
          try {
            await addRelay(pid, "configured");
          } catch (relayErr) {
            const err = relayErr as Error & { code?: string; stack?: string };
            // Log the full stack to the operator's console so we can see the
            // path through libp2p internals (most "Cannot read properties of
            // undefined (reading 'peerId')" errors come from a place we
            // don't control). Also re-throw so the summary failures array
            // captures the message.
            console.error(
              `[p2p] relay reservation addRelay FAILED for ${pid.toString()}:\n${err.stack ?? err.message}`,
            );
            const wrapped = new Error(
              `addRelay(${pid.toString()}, configured) failed: ${err.message}` +
                (err.code ? ` [code=${err.code}]` : ""),
            );
            throw wrapped;
          }
          // Verification step: did the reservation actually land? If
          // `hasReservation` is missing (older libp2p) skip the check and
          // trust addRelay's return value.
          if (hasReservation) {
            await new Promise((r) => setTimeout(r, RESERVATION_VERIFY_SETTLE_MS));
            if (hasReservation(pid)) {
              if (this.options.enableP2pDebug && attempt > 1) {
                console.log(
                  `[p2p] relay reservation verified for ${pid.toString()} on attempt ${attempt}/${RESERVATION_VERIFY_ATTEMPTS}`,
                );
              }
              settled = { addr, ok: true, attempts: attempt };
              break;
            }
            // addRelay returned but reservation isn't in the local store.
            // Most likely the hop stream was closed mid-handshake (relay
            // log shows the smoking gun: relay's `handleConnect` returns
            // "Cannot write to a stream that is closed"). Retry with
            // backoff so the next attempt gets a fresh hop stream.
            if (attempt < RESERVATION_VERIFY_ATTEMPTS) {
              if (this.options.enableP2pDebug) {
                console.warn(
                  `[p2p] relay reservation addRelay returned but local store empty for ${pid.toString()}, attempt ${attempt}/${RESERVATION_VERIFY_ATTEMPTS} — retrying in ${RESERVATION_VERIFY_BACKOFF_MS}ms`,
                );
              }
              await new Promise((r) => setTimeout(r, RESERVATION_VERIFY_BACKOFF_MS));
              continue;
            }
            throw new Error(
              `addRelay(${pid.toString()}, configured) returned but reservation did not land after ${RESERVATION_VERIFY_ATTEMPTS} attempts (client/server state desync)`,
            );
          }
          settled = { addr, ok: true, attempts: 1 };
          break;
        }
        if (!settled) {
          throw new Error(`addRelay(${pid.toString()}, configured): exhausted retries without throwing`);
        }
        results.push({ status: "fulfilled", value: settled });
      } catch (reason) {
        results.push({ status: "rejected", reason });
      }
    }
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i];
      const addr = relayMultiaddrs[i];
      if (r.status === "fulfilled") {
        if (r.value?.skipped) {
          // already counted in skipped + skipReasons above
        } else {
          reserved += 1;
          const m = addr.match(/\/p2p\/([^/]+)$/);
          const relayId = m?.[1];
          if (relayId && !this.lastReservedRelayPeerIds.includes(relayId)) {
            this.lastReservedRelayPeerIds.push(relayId);
          }
          this.relayEverReserved = true;
          this.lastReservedAt = new Date().toISOString();
          this.lastReservationError = undefined;
          if (this.options.enableP2pDebug) {
            console.log(`[p2p] relay reservation requested: ${addr}`);
          }
        }
      } else {
        failed += 1;
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        failures.push(`${addr}: ${reason}`);
        this.lastReservationError = reason;
        if (this.options.enableP2pDebug) {
          console.warn(`[p2p] relay reservation FAILED: ${addr} (${reason})`);
        }
      }
    }
    if (this.options.enableP2pDebug && skipped > 0) {
      console.log(
        `[p2p] relay reservation skipped ${skipped} non-relay address(es): ${JSON.stringify(skipReasons)}`,
      );
    }
    return { attempted: relayMultiaddrs.length, reserved, failed, skipped, skipReasons, failures };
  }

  /**
   * Returns connection info for a specific peer.
   * @param peerId Libp2p peer ID (e.g., 12D3KooW...)
   * @returns Connection info: connected status, whether connection is direct P2P or relayed
   */
  getPeerConnectionInfo(peerId: string): { connected: boolean; direct: boolean; relayPeerId?: string } {
    if (!this.node) {
      return { connected: false, direct: false };
    }

    try {
      const node = this.node as Libp2p & {
        getConnections?: (peerId?: ReturnType<typeof peerIdFromString>) => Array<{
          status?: string;
          remoteAddr?: { toString?: () => string };
        }>;
      };
      const pid = peerIdFromString(peerId);
      const conns = node.getConnections?.(pid) ?? [];
      if (conns.length === 0) {
        return { connected: false, direct: false };
      }

      const openConns = conns.filter((c) => c?.status === "open" || c?.status === undefined);
      if (openConns.length === 0) {
        return { connected: false, direct: false };
      }

      // Check if any connection is direct (not via p2p-circuit)
      const directConn = openConns.find(
        (c) => !(c?.remoteAddr?.toString?.() ?? "").includes("/p2p-circuit"),
      );

      if (directConn) {
        return { connected: true, direct: true };
      }

      // Relay connection - extract relay peer ID from address
      const relayConn = openConns[0];
      const remoteAddr = relayConn?.remoteAddr?.toString?.() ?? "";
      // Address format: /ip4/x.x.x.x/tcp/port/p2p-circuit/p2p/<relayPeerId>/p2p/<targetPeerId>
      const relayMatch = remoteAddr.match(/p2p-circuit\/p2p\/([^/]+)\/p2p\//);
      const relayPeerId = relayMatch?.[1];

      return { connected: true, direct: false, relayPeerId };
    } catch {
      return { connected: false, direct: false };
    }
  }

  /**
   * Lightweight libp2p ping on an existing direct connection (no protocol stream open).
   */
  async pingDirectPeer(peerIdStr: string): Promise<boolean> {
    const before = this.getPeerConnectionInfo(peerIdStr);
    if (!before.connected || !before.direct || !this.node) {
      return false;
    }
    const node = this.node as Libp2p & {
      services?: { ping?: { ping: (peer: ReturnType<typeof peerIdFromString>) => Promise<number> } };
    };
    if (!node.services?.ping) {
      return false;
    }
    try {
      await node.services.ping.ping(peerIdFromString(peerIdStr));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify an existing libp2p path is still usable (NAT idle / half-open TCP).
   * Does not redial when the probe succeeds; closes stale connections when it fails.
   */
  async probeBondedPeerConnection(peerIdStr: string): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }> {
    const before = this.getPeerConnectionInfo(peerIdStr);
    if (!before.connected || !this.node) {
      return before;
    }

    if (before.direct && (await this.pingDirectPeer(peerIdStr))) {
      return before;
    }

    const node = this.node as Libp2p & {
      getConnections?: (peerId?: ReturnType<typeof peerIdFromString>) => Array<{
        status?: string;
        remoteAddr?: { toString?: () => string };
        newStream: (protocols: string | string[], opts?: { runOnLimitedConnection?: boolean }) => Promise<unknown>;
        remotePeer: { toString(): string };
        close?: () => Promise<void>;
      }>;
    };
    const pid = peerIdFromString(peerIdStr);
    const conns = (node.getConnections?.(pid) ?? []).filter(
      (c) => c?.status === "open" || c?.status === undefined,
    );
    for (const conn of conns) {
      const isLimited = (conn.remoteAddr?.toString?.() ?? "").includes("/p2p-circuit");
      const opened = await this.openStreamOnConnection(
        conn,
        ENVOY_CHAT_PROTOCOL,
        isLimited,
        streamReuseTimeoutMs(ENVOY_CHAT_PROTOCOL),
      );
      if (opened) {
        try {
          await (opened.stream as { close?: () => Promise<void> }).close?.();
        } catch {
          /* ignore */
        }
        const remoteAddr = conn.remoteAddr?.toString?.() ?? "";
        return connectionInfoFromRemoteAddr(remoteAddr);
      }
    }

    await this.closeConnectionsToPeer(peerIdStr);
    return { connected: false, direct: false };
  }

  /**
   * Derives the libp2p provider CID for a capability topic (same mapping as {@link provideCapabilityTopic}).
   */
  async capabilityTopicCid(topic: string): Promise<CID> {
    return cidForCapabilityTopic(topic);
  }

  /**
   * Announce this node's own peer ID and addresses on the DHT so other peers
   * can discover it via findPeer(). This is essential for DHT server mode to work
   * for peer discovery.
   *
   * Without this, peers connecting to the same DHT bootstrap peers cannot find
   * this node via findPeer() even if both are connected to the same network.
   *
   * This announces the node's own peer ID as a "provider" of itself, allowing
   * other peers to look it up by peer ID.
   *
   * Requires DHT to be enabled (enableDht: true).
   */
  /**
   * Inject a publicly dialable address discovered at runtime (e.g. via STUN or relay
   * observed addr). The address is added to `_appendAnnounce` so it is included in
   * circuit relay bases and is advertised to the DHT on the next `provideSelf()` call.
   *
   * @param multiaddr  A multiaddr string, e.g. `/ip4/1.2.3.4/tcp/4001`
   */
  setAdvertisedAddress(multiaddr: string): void {
    const s = multiaddr.trim();
    if (!s) return;
    try {
      ma(s); // validate
      if (!this._appendAnnounce.includes(s)) {
        this._appendAnnounce.push(s);
        console.log(`[p2p] setAdvertisedAddress: added ${s}`);
      }
    } catch (err) {
      console.warn(`[p2p] setAdvertisedAddress: invalid multiaddr: ${multiaddr}`);
    }
  }

  /** Subscribe to autoNAT reachability events. Calls `onReachable` when the node
   *  becomes reachable from the public internet, with the observed address. */
  onAutoNATReachable(handler: (addr: string) => void): () => void {
    const node = this.node;
    if (!node) return () => {};
    // self:reachable is not in libp2p's typed events — use untyped handler.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlerFn = (evt: any) => {
      const addr = evt?.detail?.addr?.toString?.();
      if (addr) handler(addr);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node as any).addEventListener("self:reachable", handlerFn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (node as any).removeEventListener("self:reachable", handlerFn);
  }

  /**
   * Announce this node's peer ID + addresses into the DHT so other peers can
   * `findPeer` it. Best-effort: returns a status object so callers can log
   * accurately. Previously logged "SUCCESS" even when the broadcast put
   * timed out because no DHT peers were reachable, which hid real outages.
   */

  /**
   * Number of peers currently in the KadDHT routing table, or -1 when the DHT
   * is disabled / not yet started / the table cannot be introspected.
   *
   * Used by the capability-discovery cycle to short-circuit topic provides
   * when the routing table is empty — every `provideCapabilityTopic` would
   * otherwise time out independently (~30s × N topics) for the same root
   * cause. The relay.checkin mirror carries the topics cross-NAT regardless,
   * so skipping the DHT provide loses nothing. See
   * `docs/connectivity-internals-and-design.md` Solution B1.
   */
  getRoutingTableSize(): number {
    if (!this.options.enableDht || !this.node) return -1;
    try {
      const dht = (this.node.services as any)?.dht ?? (this.node as any).dht;
      // Preferred path: KadDHT's RoutingTable.size getter (kb.count()).
      if (typeof dht?.routingTable?.size === "number") {
        return dht.routingTable.size;
      }
      // Fallback for older KadDHT shapes: sum bucket peer counts.
      const buckets = dht?.routingTable?.buckets;
      if (Array.isArray(buckets)) {
        let n = 0;
        for (const bucket of buckets) n += bucket?.peers?.size ?? 0;
        return n;
      }
      // Alternative kbucket shape.
      if (Array.isArray(dht?.kbucket)) return dht.kbucket.length;
      return -1;
    } catch {
      return -1;
    }
  }

  async provideSelf(): Promise<{ advertised: number; timedOut: boolean }> {
    console.log("[p2p] provideSelf: starting...");
    if (!this.options.enableDht) {
      console.warn("[p2p] provideSelf: DHT not enabled, skipping self-advertisement");
      return { advertised: 0, timedOut: false };
    }
    const node = this.requireNode();
    const selfPeerId = node.peerId.toString();
    const addrs = node.getMultiaddrs();
    console.log(`[p2p] provideSelf: peerId=${selfPeerId.slice(0, 12)}…, addrs count=${addrs?.length ?? 0}`);

    // Log DHT routing table size — if the table is empty, DHT puts will
    // time out because there are no peers to replicate to. This helps
    // operators distinguish "empty table → expected timeout" from "populated
    // table → unexpected timeout" (a real network problem).
    const routingTableSize = this.getRoutingTableSize();
    if (routingTableSize >= 0) {
      console.log(`[p2p] provideSelf: DHT routing table: ${routingTableSize} peers`);
    }

    try {
      // Collect publicly dialable addresses:
      // 1. Non-private listen addrs (direct interfaces)
      // 2. _appendAnnounce (addresses discovered at runtime via STUN/relay)
      const allPublicAddrs: string[] = [];

      // Filter listen addrs — keep non-private, keep circuit-relay
      if (addrs && addrs.length > 0) {
        const publicListenAddrs = addrs.filter((ma) => {
          const s = ma.toString();
          if (!isPrivateOrUnroutableDialHint(s)) return true;
          console.log(`[p2p] provideSelf: filtered out private/unroutable addr: ${s}`);
          return false;
        });
        allPublicAddrs.push(...publicListenAddrs.map((ma) => ma.toString()));
      }

      // Add runtime-discovered addresses (STUN / relay observed / autoNAT)
      allPublicAddrs.push(...this._appendAnnounce);

      // Deduplicate + drop AutoRelay circuits outside configured relays
      const uniqueAddrs = [
        ...new Set(
          filterMultiaddrsToPreferredRelays(allPublicAddrs, this.preferredRelayPeerIds),
        ),
      ];

      if (uniqueAddrs.length === 0) {
        console.warn(`[p2p] provideSelf: no publicly dialable addresses to advertise`);
        return { advertised: 0, timedOut: false };
      }

      const key = fromString(selfPeerId);
      const info = { id: selfPeerId, addrs: uniqueAddrs };
      const value = new TextEncoder().encode(JSON.stringify(info));

      // Advertise via contentRouting.put — this broadcasts to k-closest peers.
      // Race against a hard timeout so a stuck DHT (zero reachable peers,
      // bootstrap still in progress) doesn't block this call indefinitely.
      // The previous version awaited put() with no upper bound.
      console.log(`[p2p] provideSelf: calling contentRouting.put (broadcast)`);
      console.log(`[p2p] provideSelf: advertised addrs: ${uniqueAddrs.join(", ")}`);
      let broadcastTimedOut = false;
      try {
        await Promise.race([
          node.contentRouting.put(key, value),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("provideSelf broadcast put timeout")), 15_000),
          ),
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("timeout")) {
          broadcastTimedOut = true;
          console.warn(
            `[p2p] provideSelf: broadcast put timed out after 15s — ` +
            `DHT likely has no reachable peers. Self-record NOT advertised; ` +
            `other nodes cannot findPeer(thisNode) until the DHT bootstrap completes.`,
          );
        } else {
          throw err;
        }
      }

      // Also PUT directly to each configured bootstrap peer so the record
      // propagates to that specific DHT network. libp2p's put() accepts
      // a `peers` array to target specific peers directly.
      let directPutTimedOut = false;
      const bootstrapPeers = this.options.bootstrapPeers ?? [];
      if (bootstrapPeers.length > 0) {
        // Extract peer IDs from bootstrap multiaddr strings (format: /ip4/x.x.x.x/tcp/N/p2p/<peerId>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const targetPeers: any[] = [];
        for (const bp of bootstrapPeers) {
          const p2pIdx = bp.lastIndexOf("/p2p/");
          if (p2pIdx < 0) continue;
          const peerIdStr = bp.substring(p2pIdx + 5);
          if (!peerIdStr) continue;
          try {
            targetPeers.push(peerIdFromString(peerIdStr));
          } catch {
            // skip invalid peer ID
          }
        }
        if (targetPeers.length > 0) {
          console.log(`[p2p] provideSelf: also direct-putting to ${targetPeers.length} bootstrap peer(s)`);
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (node.contentRouting as any).put(key, value, { peers: targetPeers });
            console.log(`[p2p] provideSelf: direct-put to bootstrap peers OK`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("timeout")) {
              directPutTimedOut = true;
              console.warn(`[p2p] provideSelf: direct-put to bootstrap peers timed out`);
            } else {
              console.warn(`[p2p] provideSelf: direct-put to bootstrap peers FAILED: ${err}`);
            }
          }
        }
      }

      const timedOut = broadcastTimedOut || directPutTimedOut;
      if (timedOut) {
        console.warn(
          `[p2p] provideSelf: FAILED (timed out) - advertised ${uniqueAddrs.length} addrs ` +
          `LOCALLY but did NOT propagate to DHT. Peer ${selfPeerId.slice(0, 12)}… is undiscoverable until next cycle.`,
        );
        return { advertised: uniqueAddrs.length, timedOut: true };
      }

      console.log(`[p2p] provideSelf: SUCCESS - advertised ${uniqueAddrs.length} addresses for peer ${selfPeerId.slice(0, 12)}…`);
      return { advertised: uniqueAddrs.length, timedOut: false };
    } catch (err) {
      console.error(`[p2p] provideSelf: FAILED - ${err}`);
      return { advertised: 0, timedOut: true };
    }
  }

  /**
   * Announce this node as a provider for `topic` on the DHT (requires {@link EnvoyMeshOptions.enableDht}).
   * Uses IPFS-style provider records; `topic` is hashed to a CID per `docs/p2p-discovery.md`.
   *
   * If `signingKey` is provided, also stores a signed capability topic record under the same CID
   * via DHT `put`, so queriers can retrieve and verify it. The signed record is also returned
   * to the caller.
   */
  async provideCapabilityTopic(
    topic: string,
    options?: RoutingOptions & {
      /** PEM-encoded Ed25519 private key for signing the capability record. */
      signingKey?: string;
      /** TTL in seconds for the signed record's freshness. Default: 3600 (1 hour). */
      ttlSeconds?: number;
      /** Optional org scope tag. */
      org?: string;
      /** Optional network scope tag. */
      net?: string;
      /** Optional version scope tag. */
      ver?: string;
    },
  ): Promise<{ cid: CID; signedRecord?: import("@envoymesh/protocol").SignedCapabilityTopicRecord; timedOut: boolean }> {
    this.requireDhtForCapabilityTopics();
    const cid = await cidForCapabilityTopic(topic);
    let timedOut = false;

    // Wrap provide() in a timeout — the underlying libp2p KadDHT provide
    // can hang for a long time when DHT peers are unreachable. This is
    // especially common at startup when the DHT hasn't bootstrapped yet.
    //
    // IMPORTANT: don't swallow the timeout silently. Callers need to know
    // whether the put actually landed so they can log accurately and decide
    // whether to back off or retry. We return `timedOut: true` instead of
    // throwing so the periodic schedule doesn't crash, but the boolean
    // propagates to the caller.
    //
    // Promise.race discards the loser's error/reason. We attach a .catch on
    // the inner provide so the actual libp2p error (NoPeersFoundError,
    // NotConnectedError, encode failure, ...) is logged before it's lost —
    // seeing "provide timeout for X" 11 times in a row tells us the race
    // fired, not WHY. The first timeout-streak log includes the underlying
    // libp2p error so operators can distinguish "DHT simply busy"
    // (timeout + nothing else) from "DHT route table empty" (timeout +
    // NoPeersFoundError) from "encode broke" (real error, not timeout).
    let loggedLibp2pError = false;
    const providePromise = this.requireNode().contentRouting.provide(cid, options);
    void providePromise.catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.toLowerCase().includes("timeout")) {
        // Real libp2p error (not the synthetic timeout) — log it once.
        console.warn(
          `[p2p] provideCapabilityTopic: libp2p error for ${topic}: ${errMsg}`,
        );
        loggedLibp2pError = true;
      }
    });
    try {
      await Promise.race([
        providePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`provide timeout for ${topic}`)), 30_000),
        ),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timeout")) {
        timedOut = true;
        const libp2pSuffix = loggedLibp2pError ? "" : " (no underlying libp2p error surfaced)";
        console.warn(
          `[p2p] provideCapabilityTopic: ${msg} — will retry on next cycle${libp2pSuffix}`,
        );
      } else {
        // Non-timeout errors (e.g. encode failure, unexpected libp2p
        // rejection) — surface so they aren't silently lost.
        throw err;
      }
    }

    let signedRecord: import("@envoymesh/protocol").SignedCapabilityTopicRecord | undefined;
    if (options?.signingKey) {
      const selfPeerId = this.requireNode().peerId.toString();
      const addrs = this.requireNode().getMultiaddrs();
      const primaryAddr = addrs.length > 0 ? addrs[0].toString() : `/p2p/${selfPeerId}`;
      signedRecord = createSignedCapabilityTopicRecord({
        topic,
        peerId: selfPeerId,
        multiaddr: primaryAddr,
        ttlSeconds: options.ttlSeconds ?? 3600,
        org: options.org,
        net: options.net,
        ver: options.ver,
        privateKey: options.signingKey,
      });

      // Also store the signed record in the DHT so queriers can retrieve it.
      // Use Promise.race with a hard timeout so this doesn't block indefinitely when no DHT peers are available.
      const recordBytes = Buffer.from(JSON.stringify(signedRecord), "utf8");
      try {
        await Promise.race([
          this.requireNode().contentRouting.put(cid.bytes, recordBytes, options),
          new Promise((_, reject) => setTimeout(() => reject(new Error("put timeout")), 5000)),
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("timeout")) {
          timedOut = true;
          console.warn(`[p2p] provideCapabilityTopic (signed record): ${msg}`);
        } else {
          throw err;
        }
      }
    }

    return { cid, signedRecord, timedOut };
  }

  async cancelCapabilityTopicReprovide(topic: string, options?: RoutingOptions): Promise<void> {
    this.requireDhtForCapabilityTopics();
    const cid = await cidForCapabilityTopic(topic);
    await this.requireNode().contentRouting.cancelReprovide(cid, options);
  }

  /**
   * Query the DHT for peers that have called {@link provideCapabilityTopic} for the same topic string.
   * libp2p {@link ContentRouting.findProviders} streams until aborted; unless `signal` is passed, this
   * method uses {@link AbortSignal.timeout} (`queryTimeoutMs`, default 20s) so the promise always settles.
   *
   * For each provider that has a signed capability topic record in the DHT, this method
   * fetches the record, verifies the signature using `signingPublicKey`, and sets
   * `signedRecord` on the result if valid. If verification fails, `signedRecordInvalid` is set.
   *
   * If `signingPublicKey` is not provided, no verification is attempted but signed records
   * are still included in results (unverified).
   */
  async findCapabilityTopicProviders(
    topic: string,
    options?: RoutingOptions & {
      limit?: number;
      queryTimeoutMs?: number;
      /** PEM-encoded Ed25519 public key for verifying signed capability records. */
      signingPublicKey?: string;
    },
  ): Promise<CapabilityTopicProviderRecord[]> {
    this.requireDhtForCapabilityTopics();
    const cid = await cidForCapabilityTopic(topic);
    const merged = { limit: 32, queryTimeoutMs: 20_000, ...options };
    const { limit, queryTimeoutMs, signingPublicKey, ...routingOpts } = merged;
    const signal = routingOpts.signal ?? AbortSignal.timeout(queryTimeoutMs);
    const out: CapabilityTopicProviderRecord[] = [];
    try {
      for await (const provider of this.requireNode().contentRouting.findProviders(cid, {
        ...routingOpts,
        signal,
      })) {
        const peerId = provider.id.toString();
        const multiaddrs = provider.multiaddrs.map((ma) => ma.toString());

        let signedRecord: import("@envoymesh/protocol").SignedCapabilityTopicRecord | undefined;
        let signedRecordInvalid: true | undefined;

        if (signingPublicKey) {
          try {
            const recordBytes = await this.requireNode().contentRouting.get(cid.bytes, {
              ...routingOpts,
              signal,
            });
            if (recordBytes) {
              const record = JSON.parse(Buffer.from(recordBytes).toString("utf8")) as import("@envoymesh/protocol").SignedCapabilityTopicRecord;
              // Only trust the record if the peerId matches the provider's peerId
              if (record.peerId === peerId) {
                const verification = verifySignedCapabilityTopicRecord(record, signingPublicKey);
                if (verification.ok) {
                  signedRecord = record;
                } else {
                  console.log(`[capability-topic] verification failed for ${peerId}: ${verification.reason}`);
                  signedRecordInvalid = true;
                }
              }
            }
          } catch {
            // No signed record in DHT for this provider — not an error
          }
        }

        out.push({
          peerId,
          multiaddrs,
          routing: provider.routing,
          signedRecord,
          signedRecordInvalid,
        });
        if (out.length >= limit) {
          break;
        }
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const aborted = signal.aborted || name === "AbortError" || name === "TimeoutError";
      if (aborted) {
        return out;
      }
      throw error;
    }
    return out;
  }

  get enabledFeatures(): string[] {
    return [
      ...(this.options.enableMdns === false ? [] : ["mdns"]),
      ...(this.options.bootstrapPeers && this.options.bootstrapPeers.length > 0 ? ["bootstrap"] : []),
      ...(this.options.enableDht ? ["dht"] : []),
      ...(this.options.enableRelay ? ["relay-transport"] : []),
      ...(this.options.enableRelayServer ? ["relay-server"] : []),
      ...(this.options.enableAutoNat ? ["autonat"] : []),
      ...(this.options.enableDcutr ? ["dcutr"] : []),
      ...(this.options.enableQuic ? ["quic"] : []),
      ...(this.options.enableP2pDebug ? ["p2p-debug"] : []),
      ...(this.options.enableReachabilityLog ? ["reachability-log"] : []),
    ];
  }

  onMessage(handler: MeshMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onDataTransfer(handler: MeshDataTransferHandler): () => void {
    this.dataHandlers.add(handler);
    return () => this.dataHandlers.delete(handler);
  }

  onPeerDiscovered(handler: MeshPeerDiscoveryHandler): () => void {
    this.peerDiscoveryHandlers.add(handler);
    return () => this.peerDiscoveryHandlers.delete(handler);
  }

  /** Subscribe to peer disconnect events. Returns an unsubscribe function. */
  onPeerDisconnect(handler: (peerId: string) => void): () => void {
    this.peerDisconnectHandlers.add(handler);
    return () => this.peerDisconnectHandlers.delete(handler);
  }

  /**
   * Subscribe to peer connect events.  Unlike onPeerDiscovered (which fires
   * at most once per peer from mDNS/bootstrap), this fires every time a peer
   * transitions to "connected" — covering relay dials, inbound connections,
   * and circuit-relay paths that pre-empt mDNS discovery.
   *
   * The handler receives the peerId and whatever multiaddrs are available in
   * the libp2p peer store at connection time.
   */
  onPeerConnect(handler: MeshPeerDiscoveryHandler): () => void {
    this.peerConnectHandlers.add(handler);
    return () => this.peerConnectHandlers.delete(handler);
  }

  /**
   * Register a raw protocol handler that receives the libp2p stream directly.
   * Unlike `onMessage` (which provides decoded envelopes), this gives access
   * to the raw duplex stream for non-envelope protocols like client-proxy.
   */
  async handleRawProtocol(
    protocol: string,
    handler: (stream: any, connection: any) => Promise<void>,
  ): Promise<void> {
    await this.requireNode().handle(protocol, handler, { runOnLimitedConnection: true });
  }

  /**
   * Helper: if [target] is a bare peer ID (not starting with "/"), wrap it in
   * a multiaddr path: "/p2p/<peerId>".  libp2p's getPeerAddress() calls
   * .getComponents() on the input — passing a bare string crashes with
   * "multiaddrs[0].getComponents is not a function".
   */
  private _normalizeDialTarget(target: string): Multiaddr {
    if (target.startsWith("/")) return ma(target);
    return ma(`/p2p/${target}`);
  }

  /**
   * Open a libp2p stream on [protocol] to [target] and return the raw stream.
   * Caller is responsible for read/write lifecycle and closing the stream.
   *
   * Goes through {@link openOutboundStream} so existing connections (including
   * inbound ones from NAT'd home nodes) are reused before attempting a fresh dial.
   * This is critical for the relay bridge: the relay receives an inbound TCP
   * connection from a home node behind NAT; when the relay later dials that home
   * node, it must open a new stream on the *existing* connection — a fresh dial
   * to the home node's private IP would fail from a cloud relay.
   */
  async dialProtocol(target: string, protocol: string): Promise<any> {
    const { stream } = await this.openOutboundStream(target, protocol);
    return stream;
  }

  async send(target: string, envelope: EnvoyEnvelope, sendOptions?: MeshOutboundOptions): Promise<number> {
    return this.sendEnvelopeOnProtocol(target, envelope, ENVOY_MESSAGE_PROTOCOL, sendOptions);
  }

  /**
   * Send one envelope on `/envoymesh/message/0.1.0`, then read a single reply envelope on the same stream.
   * Peers must respond with {@link InboundMeshMessage.replyWithEnvelope} from their inbound handler
   * (relay control responses) — not with a separate {@link send} (often fails for NAT’d clients).
   */
  async sendExpectReply(
    target: string,
    envelope: EnvoyEnvelope,
    options?: {
      timeoutMs?: number;
      dialHints?: string[];
      preferCircuitHints?: boolean;
      forceFreshDial?: boolean;
      sameSubnetLanFirst?: boolean;
    },
  ): Promise<EnvoyEnvelope> {
    return this.sendExpectReplyOnProtocol(target, envelope, ENVOY_MESSAGE_PROTOCOL, options);
  }

  /**
   * Send profile (or other chat-protocol) request on `/envoymesh/chat/0.1.0` and read one reply on the same stream.
   * Avoids opening `/envoymesh/message/0.1.0` on peers that only negotiate chat (which used to tear down the chat path).
   */
  async sendChatExpectEnvelopeReply(
    target: string,
    envelope: EnvoyEnvelope,
    options?: {
      timeoutMs?: number;
      dialHints?: string[];
      preferCircuitHints?: boolean;
      forceFreshDial?: boolean;
      sameSubnetLanFirst?: boolean;
    },
  ): Promise<EnvoyEnvelope> {
    return this.sendExpectReplyOnProtocol(target, envelope, ENVOY_CHAT_PROTOCOL, options);
  }

  private async sendExpectReplyOnProtocol(
    target: string,
    envelope: EnvoyEnvelope,
    protocol: string,
    options?: {
      timeoutMs?: number;
      dialHints?: string[];
      preferCircuitHints?: boolean;
      forceFreshDial?: boolean;
      sameSubnetLanFirst?: boolean;
    },
  ): Promise<EnvoyEnvelope> {
    validateEnvelopeProtocol(protocol, envelope);
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const sendOptions: MeshOutboundOptions | undefined =
      options?.dialHints?.length ||
      options?.preferCircuitHints ||
      options?.forceFreshDial ||
      options?.sameSubnetLanFirst
        ? {
            dialHints: options.dialHints,
            preferCircuitHints: options.preferCircuitHints,
            forceFreshDial: options.forceFreshDial,
            sameSubnetLanFirst: options.sameSubnetLanFirst,
          }
        : undefined;
    const { stream } = await this.openOutboundStream(target, protocol, sendOptions);
    const remotePeerId = stream.connection?.remotePeer?.toString();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol,
        direction: "outbound",
      });
    }
    if (!this.isOutboundStreamWritable(stream)) {
      const peerId = stream.connection?.remotePeer?.toString();
      await this.closeConnection(stream.connection);
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}${peerId ? ` (closed connection to ${peerId.slice(0, 12)}…)` : ""}`,
      );
    }
    /** One instance per stream: multiple `byteStream(stream)` calls register duplicate listeners. */
    const streamIo = byteStream(stream);
    await streamIo.write(encodeEnvelope(envelope));
    const readPromise = streamIo.read() as Promise<Uint8Array | null>;
    let replyBytes: Uint8Array | null;
    try {
      replyBytes = await new Promise<Uint8Array | null>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`sendExpectReply timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        void readPromise
          .then((b) => {
            clearTimeout(timer);
            resolve(b);
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    } catch (error) {
      try {
        if (typeof stream.abort === "function") {
          await stream.abort();
        }
      } catch {
        /* ignore */
      }
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
      throw error;
    }
    try {
      await stream.close();
    } catch {
      /* ignore */
    }
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:close",
        remotePeerId,
        protocol,
        direction: "outbound",
      });
    }
    if (replyBytes === null) {
      throw new Error("sendExpectReply: peer closed stream without a reply");
    }
    const reply = decodeEnvelope(replyBytes.subarray());
    validateEnvelopeProtocol(protocol, reply);
    return reply;
  }

  async sendChat(target: string, envelope: EnvoyEnvelope, sendOptions?: MeshOutboundOptions): Promise<number> {
    return this.sendEnvelopeOnProtocol(target, envelope, ENVOY_CHAT_PROTOCOL, sendOptions);
  }

  /**
   * Send chat.message on the chat protocol and read a single chat.delivered ack on the same stream.
   */
  async sendChatExpectReply(
    target: string,
    envelope: EnvoyEnvelope,
    options?: {
      timeoutMs?: number;
      dialHints?: string[];
      preferCircuitHints?: boolean;
      forceFreshDial?: boolean;
      sameSubnetLanFirst?: boolean;
    },
  ): Promise<EnvoyEnvelope> {
    validateEnvelopeProtocol(ENVOY_CHAT_PROTOCOL, envelope);
    const timeoutMs = options?.timeoutMs ?? CHAT_DELIVERY_ACK_TIMEOUT_MS;
    const sendOptions: MeshOutboundOptions | undefined =
      options?.dialHints?.length ||
      options?.preferCircuitHints ||
      options?.forceFreshDial ||
      options?.sameSubnetLanFirst
        ? {
            dialHints: options.dialHints,
            preferCircuitHints: options.preferCircuitHints,
            forceFreshDial: options.forceFreshDial,
            sameSubnetLanFirst: options.sameSubnetLanFirst,
          }
        : undefined;
    const { stream } = await this.openOutboundStream(target, ENVOY_CHAT_PROTOCOL, sendOptions);
    const remotePeerId = stream.connection?.remotePeer?.toString();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol: ENVOY_CHAT_PROTOCOL,
        direction: "outbound",
      });
    }
    if (!this.isOutboundStreamWritable(stream)) {
      const peerId = stream.connection?.remotePeer?.toString();
      await this.closeConnection(stream.connection);
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}${peerId ? ` (closed connection to ${peerId.slice(0, 12)}…)` : ""}`,
      );
    }
    const streamIo = byteStream(stream);
    await streamIo.write(encodeEnvelope(envelope));
    const readPromise = streamIo.read() as Promise<Uint8Array | null>;
    let replyBytes: Uint8Array | null;
    try {
      replyBytes = await new Promise<Uint8Array | null>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`sendChatExpectReply timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        void readPromise
          .then((b) => {
            clearTimeout(timer);
            resolve(b);
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    } catch (error) {
      try {
        if (typeof stream.abort === "function") {
          await stream.abort();
        }
      } catch {
        /* ignore */
      }
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
      throw error;
    }
    try {
      await stream.close();
    } catch {
      /* ignore */
    }
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:close",
        remotePeerId,
        protocol: ENVOY_CHAT_PROTOCOL,
        direction: "outbound",
      });
    }
    if (replyBytes === null) {
      throw new Error("sendChatExpectReply: peer closed stream without a reply");
    }
    const reply = decodeEnvelope(replyBytes.subarray());
    validateEnvelopeProtocol(ENVOY_CHAT_PROTOCOL, reply);
    if (reply.intent !== "chat.delivered") {
      throw new Error(`sendChatExpectReply: expected chat.delivered, got ${reply.intent}`);
    }
    return reply;
  }

  /** Close all libp2p connections to a peer (used before redial after a stale path). */
  async closeConnectionsToPeer(peerIdStr: string): Promise<number> {
    const node = this.requireNode();
    let closed = 0;
    try {
      const pid = peerIdFromString(peerIdStr);
      const conns = node.getConnections(pid);
      for (const conn of conns) {
        try {
          await conn.close();
          closed += 1;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore invalid peer id */
    }
    return closed;
  }

  /**
   * Close non-essential swarm peers when connection/dial-queue pressure
   * threatens circuit-relay hoppability. Keeps preferred relays and
   * Envoy-tagged contacts; drops anonymous DHT/bootstrap churn peers.
   */
  async pruneExcessSwarmConnections(options?: {
    maxPeers?: number;
    dialQueueThreshold?: number;
  }): Promise<{ closedPeers: number; reason?: string }> {
    const maxPeers = options?.maxPeers ?? PRUNE_EXCESS_SWARM_MAX_PEERS;
    const dialQueueThreshold =
      options?.dialQueueThreshold ?? PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD;
    const stats = this.getConnectionStats();
    const dialQueue = stats.dialQueueLength ?? 0;
    const overPeers = stats.totalPeerIds > maxPeers;
    const overQueue = dialQueue > dialQueueThreshold;
    if (!overPeers && !overQueue) {
      return { closedPeers: 0 };
    }

    const node = this.requireNode();
    const preferredRelays = new Set(this.preferredRelayPeerIds ?? []);
    for (const id of this.lastReservedRelayPeerIds ?? []) {
      if (id) preferredRelays.add(id);
    }
    preferredRelays.add(COMMUNITY_CN_RELAY_PEER_ID);

    const candidates: string[] = [];
    for (const peerId of stats.connectedPeerIds) {
      if (preferredRelays.has(peerId)) continue;
      let tags: string[] = [];
      try {
        const peerData = await node.peerStore.get(peerIdFromString(peerId));
        tags = [...peerData.tags.keys()];
      } catch {
        tags = [];
      }
      if (tags.includes(CONTACT_KEEP_ALIVE_PEER_TAG)) continue;
      if (tags.includes(RELAY_KEEP_ALIVE_PEER_TAG)) continue;
      candidates.push(peerId);
    }

    let closedPeers = 0;
    const target = Math.max(0, stats.totalPeerIds - maxPeers);
    const toClose = Math.max(target, overQueue ? Math.min(candidates.length, 24) : 0);
    for (const peerId of candidates.slice(0, toClose)) {
      const n = await this.closeConnectionsToPeer(peerId);
      if (n > 0) closedPeers += 1;
    }
    if (closedPeers > 0) {
      console.warn(
        `[p2p] pruned ${closedPeers} non-essential swarm peer(s) (peers=${stats.totalPeerIds} dialQueue=${dialQueue}) to protect circuit hoppability`,
      );
    }
    return {
      closedPeers,
      reason: overQueue ? "dial-queue" : "peer-count",
    };
  }

  /**
   * Best-effort dial to establish or reuse a libp2p connection before chat/file sends.
   * Opens and closes one stream on `protocol` (default chat) using the same dial-hint path as {@link sendChat}.
   */
  async ensurePeerReachable(
    target: string,
    protocol: string = ENVOY_CHAT_PROTOCOL,
    sendOptions?: MeshOutboundOptions,
  ): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }> {
    // Self-dial guard: skip if the target is the local node (by peer ID in
    // the multiaddr or direct peer ID match). Wrapped in try/catch because
    // requireNode() throws if the node isn't started.
    try {
      const selfPeerId = this.requireNode().peerId.toString();
      if (target === selfPeerId || target.includes(`/p2p/${selfPeerId}`)) {
        return { connected: false, direct: false };
      }
    } catch {
      // Node not started — skip the self-dial check.
    }
    const peerIdStr = parsePeerIdFromDialTarget(target);
    const hintList = filterDialHintsForOutboundSend(
      sendOptions?.dialHints ?? [],
      peerIdStr ?? "",
      sendOptions,
    );
    const canUpgradeRelayToDirect =
      sendOptions?.upgradeRelayToDirect === true &&
      hasLanUpgradeDialHints(hintList, {
        sameSubnetLanFirst: sendOptions?.sameSubnetLanFirst === true,
      }) &&
      !sendOptions?.preferCircuitHints;
    if (peerIdStr && !sendOptions?.forceFreshDial && !sendOptions?.verifyConnection) {
      const before = this.getPeerConnectionInfo(peerIdStr);
      if (before.connected) {
        if (before.direct || !canUpgradeRelayToDirect) {
          return before;
        }
        // Relay→Direct: try LAN first WITHOUT dropping the working relay.
        // Closing first caused Offline when tcp/0 high-port dials failed.
        try {
          const lanOnly = hintList.filter((h) => !h.includes("/p2p-circuit/"));
          const { stream } = await this.openOutboundStream(target, protocol, {
            ...sendOptions,
            dialHints: lanOnly.length > 0 ? lanOnly : hintList,
            preferCircuitHints: false,
            sameSubnetLanFirst: true,
            forceFreshDial: true,
            upgradeRelayToDirect: true,
          });
          try {
            await stream.close();
          } catch {
            /* ignore */
          }
          const after = this.getPeerConnectionInfo(peerIdStr);
          if (after.connected && after.direct) {
            return after;
          }
          return before;
        } catch {
          return before;
        }
      }
    }
    if (peerIdStr && sendOptions?.verifyConnection && !sendOptions?.forceFreshDial) {
      const before = this.getPeerConnectionInfo(peerIdStr);
      if (before.connected && before.direct && (await this.pingDirectPeer(peerIdStr))) {
        return before;
      }
    }
    try {
      const { stream } = await this.openOutboundStream(target, protocol, {
        ...sendOptions,
        dialHints: hintList,
      });
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      // Suppress common DHT noise: "limited connection" and "protocol selection"
      // failures are expected when dialing random DHT peers that don't speak
      // EnvoyMesh. Only log genuine errors (timeouts, connection refused, etc.).
      // However, "limited connection" errors on explicit circuit dials are NOT
      // noise — they indicate the circuit transport returned a limited connection
      // that cannot open application protocol streams, which is a real failure.
      const hasCircuitHint = hintList.some((h) => h.includes("/p2p-circuit/"));
      const isDhtNoise =
        !hasCircuitHint &&
        (detail.includes("limited connection") ||
          detail.includes("Protocol selection failed") ||
          detail.includes("could not negotiate"));
      if (!isDhtNoise) {
        // Classify common relay-specific errors for faster diagnosis.
        const noReservation =
          detail.includes("NO_RESERVATION") || detail.includes("no reservation") || detail.includes("relay reservation");
        if (noReservation) {
          console.warn(
            `[network] NO_RESERVATION: peer ${peerIdStr ?? target.slice(0, 16)}… has no active reservation on the relay. ` +
              `Is the target connected to a relay? Error: ${detail.slice(0, 120)}`,
          );
        } else {
          console.warn(`[network] ensurePeerReachable failed for ${target.slice(0, 24)}…: ${detail}`);
        }
      }
      // Failed redial/upgrade must not report Offline when an existing path remains.
      if (peerIdStr) {
        const still = this.getPeerConnectionInfo(peerIdStr);
        if (still.connected) {
          return still;
        }
      }
      return { connected: false, direct: false };
    }
    return peerIdStr ? this.getPeerConnectionInfo(peerIdStr) : { connected: false, direct: false };
  }

  private isOutboundStreamWritable(stream: {
    writeStatus?: string;
    status?: string;
  }): boolean {
    return stream.writeStatus === "writable" && stream.status !== "reset";
  }

  private async closeConnection(connection: { close?: () => Promise<void> } | undefined): Promise<void> {
    if (!connection?.close) return;
    try {
      await connection.close();
    } catch {
      /* ignore */
    }
  }

  private async openStreamOnConnection(
    connection: {
      newStream: (protocols: string | string[], opts?: { runOnLimitedConnection?: boolean }) => Promise<unknown>;
      remotePeer: { toString(): string };
      close?: () => Promise<void>;
    },
    protocol: string,
    limited: boolean,
    timeoutMs: number = NEW_STREAM_ON_OPEN_CONNECTION_TIMEOUT_MS,
  ): Promise<{ stream: unknown; remotePeerId: string } | undefined> {
    const attemptOpen = async (useLimited: boolean): Promise<{ stream: unknown; remotePeerId: string }> => {
      const stream = await promiseWithTimeout(
        useLimited
          ? connection.newStream([protocol], { runOnLimitedConnection: true })
          : connection.newStream(protocol),
        timeoutMs,
        useLimited ? `newStream(limited relay) ${protocol}` : `newStream ${protocol}`,
      );
      if (!this.isOutboundStreamWritable(stream as { writeStatus?: string; status?: string })) {
        const bad = stream as { close?: () => Promise<void>; abort?: () => Promise<void> };
        try {
          if (typeof bad.abort === "function") {
            await bad.abort();
          } else {
            await bad.close?.();
          }
        } catch {
          /* ignore */
        }
        throw new Error(
          `stream not writable status=${(stream as { status?: string }).status}`,
        );
      }
      return { stream, remotePeerId: connection.remotePeer.toString() };
    };

    try {
      return await attemptOpen(limited);
    } catch (firstErr) {
      if (!limited) {
        try {
          return await attemptOpen(true);
        } catch {
          /* fall through */
        }
      }
      const detail = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const protocolOnlyFailure =
        detail.includes("Protocol selection failed") || detail.includes("could not negotiate");
      if (protocolOnlyFailure) {
        // Protocol negotiation failure is extremely common on the public DHT —
        // random peers don't speak /envoymesh/message/0.1.0. This is NOT an
        // error; it's expected for non-EnvoyMesh peers. Suppress the log to
        // avoid noise (was previously logged on every attempt).
        return undefined;
      }
      console.warn(
        `[network] stream open failed on existing connection (${detail}); closing and redialing`,
      );
      await this.closeConnection(connection);
      return undefined;
    }
  }

  private async openOutboundStream(
    target: string,
    protocol: string,
    sendOptions?: MeshOutboundOptions,
  ): Promise<{ stream: any; remotePeerId?: string }> {
    const node = this.requireNode();
    const peerIdStr = parsePeerIdFromDialTarget(target);
    const hintList = filterDialHintsForOutboundSend(
      sendOptions?.dialHints ?? [],
      peerIdStr ?? "",
      sendOptions,
    );
    const skipLimitedReuse =
      hasDirectTcpDialHints(hintList) && !sendOptions?.preferCircuitHints;
    const reuseStreamTimeoutMs = streamReuseTimeoutMs(protocol);

    if (peerIdStr && !sendOptions?.forceFreshDial) {
      // Prefer limited (circuit-relay) reuse when the caller asked for circuits —
      // those connections have `limits` set and are invisible to findOpenConnectionToPeer.
      const preferLimited =
        Boolean(sendOptions?.preferCircuitHints) && !skipLimitedReuse;
      if (preferLimited) {
        const limitedExisting = this.findLimitedConnectionToPeer(node, peerIdStr);
        if (limitedExisting) {
          const opened = await this.openStreamOnConnection(
            limitedExisting,
            protocol,
            true,
            reuseStreamTimeoutMs,
          );
          if (opened) {
            return opened;
          }
        }
      }

      const existing = this.findOpenConnectionToPeer(node, peerIdStr);
      if (existing) {
        const opened = await this.openStreamOnConnection(
          existing,
          protocol,
          false,
          reuseStreamTimeoutMs,
        );
        if (opened) {
          return opened;
        }
      }

      // After a failed direct reuse, always try relay (stale direct + live circuit is common).
      if (!preferLimited) {
        const limitedExisting = this.findLimitedConnectionToPeer(node, peerIdStr);
        if (limitedExisting) {
          const opened = await this.openStreamOnConnection(
            limitedExisting,
            protocol,
            true,
            reuseStreamTimeoutMs,
          );
          if (opened) {
            return opened;
          }
        } else if (!skipLimitedReuse) {
          /* no limited conn to reuse; fall through to dial hints */
        }
      }
    }

    return this.dialOpenStreamViaHints(node, peerIdStr ?? "", target, protocol, {
      ...sendOptions,
      dialHints: hintList,
    });
  }

  private async dialOpenStreamViaHints(
    node: Libp2p,
    peerIdStr: string,
    target: string,
    protocol: string,
    sendOptions?: MeshOutboundOptions,
  ): Promise<{ stream: any; remotePeerId?: string }> {
    const allowEphemeralPrivateLan = sendOptions?.sameSubnetLanFirst === true;
    const hintFilterOpts = {
      preferCircuitHints: sendOptions?.preferCircuitHints,
      allowEphemeralPrivateLan,
    };
    let hintsRaw = filterDialHintsForOutboundSend(
      sendOptions?.dialHints ?? [],
      peerIdStr,
      hintFilterOpts,
    );
    const barePeerDial = !target.trim().startsWith("/");

    if (peerIdStr) {
      // Same-subnet: keep mDNS/peerstore high ports (nodes often listen on tcp/0).
      // Do not scrub-patch the peerstore with a filter that strips them.
      if (allowEphemeralPrivateLan) {
        const storeHints = await this.getPeerStoreDialHints(peerIdStr, {
          allowEphemeralPrivateLan: true,
        });
        hintsRaw = filterDialHintsForOutboundSend(
          [...new Set([...hintsRaw, ...storeHints])],
          peerIdStr,
          hintFilterOpts,
        );
      } else {
        const scrubbed = await this.scrubPeerStoreDialHints(peerIdStr, hintsRaw);
        hintsRaw = filterDialHintsForOutboundSend(
          [...new Set([...hintsRaw, ...scrubbed])],
          peerIdStr,
          hintFilterOpts,
        );
      }
    }

    const openStreamOnLimitedConn = async (): Promise<{ stream: any; remotePeerId?: string } | undefined> => {
      if (!peerIdStr) {
        return undefined;
      }
      const limitedExisting = this.findLimitedConnectionToPeer(node, peerIdStr);
      if (!limitedExisting) {
        return undefined;
      }
      return this.openStreamOnConnection(limitedExisting, protocol, true);
    };

    const dialOnce = async (addr: Multiaddr | string): Promise<{ stream: any; remotePeerId?: string }> => {
      // Circuit-relay v2 hops are "limited" connections. libp2p's dialProtocol
      // refuses to open app streams on them unless runOnLimitedConnection is set —
      // otherwise callers see: "Cannot open protocol stream on limited connection"
      // (Win auto-bond after mesh.dial PASS → send redial).
      // Only circuit multiaddrs need the flag — not every dial when
      // preferCircuitHints is set (LAN TCP hints stay unlimited).
      const addrStr = String(addr);
      const needsLimited = addrStr.includes("/p2p-circuit");
      const privateLan =
        sendOptions?.sameSubnetLanFirst === true &&
        !needsLimited &&
        isPrivateLanTcpDialHint(addrStr);
      const ephemeralPrivateLan =
        privateLan && isLikelyInboundConnSnapshotDialHint(addrStr);
      const dialTimeoutMs = ephemeralPrivateLan
        ? (sendOptions?.privateLanDialTimeoutMs ?? EPHEMERAL_PRIVATE_LAN_HINT_DIAL_TIMEOUT_MS)
        : privateLan
          ? (sendOptions?.privateLanDialTimeoutMs ?? PRIVATE_LAN_HINT_DIAL_TIMEOUT_MS)
          : (sendOptions?.dialTimeoutMs ?? HINT_DIAL_TIMEOUT_MS);
      const stream = await promiseWithTimeout(
        needsLimited
          ? node.dialProtocol(addr as any, protocol, { runOnLimitedConnection: true })
          : node.dialProtocol(addr as any, protocol),
        dialTimeoutMs,
        `dial ${addrStr.slice(0, 64)}`,
      );
      const s = stream as { connection?: { remotePeer?: { toString(): string } } };
      const remotePeerId = s.connection?.remotePeer?.toString();
      if (peerIdStr && remotePeerId && remotePeerId !== peerIdStr) {
        try {
          await stream.close();
        } catch {
          /* ignore */
        }
        throw new Error(`connected to ${remotePeerId.slice(0, 12)}…, expected ${peerIdStr.slice(0, 12)}…`);
      }
      if (!this.isOutboundStreamWritable(stream as { writeStatus?: string; status?: string })) {
        await this.closeConnection(
          s.connection as { close?: () => Promise<void> } | undefined,
        );
        throw new Error(
          `dial opened non-writable stream status=${(stream as { status?: string }).status}`,
        );
      }
      return { stream, remotePeerId };
    };

    // Peer-ID-less multiaddrs (e.g. WebTransport certhash addresses from the
    // DHT): skip hint-based dials which require a peer ID for /p2p/ appending.
    if (!peerIdStr && !barePeerDial) {
      return dialOnce(this._normalizeDialTarget(target));
    }

    const routableHints = preferNonLoopbackDialHints(hintsRaw);
    /** True when hints include at least one non-loopback circuit/LAN/WAN addr — try before bare `/p2p/id` dial (peerstore may prioritize remote loopback → ECONNREFUSED here). */
    const hasRoutableHint = routableHints.some((h) => !isLoopbackOrUnspecifiedDialHint(h));

    let lastError: unknown = new Error("no outbound dial attempted");

    const dialTarget = this._normalizeDialTarget(target);
    const tryHintList = async (
      hints: string[],
    ): Promise<{ stream: any; remotePeerId?: string } | undefined> => {
      let ephemeralPrivateLanTried = 0;
      for (const ma of dialHintsToMultiaddrs(
        sortDialHints(hints, { sameSubnetLanFirst: sendOptions?.sameSubnetLanFirst === true }),
        peerIdStr,
      )) {
        const addrStr = String(ma);
        if (
          sendOptions?.sameSubnetLanFirst === true &&
          isPrivateLanTcpDialHint(addrStr) &&
          !addrStr.includes("/p2p-circuit/") &&
          isLikelyInboundConnSnapshotDialHint(addrStr)
        ) {
          if (ephemeralPrivateLanTried >= MAX_EPHEMERAL_PRIVATE_LAN_DIALS) {
            continue;
          }
          ephemeralPrivateLanTried++;
        }
        try {
          return await dialOnce(ma);
        } catch (e) {
          lastError = e;
        }
      }
      return undefined;
    };

    const tryRoutableHints = async (): Promise<{ stream: any; remotePeerId?: string } | undefined> => {
      if (!hasRoutableHint) {
        return undefined;
      }
      // Try hints sequentially in speed order (LAN first, then direct TCP, then circuits).
      // Sequential avoids connection flapping from simultaneous dials to the same peer.
      return tryHintList(routableHints);
    };

    // Always prefer explicit filtered hints over bare `/p2p/id` (libp2p peerstore keeps ephemeral inbound observed addrs).
    if (barePeerDial && hasRoutableHint) {
      const viaHints = await tryRoutableHints();
      if (viaHints) {
        return viaHints;
      }
    } else if (barePeerDial && peerIdStr) {
      const storeHints = filterDialHintsForOutboundSend(
        await this.getPeerStoreDialHints(peerIdStr, { allowEphemeralPrivateLan }),
        peerIdStr,
        hintFilterOpts,
      );
      const viaStore = await tryHintList(storeHints);
      if (viaStore) {
        return viaStore;
      }
    } else if (barePeerDial) {
      try {
        return await dialOnce(dialTarget);
      } catch (e) {
        lastError = e;
      }
    }

    if (!barePeerDial) {
      try {
        return await dialOnce(dialTarget);
      } catch (firstError) {
        lastError = firstError;
      }
    }

    const hints = preferNonLoopbackDialHints(hintsRaw);
    if (!(barePeerDial && hasRoutableHint)) {
      const viaHints = await tryHintList(hints);
      if (viaHints) {
        return viaHints;
      }
    }
    /** Last resort: retry any loopback hints only if bare + routable passes failed */
    const loopOnly = hintsRaw.filter((h) => isLoopbackOrUnspecifiedDialHint(h));
    const viaLoop = await tryHintList(loopOnly);
    if (viaLoop) {
      return viaLoop;
    }
    const skipLimitedFallback =
      hasDirectTcpDialHints(hintsRaw) && !sendOptions?.preferCircuitHints;
    if (!skipLimitedFallback) {
      const viaLimited = await openStreamOnLimitedConn();
      if (viaLimited) {
        return viaLimited;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private findOpenConnectionToPeer(node: Libp2p, peerIdStr: string): any | undefined {
    const open = node
      .getConnections()
      .filter(
        (c) =>
          c.remotePeer.toString() === peerIdStr &&
          c.status === "open" &&
          // Align with libp2p `findExistingConnection`: limited relay conns cannot open app streams here.
          (c as { limits?: unknown }).limits == null,
      );
    if (open.length === 0) {
      return undefined;
    }
    const direct = open.find((c) => !(c.remoteAddr?.toString() ?? "").includes("/p2p-circuit"));
    return direct ?? open[0];
  }

  private findLimitedConnectionToPeer(node: Libp2p, peerIdStr: string): any | undefined {
    const open = node
      .getConnections()
      .filter(
        (c) =>
          c.remotePeer.toString() === peerIdStr &&
          c.status === "open" &&
          (c as { limits?: unknown }).limits != null,
      );
    if (open.length === 0) {
      return undefined;
    }
    const direct = open.find((c) => !(c.remoteAddr?.toString() ?? "").includes("/p2p-circuit"));
    return direct ?? open[0];
  }

  private async sendEnvelopeOnProtocol(
    target: string,
    envelope: EnvoyEnvelope,
    protocol: string,
    sendOptions?: MeshOutboundOptions,
  ): Promise<number> {
    validateEnvelopeProtocol(protocol, envelope);
    const startedAt = Date.now();

    let stream: any;
    try {
      const opened = await this.openOutboundStream(target, protocol, sendOptions);
      stream = opened.stream;
    } catch (dialError) {
      const errorMsg = dialError instanceof Error ? dialError.message : String(dialError);
      console.error(`[network] outbound ${protocol} dial failed for ${target}: ${errorMsg}`);
      throw dialError;
    }

    const connection = stream.connection;
    const remotePeerId = connection?.remotePeer?.toString();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol,
        direction: "outbound",
      });
    }
    if (!this.isOutboundStreamWritable(stream)) {
      const peerId = stream.connection?.remotePeer?.toString();
      await this.closeConnection(stream.connection);
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}${peerId ? ` (closed connection to ${peerId.slice(0, 12)}…)` : ""}`,
      );
    }
    const bytes = encodeEnvelope(envelope);
    const streamIo = byteStream(stream);
    await streamIo.write(bytes);
    await stream.close();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:close",
        remotePeerId,
        protocol,
        direction: "outbound",
      });
    }
    return Date.now() - startedAt;
  }

  async sendDataTransfer(
    target: string,
    voucherUtf8: Uint8Array,
    chunks: Uint8Array[],
    sendOptions?: MeshOutboundOptions,
  ): Promise<number> {
    const startedAt = Date.now();
    let stream: any;
    try {
      const opened = await this.openOutboundStream(target, ENVOY_DATA_PROTOCOL, sendOptions);
      stream = opened.stream;
    } catch (dialError) {
      const errorMsg = dialError instanceof Error ? dialError.message : String(dialError);
      console.error(`[network] outbound ${ENVOY_DATA_PROTOCOL} dial failed for ${target}: ${errorMsg}`);
      throw dialError;
    }
    const remotePeerId = stream.connection?.remotePeer?.toString();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol: ENVOY_DATA_PROTOCOL,
        direction: "outbound",
      });
    }
    if (!this.isOutboundStreamWritable(stream)) {
      const peerId = stream.connection?.remotePeer?.toString();
      await this.closeConnection(stream.connection);
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}${peerId ? ` (closed connection to ${peerId.slice(0, 12)}…)` : ""}`,
      );
    }
    const body = encodeDataTransferBody(voucherUtf8, chunks);
    await byteStream(stream).write(body);
    await stream.close();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:close",
        remotePeerId,
        protocol: ENVOY_DATA_PROTOCOL,
        direction: "outbound",
      });
    }
    return Date.now() - startedAt;
  }

  async dial(target: string, options?: { signal?: AbortSignal }): Promise<any> {
    const dialTarget = this._normalizeDialTarget(target);
    return this.requireNode().dial(dialTarget as any, options);
  }

  /**
   * Open a libp2p connection to the target and keep it open for subsequent sends.
   *
   * Previously this method closed the connection immediately, which forced every
   * downstream `send*` call to redial — but the bare-peer-ID dial path strips
   * loopback addresses from peer-directory hints (intentional for production,
   * where dialing your own loopback never reaches a remote peer). Tests pair
   * two nodes on the same host, so the only dialable hint for a freshly probed
   * peer is its loopback listen addr; closing immediately meant the next
   * send had no path and exhausted retries with `No reachable path …`.
   *
   * Keeping the connection open lets the send path's `findOpenConnectionToPeer`
   * reuse the established libp2p connection (the bare-peer-ID path becomes
   * inert for already-connected peers). Production callers that only want
   * latency measurement can still ignore the returned connection — the dial
   * time is unchanged.
   *
   * Returns the elapsed dial time in milliseconds.
   */
  async probePeer(target: string): Promise<number> {
    const dialTarget = this._normalizeDialTarget(target);
    const startedAt = Date.now();
    await this.requireNode().dial(dialTarget as any);
    return Date.now() - startedAt;
  }

  /**
   * Sends raw bytes on the EnvoyMesh message protocol stream without encoding an envelope.
   * Intended for adversarial probes and resilience testing (not for normal application traffic).
   */
  async sendRawBytes(target: string, bytes: Uint8Array): Promise<number> {
    const dialTarget = this._normalizeDialTarget(target);
    const startedAt = Date.now();
    const stream: any = await this.requireNode().dialProtocol(dialTarget as any, ENVOY_MESSAGE_PROTOCOL);
    const remotePeerId = stream.connection?.remotePeer?.toString();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol: ENVOY_MESSAGE_PROTOCOL,
        direction: "outbound",
      });
    }
    if (!this.isOutboundStreamWritable(stream)) {
      const peerId = stream.connection?.remotePeer?.toString();
      await this.closeConnection(stream.connection);
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}${peerId ? ` (closed connection to ${peerId.slice(0, 12)}…)` : ""}`,
      );
    }
    await byteStream(stream).write(bytes);
    await stream.close();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:close",
        remotePeerId,
        protocol: ENVOY_MESSAGE_PROTOCOL,
        direction: "outbound",
      });
    }
    return Date.now() - startedAt;
  }

  private async dispatch(message: InboundMeshMessage): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(message)));
  }

  /**
   * Register an inbound libp2p stream handler for the given protocol.
   *
   * Stream contract: one EnvoyEnvelope per stream, half-duplex. The handler
   * reads exactly one envelope, dispatches it, optionally writes one reply
   * on the same stream, then closes. Follow-up envelopes on the same stream
   * are not supported — each logical message requires a fresh stream.
   */
  private async installEnvelopeInboundHandler(protocol: string): Promise<void> {
    // Circuit-relay v2 inbound hops are limited; without this flag libp2p aborts
    // the stream after negotiation with LimitedConnectionError and peers never
    // see bond.request / chat over WAN relay.
    await this.requireNode().handle(
      protocol,
      async (stream: any, connection: any) => {
      const remotePeerId = connection.remotePeer.toString();
      console.log(`[network] INBOUND STREAM: protocol=${protocol}, remotePeerId=${remotePeerId}`);
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol,
        direction: "inbound",
      });

      let replyConsumed = false;
      const streamIo = byteStream(stream);
      const replyWithEnvelope =
        protocol === ENVOY_MESSAGE_PROTOCOL || protocol === ENVOY_CHAT_PROTOCOL
          ? async (env: EnvoyEnvelope) => {
              if (replyConsumed) {
                throw new Error("EnvoyMesh replyWithEnvelope: duplicate reply");
              }
              replyConsumed = true;
              validateEnvelopeProtocol(protocol, env);
              if (!this.isOutboundStreamWritable(stream)) {
                throw new Error("EnvoyMesh replyWithEnvelope: stream is not writable");
              }
              await streamIo.write(encodeEnvelope(env));
              await stream.close();
            }
          : undefined;

      try {
        const firstChunk = await streamIo.read();

        if (firstChunk !== null) {
          const firstBytes = firstChunk instanceof Uint8Array ? firstChunk : firstChunk.subarray();
          if (firstBytes.byteLength > MAX_INBOUND_ENVELOPE_BYTES) {
            console.error(
              `EnvoyMesh inbound envelope exceeds size cap ${MAX_INBOUND_ENVELOPE_BYTES} (got ${firstBytes.byteLength}); dropping stream`,
            );
            return;
          }
          const bytes = firstBytes;
          let envelope: EnvoyEnvelope;
          try {
            envelope = decodeEnvelope(bytes);
            validateEnvelopeProtocol(protocol, envelope);
          } catch (error) {
            console.error("EnvoyMesh inbound envelope decode failed", error);
            return;
          }

          await this.dispatch({
            envelope,
            remotePeerId,
            protocol,
            remoteAddr: connection?.remoteAddr?.toString?.(),
            ...(replyWithEnvelope ? { replyWithEnvelope } : {}),
          });
        }
      } catch (error) {
        console.error("EnvoyMesh inbound stream failed", error);
      } finally {
        if (!replyConsumed) {
          try {
            await stream.close();
          } catch {
            /* ignore */
          }
        }
        this.emitP2pDebug({
          kind: "stream:close",
          remotePeerId,
          protocol,
          direction: "inbound",
        });
      }
    },
      { runOnLimitedConnection: true },
    );
  }

  private async dispatchData(message: InboundDataTransfer): Promise<void> {
    await Promise.all([...this.dataHandlers].map((handler) => handler(message)));
  }

  private async dispatchPeerDiscovery(peer: DiscoveredMeshPeer): Promise<void> {
    await Promise.all([...this.peerDiscoveryHandlers].map((handler) => handler(peer)));
  }

  attachPeerDiscovery(source: EnvoyMeshPeerDiscoveryService): void {
    source.addEventListener("peer:discovery", (event) => {
      void this.dispatchPeerDiscovery({
        peerId: event.detail.id.toString(),
        multiaddrs: event.detail.multiaddrs?.map((addr) => addr.toString()) ?? [],
      });
    });
  }

  private createPeerDiscoveryServices(): any[] {
    // Filter before deciding whether to enable @libp2p/bootstrap. Loopback /
    // docker-bridge / incomplete addrs are unusable for WAN bootstrap; if the
    // filtered list is empty, enabling bootstrap with `list: []` throws
    // "Bootstrap requires a list of peer addresses" (e.g. local dual-relay
    // process E2E that still passes loopback peers for sibling-book seeding).
    const bootstrapList = (this.options.bootstrapPeers ?? []).filter(
      (a) => !isUnusableBootstrapMultiaddr(a),
    );
    return [
      ...(this.options.enableMdns === false
        ? []
        : [mdns({ interval: this.options.mdnsIntervalMs ?? DEFAULT_MDNS_INTERVAL_MS })]),
      ...(bootstrapList.length > 0
        ? [
            bootstrap({
              list: bootstrapList,
              timeout: this.options.bootstrapTimeoutMs ?? 15_000,
            }),
          ]
        : []),
    ];
  }

  private emitP2pDebug(event: P2pDebugEvent): void {
    if (!this.options.enableP2pDebug) {
      return;
    }

    this.options.onP2pDebug?.(event);
  }

  private reachabilityPeerIdForLog(detail: unknown): string {
    if (detail != null && typeof (detail as { toString?: () => string }).toString === "function") {
      try {
        const s = (detail as { toString: () => string }).toString().trim();
        if (s) return s.length <= 14 ? s : `${s.slice(0, 12)}…`;
      } catch {
        /* fall through */
      }
    }
    const s = String(detail ?? "?").trim();
    return s.length <= 14 ? s : `${s.slice(0, 12)}…`;
  }

  /**
   * Hook circuit-relay-v2 events so operators can see in the log stream
   * whether this node successfully:
   *   1. reserved a slot on a relay hop (inbound reachability via relay)
   *   2. advertised its address through the relay (other peers can find us)
   *
   * Without these, "relay is configured but not reachable" is invisible.
   * The events are emitted by `@libp2p/circuit-relay-v2` and aren't in the
   * libp2p interface types, so we use untyped handlers.
   */
  private installRelayLogging(): void {
    const node = this.node;
    if (!node) return;
    const typed = node as Libp2p & {
      addEventListener?: (type: string, handler: (event: unknown) => void) => void;
      removeEventListener?: (type: string, handler: (event: unknown) => void) => void;
    };
    if (typeof typed.addEventListener !== "function") return;
    // Idempotent — guards against accidental double-install during start()/restart cycles.
    if (this.relayLoggingHandlers) return;

    const reservation = (event: unknown) => {
      const detail = (event as { detail?: unknown })?.detail as
        | { relayPeerId?: { toString(): string }; ttl?: number; limit?: { data?: number; duration?: number } }
        | undefined;
      const relayId = detail?.relayPeerId?.toString() ?? "?";
      const isPreferred =
        this.preferredRelayPeerIds.length === 0 ||
        (relayId !== "?" && this.preferredRelayPeerIds.includes(relayId));
      if (!isPreferred) {
        // AutoRelay often reserves on public IPFS bootstraps. That does not
        // make this node reachable via the configured EnvoyMesh community
        // relay that WAN invites / auto-bond dial.
        console.log(
          `[relay] AutoRelay opportunistic slot on relay=${relayId.slice(0, 12)}… ` +
            `(ttl=${detail?.ttl ?? "?"}s) — ignored for RESERVED status; ` +
            `configured relays=${this.preferredRelayPeerIds.map((id) => id.slice(0, 12)).join(",") || "(none)"}`,
        );
        return;
      }
      this.relayEverReserved = true;
      this.lastReservationError = undefined;
      this.lastReservedAt = new Date().toISOString();
      if (relayId !== "?" && !this.lastReservedRelayPeerIds.includes(relayId)) {
        this.lastReservedRelayPeerIds.push(relayId);
      }
      console.log(
        `[relay] RESERVED slot on relay=${relayId.slice(0, 12)}… ` +
        `(ttl=${detail?.ttl ?? "?"}s, limit=${detail?.limit?.data ?? "?"}B/${detail?.limit?.duration ?? "?"}s). ` +
        `Other peers can now reach this node via /p2p-circuit/p2p/${relayId.slice(0, 12)}…/p2p/<us>.`,
      );
    };

    const reservationError = (event: unknown) => {
      const detail = (event as { detail?: unknown })?.detail;
      const msg = detail instanceof Error ? detail.message : String(detail ?? "");
      this.lastReservationError = msg || "reservation failed (no detail)";
      console.warn(
        `[relay] reservation FAILED: ${msg || "(no detail)"} — ` +
        `this node cannot be reached inbound through a relay until this succeeds. ` +
        `Check that at least one configured relay (cn-relay, public-libp2p, or a custom entry) is reachable.`,
      );
    };

    const advertSuccess = (_event: unknown) => {
      this.relayEverAdvertised = true;
      console.log(`[relay] address ADVERTISED through relay — other peers can now findPeer(thisNode).`);
    };

    const advertError = (event: unknown) => {
      const detail = (event as { detail?: unknown })?.detail;
      const msg = detail instanceof Error ? detail.message : String(detail ?? "");
      console.warn(`[relay] address advertisement FAILED: ${msg || "(no detail)"}`);
    };

    // The libp2p circuit-relay-v2 transport's ReservationStore dispatches
    // `relay:created-reservation` (NOT `relay:reservation`) when a
    // reservation is created via `addRelay(pid, "configured")`. The
    // CircuitRelayService (the server-side, separate component) does
    // emit `relay:reservation`, but we never wire it as a relay server,
    // so listening on it here was a no-op — relayEverReserved stayed
    // false even when the reservation actually landed. The fix is to
    // listen on the actual transport-side event name. Without this,
    // `logDiscoveryReadiness()` always reports `relay=PENDING` even when
    // `/reservations/inspect` on the relay shows the peer in the live
    // store, which kept the auto-bond `probeMeshReady` gate stuck.
    typed.addEventListener("relay:created-reservation", reservation);
    typed.addEventListener("relay:reservation:error", reservationError);
    typed.addEventListener("relay:advert:success", advertSuccess);
    typed.addEventListener("relay:advert:error", advertError);

    this.relayLoggingHandlers = { reservation, reservationError, advertSuccess, advertError };
  }

  private detachRelayLogging(): void {
    const node = this.node;
    const handlers = this.relayLoggingHandlers;
    this.relayLoggingHandlers = undefined;
    if (!node || !handlers) return;
    const typed = node as Libp2p & {
      removeEventListener?: (type: string, handler: (event: unknown) => void) => void;
    };
    if (typeof typed.removeEventListener !== "function") return;
    typed.removeEventListener("relay:created-reservation", handlers.reservation);
    typed.removeEventListener("relay:reservation:error", handlers.reservationError);
    typed.removeEventListener("relay:advert:success", handlers.advertSuccess);
    typed.removeEventListener("relay:advert:error", handlers.advertError);
  }

  /**
   * TCP-level reachability probe for a single host:port. Distinct from
   * the libp2p-level `dialProtocol`: this tests raw TCP connectivity
   * (firewall, NAT, ISP blocks, "host down", DNS resolution) without
   * involving the libp2p Noise+Yamux handshake. Surfaces the underlying
   * "can I even open a socket to this address?" question that the
   * 15s dial timeout hides behind a less specific error.
   *
   * Resolves with `{ ok: true }` on TCP connect, or `{ ok: false, reason }`
   * after the deadline. Never throws.
   */
  private tcpProbe(
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const socket = new net.Socket();
      const finish = (result: { ok: boolean; reason?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        resolve(result);
      };
      // Use a single source of truth for the timeout. We don't also call
      // `socket.setTimeout()` because its default behavior is to fire a
      // 'timeout' event and then close the socket, which would race with
      // our manual timer and could resolve the promise twice.
      const timer = setTimeout(() => finish({ ok: false, reason: `timeout after ${timeoutMs}ms` }), timeoutMs);
      socket.once("connect", () => {
        finish({ ok: true });
      });
      // Use the broad 'error' event for any TCP failure (ECONNREFUSED,
      // EHOSTUNREACH, ENETUNREACH, EHOSTDOWN, ETIMEDOUT, certificate
      // issues, etc.). The error object's `code` is the POSIX errno
      // string, which is the most useful signal an operator can act on.
      socket.once("error", (err: NodeJS.ErrnoException) => {
        const code = err.code ? `${err.code}` : "unknown";
        const syscode = err.syscall ? ` (${err.syscall})` : "";
        finish({ ok: false, reason: `${code}${syscode}: ${err.message}` });
      });
      try {
        socket.connect(port, host);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        finish({ ok: false, reason: `connect threw: ${msg}` });
      }
    });
  }

  /**
   * Walk every configured bootstrap peer and TCP-probe it. Surfaces in
   * the log which one(s) are reachable so an operator can immediately
   * distinguish "the relay is down" from "my firewall blocks the relay"
   * from "DNS isn't resolving". Probes run in parallel with a 5s budget
   * per host so the worst case is 5s regardless of how many peers are
   * configured. Non-blocking — fires after node.start() returns.
   *
   * Why this exists: libp2p's `dialProtocol` reports "dial timed out"
   * at 15s without telling the operator whether the issue is
   * TCP-level (firewall, relay dead) or libp2p-level (protocol
   * mismatch, peer store stale). A bare TCP probe answers the first
   * half and the relay logging above answers the second.
   */
  private async probeBootstrapPeers(): Promise<void> {
    // Filter out unusable entries before probing — a corrupted peer ID
    // in bootstrapPeers would crash `ma()` below.
    const peers = (this.options.bootstrapPeers ?? []).filter(
      (a) => !isUnusableBootstrapMultiaddr(a),
    );
    if (peers.length === 0) {
      console.log(
        `[p2p] bootstrap probe: no bootstrap peers configured — DHT will only see peers it discovers via mDNS/relay-checkin.`,
      );
      return;
    }
    const probes = peers.map(async (addr) => {
      // Parse /ip4/x.x.x.x/tcp/N/p2p/<peerId> → { host, port }.
      // Skip ws/wss (WebSocket-only) and p2p-circuit — those aren't
      // raw-TCP-probeable.
      let host: string;
      let port: number;
      try {
        const m = ma(addr);
        const components = m.getComponents();
        const ip4 = components.find((c) => c.code === 4);
        const ip6 = components.find((c) => c.code === 41);
        const tcp = components.find((c) => c.code === 6);
        if (!tcp) {
          console.log(`[p2p] bootstrap probe: skip non-TCP peer ${addr}`);
          return;
        }
        if (ip4 && typeof ip4.value === "string") {
          host = ip4.value;
        } else if (ip6 && typeof ip6.value === "string") {
          host = ip6.value;
        } else {
          console.log(`[p2p] bootstrap probe: skip non-IP peer ${addr}`);
          return;
        }
        port = Number(tcp.value);
        if (!Number.isFinite(port)) {
          console.log(`[p2p] bootstrap probe: invalid port in ${addr}`);
          return;
        }
      } catch {
        console.warn(`[p2p] bootstrap probe: invalid multiaddr ${addr}`);
        return;
      }

      const result = await this.tcpProbe(host, port, 5_000);
      if (result.ok) {
        console.log(`[p2p] bootstrap probe: REACHABLE ${host}:${port} (${addr})`);
      } else {
        console.warn(
          `[p2p] bootstrap probe: UNREACHABLE ${host}:${port} — ${result.reason}. ` +
          `Check that the relay/service is up, your firewall allows outbound to ${host}:${port}, ` +
          `and your ISP/network doesn't block this destination.`,
        );
      }
    });
    await Promise.all(probes);
  }

  /**
   * Detect the "advertised port doesn't match listen port" misconfiguration
   * that catches operators running behind NAT without port forwarding.
   * autoNAT reports observed addresses — those may not be inbound-routable.
   * Symptom: this node's DHT record is published with port P1 but the
   * OS only has a listener on port P2, so dial-back from peers fails.
   */
  private warnOnAdvertisedPortMismatch(): void {
    if (!this.node) return;
    const listenAddrs = this.node.getMultiaddrs();
    // Collect the set of TCP ports this node is actually listening on.
    const listenPorts = new Set<number>();
    for (const la of listenAddrs) {
      for (const c of la.getComponents()) {
        if (c.code === 6 && typeof c.value === "string") {
          const p = Number(c.value);
          if (Number.isFinite(p)) listenPorts.add(p);
        }
      }
    }
    // For each announced address, check if the port appears in any listen addr.
    for (const announced of this._appendAnnounce) {
      try {
        const m = ma(announced);
        const components = m.getComponents();
        const tcp = components.find((c) => c.code === 6);
        if (!tcp || typeof tcp.value !== "string") continue;
        const port = Number(tcp.value);
        if (!Number.isFinite(port) || listenPorts.has(port)) continue;
        console.warn(
          `[p2p] PORT MISMATCH: advertised address ${announced} has port ${port} ` +
          `but this node is not listening on port ${port}. ` +
          `Other peers that try to dial back to this address will fail. ` +
          `Fix: configure your router to forward external port ${port} → ` +
          `this machine's port ${port}, or remove this address from advertiseAddrs ` +
          `and rely on circuit-relay for inbound reachability.`,
        );
      } catch {
        /* skip invalid */
      }
    }
  }

  /**
   * One-line summary of the node's discovery readiness after start().
   * Operators tailing the log can read this single line and know
   * whether Discover will work — no log archaeology required.
   */
  private logDiscoveryReadiness(): void {
    const lines: string[] = [];
    if (this.options.enableRelay || this.options.enableRelayServer) {
      const status = this.getRelayReservationStatus();
      lines.push(`relay=${status.state.toUpperCase()}`);
    } else {
      lines.push("relay=OFF");
    }
    if (this.options.enableDht) {
      lines.push("dht=ON");
    } else {
      lines.push("dht=OFF");
    }
    if (this.options.enableMdns) {
      lines.push("mDNS=ON");
    } else {
      lines.push("mDNS=OFF");
    }
    const advertisedCount = this._appendAnnounce.length;
    lines.push(`advertised_addrs=${advertisedCount}`);
    const listenCount = this.node?.getMultiaddrs().length ?? 0;
    lines.push(`listen_addrs=${listenCount}`);
    // Surface the actual connection count at startup so operators can
    // catch the "DHT route table empty" case early — without this, the
    // only symptom is a wall of `provide timeout for <topic>` lines
    // minutes later once the periodic advertise kicks in.
    const connectionStats = this.getConnectionStats();
    const connectedPeerCount = connectionStats.connectedPeerIds.length;
    const relayPeerCount = connectionStats.circuitPeerIds.length;
    lines.push(`peers=${connectedPeerCount}`);
    lines.push(`relay_peers=${relayPeerCount}`);
    if (!this.relayEverReserved && (this.options.enableRelay || this.options.enableRelayServer)) {
      lines.push(
        "→ Discover may not work: no relay reservation yet. " +
        "If this persists past 30s, the configured relay is unreachable from this network.",
      );
    }
    if (this.options.enableDht && connectedPeerCount < 2) {
      // The DHT is enabled but this node has only 1 (or 0) connected peers —
      // typically 1 = the configured relay, which doesn't serve modern DHT
      // routing. Capability/interest/geo publishing would hang every 30 s
      // without this signal, drowning the log.
      lines.push(
        `→ DHT is enabled but only ${connectedPeerCount} peer(s) connected — ` +
        `capability-topic publishes will time out. Add a real bootstrap peer ` +
        `(e.g. libp2p public bootstrap, or a node you trust) to bootstrapPeers.`,
      );
    }
    console.log(`[p2p] discovery readiness: ${lines.join("  ")}`);
  }

  private detachReachabilityObservability(): void {
    const node = this.node;
    const handlers = this.reachabilityLogHandlers;
    this.reachabilityLogHandlers = undefined;
    if (!node || !handlers) {
      return;
    }
    const typed = node as Libp2p & {
      removeEventListener?: (type: string, handler: (event: unknown) => void) => void;
    };
    if (typeof typed.removeEventListener !== "function") {
      return;
    }
    typed.removeEventListener("peer:disconnect", handlers.disconnect);
    if (handlers.reconnectFailure) {
      typed.removeEventListener("peer:reconnect-failure", handlers.reconnectFailure);
    }
  }

  /** Console + peer-store introspection around libp2p KEEP_ALIVE reconnect behavior. */
  private attachReachabilityObservability(node: Libp2p): void {
    this.detachReachabilityObservability();

    const fullLog = Boolean(this.options.enableReachabilityLog);
    const peekTaggedOnly = Boolean(this.options.enableP2pDebug && !fullLog);

    if (!fullLog && !peekTaggedOnly) {
      return;
    }

    const typedNode = node as Libp2p & {
      addEventListener?: (type: string, handler: (event: unknown) => void) => void;
      removeEventListener?: (type: string, handler: (event: unknown) => void) => void;
    };
    if (typeof typedNode.addEventListener !== "function") {
      return;
    }

    const onDisconnect = (event: unknown) => {
      const detail = (event as { detail?: unknown }).detail;
      const remotePeerId =
        typeof detail === "object" && detail !== null && "toString" in detail
          ? (detail as { toString(): string }).toString()
          : typeof detail === "string"
            ? detail
            : String(detail);
      void this.logReachabilityDisconnect(remotePeerId, fullLog, peekTaggedOnly);
    };

    typedNode.addEventListener("peer:disconnect", onDisconnect);

    const handlers: {
      disconnect: (event: unknown) => void;
      reconnectFailure?: (event: unknown) => void;
    } = { disconnect: onDisconnect };

    if (fullLog) {
      const onReconnectFailure = (event: unknown) => {
        const detail = (event as { detail?: unknown }).detail;
        console.log(
          `[reachability] reconnect-failure peer=${this.reachabilityPeerIdForLog(detail)} (libp2p exhausted KEEP_ALIVE retries for this peer; KEEP_ALIVE-style tags cleared)`,
        );
      };
      typedNode.addEventListener("peer:reconnect-failure", onReconnectFailure);
      handlers.reconnectFailure = onReconnectFailure;
    }

    this.reachabilityLogHandlers = handlers;
  }

  /** After disconnect; reads peer-store tags so logs stay accurate vs libp2p reconnect queue rules. */
  private async logReachabilityDisconnect(
    remotePeerIdRaw: string,
    verbose: boolean,
    peekTaggedOnly: boolean,
  ): Promise<void> {
    const node = this.node;
    let tagNames: string[] = [];
    const idStr = remotePeerIdRaw.trim();
    if (idStr && node) {
      try {
        const peerData = await node.peerStore.get(peerIdFromString(idStr));
        tagNames = [...peerData.tags.keys()];
      } catch {
        tagNames = [];
      }
    }

    const hasReconnect = peerTagsTriggerReconnectQueue(tagNames);
    const hasEnvoyContact = tagNames.includes(CONTACT_KEEP_ALIVE_PEER_TAG);
    const short = idStr.length <= 14 ? idStr || "?" : `${idStr.slice(0, 12)}…`;

    if (verbose) {
      const maxShown = 8;
      const head = tagNames.slice(0, maxShown).join(",");
      const suffix = tagNames.length > maxShown ? `,+${tagNames.length - maxShown}more` : "";
      console.log(
        `[reachability] disconnect peer=${short} reconnectQueueEligible=${hasReconnect} envoyBondTag=${hasEnvoyContact} tags=[${head}${suffix}]`,
      );
    } else if (peekTaggedOnly && hasReconnect) {
      console.log(
        `[reachability] disconnect peer=${short} reconnectQueueEligible=true envoyBondTag=${hasEnvoyContact}`,
      );
    }
  }

  private attachP2pDebug(node: Libp2p): void {
    const typedNode = node as Libp2p & {
      addEventListener?: (type: string, handler: (event: any) => void) => void;
    };

    if (typeof typedNode.addEventListener !== "function") {
      return;
    }

    const relayDebugEnabled =
      this.options.enableP2pDebug && (this.options.enableRelay || this.options.enableRelayServer);
    if (relayDebugEnabled && this.node) {
      this.relayDebugTimer = setInterval(() => {
        try {
          const stats = this.getConnectionStats();
          if (this.options.enableRelayDebugSummary) {
            console.log(
              `[relay-debug] SUMMARY: circuitPeers=${stats.circuitPeerIds.length} circuitConns=${stats.circuitConnections} totalPeers=${stats.totalPeerIds} totalConns=${stats.totalConnections}`,
            );
            return;
          }
          const cmap = (this.node as { connectionManager?: { connections?: Map<string, unknown[]> } })
            .connectionManager;
          if (!cmap?.connections) {
            return;
          }
          for (const [peerIdStr, conns] of cmap.connections) {
            if (!Array.isArray(conns)) {
              continue;
            }
            for (const conn of conns) {
              const remoteAddr = (conn as { remoteAddr?: { toString?: () => string } })?.remoteAddr?.toString?.() ?? "";
              const connDir = (conn as { stat?: { direction?: string } })?.stat?.direction ?? "unknown";
              console.log(`[relay-debug] conn peer=${peerIdStr} dir=${connDir} addr=${remoteAddr}`);
            }
          }
        } catch (e) {
          console.log(`[relay-debug] error: ${e}`);
        }
      }, 5000);
    }

    // Dispatch peer disconnects to registered handlers — unconditional so
    // that the NodeService peer:lost pipeline fires even when enableP2pDebug
    // is off (the default).
    typedNode.addEventListener("peer:disconnect", (event: any) => {
      const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
      for (const handler of this.peerDisconnectHandlers) {
        handler(remotePeerId);
      }
    });

    // Dispatch peer connects to registered handlers — unconditional so
    // that the NodeService discovery pipeline can process peers that
    // connected via relay/inbound before mDNS fires (libp2p only emits
    // peer:discovery once per peer — if the connection manager adds the
    // peer to the store first, subsequent mDNS re-discoveries are silent).
    typedNode.addEventListener("peer:connect", async (event: any) => {
      const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
      const multiaddrs = await this.getPeerStoreDialHints(remotePeerId);
      for (const handler of this.peerConnectHandlers) {
        handler({ peerId: remotePeerId, multiaddrs });
      }
    });

    if (!this.options.enableP2pDebug) {
      return;
    }

    // Peer connect/disconnect logging (only when p2p-debug is enabled).
    typedNode.addEventListener("peer:connect", (event: any) => {
      const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
      console.log(`[p2p] peer ${remotePeerId.slice(0, 16)}… connected`);
    });

    typedNode.addEventListener("peer:disconnect", (event: any) => {
      const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
      console.log(`[p2p] peer ${remotePeerId.slice(0, 16)}… disconnected`);
    });

    typedNode.addEventListener("peer:connect", (event: any) => {
      const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
      this.emitP2pDebug({ kind: "peer:connect", remotePeerId });
    });

    typedNode.addEventListener("peer:disconnect", (event: any) => {
      const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
      this.emitP2pDebug({ kind: "peer:disconnect", remotePeerId });
    });

    typedNode.addEventListener("connection:open", (event: any) => {
      const connection = event.detail;
      const remotePeerId = connection?.remotePeer?.toString?.() ?? "unknown";
      const direction = connection?.direction === "outbound" ? "outbound" : "inbound";
      this.emitP2pDebug({ kind: "connection:open", remotePeerId, direction });
    });

    typedNode.addEventListener("connection:close", (event: any) => {
      const connection = event.detail;
      const remotePeerId = connection?.remotePeer?.toString?.() ?? "unknown";
      this.emitP2pDebug({ kind: "connection:close", remotePeerId });
    });
  }

  private isAdvancedConnectivityEnabled(): boolean {
    return Boolean(
      this.options.enableDht ||
        this.options.enableRelay ||
        this.options.enableRelayServer ||
        this.options.enableAutoNat ||
        this.options.enableDcutr,
    );
  }

  private async loadQuicTransport(): Promise<() => any> {
    try {
      const module = (await import("@chainsafe/libp2p-quic")) as { quic: () => any };
      return module.quic;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`enableQuic requested but QUIC transport could not initialize: ${message}`);
    }
  }

  private requireDhtForCapabilityTopics(): void {
    if (!this.options.enableDht) {
      throw new Error("capability topic provider APIs require DHT (enableDht: true)");
    }
  }

  private requireNode(): Libp2p {
    if (!this.node) {
      throw new Error("EnvoyMesh has not been started");
    }

    return this.node;
  }
}

export { collectStreamBytes } from "./codec.js";
export { decodeEnvelope, encodeEnvelope };
export {
  voucherJsonBytesFromObject,
  encodeDataTransferBody,
  parseInboundDataTransferBody,
  readAllFromByteStream,
  MAX_DATA_INBOUND_BYTES,
} from "./data-framing.js";
export {
  CLIENT_PROXY_PROTOCOL,
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  ENVOY_MESSAGE_PROTOCOL,
} from "./protocols.js";
export { CAPABILITY_TOPIC_NAMESPACE, cidForCapabilityTopic } from "./capability-topic-cid.js";
export { expandListenAddressesWithQuic, quicListenFromTcpListen } from "./quic-listen.js";
export {
  buildSyntheticRelayCircuitHints,
  dedupeDialHintStrings,
  isPrivateRelayHopCircuitDialHint,
  prioritizeCircuitDialHints,
  relayCircuitToPeer,
} from "./relay-circuit-hints.js";
export {
  buildConfiguredRelayCircuitListenAddrs,
  buildRelayAdvertisedMultiaddrs,
  filterMultiaddrsToPreferredRelays,
  peerIdFromRelayMultiaddr,
} from "./relay-listen-addrs.js";
import {
  isPrivateRelayHopCircuitDialHint,
  prioritizeCircuitDialHints,
} from "./relay-circuit-hints.js";
export { CapabilityRegistry, type CapabilityRegistryOptions, type CapabilityRegistryVerbosity } from "./capability-registry.js";

/**
 * Extract the libp2p peer ID from a dial target.
 * Returns `undefined` for transport-level multiaddrs that lack a `/p2p/` component
 * (e.g. WebTransport CERT hashes from DHT-discovered peers). Callers should fall
 * through to a fresh dial in that case since existing-connection reuse requires a peer ID.
 */
function parsePeerIdFromDialTarget(target: string): string | undefined {
  const trimmed = target.trim();
  if (!trimmed.includes("/")) {
    return trimmed;
  }
  const p = trimmed.lastIndexOf("/p2p/");
  if (p < 0) {
    return undefined;
  }
  const id = trimmed.slice(p + "/p2p/".length).split("/")[0]?.trim();
  if (!id) {
    return undefined;
  }
  return id;
}

/**
 * Module-level flag that disables the loopback/unroutable dial-hint filter.
 * Intended for in-process multi-node E2E tests where every peer listens on
 * 127.0.0.1 and there are no public addresses available.
 *
 * Production code must never call this — it would allow dialing loopback
 * addresses learned from the DHT / peer store in a real network.
 */
let _allowLoopbackDialHints = false;

/** @internal — exported for test harness setup only. */
export function setAllowLoopbackDialHints(v: boolean): void {
  _allowLoopbackDialHints = v;
}

/** @internal */
export function allowsLoopbackDialHints(): boolean {
  return _allowLoopbackDialHints;
}

export function isLoopbackOrUnspecifiedDialHint(addr: string): boolean {
  return (
    addr.includes("/ip4/127.") ||
    addr.includes("/ip4/0.0.0.0/") ||
    addr.includes("/ip6/::1/") ||
    addr.endsWith("/ip6/::1")
  );
}

/**
 * Docker Desktop / bridge interface gateways libp2p announces when listening on 0.0.0.0.
 * Dialing these from the host does not reach a remote libp2p peer.
 */
export function isDockerBridgeGatewayDialHint(addr: string): boolean {
  return /\/ip4\/172\.(1[7-9]|2\d|3[01])\.0\.1\//.test(addr);
}

/** Stable libp2p listen ports — not ephemeral TCP source ports from inbound connections. */
const STABLE_LIBP2P_TCP_PORTS = new Set([4001, 4002, 4011, 41641]);

/**
 * Returns true if the given multiaddr is a private / non-routable address that
 * should NOT be advertised to the DHT. Remote peers can never dial these.
 *
 * Public-hop `/p2p-circuit/` addresses are kept. Private-hop circuits are
 * classified via {@link isPrivateRelayHopCircuitDialHint}.
 */
/** True for RFC1918 / link-local / RFC6598-overlay direct TCP multiaddrs. */
export function isPrivateLanTcpDialHint(addr: string): boolean {
  const a = addr.trim();
  if (!a.includes("/tcp/") || a.includes("/p2p-circuit/")) {
    return false;
  }
  if (isLoopbackOrUnspecifiedDialHint(a) || isDockerBridgeGatewayDialHint(a)) {
    return false;
  }
  if (/\/ip4\/10\.\d+\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/192\.168\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/169\.254\.\d+\.\d+\//.test(a)) return true;
  // RFC 6598 (100.64/10) — Tailscale / headscale / some carrier overlays.
  // Within the same overlay these are mutually dialable (Online-direct);
  // wan-public still strips them for cross-Internet invites.
  if (/\/ip4\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+\//.test(a)) return true;
  return false;
}

/** True when dial hints include at least one same-LAN direct TCP path. */
export function hasDirectPrivateLanDialHints(hints: readonly string[]): boolean {
  return hints.some((h) => isPrivateLanTcpDialHint(h));
}

/** True for direct (non-circuit) TCP hints that are not loopback. */
export function hasDirectTcpDialHints(hints: readonly string[]): boolean {
  return hints.some(
    (h) =>
      h.includes("/tcp/") &&
      !h.includes("/p2p-circuit/") &&
      !isLoopbackOrUnspecifiedDialHint(h) &&
      !isDockerBridgeGatewayDialHint(h) &&
      !isLikelyInboundConnSnapshotDialHint(h),
  );
}

/**
 * True when hints include a LAN TCP path we may try for Relay→Direct upgrade.
 * Includes high-port private LAN (`tcp/0` listeners) when {@link sameSubnetLanFirst}.
 */
export function hasLanUpgradeDialHints(
  hints: readonly string[],
  opts?: { sameSubnetLanFirst?: boolean },
): boolean {
  if (hasDirectTcpDialHints(hints)) return true;
  if (opts?.sameSubnetLanFirst !== true) return false;
  return hasDirectPrivateLanDialHints(hints);
}

export function isPrivateOrUnroutableDialHint(addr: string): boolean {
  // Public-hop circuits are WAN-dialable. Private-hop circuits are not.
  if (addr.includes("/p2p-circuit/")) {
    return isPrivateRelayHopCircuitDialHint(addr);
  }
  // When running in-process E2E tests, keep loopback addresses so two-node
  // topologies on 127.0.0.1 can reach each other through the hint pipeline.
  if (allowsLoopbackDialHints()) return false;
  // Filter private/reserved IP ranges.
  if (isLoopbackOrUnspecifiedDialHint(addr)) return true;
  if (isDockerBridgeGatewayDialHint(addr)) return true;
  const a = addr.trim();
  if (/\/ip4\/10\.\d+\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/192\.168\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/169\.254\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+\//.test(a)) return true;
  return false;
}

/**
 * Inbound chat stores `connection.remoteAddr`, which is the remote side's ephemeral
 * source port on outbound-initiated TCP connections — not a dialable listen address.
 */
export function isLikelyInboundConnSnapshotDialHint(addr: string): boolean {
  if (!addr.includes("/tcp/")) {
    return false;
  }
  // Match `/tcp/N/` or `/tcp/N` at end — peer-directory often omits a trailing slash.
  const match = addr.match(/\/tcp\/(\d+)(?:\/|$)/);
  if (!match) {
    return false;
  }
  const port = Number(match[1]);
  if (STABLE_LIBP2P_TCP_PORTS.has(port)) {
    return false;
  }
  return port >= 32768;
}

/**
 * True when a multiaddr must not be used as bootstrap / relay.checkin target.
 *
 * This catches malformed multiaddrs, loopback/DOCKER addresses, and —
 * critically — addresses whose embedded peer ID is not valid base58btc.
 * An invalid peer ID would crash @libp2p/bootstrap on startup, making the
 * node completely unrecoverable.
 */
export function isUnusableBootstrapMultiaddr(addr: string): boolean {
  const a = addr.trim();
  if (!a.startsWith("/")) {
    return true;
  }
  if (isLoopbackOrUnspecifiedDialHint(a)) {
    return true;
  }
  if (isDockerBridgeGatewayDialHint(a)) {
    return true;
  }
  if (!a.includes("/p2p/")) {
    return true;
  }
  if (isBrowserOnlyTransportDialHint(a) || isIncompleteCircuitDialHint(a)) {
    return true;
  }
  // Validate ALL /p2p/<peerId> segments (not just the last one).
  // Circuit multiaddrs have two: /p2p/<relayId>/p2p-circuit/p2p/<targetId>.
  // A corrupted relay ID (e.g. containing lowercase-L 'l', which is not
  // valid base58btc) crashes @libp2p/bootstrap and makes the node
  // unrecoverable on startup.
  const p2pSegments = a.split("/p2p/");
  for (let i = 1; i < p2pSegments.length; i++) {
    const peerIdStr = p2pSegments[i]!.split("/")[0]!.trim();
    if (!peerIdStr) return true;
    try {
      peerIdFromString(peerIdStr);
    } catch {
      return true;
    }
  }
  return false;
}

/** Browser/WebTransport/QUIC multiaddrs from the public DHT — not dialable by desktop TCP nodes. */
export function isBrowserOnlyTransportDialHint(addr: string): boolean {
  const a = addr.trim();
  return (
    a.includes("/webtransport/") ||
    a.includes("/certhash/") ||
    a.includes("/quic-v1/") ||
    a.includes("/quic/")
  );
}

/**
 * Circuit paths whose relay hop is not TCP (e.g. QUIC bootstrap relays from the public libp2p DHT).
 * Desktop TCP nodes cannot open app streams on those limited relay connections.
 */
export function isUnusableDesktopCircuitDialHint(addr: string): boolean {
  const a = addr.trim();
  if (!a.includes("/p2p-circuit/")) {
    return false;
  }
  const relayHop = a.split("/p2p-circuit/")[0] ?? "";
  return !relayHop.includes("/tcp/");
}

/** libp2p circuit-relay v2: remote peer has no reservation slot on the relay hop. */
export function isRelayReservationDialError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /NO_RESERVATION|no reservation/i.test(msg);
}

/**
 * Circuit reservation without a final `/p2p/<remotePeer>` hop — dials the relay, not the contact.
 * Example bad: `…/p2p/<relayId>/p2p-circuit` (no target peer appended).
 */
export function isIncompleteCircuitDialHint(addr: string): boolean {
  const a = addr.trim();
  if (!a.includes("/p2p-circuit")) {
    return false;
  }
  if (/\/p2p-circuit\/p2p\/[^/]+$/.test(a)) {
    return false;
  }
  return true;
}

function lastPeerIdFromMultiaddr(addr: string): string | undefined {
  const m = addr.trim().match(/\/p2p\/([^/]+)$/);
  return m?.[1];
}

export type UsableOutboundDialHintOptions = {
  /**
   * Keep high-port (≥32768) private LAN TCP hints. Needed when both peers
   * listen on `tcp/0` (random port) on the same subnet — the live listen
   * address looks like an inbound snapshot but is the only LAN path.
   */
  allowEphemeralPrivateLan?: boolean;
};

/**
 * Filter multiaddrs for outbound dials to a specific libp2p peer.
 * Drops WebTransport, incomplete circuits, bootstrap nodes, and paths whose final `/p2p/` id ≠ target.
 */
export function isUsableOutboundPeerDialHint(
  addr: string,
  targetPeerId?: string,
  opts?: UsableOutboundDialHintOptions,
): boolean {
  const a = addr.trim();
  if (!a.startsWith("/")) {
    return false;
  }
  if (!allowsLoopbackDialHints() && (isLoopbackOrUnspecifiedDialHint(a) || isDockerBridgeGatewayDialHint(a))) {
    return false;
  }
  if (isPublicLibp2pBootstrapMultiaddr(a) || a.includes("bootstrap.libp2p.io")) {
    return false;
  }
  if (
    isBrowserOnlyTransportDialHint(a) ||
    isIncompleteCircuitDialHint(a) ||
    isUnusableDesktopCircuitDialHint(a)
  ) {
    return false;
  }
  // Snapshot check: high TCP ports (≥32768) are almost always ephemeral
  // source ports from inbound connections, not dialable listen addresses.
  // Apply even when `/p2p/` is absent — peer-directory often stores bare
  // `/ip4/…/tcp/HIGHPORT` snapshots that previously skipped this filter and
  // burned full dialTimeout on same-LAN warm.
  // Exception: same-subnet dials may keep private-LAN high ports (tcp/0 listeners).
  if (isLikelyInboundConnSnapshotDialHint(a)) {
    const allowLanEphemeral =
      opts?.allowEphemeralPrivateLan === true && isPrivateLanTcpDialHint(a);
    if (!allowLanEphemeral) {
      return false;
    }
  }
  const hasExplicitPeer = lastPeerIdFromMultiaddr(a);
  if (hasExplicitPeer && targetPeerId?.trim() && hasExplicitPeer !== targetPeerId.trim()) {
    return false;
  }
  return true;
}

export function filterUsableOutboundPeerDialHints(
  addrs: string[],
  targetPeerId: string,
  opts?: UsableOutboundDialHintOptions,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addrs) {
    const a = raw.trim();
    if (!a || seen.has(a)) {
      continue;
    }
    if (!isUsableOutboundPeerDialHint(a, targetPeerId, opts)) {
      continue;
    }
    seen.add(a);
    out.push(a);
  }
  return out;
}

/**
 * When direct TCP hints exist and circuits are not explicitly preferred, drop
 * `/p2p-circuit/` paths so libp2p cannot fall through to stale relay
 * reservations (NO_RESERVATION).
 *
 * **Cross-network safeguard:** If ALL direct TCP hints are private LAN
 * (RFC1918 / link-local / CGNAT) and none are publicly routable, circuit
 * hints are KEPT.  Private-LAN addresses are unreachable from other networks;
 * stripping circuits would leave no viable path.  This fixes the sponsor-
 * friend auto-bond scenario where the bundled config carries the sponsor's
 * home LAN addresses (192.168.x) but the new user is on a different network.
 */
export function filterDialHintsForOutboundSend(
  hints: readonly string[],
  targetPeerId: string,
  opts?: {
    preferCircuitHints?: boolean;
    /** Alias used when callers pass {@link MeshOutboundOptions} through. */
    sameSubnetLanFirst?: boolean;
  } & UsableOutboundDialHintOptions,
): string[] {
  const allowEphemeralPrivateLan =
    opts?.allowEphemeralPrivateLan === true || opts?.sameSubnetLanFirst === true;
  const filtered = filterUsableOutboundPeerDialHints([...hints], targetPeerId, {
    allowEphemeralPrivateLan,
  });
  if (opts?.preferCircuitHints === true) {
    return prioritizeCircuitDialHints(filtered);
  }
  // Only strip circuits when we have at least one publicly routable direct
  // TCP hint.  Private-LAN-only direct hints (192.168.x, 10.x, 172.16-31,
  // 169.254.x) are unreachable cross-network — the circuit fallback must
  // survive so the dial layer can try the relay path.
  const hasPublicDirect = filtered.some(
    (h) =>
      hasDirectTcpDialHints([h]) &&
      !isPrivateOrUnroutableDialHint(h),
  );
  if (hasPublicDirect) {
    return filtered.filter((h) => !h.includes("/p2p-circuit/"));
  }
  return filtered;
}

/** True for libp2p project's public DHT bootstrap dnsaddr multiaddrs (not EnvoyMesh circuit relays). */
export function isPublicLibp2pBootstrapMultiaddr(addr: string): boolean {
  const a = addr.trim();
  return (
    a.includes("bootstrap.libp2p.io") ||
    a.includes("/dnsaddr/bootstrap.libp2p.io/") ||
    a.includes("/dnsaddr/am6.bootstrap.libp2p.io/") ||
    a.includes("/dnsaddr/am7.bootstrap.libp2p.io/")
  );
}

/** Keep only multiaddrs suitable for libp2p bootstrap and relay control-plane dials. */
export function filterBootstrapMultiaddrs(addrs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addrs) {
    const a = raw.trim();
    if (!a || isUnusableBootstrapMultiaddr(a) || seen.has(a)) {
      continue;
    }
    seen.add(a);
    out.push(a);
  }
  return out;
}

/** Bootstrap addrs that speak Envoy relay.checkin / relay.lookup (exclude public libp2p DHT nodes). */
export function filterRelayControlTargets(addrs: string[]): string[] {
  return filterBootstrapMultiaddrs(addrs).filter((a) => !isPublicLibp2pBootstrapMultiaddr(a));
}

/**
 * Cap wan-default bootstrap fanout so circuit-relay CONNECT stays reliable.
 *
 * History (2026-08-05): Allen Mac with 27 bootstrap addrs opened 140+ peers /
 * dialQueue 300+. Local `hasLiveRelayReservation()` stayed true while external
 * `/p2p-circuit/` dials flapped (OK 119ms ↔ 20s timeout). Prefer configured /
 * community relays; keep at most {@link MAX_BOOTSTRAP_PEERS_FOR_HOPPABILITY}
 * total dial targets (resolved public DHT peers count toward the cap).
 */
export const MAX_BOOTSTRAP_PEERS_FOR_HOPPABILITY = 8;

/** Community cn-relay peer id — always preferred when present in the list. */
export const COMMUNITY_CN_RELAY_PEER_ID =
  "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";

export function capBootstrapPeersForCircuitHoppability(
  addrs: readonly string[],
  options?: { maxTotal?: number; preferPeerIds?: readonly string[] },
): string[] {
  const maxTotal = options?.maxTotal ?? MAX_BOOTSTRAP_PEERS_FOR_HOPPABILITY;
  const prefer = new Set<string>([
    COMMUNITY_CN_RELAY_PEER_ID,
    ...(options?.preferPeerIds ?? []).map((s) => s.trim()).filter(Boolean),
  ]);
  const filtered = filterBootstrapMultiaddrs([...addrs]).filter(
    (a) => !isPrivateLanTcpDialHint(a) && !a.includes("/p2p-circuit/"),
  );
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const a of filtered) {
    const p2pIdx = a.lastIndexOf("/p2p/");
    const peerId = p2pIdx >= 0 ? a.slice(p2pIdx + 5).split("/")[0]?.trim() : undefined;
    if (peerId && prefer.has(peerId)) preferred.push(a);
    else rest.push(a);
  }
  const out = [...preferred];
  for (const a of rest) {
    if (out.length >= maxTotal) break;
    out.push(a);
  }
  return out;
}

/** Returns true if the multiaddr uses QUIC (udp port + quic-v1). */
export function isQuicDialHint(addr: string): boolean {
  return addr.includes("/quic-v1");
}

/** Prefer non-loopback multiaddrs first; omit loopback whenever any usable hint exists. */
export function preferNonLoopbackDialHints(hints: string[]): string[] {
  const non = hints.filter((h) => !isLoopbackOrUnspecifiedDialHint(h));
  if (non.length > 0) {
    return sortDialHints(non);
  }
  return sortDialHints(hints);
}

/**
 * Sort dial hints by:
 * 1. Prefer direct TCP/LAN paths over relay circuits (LAN + same-network peers)
 * 2. Prefer stable listen ports over ephemeral inbound snapshots (same-subnet mode)
 * 3. Prefer TCP over browser/WebTransport QUIC
 * 4. Prefer non-loopback / non-unspecified over loopback
 */
function sortDialHints(
  hints: string[],
  opts?: { sameSubnetLanFirst?: boolean },
): string[] {
  return [...hints].sort((a, b) => {
    const browserA = isBrowserOnlyTransportDialHint(a) ? 1 : 0;
    const browserB = isBrowserOnlyTransportDialHint(b) ? 1 : 0;
    if (browserA !== browserB) {
      return browserA - browserB;
    }
    const lanA = isPrivateLanTcpDialHint(a) ? 0 : 1;
    const lanB = isPrivateLanTcpDialHint(b) ? 0 : 1;
    if (lanA !== lanB) {
      return lanA - lanB;
    }
    if (opts?.sameSubnetLanFirst) {
      // Stable listen ports (4001/4011/…) before ephemeral inbound snapshots.
      const snapA = isLikelyInboundConnSnapshotDialHint(a) ? 1 : 0;
      const snapB = isLikelyInboundConnSnapshotDialHint(b) ? 1 : 0;
      if (snapA !== snapB) {
        return snapA - snapB;
      }
    }
    const circuitA = a.includes("/p2p-circuit/p2p/") ? 1 : 0;
    const circuitB = b.includes("/p2p-circuit/p2p/") ? 1 : 0;
    if (circuitA !== circuitB) {
      return circuitA - circuitB;
    }
    const tcpA = a.includes("/tcp/") ? 0 : 1;
    const tcpB = b.includes("/tcp/") ? 0 : 1;
    if (tcpA !== tcpB) {
      return tcpA - tcpB;
    }
    const quicA = isQuicDialHint(a) ? 1 : 0;
    const quicB = isQuicDialHint(b) ? 1 : 0;
    if (quicA !== quicB) {
      return quicA - quicB;
    }
    return Number(isLoopbackOrUnspecifiedDialHint(a)) - Number(isLoopbackOrUnspecifiedDialHint(b));
  });
}

function dialHintsToMultiaddrs(
  hints: string[],
  peerIdStr: string,
): Multiaddr[] {
  const out: Multiaddr[] = [];
  for (const h of hints) {
    const a = h.trim();
    if (!a.startsWith("/")) continue;
    try {
      if (a.includes("/p2p/")) {
        out.push(ma(a));
      } else {
        out.push(ma(`${a}/p2p/${peerIdStr}`));
      }
    } catch {
      /* skip unusable addr string */
    }
  }
  return out;
}

function validateEnvelopeProtocol(protocol: string, envelope: EnvoyEnvelope): void {
  if (protocol === ENVOY_CHAT_PROTOCOL) {
    if (
      envelope.intent !== "chat.message" &&
      envelope.intent !== "chat.delivered" &&
      envelope.intent !== "chat.room.sync" &&
      envelope.intent !== "chat.room.message" &&
      !envelope.intent.startsWith("call.") &&
      !envelope.intent.startsWith("profile.") &&
      !envelope.intent.startsWith("bond.")
    ) {
      throw new Error(`invalid intent ${envelope.intent} on chat protocol`);
    }
    return;
  }
  if (protocol === ENVOY_MESSAGE_PROTOCOL && envelope.intent === "chat.message") {
    throw new Error("chat.message must be sent on chat protocol");
  }
}
