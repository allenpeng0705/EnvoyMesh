/**
 * Config schema — the v0 subset of the design §20 TOML
 * config file. Not the full schema: just the fields the
 * loader actually reads today.
 *
 * **Why a zod schema, not a hand-rolled type?**
 * smol-toml returns a plain object with `unknown` values;
 * the zod schema validates the shape + value kinds at
 * load time, so the rest of the code can rely on the
 * narrower types without per-field guards.
 *
 * **Why not the full §20 schema?** The full design has
 * ~30 fields (MCP, mesh, self-evolve, hooks, etc.).
 * Most of them are aspirational (see §2.5 of the
 * implementation plan: "MCP — deferred", "OS sandbox —
 * deferred", etc.). T2.2 ships the subset that has a
 * consumer today: the permission + sandbox + writable-
 * roots fields that flow into `AgentOptions`. The rest
 * lands when their consumers do.
 *
 * **Field naming:** kebab-case in the file
 * (`permission_mode`), camelCase in the type
 * (`permissionMode`). The mapping is at the schema
 * level, so consumers never see the file convention.
 */
import { z } from "zod";
import { AskForApprovalSchema, HookEventNameSchema, PermissionModeSchema, SandboxBackendSchema, } from "../types.js";
import { ShellEnvironmentPolicySchema } from "./shell-env.js";
/**
 * Phase B / Item 15.2: a single hook handler spec in
 * the config layer. The shape is a strict subset of the
 * runtime `HookHandler` (no `module` form — the config
 * layer is data-only; importing code belongs in a
 * separate `extensions/` directory, not in TOML).
 *
 * **Why not the runtime `HookHandler` directly:** the
 * runtime accepts either `command` or `module` (OR).
 * The config layer requires `command` (a TOML file
 * can't import a TS module). Splitting the types keeps
 * both clean.
 */
export const HookHandlerSpecSchema = z
    .object({
    /**
     * The shell command to run. Same wire format as the
     * runtime `runShellHandler`: `HOOK_EVENT` +
     * `HOOK_PAYLOAD` env vars, stdout parsed as JSON.
     */
    command: z.string().min(1),
    /**
     * Optional match clause. When set, the handler only
     * fires when the event payload matches:
     * - `tool`: the `tool` field of the payload (e.g.
     *   `"bash"` for `PreToolUse` / `PostToolUse`).
     * - `pattern`: a regex tested against the JSON
     *   payload (deepseek's `matcher` is mapped to
     *   `pattern` — envoy's match is always regex).
     */
    match: z
        .object({
        tool: z.string().optional(),
        pattern: z.string().optional(),
    })
        .optional(),
    /** The event name this handler is registered for. */
    event: HookEventNameSchema,
    /**
     * Max time the handler is allowed to run. Default
     * 5s (matches the runtime's `runShellHandler`
     * default).
     */
    timeoutMs: z.number().int().positive().optional(),
})
    .strict();
/**
 * The v0 user-config layer. All fields are optional —
 * a config file may set only some of them; the rest
 * fall back to the agent's defaults.
 *
 * **Why `.strict()`:** a typo in a TOML key
 * (`permision_mode`) would otherwise be silently
 * ignored (zod's default is "strip unknown"). With
 * `.strict()`, the loader surfaces it as a clear
 * `invalid config shape: permision_mode: unrecognized
 * key` error. Cheap to debug; cheap to add.
 */
export const ConfigLayerSchema = z
    .object({
    /** Mirrors `PermissionMode`. */
    permissionMode: PermissionModeSchema.optional(),
    /** Mirrors `AskForApproval`. */
    askForApproval: AskForApprovalSchema.optional(),
    /** Mirrors `SandboxBackend`. */
    sandboxBackend: SandboxBackendSchema.optional(),
    /** If true, network is allowed in workspace-write mode. */
    networkAccess: z.boolean().optional(),
    /**
     * If true, /tmp is treated as a writable root
     * (the renamed `excludeSlashTmp` — see T1.1).
     */
    slashTmpWritable: z.boolean().optional(),
    /** Extra paths writable in workspace-write mode. */
    writableRoots: z.array(z.string()).optional(),
    /**
     * Phase B / Item 15.2: hook handlers registered on
     * the agent's `HookRegistry` at runner startup.
     * Each entry is one handler (the runtime composes
     * multiple handlers per event). The same shape is
     * produced by the codex importer (chunk 15.3+) and
     * the deepseek importer (this chunk) so a mixed
     * config (native + imported) is consistent.
     */
    hooks: z.array(HookHandlerSpecSchema).optional(),
    /**
     * MCP stdio servers to spawn at runner startup. Tools appear as
     * `mcp__<name>__<tool>` on the model tool list.
     */
    mcpServers: z
        .array(z
        .object({
        name: z.string().min(1),
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
    })
        .strict())
        .optional(),
    /**
     * Static mesh peers for collaboration (cluster rail, /peers, /route).
     * TOML: `[[peers]]` with `id`, `endpoint` (`host:port`), optional
     * `model` and `capabilities`.
     */
    peers: z
        .array(z
        .object({
        id: z.string().min(1),
        endpoint: z.string().min(1),
        model: z.string().optional(),
        capabilities: z.array(z.string()).optional(),
    })
        .strict())
        .optional(),
    /**
     * Whitelisted Cordis plugins (`@envoymesh/envoy-harness-cordis`).
     * TOML: `[[cordis_plugins]]` with `name` and optional inline `config`.
     */
    cordisPlugins: z
        .array(z
        .object({
        name: z.string().min(1),
        config: z.record(z.unknown()).optional(),
    })
        .strict())
        .optional(),
    /**
     * plugin names the user explicitly trusts. Combined
     * with the in-binary built-in whitelist (the
     * `envoy-harness-plugin-*` samples that ship in this
     * package) to form the runtime allow-list. A name
     * not in either is rejected by the loader with a
     * `PluginLoadError`.
     *
     * **Security boundary:** the allow-list is the gate.
     * `await import(name)` is a code-execution vector;
     * the user controls which plugin names are loadable
     * by enumerating them here. The loader still validates
     * the loaded module's `CapabilityModule` shape
     * (`name` + `apply`); this field is the human
     * curation step, that validation is the structural
     * safety net.
     *
     * **Format:** each entry is a Node module specifier
     * (`@scope/pkg`, `my-pkg`, `./relative/path`,
     * `file:///abs/path`). Built-in names
     * (`envoy-harness-plugin-audit-log` etc.) are
     * already in the in-binary allow-list and don't
     * need to be repeated.
     */
    plugins: z
        .object({
        allow: z.array(z.string().min(1)).optional(),
    })
        .strict()
        .optional(),
    /** Deployment persona injected into the system prompt. */
    persona: z.string().optional(),
    /** Extra developer instructions for the system prompt. */
    developerInstructions: z.string().optional(),
    /** When false, omit the harness identity opener. Default true. */
    includeHarnessIdentity: z.boolean().optional(),
    /**
     * Extra project-doc filenames after AGENTS.md
     * (default ENVOY.md, CLAUDE.md, CONTRIBUTING.md when unset at prompt build).
     */
    projectDocFallbackFilenames: z.array(z.string().min(1)).optional(),
    /**
     * Codex-shaped policy for bash/job spawn env.
     * TOML: `[shell_environment_policy]`.
     */
    shellEnvironmentPolicy: ShellEnvironmentPolicySchema.optional(),
})
    .strict();
//# sourceMappingURL=schema.js.map