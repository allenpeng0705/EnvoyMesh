/** Resolve effective AI access for a contact (explicit prefs, else default mode for new contacts). */
export function resolveContactAiAccessLevel(contactOwnerId, contactAiPreferences, defaultModeForNewContacts) {
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
export function contactAiAccessLevelForAssistantMode(mode) {
    if (mode === "assistant") {
        return "assistant_only";
    }
    if (mode === "auto") {
        return "full";
    }
    return "none";
}
//# sourceMappingURL=contact-ai-access.js.map