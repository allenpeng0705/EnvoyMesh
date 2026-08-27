/**
 * Public config API. Re-exports the schema, the loader,
 * and the path resolver so consumers (`Agent`,
 * `run()`, the REPL) can pull from one import path.
 */
export { ConfigLayerSchema, HookHandlerSpecSchema, type ConfigLayer, type HookHandlerSpec, } from "./schema.js";
export { ConfigLoadError, DEFAULT_CONFIG_PATH, loadConfig, loadConfigFile, loadConfigWithImport, resolveConfigPath, } from "./loader.js";
export { applyShellEnvironmentPolicy, ShellEnvironmentPolicySchema, type ShellEnvironmentPolicy, } from "./shell-env.js";
export { resolveAgentRuntimeConfig, systemPromptOptionsFromConfig, type ResolvedAgentRuntimeConfig, } from "./apply.js";
export { defaultDistConfigPath, loadConfigStack, mergeConfigLayers, parseConfigLayer, type LoadConfigStackOptions, type LoadedConfigStack, } from "./layers.js";
export { importCodexConfig, importDeepseekConfig, isImportFormat, parseClaudeCodeHooks, SUPPORTED_IMPORT_FORMATS, type CodexImportResult, type CodexImportWarning, type DeepseekImportResult, type DeepseekImportWarning, type ImportCodexOptions, type ImportDeepseekOptions, type ImportFormat, type ParseClaudeCodeHooksOptions, type ParseClaudeCodeHooksResult, type SkippedCcHook, } from "./import/index.js";
//# sourceMappingURL=index.d.ts.map