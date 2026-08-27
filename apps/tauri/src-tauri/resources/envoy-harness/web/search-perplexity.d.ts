/**
 * Perplexity Sonar search provider (chat-completions API).
 */
import type { CredentialsProvider } from "../credentials/types.js";
import type { WebSearchProvider } from "./types.js";
export interface PerplexitySearchProviderOptions {
    credentials?: CredentialsProvider & {
        resolveByName?(name: string, opts: {
            signal: AbortSignal;
        }): Promise<string>;
    };
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    model?: string;
}
export declare function createPerplexitySearchProvider(options?: PerplexitySearchProviderOptions): WebSearchProvider;
//# sourceMappingURL=search-perplexity.d.ts.map