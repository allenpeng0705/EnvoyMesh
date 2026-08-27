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
import type { WebFetchProvider } from "./types.js";
export interface HttpFetchProviderOptions {
    /** Soft cap on decoded body bytes (default 512 KiB). */
    maxBytes?: number;
    /** Built-in timeout for the whole fetch (default 30s). */
    timeoutMs?: number;
    /** Override fetch (tests). */
    fetchImpl?: typeof fetch;
}
/** Built-in keyless fetch provider. Always `available()`. */
export declare function createHttpFetchProvider(options?: HttpFetchProviderOptions): WebFetchProvider;
//# sourceMappingURL=fetch-http.d.ts.map