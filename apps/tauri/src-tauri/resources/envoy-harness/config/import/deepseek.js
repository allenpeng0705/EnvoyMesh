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
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { ConfigLoadError } from "../loader.js";
import { ConfigLayerSchema } from "../schema.js";
import { parseClaudeCodeHooks } from "./claude-code.js";
import { importCodexConfig } from "./codex.js";
/**
 * The set of hook-bridge names this importer knows about.
 * Each entry is the package name; matching is by suffix
 * (`endsWith`) so a user's `@deepseek-ai/dsh-hooks-claude-code`
 * AND a hypothetical `myorg/my-dsh-hooks-claude-code` both
 * resolve to the CC importer.
 *
 * **Why suffix matching:** deepseek's package names live
 * under `@deepseek-ai/` in the official registry, but
 * forks + mirrors might re-scope. The suffix is the
 * stable identifier.
 */
const KNOWN_HOOK_BRIDGES = new Map([
    [
        "dsh-hooks-claude-code",
        async (entry, cordisDir) => {
            const config = entry.config;
            const configPath = readStringField(config, "configPath");
            if (configPath === undefined) {
                throw new ConfigLoadError(`deepseek importer: ${entry.id}: dsh-hooks-claude-code ` +
                    `requires a 'configPath' field (path to the CC hooks.json)`, entry.id);
            }
            // Resolve relative paths against the cordis.yml's
            // directory, NOT the process cwd. The user wrote
            // `configPath: ./.claude/hooks.json` expecting it to
            // be relative to their project root, not to wherever
            // they happened to run the command.
            const resolved = path.isAbsolute(configPath)
                ? configPath
                : path.resolve(cordisDir, configPath);
            const pluginRoot = readStringField(config, "pluginRoot");
            const projectDir = readStringField(config, "projectDir");
            const result = await parseClaudeCodeHooks({
                filePath: resolved,
                ...(pluginRoot !== undefined ? { pluginRoot } : {}),
                ...(projectDir !== undefined ? { projectDir } : {}),
            });
            return [...result.specs];
        },
    ],
    [
        "dsh-hooks-codex",
        async (entry, cordisDir) => {
            const config = entry.config;
            const configPath = readStringField(config, "configPath");
            if (configPath === undefined) {
                throw new ConfigLoadError(`deepseek importer: ${entry.id}: dsh-hooks-codex ` +
                    `requires a 'configPath' field (path to codex config.toml)`, entry.id);
            }
            const resolved = path.isAbsolute(configPath)
                ? configPath
                : path.resolve(cordisDir, configPath);
            const result = await importCodexConfig({ filePath: resolved });
            return [...(result.layer.hooks ?? [])];
        },
    ],
    // Future bridges:
]);
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
export async function importDeepseekConfig(options) {
    const raw = await readFile(options.filePath);
    const cordisDir = path.dirname(options.filePath);
    const entries = parseCordisYml(raw, options.filePath);
    const warnings = [];
    const allSpecs = [];
    for (const entry of entries) {
        if (entry.disabled) {
            // A `disabled: true` plugin is intentionally turned off.
            // We don't warn (it's not a missing-feature case; the
            // user knows).
            continue;
        }
        // Match by suffix — a user's
        // `@deepseek-ai/dsh-hooks-claude-code` AND a hypothetical
        // `myorg/dsh-hooks-claude-code` both hit the CC importer.
        const bridge = findHookBridge(entry.name);
        if (bridge === undefined) {
            // Not a hook bridge. Silently ignored for v0; future
            // chunks add the other bridges (LLM, MCP, session,
            // etc.) as their envoy-harness equivalents land.
            continue;
        }
        try {
            const specs = await bridge(entry, cordisDir);
            allSpecs.push(...specs);
        }
        catch (err) {
            // A bridge-level error (e.g. `configPath` missing or
            // the referenced file is broken) is fatal for THIS
            // plugin, but not for the whole import. We surface
            // it as a warning so the user sees the issue + the
            // import continues with the other plugins.
            warnings.push({
                plugin: entry.id,
                reason: err.message,
            });
        }
    }
    // Build the layer. We only set `hooks` if at least one
    // spec was produced (an empty array would fail the
    // zod schema's `.optional()` invariant on the array's
    // contents if the user supplied a stale `hooks = []`).
    const layer = {};
    if (allSpecs.length > 0) {
        layer.hooks = allSpecs;
    }
    // Final schema validation. The mapping is hand-checked,
    // but the schema is the source of truth — if a future
    // field is added to `HookHandlerSpec`, this catches
    // drift at the boundary.
    const result = ConfigLayerSchema.safeParse(layer);
    if (!result.success) {
        throw new ConfigLoadError(`invalid deepseek config: ${options.filePath}: ` +
            result.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; "), options.filePath, result.error);
    }
    return { layer: result.data, warnings, sourcePath: options.filePath };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Read the file. ENOENT is an error here. */
async function readFile(filePath) {
    try {
        return await fs.readFile(filePath, "utf8");
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new ConfigLoadError(`deepseek config file not found: ${filePath}`, filePath, err);
        }
        throw new ConfigLoadError(`failed to read deepseek config file: ${filePath}: ${err.message}`, filePath, err);
    }
}
/**
 * Parse the cordis.yml as YAML. Returns the list of
 * resolved plugin entries. Throws on:
 * - non-array root,
 * - non-object entries,
 * - missing `name`,
 * - `!!js` tags (we don't support JS expressions — the
 *   user must rewrite to a static value).
 */
function parseCordisYml(raw, filePath) {
    let parsed;
    try {
        parsed = parseYaml(raw);
    }
    catch (err) {
        throw new ConfigLoadError(`failed to parse deepseek YAML: ${filePath}: ${err.message}`, filePath, err);
    }
    if (!Array.isArray(parsed)) {
        throw new ConfigLoadError(`invalid deepseek config: ${filePath}: ` +
            `expected a YAML list of plugin entries at the root`, filePath);
    }
    // Detect `!!js` tags via a pre-pass on the raw text.
    // `yaml`'s parser SILENTLY warns and accepts these
    // (it falls back to a string), so we have to pre-check
    // the raw text to reject them. We don't support JS
    // expressions (a JS evaluator would re-introduce the
    // security surface we're trying to avoid by NOT adopting
    // Cordis).
    if (raw.includes("!!js")) {
        throw new ConfigLoadError(`invalid deepseek config: ${filePath}: ` +
            `!!js tags are not supported (rewrite to a static value ` +
            `or use the native envoy-harness config format)`, filePath);
    }
    const out = [];
    for (let i = 0; i < parsed.length; i++) {
        const rawEntry = parsed[i];
        if (typeof rawEntry !== "object" || rawEntry === null) {
            throw new ConfigLoadError(`invalid deepseek config: ${filePath}: ` +
                `entry ${i} is not an object`, filePath);
        }
        const entry = rawEntry;
        // The shape is `{ id, name, config, disabled }`. We
        // also accept `{ name, config, disabled }` (id optional).
        const name = entry["name"];
        if (typeof name !== "string") {
            throw new ConfigLoadError(`invalid deepseek config: ${filePath}: ` +
                `entry ${i} has no 'name' field`, filePath);
        }
        const id = typeof entry["id"] === "string" ? entry["id"] : name;
        const config = asObject(entry["config"]);
        const disabled = entry["disabled"] === true;
        out.push({ id, name, config, disabled });
    }
    return out;
}
/** Match a plugin name to a known hook bridge (by suffix). */
function findHookBridge(name) {
    for (const [suffix, handler] of KNOWN_HOOK_BRIDGES) {
        if (name.endsWith(suffix))
            return handler;
    }
    return undefined;
}
/** A plain (non-null, non-array) object, or `undefined`. */
function asObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
/** Read a string field from a config object, or `undefined`. */
function readStringField(config, key) {
    if (config === undefined)
        return undefined;
    const v = config[key];
    return typeof v === "string" ? v : undefined;
}
//# sourceMappingURL=deepseek.js.map