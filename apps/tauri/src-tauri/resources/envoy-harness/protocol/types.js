/**
 * Phase E — JSON-RPC 2.0 types shared by ACP + SDK.
 */
export const JsonRpcErrorCode = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    /** Session not found / busy / cancelled. */
    SESSION_ERROR: -32001,
    PERMISSION_DENIED: -32002,
};
/** @deprecated Use {@link JsonRpcErrorCode.SESSION_ERROR}. */
export const SESSION_ERROR = JsonRpcErrorCode.SESSION_ERROR;
export class JsonRpcError extends Error {
    code;
    data;
    name = "JsonRpcError";
    constructor(message, code, data) {
        super(message);
        this.code = code;
        this.data = data;
    }
}
export function isJsonRpcRequest(msg) {
    return ("method" in msg &&
        "id" in msg &&
        msg.id !== undefined &&
        !("result" in msg) &&
        !("error" in msg));
}
export function isJsonRpcNotification(msg) {
    return "method" in msg && !("id" in msg);
}
export function isJsonRpcResponse(msg) {
    return "result" in msg || "error" in msg;
}
//# sourceMappingURL=types.js.map