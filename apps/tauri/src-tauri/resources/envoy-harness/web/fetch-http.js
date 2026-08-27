/**
 * Phase C / Item 8 — keyless HTTP fetch provider (Node 22+ `fetch`).
 *
 * **Why streaming:** `await response.arrayBuffer()` reads the
 * FULL body into memory before `maxBytes` is checked, so a
 * malicious or chatty server returning GB of data would OOM
 * the process. We read the body chunk-by-chunk via
 * `response.body` and stop at `maxBytes`.
 *
 * **Why a built-in timeout:** the caller is expected to pass
 * a signal, but if they don't, a hung TCP socket hangs
 * forever. Default 30s matches the Brave provider.
 */
import { WebError } from "./types.js";
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
function classifyBody(contentType, text) {
    const ct = (contentType ?? "").toLowerCase();
    if (ct.includes("html")) {
        return { kind: "html", content: text };
    }
    return { kind: "text", content: text };
}
/** Read `body` chunk-by-chunk until `maxBytes` is reached. */
async function readBodyCapped(body, maxBytes) {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    let truncated = false;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            if (value === undefined)
                continue;
            const chunk = Buffer.from(value);
            const remaining = maxBytes - total;
            if (chunk.byteLength > remaining) {
                chunks.push(chunk.subarray(0, Math.max(0, remaining)));
                total = maxBytes;
                truncated = true;
                // Cancel the underlying stream so the server stops sending.
                await reader.cancel().catch(() => undefined);
                break;
            }
            chunks.push(chunk);
            total += chunk.byteLength;
        }
    }
    finally {
        reader.releaseLock();
    }
    return { buf: Buffer.concat(chunks), truncated };
}
/** Built-in keyless fetch provider. Always `available()`. */
export function createHttpFetchProvider(options = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    return {
        id: "http",
        available: () => true,
        async fetch(request, signal) {
            let url;
            try {
                url = new URL(request.url);
            }
            catch {
                throw new WebError(`invalid url: ${request.url}`, "INVALID_URL");
            }
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                throw new WebError(`unsupported protocol: ${url.protocol}`, "INVALID_URL");
            }
            // Caller's signal short-circuits the 30s default; if no
            // signal, the timeout applies. We do not require the
            // caller to pass one.
            const userSignal = signal;
            const ownAc = new AbortController();
            const timer = setTimeout(() => ownAc.abort(), timeoutMs);
            const onUserAbort = () => ownAc.abort();
            if (userSignal !== undefined) {
                if (userSignal.aborted) {
                    clearTimeout(timer);
                    throw new WebError("fetch aborted", "FETCH_FAILED");
                }
                userSignal.addEventListener("abort", onUserAbort, { once: true });
            }
            const composedSignal = ownAc.signal;
            let response;
            try {
                // exactOptionalPropertyTypes: omit `signal` when
                // undefined (RequestInit.signal is AbortSignal | null).
                response = await fetchImpl(url, {
                    signal: composedSignal,
                    redirect: "follow",
                    headers: { accept: "text/html,text/plain,*/*;q=0.8" },
                });
            }
            catch (err) {
                clearTimeout(timer);
                userSignal?.removeEventListener("abort", onUserAbort);
                const aborted = composedSignal.aborted;
                throw new WebError(aborted
                    ? "fetch aborted (timeout or cancel)"
                    : err instanceof Error
                        ? err.message
                        : String(err), "FETCH_FAILED");
            }
            if (response.body === null) {
                // No body — return empty content but keep status.
                clearTimeout(timer);
                userSignal?.removeEventListener("abort", onUserAbort);
                return {
                    url: response.url || url.toString(),
                    statusCode: response.status,
                    body: { kind: "text", content: "" },
                    truncated: false,
                };
            }
            const { buf, truncated } = await readBodyCapped(response.body, maxBytes);
            clearTimeout(timer);
            userSignal?.removeEventListener("abort", onUserAbort);
            const text = buf.toString("utf8");
            return {
                url: response.url || url.toString(),
                statusCode: response.status,
                body: classifyBody(response.headers.get("content-type"), text),
                truncated,
            };
        },
    };
}
//# sourceMappingURL=fetch-http.js.map