/**
 * D2 — `createInProcessPeerPair`: a hermetic client/server pair over two
 * `PassThrough` streams (the ACP test pattern). The server side uses the
 * injected handler; the client side is a `PeerClient`.
 */
import { PassThrough } from "node:stream";
import { JsonRpcConnection } from "@envoymesh/envoy-harness";
import { PeerClient } from "./client.js";
export function createInProcessPeerPair(handler, options) {
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const server = new JsonRpcConnection({
        input: clientToServer,
        output: serverToClient,
        onRequest: handler,
    });
    const client = new PeerClient({
        connection: new JsonRpcConnection({
            input: serverToClient,
            output: clientToServer,
        }),
        ...(options?.requestTimeoutMs !== undefined
            ? { requestTimeoutMs: options.requestTimeoutMs }
            : {}),
    });
    return {
        client,
        server,
        close() {
            clientToServer.destroy();
            serverToClient.destroy();
        },
    };
}
//# sourceMappingURL=pair.js.map