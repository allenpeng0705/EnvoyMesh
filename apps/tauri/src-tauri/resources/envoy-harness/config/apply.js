/**
 * Apply a ConfigLayer to session permission / approval / sandbox.
 */
import { policyFromMode } from "../permissions/policy.js";
/**
 * Resolve permission + approval + sandbox from a config layer.
 * Defaults match ACP/Envoy chat (writable workspace) when unset.
 */
export function resolveAgentRuntimeConfig(cwd, layer = {}, defaults = {}) {
    const permissionMode = layer.permissionMode ?? defaults.permissionMode ?? "workspace-write";
    const askForApproval = layer.askForApproval ?? defaults.askForApproval ?? "on-request";
    const base = policyFromMode(permissionMode, cwd);
    const sandboxPolicy = {
        ...base,
        approval: askForApproval,
        ...(layer.sandboxBackend !== undefined
            ? { backend: layer.sandboxBackend }
            : {}),
        ...(layer.networkAccess !== undefined
            ? { networkAccess: layer.networkAccess }
            : {}),
        ...(layer.slashTmpWritable !== undefined
            ? { slashTmpWritable: layer.slashTmpWritable }
            : {}),
        writableRoots: [
            ...base.writableRoots,
            ...(layer.writableRoots ?? []),
        ],
    };
    return { permissionMode, askForApproval, sandboxPolicy };
}
/** Options passed through to `buildAgentSystemPrompt` from a layer. */
export function systemPromptOptionsFromConfig(layer) {
    return {
        ...(layer.persona !== undefined ? { persona: layer.persona } : {}),
        ...(layer.developerInstructions !== undefined
            ? { developerInstructions: layer.developerInstructions }
            : {}),
        ...(layer.includeHarnessIdentity !== undefined
            ? { includeHarnessIdentity: layer.includeHarnessIdentity }
            : {}),
        ...(layer.permissionMode !== undefined
            ? { permissionMode: layer.permissionMode }
            : {}),
        ...(layer.askForApproval !== undefined
            ? { askForApproval: layer.askForApproval }
            : {}),
        ...(layer.projectDocFallbackFilenames !== undefined
            ? { projectDocFallbackFilenames: layer.projectDocFallbackFilenames }
            : {}),
    };
}
//# sourceMappingURL=apply.js.map