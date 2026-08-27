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
import { promises as fs } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { ConfigLayerSchema } from "../schema.js";
import { ConfigLoadError } from "../loader.js";
import { parseCodexHookTable } from "./codex-hooks.js";
import { parseCodexMcpServers } from "./codex-mcp.js";
// ---------------------------------------------------------------------------
// Field map (the heart of the importer)
// ---------------------------------------------------------------------------
/**
 * The set of top-level codex keys we know about. Any
 * key in the file that is NOT in this set (or in the
 * "ignored" set below) is reported as a warning.
 *
 * **Why a set + a separate IGNORED list:** a "known but
 * ignored" key is different from a "totally unknown" key.
 * A typo (`permision_mode`) is unknown → warning with a
 * "looks like a typo" hint. A `web_search` is known but
 * ignored → warning with a "lands in Phase C" hint.
 * Both are warnings; the messages are different.
 */
const KNOWN_BUT_IGNORED_KEYS = new Map([
    ["model", { reason: "not yet supported (envoy-harness CLI flag today)" }],
    ["model_providers", { reason: "not yet supported (envoy-harness CLI flag today)" }],
    ["mcp_oauth_credentials_store", { reason: "MCP OAuth store not yet supported" }],
    ["web_search", { reason: "web search lands in Phase C" }],
    ["skills", { reason: "skill loader lands in Phase B item 3" }],
    ["agents", { reason: "subagent registry lands in Phase C" }],
    ["profiles", { reason: "TOML profile composition lands in a future chunk" }],
    ["notify", { reason: "desktop notification not yet supported" }],
    ["history", { reason: "history persistence lives in REPL options" }],
    ["tui", { reason: "TUI lives in EnvoyMesh's Tauri host, not the core" }],
    ["hide_agent_reasoning", { reason: "tracing detail; ignored for v0" }],
    ["personality", { reason: "system-prompt customization; ignored for v0" }],
    ["otel", { reason: "telemetry seam lands in Phase D (item 17)" }],
    ["analytics", { reason: "telemetry seam lands in Phase D (item 17)" }],
    ["feedback", { reason: "feedback loop lands in Phase D (item 16)" }],
    ["apps", { reason: "Tauri / marketplace concern, not Package 1" }],
    ["marketplace", { reason: "Tauri / marketplace concern, not Package 1" }],
    ["plugin", { reason: "plugin loader lands in Phase B item 3" }],
    ["windows", { reason: "Windows-only; envoy-harness is cross-platform" }],
    ["sandbox", { reason: "OS sandbox seam lands in Phase F (item 4)" }],
    ["memories", { reason: "memory store already lives in envoy-harness; loaded via the memory subsystem" }],
    ["project_doc_fallback_filenames", { reason: "AGENTS.md discovery lives in `discoverAgentsMd`" }],
    ["project_doc_max_bytes", { reason: "AGENTS.md discovery lives in `discoverAgentsMd`" }],
    ["forced_chatgpt_workspace_id", { reason: "OpenAI workspace login; not applicable" }],
    ["forced_login_method", { reason: "OpenAI login; not applicable" }],
    ["cli_auth_credentials_store", { reason: "auth credential store; lands in Phase C (item 13)" }],
    ["voice", { reason: "TUI feature; not in Package 1" }],
    ["ideal_patch_concurrency", { reason: "patch-application knob; ignored for v0" }],
]);
// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------
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
export async function importCodexConfig(options) {
    const raw = await readCodexFile(options.filePath);
    const parsed = parseCodexToml(raw, options.filePath);
    const warnings = [];
    const layer = {};
    // 1. Top-level permission + approval.
    if ("sandbox_mode" in parsed) {
        const v = parsed.sandbox_mode;
        if (typeof v === "string") {
            if (v === "read-only" ||
                v === "workspace-write" ||
                v === "danger-full-access") {
                layer.permissionMode = v;
            }
            else {
                throw new ConfigLoadError(`invalid codex config: ${options.filePath}: sandbox_mode: ` +
                    `unrecognized value '${v}' (expected read-only | workspace-write | danger-full-access)`, options.filePath);
            }
        }
        else {
            throw new ConfigLoadError(`invalid codex config: ${options.filePath}: sandbox_mode: ` +
                `expected string, got ${typeof v}`, options.filePath);
        }
    }
    if ("approval_policy" in parsed) {
        const v = parsed.approval_policy;
        if (typeof v === "string") {
            const mapped = mapApprovalPolicy(v);
            if (mapped !== undefined) {
                layer.askForApproval = mapped.value;
                // Approximations are reported as warnings (not errors)
                // so the user knows the mapping is lossy.
                if (mapped.warning !== undefined) {
                    warnings.push({
                        key: "approval_policy",
                        reason: mapped.warning,
                    });
                }
            }
            else {
                throw new ConfigLoadError(`invalid codex config: ${options.filePath}: approval_policy: ` +
                    `unrecognized value '${v}' (expected untrusted | on-failure | on-request | never)`, options.filePath);
            }
        }
        else {
            throw new ConfigLoadError(`invalid codex config: ${options.filePath}: approval_policy: ` +
                `expected string, got ${typeof v}`, options.filePath);
        }
    }
    // 2. workspace-write settings.
    if ("sandbox_workspace_write" in parsed &&
        typeof parsed.sandbox_workspace_write === "object" &&
        parsed.sandbox_workspace_write !== null) {
        const w = parsed.sandbox_workspace_write;
        if ("writable_roots" in w) {
            if (!Array.isArray(w.writable_roots)) {
                throw new ConfigLoadError(`invalid codex config: ${options.filePath}: ` +
                    `sandbox_workspace_write.writable_roots: expected array of strings`, options.filePath);
            }
            if (!w.writable_roots.every((x) => typeof x === "string")) {
                throw new ConfigLoadError(`invalid codex config: ${options.filePath}: ` +
                    `sandbox_workspace_write.writable_roots: all entries must be strings`, options.filePath);
            }
            layer.writableRoots = w.writable_roots;
        }
        if ("network_access" in w) {
            if (typeof w.network_access !== "boolean") {
                throw new ConfigLoadError(`invalid codex config: ${options.filePath}: ` +
                    `sandbox_workspace_write.network_access: expected boolean`, options.filePath);
            }
            layer.networkAccess = w.network_access;
        }
        if ("exclude_slash_tmp" in w) {
            if (typeof w.exclude_slash_tmp !== "boolean") {
                throw new ConfigLoadError(`invalid codex config: ${options.filePath}: ` +
                    `sandbox_workspace_write.exclude_slash_tmp: expected boolean`, options.filePath);
            }
            // Inverse mapping: codex calls it "exclude" (true = /tmp is NOT writable);
            // envoy-harness calls it "slashTmpWritable" (true = /tmp IS writable).
            layer.slashTmpWritable = !w.exclude_slash_tmp;
        }
    }
    if ("mcp_servers" in parsed) {
        layer.mcpServers = parseCodexMcpServers(parsed.mcp_servers, options.filePath);
    }
    if ("hook" in parsed) {
        const hookSpecs = parseCodexHookTable(parsed.hook);
        if (hookSpecs.length > 0) {
            layer.hooks = [...(layer.hooks ?? []), ...hookSpecs];
        }
    }
    // 3. Walk the parsed object for warnings.
    //    the known-field extraction so the warnings don't fire
    //    for keys we've already mapped.
    collectWarnings(parsed, "", warnings);
    // 4. Validate the layer against the schema. This catches
    //    type drift in the future (if ConfigLayerSchema ever
    //    tightens). The mapping above is hand-checked, but the
    //    schema is the source of truth.
    const result = ConfigLayerSchema.safeParse(layer);
    if (!result.success) {
        throw new ConfigLoadError(`invalid codex config: ${options.filePath}: ` +
            result.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; "), options.filePath, result.error);
    }
    return {
        layer: result.data,
        warnings,
        sourcePath: options.filePath,
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Read the file. ENOENT is an error here (the user
 *  explicitly asked to import this file). */
async function readCodexFile(filePath) {
    try {
        return await fs.readFile(filePath, "utf8");
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new ConfigLoadError(`codex config file not found: ${filePath}`, filePath, err);
        }
        throw new ConfigLoadError(`failed to read codex config file: ${filePath}: ${err.message}`, filePath, err);
    }
}
/** Parse the file as TOML. The result is `unknown`; the
 *  field extractors above narrow it. */
function parseCodexToml(raw, filePath) {
    let parsed;
    try {
        parsed = parseToml(raw);
    }
    catch (err) {
        throw new ConfigLoadError(`failed to parse codex TOML: ${filePath}: ${err.message}`, filePath, err);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        // An empty TOML file parses to an empty object; a non-object
        // result is malformed.
        throw new ConfigLoadError(`invalid codex config: ${filePath}: expected a TOML table at the root`, filePath);
    }
    return parsed;
}
/**
 * Map codex's `approval_policy` to envoy-harness's
 * `askForApproval`. Two of the four values are exact
 * matches; the other two are approximations (the
 * caller is told via a warning).
 */
function mapApprovalPolicy(v) {
    switch (v) {
        case "untrusted":
            // codex "untrusted" is closest to envoy-harness's
            // "unless-trusted" — both ask for approval on
            // anything that isn't on a trusted list.
            return {
                value: "unless-trusted",
                warning: "approval_policy 'untrusted' mapped to 'unless-trusted' " +
                    "(approximate; review the docs to confirm the semantics match your intent)",
            };
        case "on-failure":
            // codex "on-failure" asks for approval only on
            // failures (e.g. test failures). envoy-harness
            // has no equivalent; the closest is "granular"
            // (per-tool decisions). Approximate.
            return {
                value: "granular",
                warning: "approval_policy 'on-failure' mapped to 'granular' " +
                    "(approximate; envoy-harness has no failure-only mode)",
            };
        case "on-request":
            return { value: "on-request" };
        case "never":
            return { value: "never" };
        default:
            return undefined;
    }
}
/**
 * Top-level codex keys whose contents we've ALREADY
 * enumerated manually (each child is mapped or warned
 * about by the field extractors above). We skip these
 * to avoid double-reporting.
 */
const KNOWN_MAPPED_PARENTS = new Set([
    "sandbox_mode",
    "approval_policy",
    "sandbox_workspace_write",
    "mcp_servers",
    "hook",
]);
/**
 * Walk the parsed TOML and collect warnings for every
 * key we DIDN'T map. We walk after the known-field
 * extraction so we don't re-warn for keys we already
 * consumed. The `path` argument is the dotted path of
 * the current nesting level.
 */
function collectWarnings(obj, path, warnings) {
    for (const [k, v] of Object.entries(obj)) {
        const fullKey = path === "" ? k : `${path}.${k}`;
        if (path === "" && KNOWN_MAPPED_PARENTS.has(k)) {
            // Already handled by the field extractors — skip
            // (don't report it as unknown; don't recurse into
            // its children, we already know which ones we want).
            continue;
        }
        if (path === "sandbox_workspace_write" &&
            (k === "writable_roots" || k === "network_access" || k === "exclude_slash_tmp")) {
            // Already handled by the workspace-write extractor.
            continue;
        }
        if (path === "") {
            // Top-level unknown / ignored key.
            const known = KNOWN_BUT_IGNORED_KEYS.get(k);
            if (known !== undefined) {
                warnings.push({ key: fullKey, reason: known.reason });
            }
            else {
                warnings.push({
                    key: fullKey,
                    reason: "unknown codex key (not in envoy-harness schema; ignored)",
                });
            }
        }
        // Recurse into nested objects (for unknown tables
        // we want the user to see what's inside, so they
        // know what was dropped).
        if (v !== null &&
            typeof v === "object" &&
            !Array.isArray(v) &&
            // Don't recurse into known-but-ignored top-level
            // tables (the warning already covers their contents).
            !(path === "" && KNOWN_BUT_IGNORED_KEYS.has(k)) &&
            // Don't recurse into known-and-mapped parents.
            !(path === "" && KNOWN_MAPPED_PARENTS.has(k))) {
            collectWarnings(v, fullKey, warnings);
        }
    }
}
//# sourceMappingURL=codex.js.map