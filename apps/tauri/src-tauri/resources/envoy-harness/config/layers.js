/**
 * Config layer stack (Codex-style):
 *   config.dist.toml → user config.toml → project .envoy/config.toml → overrides
 *
 * CLI `--config <path>` replaces the user layer when provided.
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ConfigLoadError, loadConfigFile, resolveConfigPath, } from "./loader.js";
import { ConfigLayerSchema } from "./schema.js";
/**
 * Merge config layers. Later layers win on defined keys.
 * Arrays (`hooks`, `mcpServers`, …) are replaced, not concatenated —
 * same semantics as `mergeLayers` in the loader.
 */
export function mergeConfigLayers(...layers) {
    let out = {};
    for (const layer of layers) {
        out = mergeTwo(out, layer);
    }
    return out;
}
function mergeTwo(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
        if (v !== undefined) {
            out[k] = v;
        }
    }
    return out;
}
/** Default dist path beside the resolved user config. */
export function defaultDistConfigPath(userConfigPath) {
    return path.join(path.dirname(userConfigPath ?? resolveConfigPath()), "config.dist.toml");
}
/**
 * Load and merge the config stack. Missing files are silent.
 */
export async function loadConfigStack(options = {}) {
    const sources = [];
    const layers = [];
    const userPath = options.filePath !== undefined
        ? path.resolve(options.filePath)
        : resolveConfigPath();
    const distPath = defaultDistConfigPath(userPath);
    const dist = await tryLoad(distPath);
    if (dist !== undefined) {
        layers.push(dist);
        sources.push(distPath);
    }
    const user = await tryLoad(userPath);
    if (user !== undefined) {
        layers.push(user);
        sources.push(userPath);
    }
    if (options.cwd !== undefined) {
        const projectPath = path.join(options.cwd, ".envoy", "config.toml");
        const project = await tryLoad(projectPath);
        if (project !== undefined) {
            layers.push(project);
            sources.push(projectPath);
        }
    }
    if (options.overrides !== undefined) {
        layers.push(options.overrides);
    }
    return {
        layer: mergeConfigLayers(...layers),
        sources,
    };
}
async function tryLoad(filePath) {
    try {
        await fs.access(filePath);
    }
    catch {
        return undefined;
    }
    try {
        return await loadConfigFile(filePath);
    }
    catch (err) {
        if (err instanceof ConfigLoadError)
            throw err;
        throw new ConfigLoadError(err instanceof Error ? err.message : String(err), filePath);
    }
}
/** Validate a raw object as ConfigLayer (for tests / overlays). */
export function parseConfigLayer(raw) {
    return ConfigLayerSchema.parse(raw);
}
/** Home-relative helper for docs/tests. */
export function userConfigHomeHint() {
    return path.join(os.homedir(), ".config", "envoy-harness");
}
//# sourceMappingURL=layers.js.map