/**
 * Phase B / Item 3.2 + 3.4 — built-in sample plugin: `confirm-tool`.
 *
 * **What this is:** a hook plugin that asks the user
 * to confirm every invocation of a particular tool
 * (default: `bash`). The plugin registers a
 * `PreToolUse` handler that returns
 * `{ kind: "ask", ... }` when the payload's `tool`
 * field matches the configured target; otherwise
 * the handler returns `{ kind: "continue" }` (a
 * pass-through).
 *
 * **Why this plugin:** it exercises three facets of
 * the seam that the `audit-log` sample doesn't:
 *
 * 1. **A `PreToolUse` hook** (the `audit-log` is
 *    `PostToolUse`). Proves the seam works for any
 *    of the 12 hook events.
 * 2. **The `ask` decision** (F9.1's
 *    `AskDecision` host wire). The agent loop
 *    pauses, calls `AgentOptions.askHandler`,
 *    and resumes with the user's allow / deny /
 *    modify choice. The `audit-log` plugin never
 *    returns `ask`.
 * 3. **Config-driven behavior** (`config.tool`).
 *    The plugin's `apply(ctx, config)` reads the
 *    config and behaves differently based on it.
 *
 * **Manual filter (not `match.tool`):** the
 * `HookRegistry.on()` API takes
 * `HookFn | HookHandler` (see `src/types.ts:212`);
 * the declarative `HookHandler.match` field is
 * only honored for shell-command / TS-module
 * handlers, NOT for inline `HookFn` calls. A
 * `HookFn` that wants to filter by tool name
 * must inspect the payload itself. This plugin
 * does the canonical "filter, then act" pattern.
 *
 * **Hermetic:** no I/O, no LLM, no real kernel.
 * The test suite fires synthetic `PreToolUse`
 * events on a real `HookRegistry` and asserts
 * the returned `HookDecision`.
 *
 * **Config shape:** `{ tool?: string }` — the tool
 * name to ask on. The schema is exported as
 * `ConfirmToolConfigSchema`. The plugin reads
 * `config.tool` and falls back to `"bash"` when
 * the field is absent.
 */
import { z } from "zod";
import type { CapabilityModule } from "../types.js";
/** The confirm-tool plugin's typed config. The
 *  `| undefined` is intentional: the zod schema's
 *  optional fields produce `{ key: string | undefined }`
 *  in the parsed output, and the interface matches
 *  that exactOptionalPropertyTypes-friendly shape. */
export interface ConfirmToolConfig {
    /** The tool name to ask on. Default: `"bash"`. */
    tool?: string | undefined;
}
/** zod schema for the confirm-tool plugin's config.
 *  Chunk 3.4: the runner validates the CLI-supplied
 *  config against this schema before calling `apply`. */
export declare const ConfirmToolConfigSchema: z.ZodObject<{
    tool: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    tool?: string | undefined;
}, {
    tool?: string | undefined;
}>;
/** The plugin's name. Used by the whitelist + the registry. */
export declare const CONFIRM_TOOL_NAME = "envoy-harness-plugin-confirm-tool";
/**
 * The confirm-tool plugin.
 *
 * Registers a `PreToolUse` handler that:
 * - filters by `payload.tool === targetTool`
 *   (default `bash`, override via `config.tool`);
 * - returns `ask` for matching tool calls (so the
 *   host's `askHandler` prompts the user);
 * - returns `continue` for non-matching calls.
 *
 * The `ask` decision surfaces the tool name + a
 * standard question + the standard "Allow / Deny"
 * options, which is the canonical "permission
 * request" shape in codex / claudecode / deepseek.
 *
 * The returned `Disposable` unregisters the
 * handler when the plugin is disposed.
 */
export declare const confirmToolPlugin: CapabilityModule<ConfirmToolConfig>;
//# sourceMappingURL=confirm-tool.d.ts.map