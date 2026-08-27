/**
 * Phase G — system-prompt assembly public surface.
 */
export { createSystemPromptRegistry, type SystemPromptRegistry, } from "./registry.js";
export { agentsMdSection, bashGuidanceSection, developerInstructionsSection, harnessIdentitySection, jobsGuidanceSection, personaSection, permissionsPolicySection, planModeSection, readFileGuidanceSection, terminalGuidanceSection, webSearchGuidanceSection, workspaceSection, DEFAULT_PROJECT_DOC_FALLBACKS, } from "./builtin.js";
export { buildAgentSystemPrompt, type BuildAgentSystemPromptOptions } from "./wire.js";
export type { PromptAssemblyContext, PromptSection } from "./types.js";
//# sourceMappingURL=index.d.ts.map