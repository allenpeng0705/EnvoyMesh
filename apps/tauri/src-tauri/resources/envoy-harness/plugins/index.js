/**
 * Phase B / Item 3.1 — plugin system public surface.
 *
 * Re-exports the types, the loader, the registry, and
 * the whitelist helper. The built-in `audit-log` plugin
 * lives in `./builtin/audit-log.js` and is registered
 * separately (it ships with the harness; the user
 * doesn't have to add it to the whitelist).
 */
export { PluginConfigError, PluginLoadError, } from "./types.js";
export { loadPlugin } from "./loader.js";
export { PluginRegistry } from "./registry.js";
export { getBuiltinPlugin, isBuiltinPlugin, isWhitelistedPlugin, PLUGIN_WHITELIST, } from "./whitelist.js";
export { isAllowedPlugin, isBuiltinPluginName, resolvePluginAllowList, } from "./allowlist.js";
export { mergePluginConfigs, parsePluginConfigEntry, PluginConfigParseError, } from "./config-parser.js";
export { validatePluginConfig } from "./validate-config.js";
export { auditLogPlugin, AuditLogConfigSchema, } from "./builtin/audit-log.js";
export { confirmToolPlugin, ConfirmToolConfigSchema, } from "./builtin/confirm-tool.js";
export { calculatorPlugin, CalculatorConfigSchema, evaluateExpression, CalculatorError, } from "./builtin/calculator.js";
//# sourceMappingURL=index.js.map