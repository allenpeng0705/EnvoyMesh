/**
 * PreToolUse hook that forces host approval via AskHandler.
 *
 * ACP / embedding hosts set `AgentOptions.askHandler` to bridge
 * into `session/request_permission`. Without a PreToolUse `ask`
 * decision, that handler never runs — tools would execute silently.
 */
import type { HookRegistry } from "../hooks/index.js";
export interface ToolPermissionAskHookOptions {
    /**
     * Return false to skip asking (auto-allow). Default: ask for every tool.
     */
    shouldAsk?: (toolName: string, args?: unknown) => boolean;
}
/**
 * Register a PreToolUse handler that returns `{ kind: "ask" }` so
 * the agent loop pauses on `askHandler`. Returns an unregister fn.
 *
 * **Why this looks the way it does:** the `HookRegistry` invokes
 * handlers with a `HookEvent` (`{ name, payload }`), NOT with the
 * raw payload. An earlier version of this function accepted the
 * raw `payload: unknown` and tried to read `payload.tool` directly,
 * which was always undefined (the real field is `event.payload.tool`).
 * The bug was silent (the question defaulted to "Allow tool `tool`?")
 * and only caught by code review.
 */
export declare function installToolPermissionAskHook(hooks: HookRegistry, options?: ToolPermissionAskHookOptions): () => void;
//# sourceMappingURL=permission-hook.d.ts.map