/**
 * Apply a ConfigLayer to session permission / approval / sandbox.
 */
import type { ConfigLayer } from "./schema.js";
import type { AskForApproval, PermissionMode, SandboxPolicy } from "../types.js";
export interface ResolvedAgentRuntimeConfig {
    permissionMode: PermissionMode;
    askForApproval: AskForApproval;
    sandboxPolicy: SandboxPolicy;
}
/**
 * Resolve permission + approval + sandbox from a config layer.
 * Defaults match ACP/Envoy chat (writable workspace) when unset.
 */
export declare function resolveAgentRuntimeConfig(cwd: string, layer?: ConfigLayer, defaults?: {
    permissionMode?: PermissionMode;
    askForApproval?: AskForApproval;
}): ResolvedAgentRuntimeConfig;
/** Options passed through to `buildAgentSystemPrompt` from a layer. */
export declare function systemPromptOptionsFromConfig(layer: ConfigLayer): {
    persona?: string;
    developerInstructions?: string;
    includeHarnessIdentity?: boolean;
    permissionMode?: PermissionMode;
    askForApproval?: AskForApproval;
    projectDocFallbackFilenames?: ReadonlyArray<string>;
};
//# sourceMappingURL=apply.d.ts.map