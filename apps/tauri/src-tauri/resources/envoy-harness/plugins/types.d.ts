/**
 * Phase B / Item 3.1 — plugin system types.
 *
 * **What this is:** the structural types for the
 * capability-module seam. A plugin is a TypeScript module
 * with a default export matching `CapabilityModule`; the
 * host loads it via `loadPlugin`, then registers it on a
 * `PluginRegistry`. The registry calls `apply(ctx, config)`
 * once at registration time (the plugin registers hooks,
 * tools, fragments on `ctx`); the registry calls
 * `dispose()` when the plugin is unregistered or the
 * agent is destroyed.
 *
 * **Reference:** deepseek's `apply(ctx, config)` shape
 * (port the SHAPE, not the runtime; we don't take Cordis
 * as a dep). The CapabilityContext exposes narrow
 * facets (hooks, tools, cwd, logger) — not the full
 * Agent — so a plugin can only extend, not override.
 *
 * **Stability:** the public surface is the `CapabilityModule`,
 * `CapabilityContext`, `PluginLogger`, and `Disposable`
 * interfaces. New methods on the context are additive.
 */
import type { z } from "zod";
import type { CredentialsProvider } from "../credentials/types.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { JobRegistry } from "../jobs/types.js";
import type { TerminalSessionService } from "../terminal/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { WebRuntime } from "../web/types.js";
/**
 * A `Disposable` cleans up plugin-owned resources
 * (a timer, a sub-process, a socket, a per-instance
 * hook handler). The `PluginRegistry` calls every
 * registered `Disposable` in reverse-registration
 * order when the agent is destroyed.
 *
 * The shape is a no-arg function (matches the
 * `EventListener` / `AbortController` patterns in the
 * stdlib). A plugin that has nothing to dispose returns
 * `void` from `apply`; the registry supplies a no-op
 * disposer.
 */
export type Disposable = () => void;
/**
 * The thin logger a plugin uses for diagnostic output.
 * The harness prefixes every line with `[<plugin name>]`
 * so multi-plugin logs are easy to grep.
 */
export interface PluginLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
/**
 * The plugin's window into the harness. v0 exposes the
 * three extension points a plugin can write to: the
 * agent's hook registry, the agent's tool registry, and
 * a logger. The full `Agent` is NOT exposed (security
 * boundary).
 *
 * **Why a narrow surface:** a plugin that needs the
 * full Agent (run model calls, set the system prompt,
 * touch the session) is a HOST, not a plugin. Hosts
 * are TypeScript programs that own an Agent and use
 * it directly; plugins extend an existing Agent.
 */
export interface CapabilityContext {
    /** The working directory the agent is operating in. */
    readonly cwd: string;
    /**
     * The agent's hook registry. A plugin registers hooks
     * via `ctx.hooks.on(event, handler)`; the handlers
     * run on the relevant hook events for the rest of the
     * agent's lifetime (or until the plugin disposes).
     */
    readonly hooks: HookRegistry;
    /**
     * The agent's tool registry. A plugin registers tools
     * via `ctx.tools.register(tool)`; the model sees the
     * new tools on the next turn.
     */
    readonly tools: ToolRegistry;
    /**
     * A logger prefixed with the plugin's name. Use
     * `info` for normal operation, `warn` for recoverable
     * issues, `error` for non-fatal failures. v0 writes
     * to `process.stderr` (the same destination the
     * harness's own warnings use).
     */
    readonly logger: PluginLogger;
    /**
     * Phase C/D — optional environment handles when the
     * host wired them via `wireEnvironmentTools`.
     * Plugins must tolerate absence (local one-shot
     * without environment still works).
     */
    readonly jobs?: JobRegistry;
    readonly web?: WebRuntime;
    readonly terminals?: TerminalSessionService;
    readonly credentials?: CredentialsProvider;
}
/**
 * The contract every plugin must satisfy. A plugin is a
 * TypeScript module with a `default` export matching
 * this shape.
 *
 * **Why a default export:** `await import(modulePath)`
 * returns the module's namespace; the default export
 * is the `CapabilityModule`. This is the canonical ES
 * module pattern for "the main thing this module
 * exports" (matches Rollup / Webpack / TypeScript
 * module conventions).
 *
 * **Why `apply(ctx, config) → Disposable | void`:** the
 * plugin registers its hooks / tools / fragments on
 * `ctx` during `apply`. If it has per-instance state
 * (a timer, a sub-process) it returns a `Disposable`
 * that the registry calls when the plugin is
 * unregistered. If it has nothing to clean up, it
 * returns `void`.
 *
 * @typeParam Config — the plugin's typed config. v0 is
 *   `unknown` (the plugin validates internally if it
 *   wants to). Chunk 3.4 adds a `configSchema?` field
 *   that, when set, makes the runner validate the
 *   config against a zod schema before calling `apply`.
 */
export interface CapabilityModule<Config = unknown> {
    /** Stable identifier. Must be unique in the registry. */
    readonly name: string;
    /**
     * Optional zod schema. When set, the runner
     * validates the config against this schema
     * BEFORE calling `apply` (see
     * `validatePluginConfig` in `validate-config.ts`).
     * When unset, the config is passed through as
     * `unknown` (the v0 contract; the plugin validates
     * internally if it wants to).
     *
     * **Why optional:** forcing every plugin to define
     * a schema would break the v0 contract. The
     * `?` field is additive — existing plugins compile
     * unchanged, the runner checks for the field and
     * validates only when present.
     */
    readonly configSchema?: z.ZodSchema<Config>;
    /**
     * The main entry. Register hooks / tools / fragments
     * on `ctx` here. Optionally return a `Disposable`
     * for per-instance cleanup.
     */
    apply(ctx: CapabilityContext, config: Config): Disposable | void;
}
/**
 * An error thrown by `loadPlugin` or `PluginRegistry`.
 * Distinct from `ConfigLoadError` (which is config-side)
 * and `HookError` (which is runtime-side) so the CLI
 * can distinguish "couldn't load the plugin" from
 * "the plugin loaded but threw at apply-time".
 */
export declare class PluginLoadError extends Error {
    readonly modulePath: string;
    readonly cause?: unknown | undefined;
    readonly name = "PluginLoadError";
    constructor(message: string, modulePath: string, cause?: unknown | undefined);
}
/**
 * A structural zod-issue shape. We don't reach into
 * zod's internal type names (`$ZodIssue` in v4,
 * `ZodIssue` in v3) so this works across the zod
 * minor versions the harness pulls in. The
 * `message` + `path` are the only fields the error
 * formatter needs; everything else is forwarded
 * as opaque metadata (callers can introspect for
 * IDE integrations).
 *
 * Re-exported from `validate-config.ts` for the
 * public surface (the alias `ZodIssueLike`).
 */
export interface ZodIssueLike {
    readonly path: ReadonlyArray<PropertyKey>;
    readonly message: string;
    readonly code?: string;
    readonly [key: string]: unknown;
}
/**
 * Phase B / Item 3.4 — an error thrown by
 * `validatePluginConfig` when the parsed config
 * fails the plugin's `configSchema` validation.
 *
 * Distinct from `PluginLoadError` (which is
 * module-side: couldn't load the module) so the CLI
 * can format a clear "config is invalid" message
 * with the zod issue path + message.
 */
export declare class PluginConfigError extends Error {
    readonly pluginName: string;
    readonly issues: ReadonlyArray<ZodIssueLike>;
    readonly name = "PluginConfigError";
    constructor(pluginName: string, issues: ReadonlyArray<ZodIssueLike>);
}
//# sourceMappingURL=types.d.ts.map