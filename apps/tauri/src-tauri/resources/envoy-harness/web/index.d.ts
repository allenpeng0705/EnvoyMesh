/**
 * Phase C / Item 8 — web search/fetch public surface.
 */
export type { WebErrorCode, WebFetchBody, WebFetchProvider, WebFetchRequest, WebFetchResult, WebRuntime, WebRuntimeConfig, WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource, } from "./types.js";
export { WebError } from "./types.js";
export { createFakeFetchProvider, createFakeSearchProvider, createWebRuntime, } from "./runtime.js";
export { createHttpFetchProvider, type HttpFetchProviderOptions, } from "./fetch-http.js";
export { createBraveSearchProvider, type BraveSearchProviderOptions, } from "./search-brave.js";
export { createExaSearchProvider, type ExaSearchProviderOptions, } from "./search-exa.js";
export { createPerplexitySearchProvider, type PerplexitySearchProviderOptions, } from "./search-perplexity.js";
export { makeWebTools, registerWebTools } from "./tools.js";
//# sourceMappingURL=index.d.ts.map