/**
 * D2 — `createInProcessPeerPair`: a hermetic client/server pair over two
 * `PassThrough` streams (the ACP test pattern). The server side uses the
 * injected handler; the client side is a `PeerClient`.
 */
import { JsonRpcConnection, type RequestHandler } from "@envoymesh/envoy-harness";
import { PeerClient } from "./client.js";
export interface InProcessPeerPair {
    client: PeerClient;
    /** The server-side connection (for disposal / direct handler access). */
    server: JsonRpcConnection;
    close(): void;
}
export declare function createInProcessPeerPair(handler: RequestHandler, options?: {
    requestTimeoutMs?: number;
}): InProcessPeerPair;
//# sourceMappingURL=pair.d.ts.map