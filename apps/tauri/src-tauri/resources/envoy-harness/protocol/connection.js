/**
 * Phase E — bidirectional JSON-RPC connection over streams.
 */
import { EventEmitter } from "node:events";
import { encodeFrame, FrameDecoder } from "./framing.js";
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, JsonRpcError, JsonRpcErrorCode, } from "./types.js";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export class JsonRpcConnection {
    #output;
    #pending = new Map();
    #decoder = new FrameDecoder();
    #events = new EventEmitter();
    #nextId = 1;
    #closed = false;
    #onRequest;
    #onNotification;
    #defaultRequestTimeoutMs;
    constructor(options) {
        this.#output = options.output;
        this.#defaultRequestTimeoutMs =
            options.defaultRequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        this.#onRequest =
            options.onRequest ??
                (async (method) => {
                    throw new JsonRpcError(`method not found: ${method}`, JsonRpcErrorCode.METHOD_NOT_FOUND);
                });
        this.#onNotification = options.onNotification ?? (() => undefined);
        options.input.on("data", (chunk) => {
            try {
                this.#decoder.feed(chunk);
                for (const msg of this.#decoder.take()) {
                    void this.#dispatch(msg);
                }
            }
            catch (err) {
                this.#events.emit("error", err);
            }
        });
        options.input.on("end", () => this.close());
        options.input.on("error", (err) => this.#events.emit("error", err));
    }
    /**
     * Send a JSON-RPC request. `timeoutMs` defaults to
     * `defaultRequestTimeoutMs` (30s); pass `Infinity` to
     * disable the timeout for long-running ops (e.g.
     * `session/request_permission`).
     */
    request(method, params, timeoutMs = this.#defaultRequestTimeoutMs) {
        if (this.#closed) {
            return Promise.reject(new Error("json-rpc connection closed"));
        }
        const id = this.#nextId++;
        const msg = {
            jsonrpc: "2.0",
            id,
            method,
            ...(params !== undefined ? { params } : {}),
        };
        return new Promise((resolve, reject) => {
            const pending = { resolve, reject };
            this.#pending.set(id, pending);
            // Skip the timer entirely if the timeout is disabled.
            let timer;
            if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
                timer = setTimeout(() => {
                    this.#pending.delete(id);
                    reject(new Error(`json-rpc request '${method}' (id=${id}) timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }
            const origResolve = pending.resolve;
            const origReject = pending.reject;
            pending.resolve = (value) => {
                if (timer !== undefined)
                    clearTimeout(timer);
                origResolve(value);
            };
            pending.reject = (err) => {
                if (timer !== undefined)
                    clearTimeout(timer);
                origReject(err);
            };
            this.#write(msg);
        });
    }
    notify(method, params) {
        if (this.#closed)
            return;
        const msg = {
            jsonrpc: "2.0",
            method,
            ...(params !== undefined ? { params } : {}),
        };
        this.#write(msg);
    }
    setRequestHandler(handler) {
        this.#onRequest = handler;
    }
    setNotificationHandler(handler) {
        this.#onNotification = handler;
    }
    on(event, listener) {
        this.#events.on(event, listener);
    }
    close() {
        if (this.#closed)
            return;
        this.#closed = true;
        for (const [, p] of this.#pending) {
            p.reject(new Error("json-rpc connection closed"));
        }
        this.#pending.clear();
        this.#events.emit("close");
    }
    get closed() {
        return this.#closed;
    }
    #write(msg) {
        this.#output.write(encodeFrame(msg));
    }
    async #dispatch(msg) {
        if (isJsonRpcResponse(msg)) {
            if (msg.id === null || msg.id === undefined)
                return;
            const pending = this.#pending.get(msg.id);
            if (pending === undefined)
                return;
            this.#pending.delete(msg.id);
            if ("error" in msg && msg.error !== undefined) {
                pending.reject(new JsonRpcError(msg.error.message, msg.error.code, msg.error.data));
            }
            else {
                pending.resolve(msg.result);
            }
            return;
        }
        if (isJsonRpcRequest(msg)) {
            try {
                const result = await this.#onRequest(msg.method, msg.params);
                this.#write({ jsonrpc: "2.0", id: msg.id, result: result ?? null });
            }
            catch (err) {
                const code = err instanceof JsonRpcError
                    ? err.code
                    : JsonRpcErrorCode.INTERNAL_ERROR;
                const message = err instanceof Error ? err.message : String(err);
                const data = err instanceof JsonRpcError ? err.data : undefined;
                this.#write({
                    jsonrpc: "2.0",
                    id: msg.id,
                    error: {
                        code,
                        message,
                        ...(data !== undefined ? { data } : {}),
                    },
                });
            }
            return;
        }
        if (isJsonRpcNotification(msg)) {
            try {
                this.#onNotification(msg.method, msg.params);
            }
            catch (err) {
                this.#events.emit("error", err);
            }
        }
    }
}
//# sourceMappingURL=connection.js.map