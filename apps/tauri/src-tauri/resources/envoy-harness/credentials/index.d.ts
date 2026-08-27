/**
 * Phase C / Item 13 — credentials public surface.
 */
export type { CredentialErrorCode, CredentialReference, CredentialSource, CredentialsProvider, ResolveCredentialOptions, } from "./types.js";
export { CredentialError } from "./types.js";
export { createCredentialsProvider } from "./provider.js";
export { createEnvCredentialsProvider, type EnvCredentialsOptions, } from "./env.js";
export { createFileCredentialsProvider, type FileCredentialsOptions, } from "./file.js";
export { createAskCredentialsProvider, type AskCredentialsOptions, } from "./ask.js";
export { createRedactingTracer, type RedactingTracerOptions, } from "./redaction.js";
//# sourceMappingURL=index.d.ts.map