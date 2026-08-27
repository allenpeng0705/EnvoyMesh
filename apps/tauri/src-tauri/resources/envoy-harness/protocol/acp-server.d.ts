/**
 * Phase E / Item 10 — ACP server dialect.
 */
import type { JsonRpcConnection } from "./connection.js";
import type { ProtocolSessionBackend } from "./session-backend.js";
export declare const ACP_PROTOCOL_VERSION = 1;
export interface AcpServerOptions {
    connection: JsonRpcConnection;
    backend: ProtocolSessionBackend;
    serverInfo?: {
        name: string;
        version: string;
    };
}
/** Attach ACP handlers to a JSON-RPC connection. */
export declare function attachAcpServer(options: AcpServerOptions): () => void;
//# sourceMappingURL=acp-server.d.ts.map