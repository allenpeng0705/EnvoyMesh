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
/**
 * An `LspManager` backed by a static extension → client map.
 * `forFile` looks up the file's extension; `closeAll` closes
 * every client in the map.
 */
export class StaticLspManager {
    map;
    literalMap;
    rootUri;
    constructor(map, opts = {}) {
        this.map = map;
        // Per-file literal entries (key starts with "/") take
        // precedence over extension lookups. The host can
        // override a specific file (e.g. for a generated file
        // that should route to a non-default client).
        this.literalMap = new Map(Array.from(map.entries()).filter(([k]) => k.startsWith("/")));
        this.rootUri = opts.rootUri ?? process.cwd();
    }
    forFile(file) {
        // Literal path match wins.
        const literal = this.literalMap.get(file);
        if (literal)
            return literal;
        // Then extension match.
        const lastDot = file.lastIndexOf(".");
        const lastSlash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
        if (lastDot <= lastSlash)
            return null; // no extension
        const ext = file.slice(lastDot);
        return this.map.get(ext) ?? null;
    }
    /**
     * F17.2.5: list the (language, rootUri) pairs for every
     * unique client. The language is the file extension
     * (e.g. ".ts" → "ts"); literal-path entries are skipped
     * (they're per-file overrides, not "language servers").
     * Used by `/lsp`.
     */
    listServers() {
        const seen = new Set();
        const result = [];
        for (const [ext, client] of this.map.entries()) {
            if (ext.startsWith("/"))
                continue; // skip literal paths
            if (seen.has(client))
                continue;
            seen.add(client);
            result.push({ language: ext.replace(/^\./, ""), rootUri: this.rootUri });
        }
        return result;
    }
    async closeAll() {
        const seen = new Set();
        for (const client of this.map.values()) {
            if (seen.has(client))
                continue;
            seen.add(client);
            await client.close();
        }
    }
}
//# sourceMappingURL=static-manager.js.map