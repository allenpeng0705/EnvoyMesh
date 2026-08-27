/**
 * Phase C / Item 13 — composite credentials provider.
 *
 * Resolution order when `source` is omitted by callers that
 * use `resolveByName`: env → file → ask. Explicit `source`
 * skips the cascade.
 */
import type { CredentialsProvider, ResolveCredentialOptions } from "./types.js";
export interface CompositeCredentialsOptions {
    env: CredentialsProvider;
    file: CredentialsProvider;
    ask: CredentialsProvider;
}
/** Create the default cascade provider. */
export declare function createCredentialsProvider(backends: CompositeCredentialsOptions): CredentialsProvider & {
    resolveByName(name: string, opts: ResolveCredentialOptions): Promise<string>;
    /** Values resolved this session — for redaction. */
    revealedValues(): ReadonlySet<string>;
};
//# sourceMappingURL=provider.d.ts.map