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
  /** UI locale (en default). */
  locale?: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  wsUrl: "ws://localhost:3030/ws",
  autoConnect: true,
  notificationsEnabled: true,
  showConnectionStatus: true,
  locale: "en",
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

export const TERMINAL_SELECTED_SESSION_KEY = "envoymesh:terminal:selectedSessionId";
export const ASSISTANT_LINKED_TERMINAL_KEY = "envoymesh:assistant:linkedTerminalSessionId";
export const TERMINAL_NESTED_MULTIPLEXER_TIP_KEY = "envoymesh:terminal:nestedMultiplexerTipDismissed";

export function loadTerminalSelectedSessionId(): string | null {
  try {
    return localStorage.getItem(TERMINAL_SELECTED_SESSION_KEY);
  } catch {
    return null;
  }
}

export function saveTerminalSelectedSessionId(sessionId: string | null): void {
  try {
    if (!sessionId) {
      localStorage.removeItem(TERMINAL_SELECTED_SESSION_KEY);
      return;
    }
    localStorage.setItem(TERMINAL_SELECTED_SESSION_KEY, sessionId);
  } catch {
    //
  }
}

export function loadAssistantLinkedTerminalSessionId(): string | null {
  try {
    return localStorage.getItem(ASSISTANT_LINKED_TERMINAL_KEY);
  } catch {
    return null;
  }
}

export function saveAssistantLinkedTerminalSessionId(sessionId: string | null): void {
  try {
    if (!sessionId) {
      localStorage.removeItem(ASSISTANT_LINKED_TERMINAL_KEY);
      return;
    }
    localStorage.setItem(ASSISTANT_LINKED_TERMINAL_KEY, sessionId);
  } catch {
    //
  }
}
