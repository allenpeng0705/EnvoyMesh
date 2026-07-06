/**
 * Typed localStorage helpers.
 * Replaces the ad-hoc try/catch patterns previously inlined in App.tsx.
 */

import { WS_LOOPBACK_URL } from "@envoymesh/api";

/** macOS often resolves `localhost` to IPv6 ::1 while the node binds IPv4 — normalize saved URLs. */
export function normalizeLoopbackWsUrl(url: string): string {
  return url.replace(/^ws:\/\/localhost\b/i, "ws://127.0.0.1");
}

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

const SETUP_COMPLETE_KEY = "envoymesh.setupComplete";

export function markFirstRunSetupComplete(ownerId: string): void {
  saveToStorage(SETUP_COMPLETE_KEY, { ownerId, completedAt: new Date().toISOString() });
}

export function isFirstRunSetupComplete(ownerId: string | undefined): boolean {
  const id = ownerId?.trim();
  if (!id) return false;
  const stored = loadFromStorage(SETUP_COMPLETE_KEY, { ownerId: "" });
  return stored.ownerId === id;
}

/** True when this browser profile has finished setup at least once (used before RPC connects). */
export function hasCompletedFirstRunSetup(): boolean {
  const stored = loadFromStorage(SETUP_COMPLETE_KEY, { ownerId: "" });
  return Boolean(stored.ownerId?.trim());
}

// First-run getting-started guide — auto-opens once per owner after setup,
// re-openable any time from the header Help button.
const GUIDE_SEEN_KEY_PREFIX = "envoymesh.guideSeen:";

export function hasSeenGettingStartedGuide(ownerId: string | undefined): boolean {
  const id = ownerId?.trim();
  if (!id) return false;
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

export function markGettingStartedGuideSeen(ownerId: string): void {
  const id = ownerId.trim();
  if (!id) return;
  try {
    localStorage.setItem(GUIDE_SEEN_KEY_PREFIX + id, "1");
  } catch {
    /* storage may be unavailable (private mode) — non-fatal */
  }
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

function resolveDefaultWsUrl(): string {
  const fromEnv = import.meta.env.VITE_ENVOYMESH_WS_URL?.trim();
  if (fromEnv) return normalizeLoopbackWsUrl(fromEnv);
  return WS_LOOPBACK_URL;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  wsUrl: WS_LOOPBACK_URL,
  autoConnect: true,
  notificationsEnabled: true,
  showConnectionStatus: true,
  locale: "en",
};

const APP_SETTINGS_KEY = "envoymesh:app-settings";

export function loadAppSettings(): AppSettings {
  const defaults = { ...DEFAULT_APP_SETTINGS, wsUrl: resolveDefaultWsUrl() };
  const loaded = loadFromStorage<AppSettings>(APP_SETTINGS_KEY, defaults);
  let wsUrl = normalizeLoopbackWsUrl(loaded.wsUrl.trim() || defaults.wsUrl);
  // Dev env wins over localStorage so alt-port nodes work without clearing browser storage.
  const devOverride = import.meta.env.DEV ? import.meta.env.VITE_ENVOYMESH_WS_URL?.trim() : undefined;
  if (devOverride) {
    wsUrl = normalizeLoopbackWsUrl(devOverride);
  }
  return { ...loaded, wsUrl };
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
