/**
 * The `run` subcommand (default; one-shot) handler.
 * Extracted in T3.2 from `cli/run.ts` so each
 * subcommand has its own file.
 *
 * The flow:
 * 1. Resolve the prompt (positional, `-` for
 *    stdin, or a path).
 * 2. Resolve the model (programmatic or
 *    `--provider + env`).
 * 3. Load the user config (TOML; CLI > config
 *    > default per design §20.1).
 * 4. Build the agent (sandbox policy from CLI
 *    + plan + config; tools; hooks; tracer;
 *    ask handler).
 * 5. Run the loop.
 * 6. Flush the session (so the JSONL write chain
 *    drains before the CLI returns).
 * 7. Print the result.
 */
import { Agent, BUILTIN_TOOLS, ConfigLoadError, EXIT_USAGE, HookRegistry, JsonLinesTracer, LocalMemoryStore, loadConfigStack, loadConfigWithImport, NullTracer, ToolRegistry, VerboseTracer, buildAgentSystemPrompt, systemPromptOptionsFromConfig, } from "../../index.js";
import { wireEnvironmentTools } from "../../environment/index.js";
import { wireMcpClientsFromConfig } from "../../mcp/index.js";
import { policyFromMode } from "../../permissions/policy.js";
import * as path from "node:path";
import { resolveSession } from "../../session/resolve.js";
import { wireCordisExtensions } from "../../cordis/wire-from-config.js";
import { CliError } from "./errors.js";
import { DEFAULT_MAX_COST_USD, defaultAskHandler, defaultSessionDir, resolveModel, resolvePrompt, } from "./helpers.js";
export async function runAgent(parsed, options, stdout, stderr) {
    void stderr; // reserved for future use (e.g. verbose log)
    // 1. Resolve the prompt.
    const prompt = await resolvePrompt(parsed);
    if (prompt === null) {
        throw new CliError("no prompt provided (pass it as an argument)", EXIT_USAGE);
    }
    // 2. Resolve the model. F7.5: when no model is injected
    //    via RunOptions, dispatch from --provider + env vars.
    //    This makes the bin script usable end-to-end (no
    //    need to wire a default adapter in user code).
    const model = resolveModel(parsed, options);
    // 2.5. T2.2: load the user config (TOML). CLI flags
    //      win over the file; the file wins over the agent's
    //      built-in defaults (design §20.1 layer composition).
    //      Missing file → empty config (silent). Malformed file
    //      → throws ConfigLoadError (caught below as a usage error).
    //
    //      Phase B / Item 15.1: `--import-config <path> --from <format>`
    //      adds an imported layer (e.g. codex's config.toml).
    //      Imported values win over the native config; CLI flags
    //      win over both (enforced below by the `??` chain).
    //
    //      Validation: the two flags must appear together. Passing
    //      one without the other is a usage error (the user almost
    //      certainly forgot the companion flag).
    if ((parsed.importConfig === undefined) !==
        (parsed.importFrom === undefined)) {
        throw new CliError("--import-config and --from must be passed together", EXIT_USAGE);
    }
    let configLayer = {};
    let importWarningSummary;
    if (parsed.importConfig !== undefined) {
        // The user explicitly asked to import a file. Surface
        // ALL errors (no ENOENT silencing here — they want THIS
        // file, and a missing file is a clear mistake).
        // `parsed.importFrom` is guaranteed defined here (the
        // XOR check above enforces it), so the conditional
        // spread is just to satisfy `exactOptionalPropertyTypes`.
        const result = await loadConfigWithImport({
            ...(parsed.config !== undefined ? { filePath: parsed.config } : {}),
            importPath: parsed.importConfig,
            ...(parsed.importFrom !== undefined ? { importFrom: parsed.importFrom } : {}),
        });
        configLayer = result.layer;
        if (result.importResult !== undefined && result.importResult.warnings.length > 0) {
            const warnings = result.importResult.warnings;
            const n = warnings.length;
            importWarningSummary =
                `import: ${n} codex key${n === 1 ? "" : "s"} not mapped ` +
                    (parsed.verbose
                        ? `(${warnings.map((w) => w.key).join(", ")})`
                        : "(use --verbose to list)");
            if (parsed.verbose) {
                // Print the full list to stderr too (one per line) for
                // the user who runs --verbose and wants to grep.
                for (const w of warnings) {
                    stderr.write(`  imported warning: ${w.key} — ${w.reason}\n`);
                }
            }
        }
    }
    else {
        // Config stack: dist → user → project `.envoy/config.toml`.
        try {
            const { layer } = await loadConfigStack({
                cwd: parsed.cwd ?? options.cwd ?? process.cwd(),
                ...(parsed.config !== undefined ? { filePath: parsed.config } : {}),
            });
            configLayer = layer;
        }
        catch (err) {
            if (!(err instanceof ConfigLoadError) ||
                !/ENOENT/.test(String(err.cause))) {
                throw err;
            }
        }
    }
    // Surface the import-warning summary (one line) so the user
    // sees it even without --verbose. We do this BEFORE the agent
    // runs so the user doesn't miss it.
    if (importWarningSummary !== undefined) {
        stderr.write(`${importWarningSummary}\n`);
    }
    // 3. Build the agent.
    let cwd = parsed.cwd ?? options.cwd ?? process.cwd();
    // F-fix: `--plan` forces a read-only session (plan mode is
    // read + think, no writes) regardless of `--sandbox`.
    // T2.2: the config file's `permissionMode` is the next
    // fallback (CLI > config > "read-only" default).
    const configMode = configLayer.permissionMode;
    const effectiveMode = parsed.plan
        ? "read-only"
        : parsed.sandbox ?? configMode ?? "read-only";
    const meta = {
        cwd,
        ...(effectiveMode !== undefined ? { permissionMode: effectiveMode } : {}),
        startedAt: new Date().toISOString(),
        title: prompt.slice(0, 60),
    };
    // F14.1: resolve the session. Three modes:
    //   1. `--resume <id>`  → load from disk, pass to Agent.
    //   2. `--fork <id>`    → load from disk, copy messages to
    //                         a NEW session (fresh id), persist.
    //   3. `--persist`      → create a new persisted session.
    //   4. (none of the above) → in-memory session (current behavior).
    const session = await resolveSession(parsed, meta, defaultSessionDir(parsed), stderr);
    // F-fix: the session's recorded cwd wins (matches the REPL's
    // `--repl --resume` behavior). For fresh in-memory / --persist
    // sessions this is the same cwd we just built; for --resume it
    // restores the directory the session was created in.
    cwd = session.metadata.cwd;
    const tools = new ToolRegistry();
    for (const t of BUILTIN_TOOLS)
        tools.register(t);
    const mcpWire = await wireMcpClientsFromConfig(configLayer.mcpServers, tools);
    // Phase C: jobs / web / terminal (Cordis-free L3 ports).
    const environment = wireEnvironmentTools(tools, {
        ...(options.skills !== undefined ? { skills: options.skills } : {}),
    });
    const cordisWire = await wireCordisExtensions({
        plugins: configLayer.cordisPlugins,
        cwd,
        tools,
        environment,
    });
    const jobRegistry = cordisWire.jobs;
    const hooks = options.hooks ?? new HookRegistry();
    // Build the sandbox executor from CLI flags (opt-in).
    // `--sandbox-executor landlock` / `seatbelt` activates a
    // kernel-level executor; absence (or `none`) keeps the
    // default noop — the 6 bash validators are the v1
    // enforcement layer and the default test path stays
    // hermetic. The agent's `sandboxExecutor` option takes
    // priority if the caller also passed one via RunOptions.
    let sandboxExecutor = options.sandboxExecutor;
    if (sandboxExecutor === undefined && parsed.sandboxExecutor !== undefined) {
        const { resolveSandboxExecutor } = await import("../../sandbox/resolve.js");
        // The CLI's `--sandbox-executor none` is a user-facing
        // synonym for "no override" (same as omitting the flag),
        // but the resolver's `force` enum is `"noop"` for
        // explicit noop. Map at the boundary.
        const force = parsed.sandboxExecutor === "none"
            ? "noop"
            : parsed.sandboxExecutor;
        sandboxExecutor = resolveSandboxExecutor({
            policy: policyFromMode(parsed.sandbox ?? "read-only", cwd),
            force,
        });
    }
    const agentOptions = {
        model,
        tools,
        session,
        hooks,
        cwd,
        jobRegistry: jobRegistry,
        terminalService: environment.terminals,
        ...(mcpWire !== undefined ? { mcpClients: mcpWire.registry } : {}),
        ...(sandboxExecutor !== undefined ? { sandboxExecutor } : {}),
    };
    if (parsed.maxTurns !== undefined) {
        agentOptions.maxIterations = parsed.maxTurns;
    }
    if (parsed.maxCostUsd !== undefined) {
        agentOptions.maxCostUsd = parsed.maxCostUsd;
    }
    else {
        // F-fix: the CLI help promises a default $5.00 ceiling;
        // apply it (the library's Agent itself stays uncapped).
        agentOptions.maxCostUsd = DEFAULT_MAX_COST_USD;
    }
    if (parsed.approval !== undefined) {
        agentOptions.approval = parsed.approval;
    }
    // Phase G — wire the system-prompt assembly (AGENTS.md discovery +
    // optional plan mode + terminal guidance) instead of a flat string.
    agentOptions.systemPrompt = await buildAgentSystemPrompt({
        cwd,
        plan: parsed.plan === true,
        ...systemPromptOptionsFromConfig(configLayer),
        permissionMode: effectiveMode ?? "read-only",
        ...(configLayer.askForApproval !== undefined
            ? { askForApproval: configLayer.askForApproval }
            : parsed.approval !== undefined
                ? {
                    askForApproval: parsed.approval,
                }
                : {}),
    });
    agentOptions.memoryStore = new LocalMemoryStore({
        memoryRoot: process.env["ENVOY_MEMORY_DIR"] ?? path.join(cwd, "memories"),
    });
    agentOptions.skills = environment.skills;
    if (configLayer.shellEnvironmentPolicy !== undefined) {
        agentOptions.shellEnvironmentPolicy = configLayer.shellEnvironmentPolicy;
    }
    if (configLayer.askForApproval !== undefined) {
        agentOptions.approval = configLayer.askForApproval;
    }
    else if (parsed.approval !== undefined) {
        agentOptions.approval = parsed.approval;
    }
    // Apply ConfigLayer sandbox extras on top of session mode.
    {
        const { resolveAgentRuntimeConfig } = await import("../../config/apply.js");
        const runtime = resolveAgentRuntimeConfig(cwd, configLayer, {
            permissionMode: effectiveMode ?? "read-only",
            ...(agentOptions.approval !== undefined
                ? { askForApproval: agentOptions.approval }
                : {}),
        });
        agentOptions.sandboxPolicy = runtime.sandboxPolicy;
    }
    if (options.askHandler) {
        agentOptions.askHandler = options.askHandler;
    }
    else {
        // F9.1 default: log to stderr + deny. The host (Tauri,
        // web, etc.) injects a real UI handler via RunOptions.
        agentOptions.askHandler = defaultAskHandler;
    }
    // F9.4: when --json is set, wire a JsonLinesTracer
    // to stdout. The trace events stream alongside the
    // final text; downstream tools (jq, a viewer) parse
    // the stream.
    if (parsed.json) {
        agentOptions.tracer = new JsonLinesTracer(stdout);
    }
    else if (parsed.verbose) {
        // F-fix: `--verbose` prints human-readable tool-call lines
        // to stderr (JSON Lines takes precedence when both are set).
        agentOptions.tracer = new VerboseTracer(stderr);
    }
    else if (options.tracer) {
        // Programmatic injection takes precedence (the host
        // might want a different sink — file, websocket, etc.).
        agentOptions.tracer = options.tracer;
    }
    else {
        // Default: NullTracer (no observable side effect).
        agentOptions.tracer = new NullTracer();
    }
    const agent = new Agent(agentOptions);
    // Phase B / Item 15.2: register any hooks loaded from
    // the config layer. The `hooks` field is produced by
    // the codex / deepseek importers (via
    // `loadConfigWithImport`) or by a native TOML config.
    // Registration is idempotent — the disposer returned
    // by `registerHooksFromConfig` unregisters everything
    // it registered, but the runner's lifetime is one
    // process, so we don't actually need the disposer
    // (it's just for the type contract).
    if (configLayer.hooks !== undefined && configLayer.hooks.length > 0) {
        // Lazy import to keep the one-shot module's import
        // graph small for callers that don't use the hooks
        // path.
        const { registerHooksFromConfig } = await import("../../hooks/register-from-config.js");
        registerHooksFromConfig(agent.hooks, configLayer.hooks);
    }
    // Phase B / Item 3.1: load + register plugins. The
    // host (the runner) is the wire-up: it builds a
    // `CapabilityContext` from the agent's already-
    // constructed sub-registries + cwd, then registers
    // each plugin on a `PluginRegistry`. The agent
    // doesn't need to know about plugins for chunk 3.1;
    // the registry is held by the runner (or passed to
    // the agent via `options.plugins` for future chunks
    // that need it for `/plugins` listing / sub-agent
    // inheritance).
    //
    // Phase B / Item 3.3: per-plugin configs from
    // `--plugin-config <name>.<key>=<value>`. The
    // runner merges every entry into a
    // `Map<name, Record<string, unknown>>` and passes
    // the right config to each plugin's
    // `register(module, config, ctx)`. Plugins without
    // a matching `--plugin-config` entry get `{}`.
    if (parsed.plugins.length > 0) {
        const { PluginRegistry, loadPlugin, mergePluginConfigs, PluginConfigError, PluginLoadError, resolvePluginAllowList, isAllowedPlugin, validatePluginConfig, } = await import("../../plugins/index.js");
        // Build the resolved allow-list (built-in samples ∪
        // `config.plugins.allow`). This is the security gate
        // for the loader: every `--plugin` entry is checked
        // against this set. The runner builds it once per
        // invocation and threads it through every loadPlugin
        // call.
        const allowList = resolvePluginAllowList({
            ...(configLayer.plugins?.allow !== undefined
                ? { configured: configLayer.plugins.allow }
                : {}),
        });
        const registry = new PluginRegistry();
        const pluginLogger = {
            info: (msg) => stderr.write(`[plugin] ${msg}\n`),
            warn: (msg) => stderr.write(`[plugin] warn: ${msg}\n`),
            error: (msg) => stderr.write(`[plugin] error: ${msg}\n`),
        };
        // The plugin's `CapabilityContext` exposes the same
        // `hooks` + `tools` registries the agent uses.
        // Plugins register hooks / tools on these
        // registries; the agent picks them up.
        const pluginCtx = {
            cwd: agent.cwd,
            hooks: agent.hooks,
            tools: agent.tools,
            logger: pluginLogger,
            jobs: environment.jobs,
            web: environment.web,
            terminals: environment.terminals,
            credentials: environment.credentials,
        };
        // Build the per-plugin config map once (the
        // merge is pure). Plugins with no `--plugin-config`
        // entries get `{}` (the merge returns an empty
        // map, and the `get(name) ?? {}` below supplies
        // the default).
        const configByPlugin = mergePluginConfigs(parsed.pluginConfigs);
        for (const modulePath of parsed.plugins) {
            // Quick allow-list check (the loader also
            // checks; this just gives the user a friendlier
            // error before the async import kicks in).
            if (!isAllowedPlugin(modulePath, allowList)) {
                throw new CliError(`plugin not in allow-list: ${modulePath} ` +
                    `(add it to config.plugins.allow in your TOML config)`, EXIT_USAGE);
            }
            let loaded;
            try {
                loaded = await loadPlugin({ modulePath, allowList });
            }
            catch (err) {
                if (err instanceof PluginLoadError) {
                    throw new CliError(err.message, EXIT_USAGE);
                }
                throw err;
            }
            // v0: pass the per-plugin config (or `{}` if
            // the user didn't supply any for this plugin).
            // Chunk 3.4: validate the config against the
            // plugin's `configSchema` (when present) BEFORE
            // calling `apply`. A bad config throws
            // `PluginConfigError`; we convert to
            // `CliError(EXIT_USAGE)` so the user sees a
            // clear "config is invalid" message.
            const rawConfig = configByPlugin.get(modulePath) ?? {};
            let config = rawConfig;
            try {
                config = validatePluginConfig(loaded.module, rawConfig);
            }
            catch (err) {
                if (err instanceof PluginConfigError) {
                    throw new CliError(err.message, EXIT_USAGE);
                }
                throw err;
            }
            registry.register(loaded.module, config, pluginCtx);
        }
        // The registry is held by the runner for the
        // agent's lifetime. We don't dispose at the
        // end (the process is exiting anyway).
        void registry;
    }
    // 4. Run the loop.
    const result = await agent.run(prompt);
    // F-fix: make sure the transcript is durable before the CLI
    // returns (PersistedSession's appends are fire-and-forget).
    await session.flush();
    // 5. Print the result.
    const text = result.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    if (!parsed.quiet) {
        stdout.write(text + "\n");
    }
    await environment.dispose().catch(() => undefined);
    if (cordisWire.cordisDispose !== undefined) {
        await cordisWire.cordisDispose().catch(() => undefined);
    }
    if (mcpWire !== undefined) {
        await mcpWire.dispose().catch(() => undefined);
    }
    return {
        subcommand: "run",
        content: text,
        stopReason: result.stopReason,
        sessionId: session.id,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
    };
}
//# sourceMappingURL=one-shot.js.map