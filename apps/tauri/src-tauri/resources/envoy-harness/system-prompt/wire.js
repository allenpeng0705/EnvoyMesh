/**
 * Phase G — build the Agent's system prompt for CLI / ACP / EnvoyMesh.
 *
 * Default composition (DeepSeek-shaped orders):
 *   -101  harness:identity
 *   -100  agents-md (+ ENVOY.md / CLAUDE.md / CONTRIBUTING.md fallbacks)
 *    -95  workspace (<environment_context>)
 *    -90  cursor-rules (when present)
 *    -50  plan-mode (when --plan)
 *      0  deployment:persona (when set)
 *     60  permissions:policy
 *    100  terminal:guidance
 *    102+ tool guidance (read_file / bash / jobs / web)
 */
import { importCursorRules } from "../config/import/cursor.js";
import { createSystemPromptRegistry } from "./registry.js";
import { agentsMdSection, bashGuidanceSection, developerInstructionsSection, harnessIdentitySection, jobsGuidanceSection, personaSection, permissionsPolicySection, planModeSection, readFileGuidanceSection, terminalGuidanceSection, webSearchGuidanceSection, workspaceSection, interactionGuidanceSection, turnHintsGuidanceSection, } from "./builtin.js";
/** Render the default envoy system prompt for a run. */
export async function buildAgentSystemPrompt(options) {
    const registry = createSystemPromptRegistry();
    if (options.includeHarnessIdentity !== false) {
        registry.register(harnessIdentitySection());
    }
    registry.register(agentsMdSection(options.cwd, {
        ...(options.projectDocFallbackFilenames !== undefined
            ? { fallbackFilenames: options.projectDocFallbackFilenames }
            : {}),
    }));
    if (options.workspace !== false) {
        registry.register(workspaceSection(options.cwd));
    }
    const cursor = await importCursorRules(options.cwd);
    if (cursor.rulesText.length > 0) {
        registry.register({
            name: "cursor-rules",
            order: -90,
            text: `# Cursor rules\n\n${cursor.rulesText}`,
        });
    }
    if (options.plan === true) {
        registry.register(planModeSection("You are in PLAN MODE. Investigate and produce a plan only — " +
            "do not make any changes to the workspace. Your session is read-only."));
    }
    if (options.persona !== undefined && options.persona.trim().length > 0) {
        registry.register(personaSection(options.persona));
    }
    if (options.developerInstructions !== undefined &&
        options.developerInstructions.trim().length > 0) {
        registry.register(developerInstructionsSection(options.developerInstructions));
    }
    registry.register(permissionsPolicySection({
        permissionMode: options.permissionMode ?? "workspace-write",
        ...(options.askForApproval !== undefined
            ? { askForApproval: options.askForApproval }
            : {}),
    }));
    registry.register(interactionGuidanceSection());
    registry.register(turnHintsGuidanceSection());
    if (options.terminalGuidance !== false) {
        registry.register(terminalGuidanceSection());
    }
    if (options.toolGuidance !== false) {
        registry.register(readFileGuidanceSection());
        registry.register(bashGuidanceSection());
        registry.register(jobsGuidanceSection());
        registry.register(webSearchGuidanceSection());
    }
    for (const section of options.extraSections ?? []) {
        registry.register(section);
    }
    return registry.render();
}
//# sourceMappingURL=wire.js.map