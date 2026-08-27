/**
 * Phase C / Item 8 — {@link WebRuntime} with provider selection.
 */
import type { WebFetchProvider, WebFetchRequest, WebFetchResult, WebRuntime, WebRuntimeConfig, WebSearchProvider, WebSearchRequest, WebSearchResult } from "./types.js";
/** Create a provider-neutral web runtime. */
export declare function createWebRuntime(config?: WebRuntimeConfig): WebRuntime;
/** Test helper: a search provider with controllable availability. */
export declare function createFakeSearchProvider(options: {
    id: string;
    available?: boolean;
    search?: (request: WebSearchRequest, signal?: AbortSignal) => Promise<WebSearchResult>;
}): WebSearchProvider;
/** Test helper: a fetch provider with controllable availability. */
export declare function createFakeFetchProvider(options: {
    id: string;
    available?: boolean;
    fetch?: (request: WebFetchRequest, signal?: AbortSignal) => Promise<WebFetchResult>;
}): WebFetchProvider;
//# sourceMappingURL=runtime.d.ts.map