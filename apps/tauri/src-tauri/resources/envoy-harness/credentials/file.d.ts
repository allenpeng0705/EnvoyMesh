/**
 * Phase C / Item 13 — file-backed credentials (JSON, mode 0600).
 */
import type { CredentialsProvider } from "./types.js";
export interface FileCredentialsOptions {
    /** Absolute path to a JSON object `{ "NAME": "value", ... }`. */
    filePath: string;
    /** Skip the 0600 permission check (tests on platforms without mode). */
    skipPermissionCheck?: boolean;
}
export declare function createFileCredentialsProvider(options: FileCredentialsOptions): CredentialsProvider;
//# sourceMappingURL=file.d.ts.map