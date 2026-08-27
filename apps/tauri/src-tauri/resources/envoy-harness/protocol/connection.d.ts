/**
 * Phase E — bidirectional JSON-RPC connection over streams.
 */
import type { Readable, Writable } from "node:stream";
export type RequestHandler = (method: string, params: unknown) => Promise<unknown>;
export type NotificationHandler = (method: string, params: unknown) => void;
export interface JsonRpcConnectionOptions {
    input: Readable;
    output: Writable;
    onRequest?: RequestHandler;
    onNotification?: NotificationHandler;
    /**
     * Default timeout for outbound `request()` calls in
     * milliseconds. The server-initiated `request_permission`
     * path typically uses a longer timeout — pass it per-call.
     * Default 30s; pass `Infinity` to disable.
     */
    defaultRequestTimeoutMs?: number;
}
/** @alias {@link RequestHandler} */
export type JsonRpcRequestHandler = RequestHandler;
/** @alias {@link NotificationHandler} */
export type JsonRpcNotificationHandler = NotificationHandler;
export declare class JsonRpcConnection {
    #private;
    constructor(options: JsonRpcConnectionOptions);
    /**
     * Send a JSON-RPC request. `timeoutMs` defaults to
     * `defaultRequestTimeoutMs` (30s); pass `Infinity` to
     * disable the timeout for long-running ops (e.g.
     * `session/request_permission`).
     */
    request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
    notify(method: string, params?: unknown): void;
    setRequestHandler(handler: RequestHandler): void;
    setNotificationHandler(handler: NotificationHandler): void;
    on(event: "error" | "close", listener: (...args: unknown[]) => void): void;
    close(): void;
    get closed(): boolean;
}
//# sourceMappingURL=connection.d.ts.map