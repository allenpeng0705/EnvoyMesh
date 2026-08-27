/**
 * Phase C / Item 8 — web search/fetch public surface.
 */
// WebErrorCode covers selection + http provider failures
export { WebError } from "./types.js";
export { createFakeFetchProvider, createFakeSearchProvider, createWebRuntime, } from "./runtime.js";
export { createHttpFetchProvider, } from "./fetch-http.js";
export { createBraveSearchProvider, } from "./search-brave.js";
export { createExaSearchProvider, } from "./search-exa.js";
export { createPerplexitySearchProvider, } from "./search-perplexity.js";
export { makeWebTools, registerWebTools } from "./tools.js";
//# sourceMappingURL=index.js.map