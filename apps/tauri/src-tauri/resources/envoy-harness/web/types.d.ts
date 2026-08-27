/**
 * Phase C / Item 8 — web search/fetch types (L3 port of
 * deepseek `dsh-web`, Cordis-free).
 *
 * Search and fetch are separate providers on one runtime.
 */
export interface WebSearchRequest {
    readonly query: string;
    readonly maxResults?: number;
}
export interface WebSearchSource {
    readonly url: string;
    readonly title?: string;
    readonly snippet?: string;
    readonly publishedAt?: string;
}
export interface WebSearchResult {
    readonly content?: string;
    readonly sources: readonly WebSearchSource[];
    readonly truncated: boolean;
}
export interface WebFetchRequest {
    readonly url: string;
}
export type WebFetchBody = {
    readonly kind: "html";
    readonly content: string;
} | {
    readonly kind: "text";
    readonly content: string;
};
export interface WebFetchResult {
    readonly url: string;
    readonly statusCode: number;
    readonly body: WebFetchBody;
    readonly truncated: boolean;
}
export interface WebSearchProvider {
    readonly id: string;
    /** Cheap local check — must not hit the network. */
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
export interface WebFetchProvider {
    readonly id: string;
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
export type WebErrorCode = "PROVIDER_MISSING" | "PROVIDER_UNAVAILABLE" | "PROVIDER_AMBIGUOUS" | "DUPLICATE_PROVIDER" | "FETCH_FAILED" | "INVALID_URL";
export declare class WebError extends Error {
    readonly code: WebErrorCode;
    readonly name = "WebError";
    constructor(message: string, code: WebErrorCode);
}
export interface WebRuntimeConfig {
    /** Preferred search provider id (else auto-select if exactly one usable). */
    searchProvider?: string;
    /** Preferred fetch provider id. */
    fetchProvider?: string;
}
export interface WebRuntime {
    registerSearchProvider(provider: WebSearchProvider): () => void;
    registerFetchProvider(provider: WebFetchProvider): () => void;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
//# sourceMappingURL=types.d.ts.map