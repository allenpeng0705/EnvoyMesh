/**
 * Config layer stack (Codex-style):
 *   config.dist.toml → user config.toml → project .envoy/config.toml → overrides
 *
 * CLI `--config <path>` replaces the user layer when provided.
 */
import type { ConfigLayer } from "./schema.js";
export interface LoadConfigStackOptions {
    /** Project cwd for `.envoy/config.toml`. */
    cwd?: string;
    /** Explicit user/CLI config path (replaces default user config). */
    filePath?: string;
    /** Highest-precedence overlay (CLI flags as a layer). */
    overrides?: ConfigLayer;
}
export interface LoadedConfigStack {
    layer: ConfigLayer;
    /** Paths that contributed (existing files only), low → high precedence. */
    sources: ReadonlyArray<string>;
}
/**
 * Merge config layers. Later layers win on defined keys.
 * Arrays (`hooks`, `mcpServers`, …) are replaced, not concatenated —
 * same semantics as `mergeLayers` in the loader.
 */
export declare function mergeConfigLayers(...layers: ReadonlyArray<ConfigLayer>): ConfigLayer;
/** Default dist path beside the resolved user config. */
export declare function defaultDistConfigPath(userConfigPath?: string): string;
/**
 * Load and merge the config stack. Missing files are silent.
 */
export declare function loadConfigStack(options?: LoadConfigStackOptions): Promise<LoadedConfigStack>;
/** Validate a raw object as ConfigLayer (for tests / overlays). */
export declare function parseConfigLayer(raw: unknown): ConfigLayer;
/** Home-relative helper for docs/tests. */
export declare function userConfigHomeHint(): string;
//# sourceMappingURL=layers.d.ts.map