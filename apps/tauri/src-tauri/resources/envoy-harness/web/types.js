/**
 * Phase C / Item 8 — web search/fetch types (L3 port of
 * deepseek `dsh-web`, Cordis-free).
 *
 * Search and fetch are separate providers on one runtime.
 */
// PROVIDER_* = selection; FETCH_FAILED / INVALID_URL = http provider
export class WebError extends Error {
    code;
    name = "WebError";
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map