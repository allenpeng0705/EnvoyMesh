/**
 * Phase C / Item 13 — credentials types (P1 seam).
 *
 * Mesh credentials stay in the adapter (`source: "mesh"`
 * is reserved and rejected here).
 */
export type CredentialSource = "env" | "file" | "ask" | "mesh";
export interface CredentialReference {
    /** Stable name (e.g. `BRAVE_SEARCH_API_KEY`). */
    name: string;
    source: CredentialSource;
    /**
     * For `env`: optional env var override (default = `name`).
     * For `file`: optional JSON key inside the credentials file.
     */
    key?: string;
}
export interface ResolveCredentialOptions {
    signal: AbortSignal;
}
export interface CredentialsProvider {
    resolve(ref: CredentialReference, opts: ResolveCredentialOptions): Promise<string>;
    list(): CredentialReference[];
}
export type CredentialErrorCode = "NOT_FOUND" | "MESH_FORBIDDEN" | "INVALID" | "PERMISSION" | "CANCELLED";
export declare class CredentialError extends Error {
    readonly code: CredentialErrorCode;
    readonly name = "CredentialError";
    constructor(message: string, code: CredentialErrorCode);
}
//# sourceMappingURL=types.d.ts.map