import type { AiIdentity, AiIdentityMode, AiRule } from "./ws-protocol.js";

const DEFAULT_PREFIX = "[AI Agent]";

export function resolveAiIdentityPrefix(identity?: AiIdentity | null): string {
  return identity?.transparentPrefix?.trim() || DEFAULT_PREFIX;
}

export function resolveEffectiveAiIdentityMode(
  identity?: AiIdentity | null,
  matchedRule?: Pick<AiRule, "action"> | null,
): AiIdentityMode {
  return matchedRule?.action.aiIdentityOverride ?? identity?.mode ?? "transparent";
}

export function shouldApplyAiIdentityPrefix(mode: AiIdentityMode): boolean {
  return mode === "transparent" || mode === "defensive";
}

/** Ensure outbound AI chat text carries the identity prefix (idempotent). */
export function applyAiIdentityPrefix(
  text: string,
  mode: AiIdentityMode,
  prefix?: string,
): string {
  const trimmed = text.trim();
  if (!trimmed || !shouldApplyAiIdentityPrefix(mode)) {
    return trimmed;
  }
  const p = (prefix?.trim() || DEFAULT_PREFIX).replace(/:+$/, "");
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${escaped}\\s*:?\\s*`, "i").test(trimmed)) {
    return trimmed;
  }
  return `${p}: ${trimmed}`;
}

export function applyAiIdentityToDraftText(
  text: string,
  identity?: AiIdentity | null,
  matchedRule?: Pick<AiRule, "action"> | null,
): string {
  const mode = resolveEffectiveAiIdentityMode(identity, matchedRule);
  return applyAiIdentityPrefix(text, mode, resolveAiIdentityPrefix(identity));
}
