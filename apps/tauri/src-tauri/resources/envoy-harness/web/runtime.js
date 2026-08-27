/**
 * Phase C / Item 8 — {@link WebRuntime} with provider selection.
 */
import { WebError } from "./types.js";
function selectProvider(kind, providers, configuredId) {
    if (configuredId !== undefined) {
        const p = providers.get(configuredId);
        if (p === undefined) {
            throw new WebError(`${kind} provider '${configuredId}' is not registered`, "PROVIDER_MISSING");
        }
        if (!p.available()) {
            throw new WebError(`${kind} provider '${configuredId}' is unavailable`, "PROVIDER_UNAVAILABLE");
        }
        return p;
    }
    const usable = [...providers.values()].filter((p) => p.available());
    if (usable.length === 0) {
        throw new WebError(`no ${kind} provider available`, "PROVIDER_UNAVAILABLE");
    }
    if (usable.length > 1) {
        throw new WebError(`multiple ${kind} providers available (${usable.map((p) => p.id).join(", ")}); configure one`, "PROVIDER_AMBIGUOUS");
    }
    return usable[0];
}
/** Create a provider-neutral web runtime. */
export function createWebRuntime(config = {}) {
    const searchProviders = new Map();
    const fetchProviders = new Map();
    return {
        registerSearchProvider(provider) {
            if (searchProviders.has(provider.id)) {
                throw new WebError(`duplicate search provider '${provider.id}'`, "DUPLICATE_PROVIDER");
            }
            searchProviders.set(provider.id, provider);
            return () => {
                searchProviders.delete(provider.id);
            };
        },
        registerFetchProvider(provider) {
            if (fetchProviders.has(provider.id)) {
                throw new WebError(`duplicate fetch provider '${provider.id}'`, "DUPLICATE_PROVIDER");
            }
            fetchProviders.set(provider.id, provider);
            return () => {
                fetchProviders.delete(provider.id);
            };
        },
        async search(request, signal) {
            const provider = selectProvider("search", searchProviders, config.searchProvider);
            const result = await provider.search(request, signal);
            if (request.maxResults === undefined)
                return result;
            if (result.sources.length <= request.maxResults)
                return result;
            return {
                ...result,
                sources: result.sources.slice(0, request.maxResults),
                truncated: true,
            };
        },
        async fetch(request, signal) {
            const provider = selectProvider("fetch", fetchProviders, config.fetchProvider);
            return provider.fetch(request, signal);
        },
    };
}
/** Test helper: a search provider with controllable availability. */
export function createFakeSearchProvider(options) {
    return {
        id: options.id,
        available: () => options.available ?? true,
        search: options.search ??
            (async () => ({ sources: [], truncated: false })),
    };
}
/** Test helper: a fetch provider with controllable availability. */
export function createFakeFetchProvider(options) {
    return {
        id: options.id,
        available: () => options.available ?? true,
        fetch: options.fetch ??
            (async (req) => ({
                url: req.url,
                statusCode: 200,
                body: { kind: "text", content: "" },
                truncated: false,
            })),
    };
}
//# sourceMappingURL=runtime.js.map