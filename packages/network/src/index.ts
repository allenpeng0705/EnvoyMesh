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
import { KEEP_ALIVE, type RoutingOptions } from "@libp2p/interface";
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
  encodeDataTransferBody,
  MAX_DATA_INBOUND_BYTES,
  parseInboundDataTransferBody,
  parseVoucherJsonObject,
  readAllFromByteStream,
} from "./data-framing.js";

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
  scanLibp2pConnectionsFlat,
  scanLibp2pConnectionsMap,
  type MeshConnectionStats,
} from "./connection-stats.js";

export {
  DEFAULT_CLIENT_MAX_CONNECTIONS,
  DEFAULT_MDNS_INTERVAL_MS,
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
 * When libp2p still reports a connection as open, `newStream` can hang or fail after NAT sleep,
 * idle TCP half-open state, or relay path expiry (often seen on Windows). We time out and force a fresh dial.
 *
 * Relay `/p2p-circuit` connections often carry `connection.limits` (Circuit Relay v2 "limited" conns).
 * `newStream()` throws `LimitedConnectionError` on those unless opting into `runOnLimitedConnection`.
 * Reusing them for Envoy app protocols is wrong — we only reuse **unlimited** connections and otherwise dial fresh.
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
 *   30_000ms — current; gives the libp2p transport (and any reservation
 *              handshake that piggybacks on the dial) a real chance to
 *              complete across slow cross-region paths.
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
const HINT_DIAL_TIMEOUT_MS = 30_000;

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
 * this at 5_000 and `HINT_DIAL_TIMEOUT_MS` at 30_000, a slow relay
 * would dial successfully then fail reservation 25s before the dial
 * timeout ever fires — the user sees `relay=PENDING` and the
 * readiness summary's "no reservation yet" warning without any
 * obvious reason.
 */
const RELAY_RESERVATION_TIMEOUT_MS = 30_000;

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
  enableDht?: boolean;
  dhtClientMode?: boolean;
  dhtProtocol?: string;
  bootstrapPeers?: string[];
  bootstrapTimeoutMs?: number;
  enableRelay?: boolean;
  enableRelayServer?: boolean;
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

export class EnvoyMesh {
  private readonly handlers = new Set<MeshMessageHandler>();
  private readonly dataHandlers = new Set<MeshDataTransferHandler>();
  private readonly peerDiscoveryHandlers = new Set<MeshPeerDiscoveryHandler>();
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

  constructor(private readonly options: EnvoyMeshOptions = {}) {}

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

    // Circuit relay v2 clients must advertise `/p2p-circuit` in listen addrs so libp2p can obtain
    // reservations on relays we dial (e.g. bootstrap). Without this, other peers cannot complete
    // inbound dials via `/…/p2p-circuit/p2p/<ourPeerId>` even if EMP relay.checkin/lookup work.
    // Servers use `circuitRelayServer()` and do not need this when only acting as the hop.
    // Browser nodes always need this (no listening addresses).
    if ((this.options.enableRelay || browserMode) && !this.options.enableRelayServer && !listenAddrs.includes("/p2p-circuit")) {
      listenAddrs = [...listenAddrs, "/p2p-circuit"];
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
      connectionMonitor: {
        pingInterval: 45_000,
        abortConnectionOnPingFailure: false,
      },
      connectionManager: {
        ...(maxConnections != null ? { maxConnections } : {}),
        reconnectRetries: 10,
        reconnectRetryInterval: 5000,
        reconnectBackoffFactor: 1.5,
        maxParallelReconnects: 10,
        // Bumped from 15s/10s to 30s in lockstep with HINT_DIAL_TIMEOUT_MS.
        // The libp2p-level dialTimeout is the hard ceiling for any single
        // multiaddr dial (the per-hint race above is the soft ceiling for
        // multiaddr iteration). Keeping them in lockstep ensures both
        // bounds agree and the slower of the two wins.
        dialTimeout: 30_000,
        addressDialTimeout: 30_000,
      },
      addresses: {
        listen: listenAddrs,
        ...(this._appendAnnounce.length > 0 ? { appendAnnounce: this._appendAnnounce } : {}),
      },
      transports: [
        ...(browserMode ? [] : [tcp()]),
        ...(enableWebSocket ? [webSockets()] : []),
        ...(this.options.enableRelay || this.options.enableRelayServer || browserMode
          ? [circuitRelayTransport({ reservationCompletionTimeout: RELAY_RESERVATION_TIMEOUT_MS })]
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
            ...(this.options.enableRelayServer ? { relay: circuitRelayServer() } : {}),
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

    await this.node.handle(ENVOY_DATA_PROTOCOL, async (stream: any, connection: any) => {
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
    });

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
    await this.node.stop();
    this.node = undefined;
    this.relayEverReserved = false;
    this.relayEverAdvertised = false;
  }

  get peerId(): string {
    return this.requireNode().peerId.toString();
  }

  get multiaddrs(): string[] {
    return this.requireNode()
      .getMultiaddrs()
      .map((addr) => addr.toString());
  }

  /** Dialable multiaddrs from the libp2p peer store (includes mDNS-learned LAN paths). */
  async getPeerStoreDialHints(peerIdStr: string): Promise<string[]> {
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
      return filterUsableOutboundPeerDialHints(out, idStr);
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

  /** Open libp2p remote peer ids from the connection manager (direct + relay). */
  getConnectedPeerIds(): string[] {
    return this.getConnectionStats().connectedPeerIds;
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

      // Deduplicate
      const uniqueAddrs = [...new Set(allPublicAddrs)];

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

  /**
   * Register a raw protocol handler that receives the libp2p stream directly.
   * Unlike `onMessage` (which provides decoded envelopes), this gives access
   * to the raw duplex stream for non-envelope protocols like client-proxy.
   */
  async handleRawProtocol(
    protocol: string,
    handler: (stream: any, connection: any) => Promise<void>,
  ): Promise<void> {
    await this.requireNode().handle(protocol, handler);
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
    },
  ): Promise<EnvoyEnvelope> {
    validateEnvelopeProtocol(protocol, envelope);
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const sendOptions: MeshOutboundOptions | undefined =
      options?.dialHints?.length || options?.preferCircuitHints || options?.forceFreshDial
        ? {
            dialHints: options.dialHints,
            preferCircuitHints: options.preferCircuitHints,
            forceFreshDial: options.forceFreshDial,
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
    },
  ): Promise<EnvoyEnvelope> {
    validateEnvelopeProtocol(ENVOY_CHAT_PROTOCOL, envelope);
    const timeoutMs = options?.timeoutMs ?? CHAT_DELIVERY_ACK_TIMEOUT_MS;
    const sendOptions: MeshOutboundOptions | undefined =
      options?.dialHints?.length ||
      options?.preferCircuitHints ||
      options?.forceFreshDial
        ? {
            dialHints: options.dialHints,
            preferCircuitHints: options.preferCircuitHints,
            forceFreshDial: options.forceFreshDial,
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
      hasDirectTcpDialHints(hintList) &&
      !sendOptions?.preferCircuitHints;
    if (peerIdStr && !sendOptions?.forceFreshDial && !sendOptions?.verifyConnection) {
      const before = this.getPeerConnectionInfo(peerIdStr);
      if (before.connected) {
        if (before.direct || !canUpgradeRelayToDirect) {
          return before;
        }
        await this.closeConnectionsToPeer(peerIdStr);
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
      const isDhtNoise =
        detail.includes("limited connection") ||
        detail.includes("Protocol selection failed") ||
        detail.includes("could not negotiate");
      if (!isDhtNoise) {
        console.warn(`[network] ensurePeerReachable failed for ${target.slice(0, 24)}…: ${detail}`);
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
    let hintsRaw = filterDialHintsForOutboundSend(
      sendOptions?.dialHints ?? [],
      peerIdStr,
      sendOptions,
    );
    const barePeerDial = !target.trim().startsWith("/");

    if (peerIdStr) {
      const scrubbed = await this.scrubPeerStoreDialHints(peerIdStr, hintsRaw);
      hintsRaw = filterDialHintsForOutboundSend(
        [...new Set([...hintsRaw, ...scrubbed])],
        peerIdStr,
        sendOptions,
      );
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
      const stream = await promiseWithTimeout(
        node.dialProtocol(addr as any, protocol),
        HINT_DIAL_TIMEOUT_MS,
        `dial ${String(addr).slice(0, 64)}`,
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
    const tryRoutableHints = async (): Promise<{ stream: any; remotePeerId?: string } | undefined> => {
      if (!hasRoutableHint) {
        return undefined;
      }
      // Try hints sequentially in speed order (LAN first, then direct TCP, then circuits).
      // Sequential avoids connection flapping from simultaneous dials to the same peer.
      for (const ma of dialHintsToMultiaddrs(sortDialHints(routableHints), peerIdStr)) {
        try {
          return await dialOnce(ma);
        } catch (e) {
          lastError = e;
        }
      }
      return undefined;
    };

    // Always prefer explicit filtered hints over bare `/p2p/id` (libp2p peerstore keeps ephemeral inbound observed addrs).
    if (barePeerDial && hasRoutableHint) {
      const viaHints = await tryRoutableHints();
      if (viaHints) {
        return viaHints;
      }
    } else if (barePeerDial && peerIdStr) {
      const storeHints = filterDialHintsForOutboundSend(
        await this.getPeerStoreDialHints(peerIdStr),
        peerIdStr,
        sendOptions,
      );
      for (const ma of dialHintsToMultiaddrs(sortDialHints(storeHints), peerIdStr)) {
        try {
          return await dialOnce(ma);
        } catch (e) {
          lastError = e;
        }
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
      for (const ma of dialHintsToMultiaddrs(sortDialHints(hints), peerIdStr)) {
        try {
          return await dialOnce(ma);
        } catch (e) {
          lastError = e;
        }
      }
    }
    /** Last resort: retry any loopback hints only if bare + routable passes failed */
    const loopOnly = hintsRaw.filter((h) => isLoopbackOrUnspecifiedDialHint(h));
    for (const ma of dialHintsToMultiaddrs(sortDialHints(loopOnly), peerIdStr)) {
      try {
        return await dialOnce(ma);
      } catch (e) {
        lastError = e;
      }
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

  async dial(target: string): Promise<any> {
    const dialTarget = this._normalizeDialTarget(target);
    return this.requireNode().dial(dialTarget as any);
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
    await this.requireNode().handle(protocol, async (stream: any, connection: any) => {
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
    });
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
    return [
      ...(this.options.enableMdns === false
        ? []
        : [mdns({ interval: this.options.mdnsIntervalMs ?? DEFAULT_MDNS_INTERVAL_MS })]),
      ...(this.options.bootstrapPeers && this.options.bootstrapPeers.length > 0
        ? [
            bootstrap({
              list: this.options.bootstrapPeers,
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
      this.relayEverReserved = true;
      console.log(
        `[relay] RESERVED slot on relay=${relayId.slice(0, 12)}… ` +
        `(ttl=${detail?.ttl ?? "?"}s, limit=${detail?.limit?.data ?? "?"}B/${detail?.limit?.duration ?? "?"}s). ` +
        `Other peers can now reach this node via /p2p-circuit/p2p/${relayId.slice(0, 12)}…/p2p/<us>.`,
      );
    };

    const reservationError = (event: unknown) => {
      const detail = (event as { detail?: unknown })?.detail;
      const msg = detail instanceof Error ? detail.message : String(detail ?? "");
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

    typed.addEventListener("relay:reservation", reservation);
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
    typed.removeEventListener("relay:reservation", handlers.reservation);
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
    const peers = this.options.bootstrapPeers ?? [];
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
      lines.push(`relay=${this.relayEverReserved ? "RESERVED" : "PENDING"}`);
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

    if (!this.options.enableP2pDebug) {
      return;
    }

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
  prioritizeCircuitDialHints,
  relayCircuitToPeer,
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
 * Note: addresses that contain `/p2p-circuit/` (circuit relay) are always kept —
 * they are universally dialable regardless of NAT.
 */
/** True for RFC1918 / link-local direct TCP multiaddrs (same-LAN dial candidates). */
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

export function isPrivateOrUnroutableDialHint(addr: string): boolean {
  // Always keep circuit relay addresses — they work through relays regardless of NAT.
  if (addr.includes("/p2p-circuit/")) return false;
  // Filter private/reserved IP ranges.
  if (isLoopbackOrUnspecifiedDialHint(addr)) return true;
  if (isDockerBridgeGatewayDialHint(addr)) return true;
  const a = addr.trim();
  if (/\/ip4\/10\.\d+\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/192\.168\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/169\.254\.\d+\.\d+\//.test(a)) return true;
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
  const match = addr.match(/\/tcp\/(\d+)\//);
  if (!match) {
    return false;
  }
  const port = Number(match[1]);
  if (STABLE_LIBP2P_TCP_PORTS.has(port)) {
    return false;
  }
  return port >= 32768;
}

/** True when a multiaddr must not be used as bootstrap / relay.checkin target. */
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

/**
 * Filter multiaddrs for outbound dials to a specific libp2p peer.
 * Drops WebTransport, incomplete circuits, bootstrap nodes, and paths whose final `/p2p/` id ≠ target.
 */
export function isUsableOutboundPeerDialHint(addr: string, targetPeerId?: string): boolean {
  const a = addr.trim();
  if (!a.startsWith("/")) {
    return false;
  }
  if (isLoopbackOrUnspecifiedDialHint(a) || isDockerBridgeGatewayDialHint(a)) {
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
  // Only skip this check for addresses WITHOUT a /p2p/ suffix — libp2p
  // peer store strips peer IDs, making valid addresses look like snapshots.
  const hasExplicitPeer = lastPeerIdFromMultiaddr(a);
  if (!targetPeerId?.trim()) {
    // No target peer ID — always apply snapshot filter.
    if (isLikelyInboundConnSnapshotDialHint(a)) {
      return false;
    }
  } else if (hasExplicitPeer) {
    // Address has an explicit /p2p/ peer ID. Verify it matches the target,
    // then still apply the snapshot check — a matching peer ID on a high
    // port is still ephemeral (e.g. port 62210 from an inbound connection).
    if (hasExplicitPeer !== targetPeerId.trim()) {
      return false;
    }
    if (isLikelyInboundConnSnapshotDialHint(a)) {
      return false;
    }
  }
  // No explicit peer ID — trust the caller's target. Skip snapshot check.
  return true;
}

export function filterUsableOutboundPeerDialHints(addrs: string[], targetPeerId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addrs) {
    const a = raw.trim();
    if (!a || seen.has(a)) {
      continue;
    }
    if (!isUsableOutboundPeerDialHint(a, targetPeerId)) {
      continue;
    }
    seen.add(a);
    out.push(a);
  }
  return out;
}

/**
 * When direct TCP/LAN hints exist and circuits are not explicitly preferred, drop `/p2p-circuit/`
 * paths so libp2p cannot fall through to stale relay reservations (NO_RESERVATION).
 */
export function filterDialHintsForOutboundSend(
  hints: readonly string[],
  targetPeerId: string,
  opts?: { preferCircuitHints?: boolean },
): string[] {
  const filtered = filterUsableOutboundPeerDialHints([...hints], targetPeerId);
  if (opts?.preferCircuitHints === true) {
    return filtered;
  }
  if (hasDirectTcpDialHints(filtered)) {
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
 * 2. Prefer TCP over browser/WebTransport QUIC
 * 3. Prefer non-loopback / non-unspecified over loopback
 */
function sortDialHints(hints: string[]): string[] {
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
