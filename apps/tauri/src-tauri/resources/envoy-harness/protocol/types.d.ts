/**
 * Phase E — JSON-RPC 2.0 types shared by ACP + SDK.
 */
export type JsonRpcId = string | number;
export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: JsonRpcId;
    method: string;
    params?: unknown;
}
export interface JsonRpcNotification {
    jsonrpc: "2.0";
    method: string;
    params?: unknown;
}
export interface JsonRpcSuccess {
    jsonrpc: "2.0";
    id: JsonRpcId;
    result: unknown;
}
export interface JsonRpcErrorObject {
    code: number;
    message: string;
    data?: unknown;
}
export interface JsonRpcFailure {
    jsonrpc: "2.0";
    id: JsonRpcId | null;
    error: JsonRpcErrorObject;
}
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcSuccess | JsonRpcFailure;
export declare const JsonRpcErrorCode: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    /** Session not found / busy / cancelled. */
    readonly SESSION_ERROR: -32001;
    readonly PERMISSION_DENIED: -32002;
};
/** @deprecated Use {@link JsonRpcErrorCode.SESSION_ERROR}. */
export declare const SESSION_ERROR: -32001;
export declare class JsonRpcError extends Error {
    readonly code: number;
    readonly data?: unknown | undefined;
    readonly name = "JsonRpcError";
    constructor(message: string, code: number, data?: unknown | undefined);
}
export declare function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest;
export declare function isJsonRpcNotification(msg: JsonRpcMessage): msg is JsonRpcNotification;
export declare function isJsonRpcResponse(msg: JsonRpcMessage): msg is JsonRpcResponse;
//# sourceMappingURL=types.d.ts.map