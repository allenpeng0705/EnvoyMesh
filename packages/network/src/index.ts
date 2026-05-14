import { noise } from "@chainsafe/libp2p-noise";
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
import { byteStream } from "@libp2p/utils";
import { KEEP_ALIVE, type RoutingOptions } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { multiaddr } from "@multiformats/multiaddr";
import type { CID } from "multiformats/cid";
import { createLibp2p, type Libp2p } from "libp2p";
import type { Uint8ArrayList } from "uint8arraylist";
import { decodeEnvelope, encodeEnvelope } from "./codec.js";
import {
  encodeDataTransferBody,
  MAX_DATA_INBOUND_BYTES,
  parseInboundDataTransferBody,
  parseVoucherJsonObject,
} from "./data-framing.js";
import {
  cidForCapabilityTopic,
  createSignedCapabilityTopicRecord,
  verifySignedCapabilityTopicRecord,
  encodeCapabilityTopicRecordToMultiaddr,
} from "./capability-topic.js";
import { expandListenAddressesWithQuic } from "./quic-listen.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key.js";

export { DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME, loadOrCreateLibp2pPrivateKey } from "./libp2p-key.js";

export const ENVOY_MESSAGE_PROTOCOL = "/envoymesh/message/0.1.0";
export const ENVOY_CHAT_PROTOCOL = "/envoymesh/chat/0.1.0";
export const ENVOY_DATA_PROTOCOL = "/envoymesh/data/0.1.0";
export const CLIENT_PROXY_PROTOCOL = "/envoymesh/client-proxy/0.1.0";

/** Prefix `keep-alive-*` triggers libp2p reconnect-on-disconnect queue for bonded contacts */
const CONTACT_KEEP_ALIVE_PEER_TAG = `${KEEP_ALIVE}-envoymesh-contact`;

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

function promiseWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
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

/** Options for {@link EnvoyMesh.send}, {@link EnvoyMesh.sendChat}, and other outbound envelope sends. */
export interface MeshOutboundOptions {
  /**
   * Extra multiaddrs to try (e.g. from `system.signal` in the peer directory) when a bare `/p2p/…`
   * dial does not succeed.
   */
  dialHints?: string[];
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
  /** Peer IDs of clients connected via this relay server (when enableRelayServer is true). */
  private readonly relayConnectedPeers = new Set<string>();
  private relayDebugTimer?: ReturnType<typeof setInterval>;
  private node?: Libp2p;
  private reachabilityLogHandlers?: {
    disconnect: (event: unknown) => void;
    reconnectFailure?: (event: unknown) => void;
  };

  constructor(private readonly options: EnvoyMeshOptions = {}) {}

  async start(): Promise<void> {
    if (this.node) {
      return;
    }

    const advancedConnectivityEnabled = this.isAdvancedConnectivityEnabled();

    const baseListen = this.options.listen ?? ["/ip4/0.0.0.0/tcp/0"];
    let listenAddrs =
      this.options.enableQuic === true ? expandListenAddressesWithQuic(baseListen) : [...baseListen];

    // Circuit relay v2 clients must advertise `/p2p-circuit` in listen addrs so libp2p can obtain
    // reservations on relays we dial (e.g. bootstrap). Without this, other peers cannot complete
    // inbound dials via `/…/p2p-circuit/p2p/<ourPeerId>` even if EMP relay.checkin/lookup work.
    // Servers use `circuitRelayServer()` and do not need this when only acting as the hop.
    if (this.options.enableRelay && !this.options.enableRelayServer && !listenAddrs.includes("/p2p-circuit")) {
      listenAddrs = [...listenAddrs, "/p2p-circuit"];
    }

    const appendAnnounce: string[] = [];
    for (const raw of this.options.advertiseAddrs ?? []) {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) continue;
      try {
        multiaddr(s);
        appendAnnounce.push(s);
      } catch {
        console.warn(`[p2p] skipping invalid advertise multiaddr: ${raw}`);
      }
    }
    if (appendAnnounce.length > 0) {
      console.log(`[p2p] appendAnnounce: ${appendAnnounce.join(", ")}`);
    }

    const quicTransportFactory = this.options.enableQuic ? await this.loadQuicTransport() : undefined;

    const libp2pPrivateKey = this.options.libp2pPrivateKeyPath
      ? await loadOrCreateLibp2pPrivateKey(this.options.libp2pPrivateKeyPath)
      : undefined;
    if (libp2pPrivateKey && this.options.enableP2pDebug) {
      console.log(`[p2p] libp2p private key file: ${this.options.libp2pPrivateKeyPath}`);
    }

    this.node = await createLibp2p({
      ...(libp2pPrivateKey != null ? { privateKey: libp2pPrivateKey } : {}),
      connectionMonitor: {
        pingInterval: 6000,
        abortConnectionOnPingFailure: true,
      },
      connectionManager: {
        reconnectRetries: 10,
        reconnectRetryInterval: 2000,
        reconnectBackoffFactor: 1.5,
        maxParallelReconnects: 10,
        dialTimeout: 15_000,
        addressDialTimeout: 10_000,
      },
      addresses: {
        listen: listenAddrs,
        ...(appendAnnounce.length > 0 ? { appendAnnounce } : {}),
      },
      transports: [
        tcp(),
        ...(this.options.enableRelay || this.options.enableRelayServer ? [circuitRelayTransport()] : []),
        ...(quicTransportFactory ? [quicTransportFactory()] : []),
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
            ...(this.options.enableAutoNat ? { autoNAT: autoNAT() } : {}),
            ...(this.options.enableDcutr ? { dcutr: dcutr() } : {}),
          }
        : undefined,
    });

    this.attachPeerDiscovery(this.node);

    await this.installEnvelopeInboundHandler(ENVOY_MESSAGE_PROTOCOL);
    await this.installEnvelopeInboundHandler(ENVOY_CHAT_PROTOCOL);

    await this.node.handle(ENVOY_DATA_PROTOCOL, async (stream: any, connection: any) => {
      const remotePeerId = connection.remotePeer.toString();
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol: ENVOY_DATA_PROTOCOL,
        direction: "inbound",
      });

      try {
        const raw = await byteStream(stream).read();
        if (raw === null || raw.byteLength === 0 || raw.byteLength > MAX_DATA_INBOUND_BYTES) {
          return;
        }
        const bytes = raw instanceof Uint8Array ? raw : (raw as Uint8ArrayList).subarray();
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

    await this.node.start();
    this.attachP2pDebug(this.node);
    this.attachReachabilityObservability(this.node);
  }

  async stop(): Promise<void> {
    if (!this.node) {
      return;
    }

    if (this.relayDebugTimer) {
      clearInterval(this.relayDebugTimer);
      this.relayDebugTimer = undefined;
    }
    this.detachReachabilityObservability();
    await this.node.stop();
    this.node = undefined;
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
   * Returns peer IDs observed on relay/circuit connections.
   */
  getConnectedRelayPeerIds(): string[] {
    const allPeers = new Set<string>();

    for (const peerId of this.relayConnectedPeers) {
      allPeers.add(peerId);
    }

    if (this.node) {
      try {
        const connections = (this.node as any).connectionManager?.connections;
        if (connections) {
          for (const [peerIdStr, conns] of connections) {
            const hasRelayConnection = Array.isArray(conns)
              ? conns.some((conn) => (conn?.remoteAddr?.toString?.() ?? "").includes("/p2p-circuit"))
              : false;
            if (hasRelayConnection) {
              allPeers.add(String(peerIdStr));
            }
          }
        }
      } catch {
        // Connection manager API may vary
      }
    }

    const result = [...allPeers];
    if (this.options.enableP2pDebug) {
      console.log(`[relay-tracked] getConnectedRelayPeerIds returning: ${JSON.stringify(result)}`);
    }
    return result;
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
      const connections = (this.node as any).connectionManager?.connections;
      if (!connections) {
        return { connected: false, direct: false };
      }

      const conns = connections.get(peerId);
      if (!conns || !Array.isArray(conns) || conns.length === 0) {
        return { connected: false, direct: false };
      }

      // Find the best (direct) connection
      const openConns = conns.filter((c) => c?.status === "open");
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
   * Derives the libp2p provider CID for a capability topic (same mapping as {@link provideCapabilityTopic}).
   */
  async capabilityTopicCid(topic: string): Promise<CID> {
    return cidForCapabilityTopic(topic);
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
  ): Promise<{ cid: CID; signedRecord?: import("@envoymesh/protocol").SignedCapabilityTopicRecord }> {
    this.requireDhtForCapabilityTopics();
    const cid = await cidForCapabilityTopic(topic);
    await this.requireNode().contentRouting.provide(cid, options);

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
      await Promise.race([
        this.requireNode().contentRouting.put(cid.bytes, recordBytes, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error("put timeout")), 5000)),
      ]).catch((err) => {
        if (!err.message.includes("timeout")) {
          throw err;
        }
        // Timeout is acceptable — record is still announced via provide(); put is best-effort DHT propagation
      });
    }

    return { cid, signedRecord };
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
  private _normalizeDialTarget(target: string): ReturnType<typeof multiaddr> {
    if (target.startsWith("/")) return multiaddr(target);
    return multiaddr(`/p2p/${target}`);
  }

  /**
   * Open a libp2p stream on [protocol] to [target] and return the raw stream.
   * Caller is responsible for read/write lifecycle and closing the stream.
   */
  async dialProtocol(target: string, protocol: string): Promise<any> {
    return this.requireNode().dialProtocol(this._normalizeDialTarget(target) as any, protocol);
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
    options?: { timeoutMs?: number },
  ): Promise<EnvoyEnvelope> {
    validateEnvelopeProtocol(ENVOY_MESSAGE_PROTOCOL, envelope);
    const dialTarget = this._normalizeDialTarget(target);
    const timeoutMs = options?.timeoutMs ?? 30_000;
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
    if (stream.writeStatus !== "writable") {
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}`,
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
        protocol: ENVOY_MESSAGE_PROTOCOL,
        direction: "outbound",
      });
    }
    if (replyBytes === null) {
      throw new Error("sendExpectReply: peer closed stream without a reply");
    }
    const reply = decodeEnvelope(replyBytes.subarray());
    validateEnvelopeProtocol(ENVOY_MESSAGE_PROTOCOL, reply);
    return reply;
  }

  async sendChat(target: string, envelope: EnvoyEnvelope, sendOptions?: MeshOutboundOptions): Promise<number> {
    return this.sendEnvelopeOnProtocol(target, envelope, ENVOY_CHAT_PROTOCOL, sendOptions);
  }

  private async openOutboundStream(
    target: string,
    protocol: string,
    sendOptions?: MeshOutboundOptions,
  ): Promise<{ stream: any; remotePeerId?: string }> {
    const node = this.requireNode();
    const peerIdStr = parsePeerIdFromDialTarget(target);

    const existing = this.findOpenConnectionToPeer(node, peerIdStr);
    if (existing) {
      try {
        const stream = await promiseWithTimeout(
          existing.newStream(protocol),
          NEW_STREAM_ON_OPEN_CONNECTION_TIMEOUT_MS,
          `newStream ${protocol}`,
        );
        return { stream, remotePeerId: existing.remotePeer.toString() };
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.warn(
          `[network] outbound reuse failed for ${peerIdStr.slice(0, 12)}… (${detail}); closing connection and redialing`,
        );
        try {
          await existing.close();
        } catch {
          /* ignore */
        }
      }
    }

    const limitedExisting = this.findLimitedConnectionToPeer(node, peerIdStr);
    if (limitedExisting) {
      try {
        const stream = await promiseWithTimeout(
          limitedExisting.newStream([protocol], { runOnLimitedConnection: true }),
          NEW_STREAM_ON_OPEN_CONNECTION_TIMEOUT_MS,
          `newStream(limited relay) ${protocol}`,
        );
        return { stream, remotePeerId: limitedExisting.remotePeer.toString() };
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.warn(
          `[network] limited relay stream open failed for ${peerIdStr.slice(0, 12)}… (${detail}); trying fresh dial`,
        );
      }
    }

    return this.dialOpenStreamViaHints(node, peerIdStr, target, protocol, sendOptions);
  }

  private async dialOpenStreamViaHints(
    node: Libp2p,
    peerIdStr: string,
    target: string,
    protocol: string,
    sendOptions?: MeshOutboundOptions,
  ): Promise<{ stream: any; remotePeerId?: string }> {
    const hintsRaw = sendOptions?.dialHints ?? [];
    const routableHints = preferNonLoopbackDialHints(hintsRaw);
    /** True when hints include at least one non-loopback circuit/LAN/WAN addr — try before bare `/p2p/id` dial (peerstore may prioritize remote loopback → ECONNREFUSED here). */
    const hasRoutableHint = routableHints.some((h) => !isLoopbackOrUnspecifiedDialHint(h));
    const barePeerDial = !target.trim().startsWith("/");

    const dialOnce = async (addr: ReturnType<typeof multiaddr> | string): Promise<{ stream: any; remotePeerId?: string }> => {
      const stream = await node.dialProtocol(addr as any, protocol);
      const s = stream as { connection?: { remotePeer?: { toString(): string } } };
      return { stream, remotePeerId: s.connection?.remotePeer?.toString() };
    };

    let lastError: unknown = new Error("no outbound dial attempted");

    if (barePeerDial && hasRoutableHint) {
      for (const ma of dialHintsToMultiaddrs(sortDialHints(routableHints), peerIdStr)) {
        try {
          return await dialOnce(ma);
        } catch (e) {
          lastError = e;
        }
      }
    }

    const dialTarget = this._normalizeDialTarget(target);
    try {
      return await dialOnce(dialTarget);
    } catch (firstError) {
      lastError = firstError;
      const hints = preferNonLoopbackDialHints(sendOptions?.dialHints ?? []);
      for (const ma of dialHintsToMultiaddrs(sortDialHints(hints), peerIdStr)) {
        try {
          return await dialOnce(ma);
        } catch (e) {
          lastError = e;
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
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
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
    if (stream.writeStatus !== "writable") {
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}`,
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

  async sendDataTransfer(target: string, voucherUtf8: Uint8Array, chunks: Uint8Array[]): Promise<number> {
    const dialTarget = this._normalizeDialTarget(target);
    const startedAt = Date.now();
    const stream: any = await this.requireNode().dialProtocol(dialTarget as any, ENVOY_DATA_PROTOCOL);
    const remotePeerId = stream.connection?.remotePeer?.toString();
    if (remotePeerId) {
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol: ENVOY_DATA_PROTOCOL,
        direction: "outbound",
      });
    }
    if (stream.writeStatus !== "writable") {
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}`,
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
    // Convert peer ID to proper multiaddr format if needed
    let dialTarget = target;
    if (!target.startsWith("/")) {
      dialTarget = `/p2p/${target}`;
    }
    return this.requireNode().dial(dialTarget as any);
  }

  async probePeer(target: string): Promise<number> {
    const dialTarget = this._normalizeDialTarget(target);
    const startedAt = Date.now();
    const connection = await this.requireNode().dial(dialTarget as any);
    await connection.close();
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
    if (stream.writeStatus !== "writable") {
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}`,
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
        protocol === ENVOY_MESSAGE_PROTOCOL
          ? async (env: EnvoyEnvelope) => {
              if (replyConsumed) {
                throw new Error("EnvoyMesh replyWithEnvelope: duplicate reply");
              }
              replyConsumed = true;
              validateEnvelopeProtocol(protocol, env);
              await streamIo.write(encodeEnvelope(env));
              await stream.close();
            }
          : undefined;

      try {
        const bytes = await streamIo.read();

        if (bytes !== null) {
          let envelope: EnvoyEnvelope;
          try {
            envelope = decodeEnvelope(bytes.subarray());
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
        : [mdns({ interval: this.options.mdnsIntervalMs ?? 1000 })]),
      ...(this.options.bootstrapPeers && this.options.bootstrapPeers.length > 0
        ? [
            bootstrap({
              list: this.options.bootstrapPeers,
              timeout: this.options.bootstrapTimeoutMs ?? 1000,
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

    // Track relay-connected peers when relay transport or relay server is enabled
    const relayTrackingEnabled = this.options.enableRelay || this.options.enableRelayServer;
    if (relayTrackingEnabled) {
      typedNode.addEventListener("peer:connect", (event: any) => {
        const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
        this.relayConnectedPeers.add(remotePeerId);
        if (this.options.enableP2pDebug) {
          console.log(`[relay-tracked] peer:connect ${remotePeerId} (total: ${this.relayConnectedPeers.size})`);
        }
      });

      typedNode.addEventListener("peer:disconnect", (event: any) => {
        const remotePeerId = event.detail?.toString?.() ?? String(event.detail);
        this.relayConnectedPeers.delete(remotePeerId);
        if (this.options.enableP2pDebug) {
          console.log(`[relay-tracked] peer:disconnect ${remotePeerId} (total: ${this.relayConnectedPeers.size})`);
        }
      });

      // Also track using connectionManager for relay connections which may not fire peer:connect
      if (this.node) {
        this.relayDebugTimer = setInterval(() => {
          try {
            const cmap = (this.node as any).connectionManager;
            let relayCount = 0;
            let totalCount = 0;
            let peersList: string[] = [];
            if (cmap?.connections) {
              // connections is a Map-like structure
              try {
                for (const [peerIdStr, conns] of cmap.connections) {
                  peersList.push(String(peerIdStr));
                  totalCount += conns.length;
                  for (const conn of conns) {
                    const remoteAddr = conn?.remoteAddr?.toString?.() ?? "";
                    const connDir = conn?.stat?.direction ?? "unknown";
                    if (remoteAddr.includes("/p2p-circuit")) {
                      this.relayConnectedPeers.add(String(peerIdStr));
                      relayCount++;
                    }
                    if (this.options.enableP2pDebug) {
                      console.log(`[relay-debug] conn peer=${peerIdStr} dir=${connDir} addr=${remoteAddr}`);
                    }
                  }
                }
              } catch (e) {
                if (this.options.enableP2pDebug) {
                  console.log(`[relay-debug] connectionManager iteration failed: ${e}`);
                }
              }
            }
            if (this.options.enableP2pDebug && this.options.enableRelayDebugSummary) {
              console.log(`[relay-debug] SUMMARY: peers=${peersList.join(",")} total=${totalCount} relay=${relayCount} tracked=${this.relayConnectedPeers.size}`);
            }
          } catch (e) {
            if (this.options.enableP2pDebug) {
              console.log(`[relay-debug] error: ${e}`);
            }
          }
        }, 5000);
      }
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
export { voucherJsonBytesFromObject } from "./data-framing.js";
export { CAPABILITY_TOPIC_NAMESPACE, cidForCapabilityTopic } from "./capability-topic.js";
export { expandListenAddressesWithQuic, quicListenFromTcpListen } from "./quic-listen.js";
export { CapabilityRegistry, type CapabilityRegistryOptions, type CapabilityRegistryVerbosity } from "./capability-registry.js";

function parsePeerIdFromDialTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed.includes("/")) {
    return trimmed;
  }
  const p = trimmed.lastIndexOf("/p2p/");
  if (p < 0) {
    throw new Error(`Cannot parse peer id from dial target: ${target}`);
  }
  const id = trimmed.slice(p + "/p2p/".length).split("/")[0]?.trim();
  if (!id) {
    throw new Error(`Cannot parse peer id from dial target: ${target}`);
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
 * 1. Prefer QUIC multiaddrs over TCP-only
 * 2. Prefer non-loopback / non-unspecified over loopback
 */
function sortDialHints(hints: string[]): string[] {
  return [...hints].sort((a, b) => {
    // Primary: QUIC first
    const quicA = isQuicDialHint(a) ? 0 : 1;
    const quicB = isQuicDialHint(b) ? 0 : 1;
    if (quicA !== quicB) return quicA - quicB;
    // Secondary: non-loopback first
    return Number(isLoopbackOrUnspecifiedDialHint(a)) - Number(isLoopbackOrUnspecifiedDialHint(b));
  });
}

function dialHintsToMultiaddrs(
  hints: string[],
  peerIdStr: string,
): Array<ReturnType<typeof multiaddr>> {
  const out: Array<ReturnType<typeof multiaddr>> = [];
  for (const h of hints) {
    const a = h.trim();
    if (!a.startsWith("/")) continue;
    try {
      if (a.includes("/p2p/")) {
        out.push(multiaddr(a));
      } else {
        out.push(multiaddr(`${a}/p2p/${peerIdStr}`));
      }
    } catch {
      /* skip unusable addr string */
    }
  }
  return out;
}

function validateEnvelopeProtocol(protocol: string, envelope: EnvoyEnvelope): void {
  if (protocol === ENVOY_CHAT_PROTOCOL && envelope.intent !== "chat.message") {
    throw new Error(`invalid intent ${envelope.intent} on chat protocol`);
  }
  if (protocol === ENVOY_MESSAGE_PROTOCOL && envelope.intent === "chat.message") {
    throw new Error("chat.message must be sent on chat protocol");
  }
}
