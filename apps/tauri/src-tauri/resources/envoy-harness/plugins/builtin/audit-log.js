/**
 * Phase B / Item 3.1 + 3.4 — built-in sample plugin: `audit-log`.
 *
 * **What this is:** the smallest possible plugin that
 * exercises the full lifecycle. It registers a
 * `PostToolUse` hook on the agent's `HookRegistry`; the
 * hook logs every tool call to `stderr` (prefixed with
 * the plugin name so multi-plugin logs are easy to grep).
 *
 * **Why this plugin:** it's a 1-page example that
 * demonstrates:
 * 1. The plugin's `name` field.
 * 2. The `apply(ctx, config)` lifecycle.
 * 3. Hook registration on `ctx.hooks`.
 * 4. The `dispose()` cleanup path.
 * 5. (chunk 3.4) A zod `configSchema` that the runner
 *    validates before calling `apply`.
 *
 * **Hermetic:** no I/O, no LLM, no real kernel. The test
 * suite exercises the hook by firing a synthetic
 * `PostToolUse` event on a real `HookRegistry`.
 *
 * **Config shape:** `{ prefix?: string }` — the log
 * line prefix. The schema is exported as
 * `AuditLogConfigSchema`. The plugin reads `config.prefix`
 * and falls back to `"audit"` when the field is absent.
 */
import { z } from "zod";
/** zod schema for the audit-log plugin's config.
 *  Chunk 3.4: the runner validates the CLI-supplied
 *  config against this schema before calling `apply`. */
export const AuditLogConfigSchema = z.object({
    prefix: z.string().optional(),
});
/** The plugin's name. Used by the whitelist + the registry. */
export const AUDIT_LOG_NAME = "envoy-harness-plugin-audit-log";
/**
 * The audit-log plugin.
 *
 * Registers a `PostToolUse` hook that logs every tool
 * call. The log line format is:
 *   `<prefix> tool=<name> result=<ok|error>`
 *
 * **What it does NOT do:** the v0 plugin doesn't log
 * the tool's args or result content (that would be a
 * security / privacy hazard — the args may contain
 * secrets, the result may contain PII). The plugin
 * is the audit hook, not the data exfil hook.
 */
export const auditLogPlugin = {
    name: AUDIT_LOG_NAME,
    configSchema: AuditLogConfigSchema,
    apply(ctx, config) {
        // The runner validated `config` against
        // `configSchema` (chunk 3.4). Tests that call
        // `apply` directly pass a `Partial<AuditLogConfig>`-
        // shaped object; the destructuring default
        // handles the missing `prefix`.
        const { prefix = "audit" } = config;
        // The handler captures `prefix` via closure. The
        // `tool` and `isError` come from the `PostToolUse`
        // payload (the agent loop populates these — see
        // `run-loop.ts`).
        //
        // We return `Promise<HookDecision>` (via `async`)
        // to match the `HookFn` signature, even though
        // the body is synchronous. The runtime awaits
        // every handler; making this `async` is the
        // minimal-friction way to opt in.
        const handler = async (event) => {
            const payload = event.payload;
            const tool = payload.tool ?? "<unknown>";
            const status = payload.isError ? "error" : "ok";
            ctx.logger.info(`${prefix} tool=${tool} result=${status}`);
            return { kind: "continue" };
        };
        ctx.hooks.on("PostToolUse", handler);
        // Return a disposer that unregisters the hook.
        // The hook registry's `unregister` matches by
        // reference, so capturing the same `handler`
        // object here is critical.
        return () => {
            ctx.hooks.unregister("PostToolUse", handler);
        };
    },
};
//# sourceMappingURL=audit-log.js.map