/**
 * Phase C / Item 8+13 — Brave Search API provider.
 *
 * Hermetic by default: `available()` is a cheap local
 * check (env var or credentials list). Live HTTP only
 * runs inside `search()` when a key resolves.
 */
import { WebError } from "./types.js";
const BRAVE_KEY_NAME = "BRAVE_SEARCH_API_KEY";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
/**
 * Create a Brave Search {@link WebSearchProvider}.
 * `id` is always `"brave"`.
 */
export function createBraveSearchProvider(options = {}) {
    const env = options.env ?? process.env;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    async function resolveKey(signal) {
        const fromEnv = env[BRAVE_KEY_NAME];
        if (typeof fromEnv === "string" && fromEnv.length > 0)
            return fromEnv;
        const creds = options.credentials;
        if (creds?.resolveByName !== undefined) {
            return creds.resolveByName(BRAVE_KEY_NAME, { signal });
        }
        if (creds !== undefined) {
            return creds.resolve({ name: BRAVE_KEY_NAME, source: "env" }, { signal });
        }
        throw new WebError(`${BRAVE_KEY_NAME} is not set`, "PROVIDER_UNAVAILABLE");
    }
    return {
        id: "brave",
        available() {
            const fromEnv = env[BRAVE_KEY_NAME];
            if (typeof fromEnv === "string" && fromEnv.length > 0)
                return true;
            // Cheap, no network / no ask: only treat as available when a
            // file-backed credential is already cached in list() under
            // source "file" (env knownNames alone does not count).
            const refs = options.credentials?.list() ?? [];
            return refs.some((r) => r.name === BRAVE_KEY_NAME && r.source === "file");
        },
        async search(request, signal) {
            const abort = signal ?? AbortSignal.timeout(30_000);
            const apiKey = await resolveKey(abort);
            const url = new URL(BRAVE_SEARCH_URL);
            url.searchParams.set("q", request.query);
            if (request.maxResults !== undefined) {
                url.searchParams.set("count", String(Math.min(Math.max(1, request.maxResults), 20)));
            }
            let response;
            try {
                response = await fetchImpl(url, {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                        "X-Subscription-Token": apiKey,
                    },
                    signal: abort,
                });
            }
            catch (err) {
                if (abort.aborted)
                    throw err;
                throw new WebError(err instanceof Error ? err.message : String(err), "FETCH_FAILED");
            }
            if (!response.ok) {
                throw new WebError(`Brave Search HTTP ${response.status}`, "FETCH_FAILED");
            }
            const body = (await response.json());
            const raw = body.web?.results ?? [];
            const sources = [];
            for (const r of raw) {
                if (typeof r.url !== "string" || r.url.length === 0)
                    continue;
                const source = {
                    url: r.url,
                    ...(typeof r.title === "string" ? { title: r.title } : {}),
                    ...(typeof r.description === "string"
                        ? { snippet: r.description }
                        : {}),
                    ...(typeof r.age === "string" ? { publishedAt: r.age } : {}),
                };
                sources.push(source);
            }
            return { sources, truncated: false };
        },
    };
}
//# sourceMappingURL=search-brave.js.map