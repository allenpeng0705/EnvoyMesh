/**
 * Persists node settings for mobile (localStorage — same WebView as Social UI).
 */
import type {
  AiSettings,
  AutonomousPolicy,
  ContactAiPreferences,
  ModelProviderConfig,
} from "@envoymesh/api";

export interface MobileNodePrefs {
  modelProviders: ModelProviderConfig;
  chatAssistEnabled: boolean;
  aiSettings?: AiSettings;
  autonomousKillSwitch: boolean;
  autonomousPolicies: AutonomousPolicy[];
  trustModeEnabled: boolean;
  friendMatchingPreferencesText?: string;
  contactAiPreferences: ContactAiPreferences[];
}

const DEFAULT: MobileNodePrefs = {
  modelProviders: { mode: "mock" },
  chatAssistEnabled: false,
  autonomousKillSwitch: false,
  autonomousPolicies: [],
  trustModeEnabled: false,
  contactAiPreferences: [],
};

function storageKey(ownerId: string): string {
  return `envoymesh_mobile_node_prefs_${ownerId}`;
}

export function loadMobileNodePrefs(ownerId: string): MobileNodePrefs {
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(storageKey(ownerId)) : null;
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<MobileNodePrefs>;
    let modelProviders = parsed.modelProviders ?? DEFAULT.modelProviders;
    if (modelProviders.mode === "ollama" || modelProviders.mode === "litellm") {
      modelProviders = { mode: "mock" };
    }
    return {
      modelProviders,
      chatAssistEnabled: parsed.chatAssistEnabled ?? DEFAULT.chatAssistEnabled,
      aiSettings: parsed.aiSettings,
      autonomousKillSwitch: parsed.autonomousKillSwitch ?? DEFAULT.autonomousKillSwitch,
      autonomousPolicies: [...(parsed.autonomousPolicies ?? DEFAULT.autonomousPolicies)],
      trustModeEnabled: parsed.trustModeEnabled ?? DEFAULT.trustModeEnabled,
      friendMatchingPreferencesText: parsed.friendMatchingPreferencesText,
      contactAiPreferences: [...(parsed.contactAiPreferences ?? DEFAULT.contactAiPreferences)],
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveMobileNodePrefs(
  ownerId: string,
  patch: Partial<MobileNodePrefs>,
): MobileNodePrefs {
  const current = loadMobileNodePrefs(ownerId);
  const next: MobileNodePrefs = {
    modelProviders: patch.modelProviders ?? current.modelProviders,
    chatAssistEnabled: patch.chatAssistEnabled ?? current.chatAssistEnabled,
    aiSettings: patch.aiSettings !== undefined ? patch.aiSettings : current.aiSettings,
    autonomousKillSwitch: patch.autonomousKillSwitch ?? current.autonomousKillSwitch,
    autonomousPolicies: patch.autonomousPolicies ?? current.autonomousPolicies,
    trustModeEnabled: patch.trustModeEnabled ?? current.trustModeEnabled,
    friendMatchingPreferencesText:
      patch.friendMatchingPreferencesText !== undefined
        ? patch.friendMatchingPreferencesText
        : current.friendMatchingPreferencesText,
    contactAiPreferences: patch.contactAiPreferences ?? current.contactAiPreferences,
  };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey(ownerId), JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
  return next;
}
