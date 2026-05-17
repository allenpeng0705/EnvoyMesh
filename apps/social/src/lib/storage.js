/**
 * Typed localStorage helpers.
 * Replaces the ad-hoc try/catch patterns previously inlined in App.tsx.
 */
export function loadFromStorage(key, fallback) {
    try {
        const stored = localStorage.getItem(key);
        if (stored)
            return { ...fallback, ...JSON.parse(stored) };
    }
    catch {
        // ignore corrupt data
    }
    return fallback;
}
export function saveToStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}
export const DEFAULT_APP_SETTINGS = {
    wsUrl: "ws://localhost:3030/ws",
    autoConnect: true,
    notificationsEnabled: true,
    showConnectionStatus: false,
};
const APP_SETTINGS_KEY = "envoymesh:app-settings";
export function loadAppSettings() {
    return loadFromStorage(APP_SETTINGS_KEY, DEFAULT_APP_SETTINGS);
}
export function saveAppSettings(settings) {
    saveToStorage(APP_SETTINGS_KEY, settings);
}
const CONTACT_AI_MODES_KEY = "envoymesh:contact-ai-modes";
export function loadContactAiModes() {
    try {
        const stored = localStorage.getItem(CONTACT_AI_MODES_KEY);
        if (stored)
            return JSON.parse(stored);
    }
    catch {
        // ignore
    }
    return {};
}
export function saveContactAiModes(modes) {
    saveToStorage(CONTACT_AI_MODES_KEY, modes);
}
const CONTACT_AI_PREFS_KEY = "envoymesh:contact-ai-prefs";
export function loadContactAiPrefs() {
    try {
        const stored = localStorage.getItem(CONTACT_AI_PREFS_KEY);
        if (stored)
            return JSON.parse(stored);
    }
    catch {
        // ignore
    }
    return {};
}
//# sourceMappingURL=storage.js.map