/**
 * Exa Search API provider.
 */
import { WebError } from "./types.js";
const EXA_KEY_NAME = "EXA_API_KEY";
const EXA_SEARCH_URL = "https://api.exa.ai/search";
export function createExaSearchProvider(options = {}) {
    const env = options.env ?? process.env;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    async function resolveKey(signal) {
        const fromEnv = env[EXA_KEY_NAME];
        if (typeof fromEnv === "string" && fromEnv.length > 0)
            return fromEnv;
        const creds = options.credentials;
        if (creds?.resolveByName !== undefined) {
            return creds.resolveByName(EXA_KEY_NAME, { signal });
        }
        if (creds !== undefined) {
            return creds.resolve({ name: EXA_KEY_NAME, source: "env" }, { signal });
        }
        throw new WebError(`${EXA_KEY_NAME} is not set`, "PROVIDER_UNAVAILABLE");
    }
    return {
        id: "exa",
        available() {
            const fromEnv = env[EXA_KEY_NAME];
            if (typeof fromEnv === "string" && fromEnv.length > 0)
                return true;
            const refs = options.credentials?.list() ?? [];
            return refs.some((r) => r.name === EXA_KEY_NAME && r.source === "file");
        },
        async search(request, signal) {
            const key = await resolveKey(signal);
            const res = await fetchImpl(EXA_SEARCH_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": key,
                },
                body: JSON.stringify({
                    query: request.query,
                    numResults: request.maxResults ?? 5,
                    type: "auto",
                    contents: { text: { maxCharacters: 500 } },
                }),
                signal,
            });
            if (!res.ok) {
                throw new WebError(`Exa search failed: ${res.status}`, "FETCH_FAILED");
            }
            const data = (await res.json());
            const sources = (data.results ?? []).map((r) => ({
                url: r.url ?? "",
                title: r.title ?? r.url ?? "result",
                snippet: r.text ?? "",
            }));
            return {
                sources,
                truncated: false,
            };
        },
    };
}
//# sourceMappingURL=search-exa.js.map