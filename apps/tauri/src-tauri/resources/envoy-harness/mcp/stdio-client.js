/**
 * MCP stdio transport (T3.3.1) — `StdioMcpClient`.
 *
 * **What this is:** the concrete `McpClient` implementation
 * that talks to a real MCP server over stdio (JSON-RPC 2.0 +
 * `Content-Length` framing — the same framing the LSP client
 * uses). The host spawns the server (e.g.
 * `npx -y @modelcontextprotocol/server-github`) and hands the
 * streams in.
 *
 * **Protocol surface:**
 * - `initialize` handshake (protocolVersion + capabilities)
 * - `tools/list` → `McpTool[]` (JSON Schema converted to zod
 *   via `jsonSchemaToZod`)
 * - `tools/call` → `McpCallToolResult`
 * - `close` → `shutdown` + `exit` + kill
 *
 * **Request timeout:** each request/response round-trip has a
 * timeout (default 10s) so a hung server can't block the agent
 * turn forever.
 *
 * **Why JSON Schema → zod:** the `Tool` interface used for the
 * model's tool list requires a zod `parameters` schema. The MCP
 * server sends JSON Schema; `jsonSchemaToZod` converts the
 * common shapes (object/string/number/boolean/array/enum) and
 * falls back to `z.unknown()` for anything else.
 */
import { z } from "zod";
/** The MCP protocol version we advertise. */
export const MCP_PROTOCOL_VERSION = "2024-11-05";
/**
 * A `McpClient` that speaks JSON-RPC 2.0 over stdio.
 * The connection owns the child process; `close()` releases it.
 */
export class StdioMcpClient {
    serverName;
    process;
    requestTimeoutMs;
    log;
    nextId = 1;
    pending = new Map();
    buffer = Buffer.alloc(0);
    _initialized = false;
    _closed = false;
    progressListener;
    dataListener;
    constructor(options) {
        this.serverName = options.serverName;
        this.process = options.process;
        this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
        this.log = options.log ?? (() => { });
        this.dataListener = (chunk) => this.onData(chunk);
        this.process.stdout.on("data", this.dataListener);
    }
    /** Run the `initialize` handshake. Must be called once. */
    async connect() {
        this.assertOpen();
        const result = (await this.sendRequest("initialize", {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "envoy-harness", version: "0.0.0" },
        }));
        // Best-effort version negotiation: the spec requires the
        // server to echo the negotiated version, but a missing or
        // different version is not fatal in practice (most servers
        // speak 2024-11-05). Warn instead of failing — the tools
        // either work or the calls error naturally.
        if (result?.protocolVersion === undefined) {
            this.log(`StdioMcpClient: server "${this.serverName}" did not return a protocolVersion`);
        }
        else if (result.protocolVersion !== MCP_PROTOCOL_VERSION) {
            this.log(`StdioMcpClient: server "${this.serverName}" negotiated ` +
                `${result.protocolVersion} (client sent ${MCP_PROTOCOL_VERSION}); ` +
                "continuing best-effort");
        }
        this.sendNotification("notifications/initialized", {});
        this._initialized = true;
    }
    async listTools() {
        this.assertInitialized();
        const result = (await this.sendRequest("tools/list", {}));
        return (result?.tools ?? []).map((t) => ({
            name: t.name,
            description: t.description ?? "",
            inputSchema: jsonSchemaToZod(t.inputSchema ?? {}),
        }));
    }
    async callTool(name, args, options) {
        this.assertInitialized();
        this.progressListener = options?.onProgress;
        try {
            const result = (await this.sendRequest("tools/call", {
                name,
                arguments: args,
            }));
            return {
                content: result?.content ?? [],
                ...(result?.isError !== undefined ? { isError: result.isError } : {}),
            };
        }
        finally {
            this.progressListener = undefined;
        }
    }
    async close() {
        if (this._closed)
            return;
        try {
            if (this._initialized) {
                try {
                    // Best-effort with a short timeout: a server that
                    // never answers shutdown shouldn't block close().
                    await this.sendRequest("shutdown", {}, 1000);
                }
                catch {
                    // Best-effort; the server may already be dead.
                }
            }
            this.process.stdin.end();
        }
        finally {
            this.process.stdout.off("data", this.dataListener);
            for (const { reject } of this.pending.values()) {
                reject(new Error("StdioMcpClient: closed"));
            }
            this.pending.clear();
            this.process.kill();
            this._closed = true;
        }
    }
    // --- internals ---
    assertOpen() {
        if (this._closed)
            throw new Error("StdioMcpClient: closed");
    }
    assertInitialized() {
        this.assertOpen();
        if (!this._initialized) {
            throw new Error("StdioMcpClient: call connect() first");
        }
    }
    sendRequest(method, params, timeoutMs) {
        this.assertOpen();
        const id = this.nextId++;
        const body = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params,
        });
        this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
        return new Promise((resolve, reject) => {
            const effectiveTimeout = timeoutMs ?? this.requestTimeoutMs;
            const timer = setTimeout(() => {
                const p = this.pending.get(id);
                if (!p)
                    return;
                this.pending.delete(id);
                p.reject(new Error(`StdioMcpClient: request timed out after ${effectiveTimeout}ms: ${method}`));
            }, effectiveTimeout);
            this.pending.set(id, {
                resolve,
                reject: (e) => {
                    clearTimeout(timer);
                    reject(e);
                },
            });
        });
    }
    /** Write a JSON-RPC notification (no id, no response expected). */
    sendNotification(method, params) {
        this.assertOpen();
        const body = JSON.stringify({
            jsonrpc: "2.0",
            method,
            params,
        });
        this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
    }
    onData(chunk) {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        this.buffer = Buffer.concat([this.buffer, buf]);
        this.drain();
    }
    drain() {
        while (true) {
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1)
                return;
            const header = this.buffer.subarray(0, headerEnd).toString("utf8");
            const m = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
            if (!m) {
                this.log(`StdioMcpClient: bad header: ${header.slice(0, 80)}`);
                this.buffer = this.buffer.subarray(headerEnd + 4);
                continue;
            }
            const len = Number(m[1]);
            const total = headerEnd + 4 + len;
            if (this.buffer.length < total)
                return;
            const body = this.buffer.subarray(headerEnd + 4, total).toString("utf8");
            this.buffer = this.buffer.subarray(total);
            try {
                this.handleMessage(JSON.parse(body));
            }
            catch (e) {
                this.log(`StdioMcpClient: parse error: ${e.message}`);
            }
        }
    }
    handleMessage(msg) {
        if (!("id" in msg) || msg.id === undefined) {
            this.handleNotification(msg);
            return;
        }
        const pending = this.pending.get(msg.id);
        if (!pending) {
            this.log(`StdioMcpClient: response for unknown id ${msg.id}`);
            return;
        }
        this.pending.delete(msg.id);
        if (msg.error) {
            pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
        }
        else {
            pending.resolve(msg.result);
        }
    }
    handleNotification(msg) {
        if (msg.method !== "notifications/progress" &&
            msg.method !== "notifications/message") {
            return;
        }
        const params = msg.params;
        let text = params?.message ?? "";
        if (text.length === 0 && params?.progress !== undefined) {
            text = `progress ${params.progress}/${params.total ?? "?"}`;
        }
        if (text.length > 0) {
            this.progressListener?.(text);
        }
    }
}
/**
 * Convert a JSON Schema (from `tools/list`) into a zod schema
 * for the model's tool definitions. Handles the common MCP
 * shapes; anything unrecognized falls back to `z.unknown()` so
 * the tool list never breaks on an exotic schema.
 */
export function jsonSchemaToZod(schema) {
    const type = schema["type"];
    if (type === "object" || schema["properties"] !== undefined) {
        const properties = (schema["properties"] ?? {});
        const required = new Set(Array.isArray(schema["required"]) ? schema["required"] : []);
        const shape = {};
        for (const [key, propSchema] of Object.entries(properties)) {
            const prop = jsonSchemaToZod(propSchema);
            shape[key] = required.has(key) ? prop : prop.optional();
        }
        return z.object(shape);
    }
    if (type === "string") {
        if (Array.isArray(schema["enum"]) && schema["enum"].length > 0) {
            const values = schema["enum"];
            if (values.every((v) => typeof v === "string")) {
                return z.enum(values);
            }
        }
        return z.string();
    }
    if (type === "number" || type === "integer")
        return z.number();
    if (type === "boolean")
        return z.boolean();
    if (type === "array") {
        const items = schema["items"];
        return z.array(items ? jsonSchemaToZod(items) : z.unknown());
    }
    return z.unknown();
}
//# sourceMappingURL=stdio-client.js.map