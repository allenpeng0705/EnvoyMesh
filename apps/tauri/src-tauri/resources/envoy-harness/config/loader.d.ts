import { type ConfigLayer } from "./schema.js";
/**
 * The default config file path. Resolved relative to
 * the user's home directory (`~/.config/envoy-harness/config.toml`).
 *
 * **Why this path:** matches the XDG Base Directory
 * spec for user config (`$XDG_CONFIG_HOME` or
 * `~/.config`). The user can override with `--config <path>`
 * or `$ENVOY_HARNESS_CONFIG`.
 */
export declare const DEFAULT_CONFIG_PATH: string;
/**
 * A config loader error. The `.cause` holds the
 * underlying parser / validator error.
 */
export declare class ConfigLoadError extends Error {
    readonly filePath: string;
    readonly cause?: unknown | undefined;
    readonly name = "ConfigLoadError";
    constructor(message: string, filePath: string, cause?: unknown | undefined);
}
/**
 * Read one config file from disk and return the
 * validated `ConfigLayer`. Returns `{}` if the file
 * does not exist (the common case: fresh install).
 *
 * @param filePath absolute path to the TOML file
 * @throws `ConfigLoadError` if the file is malformed
 *   (smol-toml or zod rejected it)
 */
export declare function loadConfigFile(filePath: string): Promise<ConfigLayer>;
/**
 * Resolve the config file path from a priority list:
 *
 * 1. Explicit `filePath` argument (from `--config <path>`)
 * 2. `$ENVOY_HARNESS_CONFIG` env var
 * 3. `$XDG_CONFIG_HOME/envoy-harness/config.toml` (if XDG is set)
 * 4. `~/.config/envoy-harness/config.toml` (default)
 *
 * Returns the resolved absolute path. The path is
 * returned even if the file doesn't exist (the caller
 * decides whether to throw or default to `{}`).
 */
export declare function resolveConfigPath(filePath?: string): string;
/**
 * Read the config from the resolved path.
 * Convenience for the CLI runner: `loadConfig({filePath})`
 * is the one-call entrypoint.
 */
export declare function loadConfig(options?: {
    filePath?: string;
}): Promise<{
    layer: ConfigLayer;
    resolvedPath: string;
}>;
/**
 * Phase B / Item 15.1: load the native config AND an
 * imported config (e.g. a codex `config.toml`) and
 * merge them.
 *
 * **Merge order (later wins):**
 * 1. native `loadConfigFile(path)` — envoy-harness's
 *    own TOML file,
 * 2. imported layer — e.g. codex's `config.toml`,
 * 3. explicit `overrides` (rarely used; the runner
 *    uses the CLI flags directly, not via this helper).
 *
 * **Why imported wins over native:** the user explicitly
 * passed `--import-config <path>` — they want the
 * imported file to take effect. The native file is
 * still loaded (so a user with both files gets the
 * union of both, with imported as the tiebreaker).
 *
 * **CLI flags win over both** — that's enforced by the
 * runner (`parsed.sandbox ?? configLayer.permissionMode
 * ?? "read-only"` in `cli/run/one-shot.ts`). This helper
 * just provides the merge primitive; precedence at the
 * CLI level is the runner's job.
 *
 * **Warnings:** the imported result carries a
 * `warnings[]` list. The runner surfaces a one-line
 * summary; `--verbose` prints the full list.
 *
 * **Hermetic:** no I/O beyond reading the two files.
 */
export declare function loadConfigWithImport(options: {
    /** Explicit path to the native config file. `undefined`
     *  → use the default (`~/.config/envoy-harness/config.toml`).
     *  Missing file is silent (matches `loadConfig`). */
    filePath?: string;
    /** Explicit path to the imported config file. Required
     *  when `importFrom` is set. */
    importPath?: string;
    /** The format of the imported file. Required when
     *  `importPath` is set. */
    importFrom?: string;
    /** Optional override layer (merged LAST, wins over both). */
    overrides?: ConfigLayer;
}): Promise<{
    layer: ConfigLayer;
    resolvedPath: string;
    importResult?: {
        layer: ConfigLayer;
        warnings: ReadonlyArray<{
            key: string;
            reason: string;
        }>;
        sourcePath: string;
    };
}>;
//# sourceMappingURL=loader.d.ts.map