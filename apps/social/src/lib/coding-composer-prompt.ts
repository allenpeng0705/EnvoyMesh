/**
 * Shape Coding prompts from sticky toolbar prefs (Ask / Plan / Fast / Think).
 */

import {
  workingModeFromAgentMode,
  type CodingComposerCapabilities,
} from "./coding-composer-capabilities.js";
import type { CodingComposerPrefs } from "./coding-composer-state.js";

const ASK_PREFIX =
  "[Mode: Ask] Answer questions and explain. Do not edit files unless the user explicitly asks.";

const PLAN_PREFIX =
  "[Mode: Plan] Produce a concrete plan only. Do not modify files or run mutating tools yet.";

const REVIEW_PREFIX =
  "[Mode: Review] Review and discuss only. Do not edit files or run mutating tools.";

/**
 * Apply sticky mode / plan-slash / thinking hints to the user prompt.
 * Fast is handled separately (one-shot `/fast` on toggle) for slash agents.
 */
export function shapeCodingComposerPrompt(
  userText: string,
  prefs: CodingComposerPrefs,
  caps: CodingComposerCapabilities,
): string {
  const body = userText.trim();
  const parts: string[] = [];

  const fromAgent = workingModeFromAgentMode(caps, prefs.agentModeId);
  const mode = fromAgent ?? prefs.mode;

  if (caps.agentModes.length > 0 && prefs.agentModeId === "review") {
    parts.push(REVIEW_PREFIX);
  } else if (
    (caps.workingMode || caps.agentModes.length > 0) &&
    mode === "ask"
  ) {
    parts.push(ASK_PREFIX);
  } else if (
    (caps.workingMode || caps.agentModes.length > 0) &&
    mode === "plan"
  ) {
    if (caps.planSlash) {
      return body ? `/plan ${body}` : "/plan";
    }
    parts.push(PLAN_PREFIX);
  }

  if (caps.thinking && prefs.thinking !== "off") {
    if (caps.planSlash || caps.fast) {
      if (prefs.thinking === "low") {
        parts.push("[Thinking: low effort]");
      } else if (prefs.thinking === "medium") {
        parts.push("[Thinking: medium effort]");
      } else {
        parts.push("[Thinking: high effort]");
      }
    }
  }

  if (parts.length === 0) return body;
  if (!body) return parts.join("\n");
  return `${parts.join("\n")}\n\n${body}`;
}

/** One-shot slash when Fast is toggled on/off (Codex / Claude / EH). */
export function fastToggleSlash(enabled: boolean): string {
  return enabled ? "/fast on" : "/fast off";
}
