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
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p, type Libp2p } from "libp2p";
import { decodeEnvelope, encodeEnvelope } from "./codec.js";

export const ENVOY_MESSAGE_PROTOCOL = "/envoymesh/message/0.1.0";

export interface InboundMeshMessage {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
}

export type MeshMessageHandler = (message: InboundMeshMessage) => Promise<void>;

export interface DiscoveredMeshPeer {
  peerId: string;
  multiaddrs: string[];
}

export type MeshPeerDiscoveryHandler = (peer: DiscoveredMeshPeer) => void | Promise<void>;

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
}

export interface EnvoyMeshPeerDiscoveryService {
  addEventListener(
    type: "peer:discovery",
    handler: (event: { detail: { id: { toString(): string }; multiaddrs?: Array<{ toString(): string }> } }) => void,
  ): void;
}

export class EnvoyMesh {
  private readonly handlers = new Set<MeshMessageHandler>();
  private readonly peerDiscoveryHandlers = new Set<MeshPeerDiscoveryHandler>();
  private node?: Libp2p;

  constructor(private readonly options: EnvoyMeshOptions = {}) {}

  async start(): Promise<void> {
    if (this.node) {
      return;
    }

    const advancedConnectivityEnabled = this.isAdvancedConnectivityEnabled();

    this.node = await createLibp2p({
      addresses: {
        listen: this.options.listen ?? ["/ip4/0.0.0.0/tcp/0"],
      },
      transports: [
        tcp(),
        ...(this.options.enableRelay ? [circuitRelayTransport()] : []),
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

    await this.node.handle(ENVOY_MESSAGE_PROTOCOL, async (stream: any, connection: any) => {
      try {
        const bytes = await byteStream(stream).read();

        if (bytes !== null) {
          await this.dispatch({
            envelope: decodeEnvelope(bytes.subarray()),
            remotePeerId: connection.remotePeer.toString(),
          });
        }
      } catch (error) {
        console.error("EnvoyMesh inbound stream failed", error);
        throw error;
      }
    });

    await this.node.start();
  }

  async stop(): Promise<void> {
    if (!this.node) {
      return;
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

  get enabledFeatures(): string[] {
    return [
      ...(this.options.enableMdns === false ? [] : ["mdns"]),
      ...(this.options.bootstrapPeers && this.options.bootstrapPeers.length > 0 ? ["bootstrap"] : []),
      ...(this.options.enableDht ? ["dht"] : []),
      ...(this.options.enableRelay ? ["relay-transport"] : []),
      ...(this.options.enableRelayServer ? ["relay-server"] : []),
      ...(this.options.enableAutoNat ? ["autonat"] : []),
      ...(this.options.enableDcutr ? ["dcutr"] : []),
    ];
  }

  onMessage(handler: MeshMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onPeerDiscovered(handler: MeshPeerDiscoveryHandler): () => void {
    this.peerDiscoveryHandlers.add(handler);
    return () => this.peerDiscoveryHandlers.delete(handler);
  }

  async send(target: string, envelope: EnvoyEnvelope): Promise<void> {
    const dialTarget = target.startsWith("/") ? multiaddr(target) : target;
    const stream = await this.requireNode().dialProtocol(dialTarget as any, ENVOY_MESSAGE_PROTOCOL);
    if (stream.writeStatus !== "writable") {
      throw new Error(
        `Cannot send on stream ${stream.id}; status=${stream.status}, writeStatus=${stream.writeStatus}, remoteWriteStatus=${stream.remoteWriteStatus}`,
      );
    }
    await byteStream(stream).write(encodeEnvelope(envelope));
    await stream.close();
  }

  private async dispatch(message: InboundMeshMessage): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(message)));
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

  private isAdvancedConnectivityEnabled(): boolean {
    return Boolean(
      this.options.enableDht ||
        this.options.enableRelay ||
        this.options.enableRelayServer ||
        this.options.enableAutoNat ||
        this.options.enableDcutr,
    );
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
