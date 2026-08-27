/**
 * Phase E / Item 11 — embedding SDK server dialect.
 */
import type { JsonRpcConnection } from "./connection.js";
import type { ProtocolSessionBackend } from "./session-backend.js";
export interface SdkServerOptions {
    connection: JsonRpcConnection;
    backend: ProtocolSessionBackend;
}
/** Attach SDK handlers to a JSON-RPC connection. */
export declare function attachSdkServer(options: SdkServerOptions): () => void;
//# sourceMappingURL=sdk-server.d.ts.map