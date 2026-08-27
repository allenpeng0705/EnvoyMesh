/**
 * Phase B / Item 3.4 — per-plugin config validator.
 *
 * **What this is:** the small helper that runs a
 * plugin's `configSchema` (a zod schema) against
 * the parsed config object. Throws `PluginConfigError`
 * on a validation failure. The runner calls this
 * before `register(module, config, ctx)` so the
 * plugin's `apply` always gets a valid `Config`.
 *
 * **Why a separate module, not inline in `one-shot.ts`:** the
 * validation is the same logic every plugin needs
 * (the `configSchema` is optional, but when present
 * the runner MUST validate). A dedicated module
 * keeps the runner's plugin loop readable and gives
 * the validator its own test file.
 *
 * **Why fail-fast in the runner, not lazily in the
 * plugin:** the plugin's `apply` is supposed to
 * TRUST its config. Validation in the runner
 * surfaces a bad config before any plugin touches
 * the agent's `HookRegistry` / `ToolRegistry` (a
 * half-applied plugin set is worse than no plugin
 * set at all).
 */
import { PluginConfigError } from "./types.js";
/**
 * Validate a plugin's config against its
 * `configSchema` (when set). Returns the validated
 * config (the zod `safeParse` result, which is
 * typed against the schema). Throws
 * `PluginConfigError` on a failure.
 *
 * **No-schema case:** when the module has no
 * `configSchema` field, the config passes through
 * unchanged (the v0 contract; the plugin validates
 * internally if it wants to).
 */
export function validatePluginConfig(module, config) {
    if (module.configSchema === undefined) {
        // No schema → pass through. Cast: the v0
        // contract is `unknown`; the plugin is
        // responsible for internal validation when
        // it doesn't declare a schema.
        return config;
    }
    // `safeParse` returns `{ success, data }` or
    // `{ success: false, error: ZodError }`. We use
    // the safe variant so we can format the error
    // into our own `PluginConfigError`. The schema
    // is already typed as `z.ZodSchema<Config>` on
    // `CapabilityModule`, so no cast is needed.
    const result = module.configSchema.safeParse(config);
    if (!result.success) {
        // `result.error.issues` is zod's issue array.
        // The shape is stable across zod minor versions
        // (`{ path, message, code, ... }`); we cast
        // to our structural type.
        const issues = result.error.issues;
        throw new PluginConfigError(module.name, issues);
    }
    return result.data;
}
//# sourceMappingURL=validate-config.js.map