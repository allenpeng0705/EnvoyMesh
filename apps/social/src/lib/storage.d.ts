/**
 * Typed localStorage helpers.
 * Replaces the ad-hoc try/catch patterns previously inlined in App.tsx.
 */
export declare function loadFromStorage<T>(key: string, fallback: T): T;
export declare function saveToStorage<T>(key: string, value: T): void;
export interface AppSettings {
    wsUrl: string;
    autoConnect: boolean;
    notificationsEnabled: boolean;
    showConnectionStatus: boolean;
}
export declare const DEFAULT_APP_SETTINGS: AppSettings;
export declare function loadAppSettings(): AppSettings;
export declare function saveAppSettings(settings: AppSettings): void;
export type AssistantMode = "manual" | "assistant" | "auto";
export declare function loadContactAiModes(): Record<string, AssistantMode>;
export declare function saveContactAiModes(modes: Record<string, AssistantMode>): void;
export interface ContactAiPrefs {
    mode: AssistantMode;
    aiAccessLevel: "none" | "assistant_only" | "full";
}
export declare function loadContactAiPrefs(): Record<string, ContactAiPrefs>;
//# sourceMappingURL=storage.d.ts.map