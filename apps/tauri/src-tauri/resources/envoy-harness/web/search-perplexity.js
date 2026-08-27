/**
 * Perplexity Sonar search provider (chat-completions API).
 */
import { WebError } from "./types.js";
const PERPLEXITY_KEY_NAME = "PERPLEXITY_API_KEY";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
export function createPerplexitySearchProvider(options = {}) {
    const env = options.env ?? process.env;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const model = options.model ?? "sonar";
    async function resolveKey(signal) {
        const fromEnv = env[PERPLEXITY_KEY_NAME];
        if (typeof fromEnv === "string" && fromEnv.length > 0)
            return fromEnv;
        const creds = options.credentials;
        if (creds?.resolveByName !== undefined) {
            return creds.resolveByName(PERPLEXITY_KEY_NAME, { signal });
        }
        if (creds !== undefined) {
            return creds.resolve({ name: PERPLEXITY_KEY_NAME, source: "env" }, { signal });
        }
        throw new WebError(`${PERPLEXITY_KEY_NAME} is not set`, "PROVIDER_UNAVAILABLE");
    }
    return {
        id: "perplexity",
        available() {
            const fromEnv = env[PERPLEXITY_KEY_NAME];
            if (typeof fromEnv === "string" && fromEnv.length > 0)
                return true;
            const refs = options.credentials?.list() ?? [];
            return refs.some((r) => r.name === PERPLEXITY_KEY_NAME && r.source === "file");
        },
        async search(request, signal) {
            const key = await resolveKey(signal);
            const res = await fetchImpl(PERPLEXITY_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: "user",
                            content: `Search and summarize: ${request.query}`,
                        },
                    ],
                }),
                signal,
            });
            if (!res.ok) {
                throw new WebError(`Perplexity search failed: ${res.status}`, "FETCH_FAILED");
            }
            const data = (await res.json());
            const summary = data.choices?.[0]?.message?.content ?? "";
            const citations = data.citations ?? [];
            const sources = citations.length > 0
                ? citations.map((c) => ({
                    url: c.url ?? "",
                    title: c.title ?? c.url ?? "source",
                    snippet: "",
                }))
                : summary.length > 0
                    ? [{ url: "", title: "Perplexity summary", snippet: summary }]
                    : [];
            return {
                ...(summary.length > 0 ? { content: summary } : {}),
                sources,
                truncated: false,
            };
        },
    };
}
//# sourceMappingURL=search-perplexity.js.map