/**
 * StaticLspManager — an `LspManager` that maps file extensions
 * to pre-configured `LspClient`s.
 *
 * **Why this exists:** the simplest useful `LspManager`. The
 * host (a test, a one-off CLI invocation) hands the agent
 * a map like `{ ".ts": tsLspClient, ".tsx": tsLspClient,
 * ".py": pyLspClient }` and the manager routes. No auto-spawn,
 * no lazy startup — just a static map.
 *
 * **Extension matching:** the file's extension (the substring
 * after the last `.`) is matched against the map. Files
 * without an extension (e.g. `Makefile`) return null.
 * **Why:** LSP servers are usually per-language, and the
 * cheapest signal is the file extension. The host can
 * provide any keys it wants (`ts`, `py`, `rs`, ...); the
 * map is the contract.
 *
 * **Case sensitivity:** extension match is case-sensitive
 * (`.ts` ≠ `.TS`). On macOS / Windows filesystems are
 * case-insensitive, but the harness's file ops normalize
 * to the on-disk case, so the host should pre-normalize.
 *
 * **Stability:** the public surface is `StaticLspManager`
 * (class) + `LspClientMap` (type). Additive.
 */
import type { LspClient, LspManager } from "./types.js";
/**
 * A map from a file extension (including the leading dot,
 * e.g. `".ts"`) to an `LspClient`. Empty extensions (`""`)
 * are not valid keys; use a file's full path as a literal
 * key if you need to override per-file.
 */
export type LspClientMap = ReadonlyMap<string, LspClient>;
/**
 * An `LspManager` backed by a static extension → client map.
 * `forFile` looks up the file's extension; `closeAll` closes
 * every client in the map.
 */
export declare class StaticLspManager implements LspManager {
    private readonly map;
    private readonly literalMap;
    private readonly rootUri;
    constructor(map: LspClientMap, opts?: {
        rootUri?: string;
    });
    forFile(file: string): LspClient | null;
    /**
     * F17.2.5: list the (language, rootUri) pairs for every
     * unique client. The language is the file extension
     * (e.g. ".ts" → "ts"); literal-path entries are skipped
     * (they're per-file overrides, not "language servers").
     * Used by `/lsp`.
     */
    listServers(): ReadonlyArray<{
        language: string;
        rootUri: string;
    }>;
    closeAll(): Promise<void>;
}
//# sourceMappingURL=static-manager.d.ts.map