/**
 * Phase B / Item 15.2 — deepseek `cordis.yml` importer.
 *
 * **What this is:** a translator from deepseek's
 * `cordis.yml` plugin-list format to envoy-harness's
 * `ConfigLayer`. v0 only extracts the *hook* plugins
 * (plugins whose `name` matches `dsh-hooks-*`); every
 * other plugin is ignored (silently or with a warning,
 * depending on whether it looks like a hook bridge or
 * not).
 *
 * **Why a hook-only subset:** the rest of the cordis.yml
 * surface (LLM adapters, MCP servers, session persistence,
 * etc.) maps to envoy-harness packages that don't exist
 * yet (or live in the adapter, not the core). The hook
 * subset is what `deepseek-style hook bridges` (per
 * gap-closure item 15) refers to.
 *
 * **What it produces:** a `ConfigLayer` with the
 * `hooks: HookHandlerSpec[]` field populated. The
 * `ConfigLayer` itself is unchanged otherwise.
 *
 * **Why a port, not an import:** deepseek's cordis
 * loader is cordis-coupled. The YAML parsing + bridge
 * dispatch is small and side-effect-free; porting keeps
 * the data shape without pulling in Cordis.
 *
 * **Out of scope (v0):**
 * - `!!js` tags (deepseek's `!!js process.env.X`). We
 *   error; the user must rewrite to a static value.
 * - Non-hook plugins (silently ignored; can be re-enabled
 *   when their envoy-harness equivalents ship).
 * - The Codex deepseek bridge (`@deepseek-ai/dsh-hooks-codex`)
 *   — chunk 15.3 (needs the codex `[hooks]` table support
 *   in the codex importer first).
 *
 * **Stability:** additive. New bridge support lands as
 * new entries in `BRIDGE_DISPATCH`.
 */
import { type ConfigLayer } from "../schema.js";
/** A non-fatal warning surfaced by the importer. */
export interface DeepseekImportWarning {
    /** The plugin id (or the parent's id, for nested warnings). */
    plugin: string;
    /** A short human-readable reason. */
    reason: string;
}
/** The result of importing a deepseek config file. */
export interface DeepseekImportResult {
    /** The mapped `ConfigLayer`. */
    layer: ConfigLayer;
    /** Warnings for plugins / hooks that were present but
     *  not mapped to envoy-harness equivalents. */
    warnings: ReadonlyArray<DeepseekImportWarning>;
    /** The absolute path of the imported file. */
    sourcePath: string;
}
/** Options for `importDeepseekConfig`. */
export interface ImportDeepseekOptions {
    /** The absolute path to the deepseek `cordis.yml` to
     *  import. The file MUST exist. */
    filePath: string;
}
/**
 * Read a deepseek `cordis.yml` and return the mapped
 * `ConfigLayer` + warnings.
 *
 * **Hermetic:** the only I/O is reading the cordis.yml +
 * the referenced hook config files. No network, no LLM.
 *
 * @throws `ConfigLoadError` if:
 *   - the file does not exist (the user asked for it),
 *   - the YAML is malformed or uses `!!js` tags,
 *   - a hook bridge plugin has no `configPath`,
 *   - the referenced config file is missing / malformed,
 *   - the resulting `ConfigLayer` fails schema validation.
 */
export declare function importDeepseekConfig(options: ImportDeepseekOptions): Promise<DeepseekImportResult>;
//# sourceMappingURL=deepseek.d.ts.map