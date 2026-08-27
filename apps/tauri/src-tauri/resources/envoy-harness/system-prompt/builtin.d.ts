/**
 * Phase G — built-in system-prompt sections.
 *
 * Environment context follows Codex's `<environment_context>` shape
 * (cwd + shell) and Claude Code's CWD/platform block. Identity,
 * persona, permissions, and tool guidance follow DeepSeek's ordered
 * section slots (MIT-adapted text).
 */
import { type DiscoveryOptions } from "../agents-md/index.js";
import type { AskForApproval, PermissionMode } from "../types.js";
import type { PromptSection } from "./types.js";
/**
 * Default project-doc fallbacks after AGENTS.md (primary).
 * ENVOY.md = native; CLAUDE.md = Claude Code compat; CONTRIBUTING.md = common.
 */
export declare const DEFAULT_PROJECT_DOC_FALLBACKS: readonly ["ENVOY.md", "CLAUDE.md", "CONTRIBUTING.md"];
/**
 * The AGENTS.md section (order -100, deepseek's identity/context slot).
 * Also discovers ENVOY.md / CLAUDE.md / CONTRIBUTING.md via fallbackFilenames.
 */
export declare function agentsMdSection(cwd: string, options?: Omit<DiscoveryOptions, "cwd">): PromptSection;
/** DeepSeek-style harness opener (order -101, before AGENTS.md). */
export declare function harnessIdentitySection(): PromptSection;
/** Optional deployment persona (order 0). Empty text is skipped by the registry. */
export declare function personaSection(persona: string): PromptSection;
/** Host/developer instructions (order 10). */
export declare function developerInstructionsSection(text: string): PromptSection;
/** The plan-mode section (order -50, after project context). */
export declare function planModeSection(text: string): PromptSection;
/**
 * Claude-style permission literacy (order 60).
 * Enforcement is host-side; this tells the model how to behave.
 */
export declare function permissionsPolicySection(opts: {
    permissionMode: PermissionMode;
    askForApproval?: AskForApproval;
}): PromptSection;
/**
 * Interaction guidance: ask_user options + plan/agent mode switches (order 65).
 */
export declare function interactionGuidanceSection(): PromptSection;
/**
 * End-of-turn follow-ups and deferred work (Codex / Claude / DeepSeek parity).
 */
export declare function turnHintsGuidanceSection(): PromptSection;
/**
 * Codex/Claude-style environment block (order -95).
 */
export declare function workspaceSection(cwd: string): PromptSection;
/**
 * Terminal guidance (order 100). Text adapted from deepseek terminal tool (MIT).
 */
export declare function terminalGuidanceSection(): PromptSection;
/** DeepSeek tool:read guidance — mapped to envoy `read_file` (order 102). */
export declare function readFileGuidanceSection(): PromptSection;
/** DeepSeek tool:bash guidance (order 105). */
export declare function bashGuidanceSection(): PromptSection;
/** DeepSeek tool:jobs guidance (order 106). */
export declare function jobsGuidanceSection(): PromptSection;
/** DeepSeek tool:web_search guidance (order 110). */
export declare function webSearchGuidanceSection(): PromptSection;
//# sourceMappingURL=builtin.d.ts.map