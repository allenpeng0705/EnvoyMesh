import type { AiSettings, ContactAiPreferences } from "./ws-protocol.js";
export type ContactAiAccessLevel = "none" | "assistant_only" | "full";
/** Resolve effective AI access for a contact (explicit prefs, else default mode for new contacts). */
export declare function resolveContactAiAccessLevel(contactOwnerId: string, contactAiPreferences: readonly ContactAiPreferences[] | undefined, defaultModeForNewContacts: AiSettings["defaultModeForNewContacts"] | undefined): ContactAiAccessLevel;
export declare function contactAiAccessLevelForAssistantMode(mode: "manual" | "assistant" | "auto"): ContactAiAccessLevel;
//# sourceMappingURL=contact-ai-access.d.ts.map