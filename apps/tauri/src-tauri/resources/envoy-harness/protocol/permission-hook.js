/**
 * PreToolUse hook that forces host approval via AskHandler.
 *
 * ACP / embedding hosts set `AgentOptions.askHandler` to bridge
 * into `session/request_permission`. Without a PreToolUse `ask`
 * decision, that handler never runs — tools would execute silently.
 */
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
export function installToolPermissionAskHook(hooks, options) {
    const shouldAsk = options?.shouldAsk ?? (() => true);
    const handler = async (event) => {
        const payload = event.payload;
        const tool = typeof payload === "object" &&
            payload !== null &&
            "tool" in payload &&
            typeof payload.tool === "string"
            ? payload.tool
            : "tool";
        const args = typeof payload === "object" && payload !== null
            ? payload.args
            : undefined;
        if (!shouldAsk(tool, args)) {
            return { kind: "continue" };
        }
        return {
            kind: "ask",
            question: `Allow tool \`${tool}\`?`,
        };
    };
    hooks.on("PreToolUse", handler);
    return () => {
        hooks.unregister("PreToolUse", handler);
    };
}
//# sourceMappingURL=permission-hook.js.map