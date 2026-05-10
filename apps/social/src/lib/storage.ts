/**
 * Typed localStorage helpers.
 * Replaces the ad-hoc try/catch patterns previously inlined in App.tsx.
 */

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return { ...fallback, ...JSON.parse(stored) };
  } catch {
    // ignore corrupt data
  }
  return fallback;
}

export function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// App settings

export interface AppSettings {
  wsUrl: string;
  autoConnect: boolean;
  notificationsEnabled: boolean;
  showConnectionStatus: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  wsUrl: "ws://localhost:3030/ws",
  autoConnect: true,
  notificationsEnabled: true,
  showConnectionStatus: false,
};

const APP_SETTINGS_KEY = "envoymesh:app-settings";

export function loadAppSettings(): AppSettings {
  return loadFromStorage<AppSettings>(APP_SETTINGS_KEY, DEFAULT_APP_SETTINGS);
}

export function saveAppSettings(settings: AppSettings): void {
  saveToStorage(APP_SETTINGS_KEY, settings);
}

// Per-contact AI modes

export type AssistantMode = "manual" | "assistant" | "auto";

const CONTACT_AI_MODES_KEY = "envoymesh:contact-ai-modes";

export function loadContactAiModes(): Record<string, AssistantMode> {
  try {
    const stored = localStorage.getItem(CONTACT_AI_MODES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return {};
}

export function saveContactAiModes(modes: Record<string, AssistantMode>): void {
  saveToStorage(CONTACT_AI_MODES_KEY, modes);
}

// Contact AI preferences (for UI display)

export interface ContactAiPrefs {
  mode: AssistantMode;
  aiAccessLevel: "none" | "assistant_only" | "full";
}

const CONTACT_AI_PREFS_KEY = "envoymesh:contact-ai-prefs";

export function loadContactAiPrefs(): Record<string, ContactAiPrefs> {
  try {
    const stored = localStorage.getItem(CONTACT_AI_PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return {};
}
