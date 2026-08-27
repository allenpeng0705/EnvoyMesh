/**
 * Phase E — Content-Length JSON-RPC framing.
 */
import type { JsonRpcMessage } from "./types.js";
/**
 * Maximum frame body size in bytes. A malicious peer can claim
 * any `Content-Length`; without this cap a single line would
 * allocate the full buffer before parsing. 16 MB is generous
 * for a JSON-RPC request and well above any honest message
 * the harness produces.
 */
export declare const MAX_FRAME_BYTES: number;
export declare function encodeFrame(message: unknown): Buffer;
/** Incremental Content-Length decoder. */
export declare class FrameDecoder {
    #private;
    constructor(options?: {
        maxBytes?: number;
    });
    feed(chunk: Buffer | string): void;
    take(): JsonRpcMessage[];
}
//# sourceMappingURL=framing.d.ts.map