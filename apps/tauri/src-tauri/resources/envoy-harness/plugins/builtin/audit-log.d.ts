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
import type { CapabilityModule } from "../types.js";
/** The audit-log plugin's typed config. The
 *  `| undefined` is intentional: the zod schema's
 *  optional fields produce `{ key: string | undefined }`
 *  in the parsed output, and the interface matches
 *  that exactOptionalPropertyTypes-friendly shape. */
export interface AuditLogConfig {
    /** The log line prefix. Default: `"audit"`. */
    prefix?: string | undefined;
}
/** zod schema for the audit-log plugin's config.
 *  Chunk 3.4: the runner validates the CLI-supplied
 *  config against this schema before calling `apply`. */
export declare const AuditLogConfigSchema: z.ZodObject<{
    prefix: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    prefix?: string | undefined;
}, {
    prefix?: string | undefined;
}>;
/** The plugin's name. Used by the whitelist + the registry. */
export declare const AUDIT_LOG_NAME = "envoy-harness-plugin-audit-log";
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
export declare const auditLogPlugin: CapabilityModule<AuditLogConfig>;
//# sourceMappingURL=audit-log.d.ts.map