import type { AiSettings, ContactAiPreferences } from "./ws-protocol.js";

export type ContactAiAccessLevel = "none" | "assistant_only" | "full";

/** True when the contact preference explicitly enables Agent Mode (default off). */
export function isContactAgentModeEnabled(
  pref: Pick<ContactAiPreferences, "agentModeEnabled"> | null | undefined,
): boolean {
  return pref?.agentModeEnabled === true;
}

/**
 * Resolve Agent Mode for inbound assist.
 * Group threads (`forceOff`) never use Agent Mode — same force-off as auto-send.
 */
export function resolveInboundContactAgentMode(input: {
  preference: Pick<ContactAiPreferences, "agentModeEnabled"> | null | undefined;
  forceOff?: boolean;
}): boolean {
  if (input.forceOff) return false;
  return isContactAgentModeEnabled(input.preference);
}

/** Resolve effective AI access for a contact (explicit prefs, else default mode for new contacts). */
export function resolveContactAiAccessLevel(
  contactOwnerId: string,
  contactAiPreferences: readonly ContactAiPreferences[] | undefined,
  defaultModeForNewContacts: AiSettings["defaultModeForNewContacts"] | undefined,
): ContactAiAccessLevel {
  const pref = contactAiPreferences?.find((p) => p.peerOwnerId === contactOwnerId);
  if (pref) {
    return pref.aiAccessLevel;
  }
  const defaultMode = defaultModeForNewContacts ?? "manual";
  if (defaultMode === "assistant") {
    return "assistant_only";
  }
  if (defaultMode === "auto") {
    return "full";
  }
  return "none";
}

export function contactAiAccessLevelForAssistantMode(
  mode: "manual" | "assistant" | "auto",
): ContactAiAccessLevel {
  if (mode === "assistant") {
    return "assistant_only";
  }
  if (mode === "auto") {
    return "full";
  }
  return "none";
}

/** Group threads never auto-send — cap full access to draft-only assistant mode. */
export function capGroupChatAiAccessLevel(level: ContactAiAccessLevel): ContactAiAccessLevel {
  return level === "full" ? "assistant_only" : level;
}

/**
 * Per-contact Auto (`full`) only applies when global auto-send is enabled.
 * When global is off, downgrade full → assistant_only (drafts OK, no auto-send).
 */
export function applyGlobalAutoSendGate(
  level: ContactAiAccessLevel,
  globalAutoSendEnabled: boolean,
): ContactAiAccessLevel {
  if (!globalAutoSendEnabled && level === "full") {
    return "assistant_only";
  }
  return level;
}

/** Resolve contact AI access for inbound chat assist (contact pref + global gate). */
export function resolveInboundContactAiAccess(input: {
  contactOwnerId: string;
  contactAiPreferences: readonly ContactAiPreferences[] | undefined;
  defaultModeForNewContacts: AiSettings["defaultModeForNewContacts"] | undefined;
  globalAutoSendEnabled: boolean;
}): ContactAiAccessLevel {
  const base = resolveContactAiAccessLevel(
    input.contactOwnerId,
    input.contactAiPreferences,
    input.defaultModeForNewContacts,
  );
  return applyGlobalAutoSendGate(base, input.globalAutoSendEnabled);
}
