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
export declare const HookHandlerSpecSchema: z.ZodObject<{
    /**
     * The shell command to run. Same wire format as the
     * runtime `runShellHandler`: `HOOK_EVENT` +
     * `HOOK_PAYLOAD` env vars, stdout parsed as JSON.
     */
    command: z.ZodString;
    /**
     * Optional match clause. When set, the handler only
     * fires when the event payload matches:
     * - `tool`: the `tool` field of the payload (e.g.
     *   `"bash"` for `PreToolUse` / `PostToolUse`).
     * - `pattern`: a regex tested against the JSON
     *   payload (deepseek's `matcher` is mapped to
     *   `pattern` — envoy's match is always regex).
     */
    match: z.ZodOptional<z.ZodObject<{
        tool: z.ZodOptional<z.ZodString>;
        pattern: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        tool?: string | undefined;
        pattern?: string | undefined;
    }, {
        tool?: string | undefined;
        pattern?: string | undefined;
    }>>;
    /** The event name this handler is registered for. */
    event: z.ZodEnum<["PreToolUse", "PostToolUse", "PreCompact", "PostCompact", "SessionStart", "SessionEnd", "Stop", "SubagentStop", "UserPromptSubmit", "Notification", "PermissionRequest", "Setup"]>;
    /**
     * Max time the handler is allowed to run. Default
     * 5s (matches the runtime's `runShellHandler`
     * default).
     */
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    event: "PreToolUse" | "PostToolUse" | "PreCompact" | "PostCompact" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStop" | "UserPromptSubmit" | "Notification" | "PermissionRequest" | "Setup";
    command: string;
    match?: {
        tool?: string | undefined;
        pattern?: string | undefined;
    } | undefined;
    timeoutMs?: number | undefined;
}, {
    event: "PreToolUse" | "PostToolUse" | "PreCompact" | "PostCompact" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStop" | "UserPromptSubmit" | "Notification" | "PermissionRequest" | "Setup";
    command: string;
    match?: {
        tool?: string | undefined;
        pattern?: string | undefined;
    } | undefined;
    timeoutMs?: number | undefined;
}>;
export type HookHandlerSpec = z.infer<typeof HookHandlerSpecSchema>;
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
export declare const ConfigLayerSchema: z.ZodObject<{
    /** Mirrors `PermissionMode`. */
    permissionMode: z.ZodOptional<z.ZodEnum<["read-only", "workspace-write", "danger-full-access"]>>;
    /** Mirrors `AskForApproval`. */
    askForApproval: z.ZodOptional<z.ZodEnum<["unless-trusted", "on-request", "granular", "never"]>>;
    /** Mirrors `SandboxBackend`. */
    sandboxBackend: z.ZodOptional<z.ZodEnum<["linux-landlock", "darwin-sandbox", "windows-sandbox", "process-fs-namespace", "none"]>>;
    /** If true, network is allowed in workspace-write mode. */
    networkAccess: z.ZodOptional<z.ZodBoolean>;
    /**
     * If true, /tmp is treated as a writable root
     * (the renamed `excludeSlashTmp` — see T1.1).
     */
    slashTmpWritable: z.ZodOptional<z.ZodBoolean>;
    /** Extra paths writable in workspace-write mode. */
    writableRoots: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * Phase B / Item 15.2: hook handlers registered on
     * the agent's `HookRegistry` at runner startup.
     * Each entry is one handler (the runtime composes
     * multiple handlers per event). The same shape is
     * produced by the codex importer (chunk 15.3+) and
     * the deepseek importer (this chunk) so a mixed
     * config (native + imported) is consistent.
     */
    hooks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        /**
         * The shell command to run. Same wire format as the
         * runtime `runShellHandler`: `HOOK_EVENT` +
         * `HOOK_PAYLOAD` env vars, stdout parsed as JSON.
         */
        command: z.ZodString;
        /**
         * Optional match clause. When set, the handler only
         * fires when the event payload matches:
         * - `tool`: the `tool` field of the payload (e.g.
         *   `"bash"` for `PreToolUse` / `PostToolUse`).
         * - `pattern`: a regex tested against the JSON
         *   payload (deepseek's `matcher` is mapped to
         *   `pattern` — envoy's match is always regex).
         */
        match: z.ZodOptional<z.ZodObject<{
            tool: z.ZodOptional<z.ZodString>;
            pattern: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            tool?: string | undefined;
            pattern?: string | undefined;
        }, {
            tool?: string | undefined;
            pattern?: string | undefined;
        }>>;
        /** The event name this handler is registered for. */
        event: z.ZodEnum<["PreToolUse", "PostToolUse", "PreCompact", "PostCompact", "SessionStart", "SessionEnd", "Stop", "SubagentStop", "UserPromptSubmit", "Notification", "PermissionRequest", "Setup"]>;
        /**
         * Max time the handler is allowed to run. Default
         * 5s (matches the runtime's `runShellHandler`
         * default).
         */
        timeoutMs: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        event: "PreToolUse" | "PostToolUse" | "PreCompact" | "PostCompact" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStop" | "UserPromptSubmit" | "Notification" | "PermissionRequest" | "Setup";
        command: string;
        match?: {
            tool?: string | undefined;
            pattern?: string | undefined;
        } | undefined;
        timeoutMs?: number | undefined;
    }, {
        event: "PreToolUse" | "PostToolUse" | "PreCompact" | "PostCompact" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStop" | "UserPromptSubmit" | "Notification" | "PermissionRequest" | "Setup";
        command: string;
        match?: {
            tool?: string | undefined;
            pattern?: string | undefined;
        } | undefined;
        timeoutMs?: number | undefined;
    }>, "many">>;
    /**
     * MCP stdio servers to spawn at runner startup. Tools appear as
     * `mcp__<name>__<tool>` on the model tool list.
     */
    mcpServers: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strict", z.ZodTypeAny, {
        command: string;
        name: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }, {
        command: string;
        name: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }>, "many">>;
    /**
     * Static mesh peers for collaboration (cluster rail, /peers, /route).
     * TOML: `[[peers]]` with `id`, `endpoint` (`host:port`), optional
     * `model` and `capabilities`.
     */
    peers: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        endpoint: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        capabilities: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        endpoint: string;
        model?: string | undefined;
        capabilities?: string[] | undefined;
    }, {
        id: string;
        endpoint: string;
        model?: string | undefined;
        capabilities?: string[] | undefined;
    }>, "many">>;
    /**
     * Whitelisted Cordis plugins (`@envoymesh/envoy-harness-cordis`).
     * TOML: `[[cordis_plugins]]` with `name` and optional inline `config`.
     */
    cordisPlugins: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        config?: Record<string, unknown> | undefined;
    }, {
        name: string;
        config?: Record<string, unknown> | undefined;
    }>, "many">>;
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
    plugins: z.ZodOptional<z.ZodObject<{
        allow: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        allow?: string[] | undefined;
    }, {
        allow?: string[] | undefined;
    }>>;
    /** Deployment persona injected into the system prompt. */
    persona: z.ZodOptional<z.ZodString>;
    /** Extra developer instructions for the system prompt. */
    developerInstructions: z.ZodOptional<z.ZodString>;
    /** When false, omit the harness identity opener. Default true. */
    includeHarnessIdentity: z.ZodOptional<z.ZodBoolean>;
    /**
     * Extra project-doc filenames after AGENTS.md
     * (default ENVOY.md, CLAUDE.md, CONTRIBUTING.md when unset at prompt build).
     */
    projectDocFallbackFilenames: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * Codex-shaped policy for bash/job spawn env.
     * TOML: `[shell_environment_policy]`.
     */
    shellEnvironmentPolicy: z.ZodOptional<z.ZodObject<{
        inherit: z.ZodOptional<z.ZodEnum<["all", "core", "none"]>>;
        exclude: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        includeOnly: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        set: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        ignoreDefaultExcludes: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        set?: Record<string, string> | undefined;
        inherit?: "none" | "all" | "core" | undefined;
        exclude?: string[] | undefined;
        includeOnly?: string[] | undefined;
        ignoreDefaultExcludes?: boolean | undefined;
    }, {
        set?: Record<string, string> | undefined;
        inherit?: "none" | "all" | "core" | undefined;
        exclude?: string[] | undefined;
        includeOnly?: string[] | undefined;
        ignoreDefaultExcludes?: boolean | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    permissionMode?: "read-only" | "workspace-write" | "danger-full-access" | undefined;
    askForApproval?: "unless-trusted" | "on-request" | "granular" | "never" | undefined;
    sandboxBackend?: "linux-landlock" | "darwin-sandbox" | "windows-sandbox" | "process-fs-namespace" | "none" | undefined;
    networkAccess?: boolean | undefined;
    slashTmpWritable?: boolean | undefined;
    writableRoots?: string[] | undefined;
    hooks?: {
        event: "PreToolUse" | "PostToolUse" | "PreCompact" | "PostCompact" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStop" | "UserPromptSubmit" | "Notification" | "PermissionRequest" | "Setup";
        command: string;
        match?: {
            tool?: string | undefined;
            pattern?: string | undefined;
        } | undefined;
        timeoutMs?: number | undefined;
    }[] | undefined;
    mcpServers?: {
        command: string;
        name: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }[] | undefined;
    peers?: {
        id: string;
        endpoint: string;
        model?: string | undefined;
        capabilities?: string[] | undefined;
    }[] | undefined;
    cordisPlugins?: {
        name: string;
        config?: Record<string, unknown> | undefined;
    }[] | undefined;
    plugins?: {
        allow?: string[] | undefined;
    } | undefined;
    persona?: string | undefined;
    developerInstructions?: string | undefined;
    includeHarnessIdentity?: boolean | undefined;
    projectDocFallbackFilenames?: string[] | undefined;
    shellEnvironmentPolicy?: {
        set?: Record<string, string> | undefined;
        inherit?: "none" | "all" | "core" | undefined;
        exclude?: string[] | undefined;
        includeOnly?: string[] | undefined;
        ignoreDefaultExcludes?: boolean | undefined;
    } | undefined;
}, {
    permissionMode?: "read-only" | "workspace-write" | "danger-full-access" | undefined;
    askForApproval?: "unless-trusted" | "on-request" | "granular" | "never" | undefined;
    sandboxBackend?: "linux-landlock" | "darwin-sandbox" | "windows-sandbox" | "process-fs-namespace" | "none" | undefined;
    networkAccess?: boolean | undefined;
    slashTmpWritable?: boolean | undefined;
    writableRoots?: string[] | undefined;
    hooks?: {
        event: "PreToolUse" | "PostToolUse" | "PreCompact" | "PostCompact" | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStop" | "UserPromptSubmit" | "Notification" | "PermissionRequest" | "Setup";
        command: string;
        match?: {
            tool?: string | undefined;
            pattern?: string | undefined;
        } | undefined;
        timeoutMs?: number | undefined;
    }[] | undefined;
    mcpServers?: {
        command: string;
        name: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }[] | undefined;
    peers?: {
        id: string;
        endpoint: string;
        model?: string | undefined;
        capabilities?: string[] | undefined;
    }[] | undefined;
    cordisPlugins?: {
        name: string;
        config?: Record<string, unknown> | undefined;
    }[] | undefined;
    plugins?: {
        allow?: string[] | undefined;
    } | undefined;
    persona?: string | undefined;
    developerInstructions?: string | undefined;
    includeHarnessIdentity?: boolean | undefined;
    projectDocFallbackFilenames?: string[] | undefined;
    shellEnvironmentPolicy?: {
        set?: Record<string, string> | undefined;
        inherit?: "none" | "all" | "core" | undefined;
        exclude?: string[] | undefined;
        includeOnly?: string[] | undefined;
        ignoreDefaultExcludes?: boolean | undefined;
    } | undefined;
}>;
export type ConfigLayer = z.infer<typeof ConfigLayerSchema>;
//# sourceMappingURL=schema.d.ts.map