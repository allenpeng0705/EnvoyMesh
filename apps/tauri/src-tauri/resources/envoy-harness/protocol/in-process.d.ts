/**
 * Phase E — in-process JSON-RPC pair (PassThrough streams).
 */
import { JsonRpcConnection } from "./connection.js";
export interface InProcessPair {
    client: JsonRpcConnection;
    server: JsonRpcConnection;
    close(): void;
}
export declare function createInProcessJsonRpcPair(): InProcessPair;
//# sourceMappingURL=in-process.d.ts.map