/**
 * Phase C / Item 8+13 — Brave Search API provider.
 *
 * Hermetic by default: `available()` is a cheap local
 * check (env var or credentials list). Live HTTP only
 * runs inside `search()` when a key resolves.
 */
import type { CredentialsProvider } from "../credentials/types.js";
import type { WebSearchProvider } from "./types.js";
export interface BraveSearchProviderOptions {
    /** Credentials cascade (env → file → ask). */
    credentials?: CredentialsProvider & {
        resolveByName?(name: string, opts: {
            signal: AbortSignal;
        }): Promise<string>;
    };
    /** Override env for `available()` / key resolution (tests). */
    env?: NodeJS.ProcessEnv;
    /** Override fetch (tests). */
    fetchImpl?: typeof fetch;
}
/**
 * Create a Brave Search {@link WebSearchProvider}.
 * `id` is always `"brave"`.
 */
export declare function createBraveSearchProvider(options?: BraveSearchProviderOptions): WebSearchProvider;
//# sourceMappingURL=search-brave.d.ts.map