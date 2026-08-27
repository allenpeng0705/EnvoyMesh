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
import type { AskForApproval, PermissionMode } from "../types.js";
import type { PromptSection } from "./types.js";
export interface BuildAgentSystemPromptOptions {
    cwd: string;
    plan?: boolean;
    /** Extra sections (registered after built-ins). */
    extraSections?: ReadonlyArray<PromptSection>;
    /** Include terminal guidance (default true). */
    terminalGuidance?: boolean;
    /** Include workspace cwd block (default true). */
    workspace?: boolean;
    /** Include harness identity opener (default true). */
    includeHarnessIdentity?: boolean;
    /** Include default tool guidance sections (default true). */
    toolGuidance?: boolean;
    /** Deployment persona (DeepSeek order 0). */
    persona?: string;
    /** Host developer instructions (order 10). */
    developerInstructions?: string;
    /** Current permission mode for permissions:policy. */
    permissionMode?: PermissionMode;
    /** Approval policy for permissions:policy. */
    askForApproval?: AskForApproval;
    /** Extra AGENTS.md discovery fallbacks (default ENVOY.md, CLAUDE.md, CONTRIBUTING.md). */
    projectDocFallbackFilenames?: ReadonlyArray<string>;
}
/** Render the default envoy system prompt for a run. */
export declare function buildAgentSystemPrompt(options: BuildAgentSystemPromptOptions): Promise<string>;
//# sourceMappingURL=wire.d.ts.map