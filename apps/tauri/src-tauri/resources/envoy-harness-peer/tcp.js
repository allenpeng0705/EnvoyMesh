/**
 * R2 — `connectPeerClient`: the production TCP transport for the peer
 * dialect. Connects a `PeerClient` to a peer server over a real socket.
 */
import { connect } from "node:net";
import { once } from "node:events";
import { JsonRpcConnection } from "@envoymesh/envoy-harness";
import { PeerClient } from "./client.js";
export async function connectPeerClient(options) {
    const socket = connect({
        host: options.host,
        port: options.port,
    });
    const timeoutMs = options.connectTimeoutMs ?? 10_000;
    const timer = setTimeout(() => {
        socket.destroy(new Error(`peer connect timed out (${options.host}:${options.port})`));
    }, timeoutMs);
    try {
        await once(socket, "connect");
    }
    catch (err) {
        clearTimeout(timer);
        socket.destroy();
        throw err;
    }
    clearTimeout(timer);
    const connection = new JsonRpcConnection({ input: socket, output: socket });
    // A server reset (ECONNRESET) must not surface as an unhandled error
    // event on the connection; hosts observe disconnects via socket close.
    connection.on("error", () => undefined);
    const client = new PeerClient({
        connection,
        ...(options.signer !== undefined ? { signer: options.signer } : {}),
        ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
        ...(options.requestTimeoutMs !== undefined
            ? { requestTimeoutMs: options.requestTimeoutMs }
            : {}),
    });
    return {
        client,
        socket,
        close() {
            socket.destroy();
        },
    };
}
//# sourceMappingURL=tcp.js.map