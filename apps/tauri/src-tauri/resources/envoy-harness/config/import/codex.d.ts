/**
 * Phase B / Item 15.1 — codex `config.toml` importer.
 *
 * **What this is:** a translator from codex's TOML config
 * shape (`codex/codex-rs/config/src/config_toml.rs`) to
 * envoy-harness's `ConfigLayer` (`src/config/schema.ts`).
 *
 * **Why a translator, not a generic kebab-to-camel converter:**
 * codex's schema has ~30 fields; envoy-harness's v0
 * `ConfigLayer` has 6. A generic converter would silently
 * smuggle in fields the rest of the code doesn't know how
 * to consume. The hand-written map below is explicit: only
 * the fields we can honor get mapped, everything else is
 * reported in the `warnings[]` so the user can see the diff.
 *
 * **What gets mapped (v0):**
 * - `sandbox_mode` → `permissionMode`
 * - `approval_policy` → `askForApproval` (with two
 *   approximate mappings: `untrusted`→`unless-trusted`,
 *   `on-failure`→`granular`)
 * - `sandbox_workspace_write.writable_roots` → `writableRoots`
 * - `sandbox_workspace_write.network_access` → `networkAccess`
 * - `sandbox_workspace_write.exclude_slash_tmp` → `!slashTmpWritable`
 *
 * **What gets ignored (with warnings, in v0):** see
 * `IGNORED_KEYS` below. The warnings are non-fatal; the
 * user gets a one-line summary in the import result.
 *
 * **Out of scope (chunk 15.2):** codex's `[hooks]` table,
 * deepseek `cordis.yml`, the JSON-RPC hook-protocol bridge.
 *
 * **Stability:** additive. New field mappings land as new
 * entries in `CODEX_FIELD_MAP`; the function signature is
 * stable.
 */
import { type ConfigLayer } from "../schema.js";
/**
 * A single warning the importer reports. The runner
 * surfaces these to the user (one-line summary by
 * default, full list with `--verbose`).
 */
export interface CodexImportWarning {
    /** The dotted path of the unknown / ignored key
     *  (e.g. `mcp_servers`, `sandbox_workspace_write.unrelated`). */
    key: string;
    /** A short human-readable reason. */
    reason: string;
}
/** The result of importing a codex config file. */
export interface CodexImportResult {
    /** The mapped `ConfigLayer` (the same shape the
     *  native `loadConfigFile` returns). */
    layer: ConfigLayer;
    /** The list of keys that were present in the codex
     *  file but NOT mapped to an envoy-harness field.
     *  Non-fatal. */
    warnings: ReadonlyArray<CodexImportWarning>;
    /** The absolute path of the imported file (for
     *  diagnostics). */
    sourcePath: string;
}
/** Options for `importCodexConfig`. */
export interface ImportCodexOptions {
    /** The absolute path to the codex `config.toml` to import.
     *  The file MUST exist (the importer is explicit — the
     *  user asked for THIS file; a missing file is an error). */
    filePath: string;
}
/**
 * Read a codex `config.toml` and return the mapped
 * `ConfigLayer` + a list of warnings for ignored keys.
 *
 * **Hermetic:** the only I/O is reading the file. No
 * network, no LLM, no real kernel.
 *
 * @throws `ConfigLoadError` if:
 *   - the file does not exist (the user explicitly asked
 *     to import THIS file; a missing file is an error, not
 *     a silent no-op),
 *   - the file is not valid TOML,
 *   - the file is well-formed TOML but a known field has
 *     the wrong type (e.g. `sandbox_mode = 123`).
 */
export declare function importCodexConfig(options: ImportCodexOptions): Promise<CodexImportResult>;
//# sourceMappingURL=codex.d.ts.map