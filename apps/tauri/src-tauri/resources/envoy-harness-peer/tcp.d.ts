/**
 * R2 — `connectPeerClient`: the production TCP transport for the peer
 * dialect. Connects a `PeerClient` to a peer server over a real socket.
 */
import { type Socket } from "node:net";
import { PeerClient } from "./client.js";
import type { PeerEventSink } from "./events.js";
import type { PeerSigner } from "./envelope.js";
export interface TcpPeerClientOptions {
    host: string;
    port: number;
    /** R2 — connect timeout (default 10s). */
    connectTimeoutMs?: number;
    /** D7 — request signing. */
    signer?: PeerSigner;
    /** D7 — observability sink. */
    onEvent?: PeerEventSink;
    /** Per-request timeout (default 30s). */
    requestTimeoutMs?: number;
}
export interface TcpPeerClient {
    client: PeerClient;
    socket: Socket;
    close(): void;
}
export declare function connectPeerClient(options: TcpPeerClientOptions): Promise<TcpPeerClient>;
//# sourceMappingURL=tcp.d.ts.map