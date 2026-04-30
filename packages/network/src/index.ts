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
import type { RoutingOptions } from "@libp2p/interface";
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
import { cidForCapabilityTopic } from "./capability-topic.js";
import { expandListenAddressesWithQuic } from "./quic-listen.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key.js";

export { DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME, loadOrCreateLibp2pPrivateKey } from "./libp2p-key.js";

export const ENVOY_MESSAGE_PROTOCOL = "/envoymesh/message/0.1.0";
export const ENVOY_CHAT_PROTOCOL = "/envoymesh/chat/0.1.0";
export const ENVOY_DATA_PROTOCOL = "/envoymesh/data/0.1.0";

export interface InboundMeshMessage {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  protocol: string;
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

export interface EnvoyMeshOptions {
  listen?: string[];
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

  constructor(private readonly options: EnvoyMeshOptions = {}) {}

  async start(): Promise<void> {
    if (this.node) {
      return;
    }

    const advancedConnectivityEnabled = this.isAdvancedConnectivityEnabled();

    const baseListen = this.options.listen ?? ["/ip4/0.0.0.0/tcp/0"];
    let listenAddrs =
      this.options.enableQuic === true ? expandListenAddressesWithQuic(baseListen) : [...baseListen];

    // Note: /p2p-circuit listen address is NOT added here manually.
    // When circuitRelayServer() service is enabled, it automatically reserves /p2p-circuit
    // addresses and they appear in getMultiaddrs() after startup.

    const quicTransportFactory = this.options.enableQuic ? await this.loadQuicTransport() : undefined;

    const libp2pPrivateKey = this.options.libp2pPrivateKeyPath
      ? await loadOrCreateLibp2pPrivateKey(this.options.libp2pPrivateKeyPath)
      : undefined;
    if (libp2pPrivateKey && this.options.enableP2pDebug) {
      console.log(`[p2p] libp2p private key file: ${this.options.libp2pPrivateKeyPath}`);
    }

    this.node = await createLibp2p({
      ...(libp2pPrivateKey != null ? { privateKey: libp2pPrivateKey } : {}),
      addresses: {
        listen: listenAddrs,
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
  }

  async stop(): Promise<void> {
    if (!this.node) {
      return;
    }

    if (this.relayDebugTimer) {
      clearInterval(this.relayDebugTimer);
      this.relayDebugTimer = undefined;
    }
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
   * Derives the libp2p provider CID for a capability topic (same mapping as {@link provideCapabilityTopic}).
   */
  async capabilityTopicCid(topic: string): Promise<CID> {
    return cidForCapabilityTopic(topic);
  }

  /**
   * Announce this node as a provider for `topic` on the DHT (requires {@link EnvoyMeshOptions.enableDht}).
   * Uses IPFS-style provider records; `topic` is hashed to a CID per `docs/p2p-discovery.md`.
   */
  async provideCapabilityTopic(topic: string, options?: RoutingOptions): Promise<void> {
    this.requireDhtForCapabilityTopics();
    const cid = await cidForCapabilityTopic(topic);
    await this.requireNode().contentRouting.provide(cid, options);
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
   */
  async findCapabilityTopicProviders(
    topic: string,
    options?: RoutingOptions & { limit?: number; queryTimeoutMs?: number },
  ): Promise<CapabilityTopicProviderRecord[]> {
    this.requireDhtForCapabilityTopics();
    const cid = await cidForCapabilityTopic(topic);
    const merged = { limit: 32, queryTimeoutMs: 20_000, ...options };
    const { limit, queryTimeoutMs, ...routingOpts } = merged;
    const signal = routingOpts.signal ?? AbortSignal.timeout(queryTimeoutMs);
    const out: CapabilityTopicProviderRecord[] = [];
    try {
      for await (const provider of this.requireNode().contentRouting.findProviders(cid, {
        ...routingOpts,
        signal,
      })) {
        out.push({
          peerId: provider.id.toString(),
          multiaddrs: provider.multiaddrs.map((ma) => ma.toString()),
          routing: provider.routing,
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

  async send(target: string, envelope: EnvoyEnvelope): Promise<number> {
    return this.sendEnvelopeOnProtocol(target, envelope, ENVOY_MESSAGE_PROTOCOL);
  }

  async sendChat(target: string, envelope: EnvoyEnvelope): Promise<number> {
    return this.sendEnvelopeOnProtocol(target, envelope, ENVOY_CHAT_PROTOCOL);
  }

  private async sendEnvelopeOnProtocol(
    target: string,
    envelope: EnvoyEnvelope,
    protocol: string,
  ): Promise<number> {
    validateEnvelopeProtocol(protocol, envelope);
    const dialTarget = target.startsWith("/") ? multiaddr(target) : target;
    const startedAt = Date.now();
    const stream: any = await this.requireNode().dialProtocol(dialTarget as any, protocol);
    const remotePeerId = stream.connection?.remotePeer?.toString();
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
    await byteStream(stream).write(encodeEnvelope(envelope));
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
    const dialTarget = target.startsWith("/") ? multiaddr(target) : target;
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
    const dialTarget = target.startsWith("/") ? multiaddr(target) : target;
    return this.requireNode().dial(dialTarget as any);
  }

  async probePeer(target: string): Promise<number> {
    const dialTarget = target.startsWith("/") ? multiaddr(target) : target;
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
    const dialTarget = target.startsWith("/") ? multiaddr(target) : target;
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
      this.emitP2pDebug({
        kind: "stream:open",
        remotePeerId,
        protocol,
        direction: "inbound",
      });

      try {
        const bytes = await byteStream(stream).read();

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
          });
        }
      } catch (error) {
        console.error("EnvoyMesh inbound stream failed", error);
      } finally {
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

function validateEnvelopeProtocol(protocol: string, envelope: EnvoyEnvelope): void {
  if (protocol === ENVOY_CHAT_PROTOCOL && envelope.intent !== "chat.message") {
    throw new Error(`invalid intent ${envelope.intent} on chat protocol`);
  }
  if (protocol === ENVOY_MESSAGE_PROTOCOL && envelope.intent === "chat.message") {
    throw new Error("chat.message must be sent on chat protocol");
  }
}
