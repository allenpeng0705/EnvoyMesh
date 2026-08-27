/**
 * Phase E — Content-Length JSON-RPC framing.
 */
/**
 * Maximum frame body size in bytes. A malicious peer can claim
 * any `Content-Length`; without this cap a single line would
 * allocate the full buffer before parsing. 16 MB is generous
 * for a JSON-RPC request and well above any honest message
 * the harness produces.
 */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;
export function encodeFrame(message) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "utf8");
    return Buffer.concat([header, body]);
}
/** Incremental Content-Length decoder. */
export class FrameDecoder {
    #buf = Buffer.alloc(0);
    /** Override the per-frame size cap (hermetic tests; do not
     *  raise this in production). Default: `MAX_FRAME_BYTES`. */
    #maxBytes;
    constructor(options) {
        this.#maxBytes = options?.maxBytes ?? MAX_FRAME_BYTES;
    }
    feed(chunk) {
        const next = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
        this.#buf = Buffer.concat([this.#buf, next]);
    }
    take() {
        const out = [];
        for (;;) {
            const msg = this.#tryTakeOne();
            if (msg === undefined)
                break;
            out.push(msg);
        }
        return out;
    }
    #tryTakeOne() {
        const sep = this.#buf.indexOf("\r\n\r\n");
        if (sep < 0)
            return undefined;
        const header = this.#buf.subarray(0, sep).toString("utf8");
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (match === null) {
            this.#buf = this.#buf.subarray(sep + 4);
            throw new Error(`missing Content-Length in header: ${header}`);
        }
        const length = Number(match[1]);
        // `(\d+)` only captures non-negative integers, so
        // `Number.isFinite` and `length < 0` are unreachable
        // here — the regex's "missing" branch handles
        // `Content-Length: -1` and `Content-Length: abc` before
        // we get to this point.
        if (length > this.#maxBytes) {
            throw new Error(`frame too large: ${length} bytes (max ${this.#maxBytes})`);
        }
        const bodyStart = sep + 4;
        if (this.#buf.byteLength < bodyStart + length)
            return undefined;
        const body = this.#buf.subarray(bodyStart, bodyStart + length);
        this.#buf = this.#buf.subarray(bodyStart + length);
        return JSON.parse(body.toString("utf8"));
    }
}
//# sourceMappingURL=framing.js.map