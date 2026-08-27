/**
 * Exa Search API provider.
 */
import type { CredentialsProvider } from "../credentials/types.js";
import type { WebSearchProvider } from "./types.js";
export interface ExaSearchProviderOptions {
    credentials?: CredentialsProvider & {
        resolveByName?(name: string, opts: {
            signal: AbortSignal;
        }): Promise<string>;
    };
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
}
export declare function createExaSearchProvider(options?: ExaSearchProviderOptions): WebSearchProvider;
//# sourceMappingURL=search-exa.d.ts.map