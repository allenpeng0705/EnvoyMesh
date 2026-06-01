export const SUPPORTED_LOCALES = ["en", "zh", "ko", "ja", "fr", "de", "it"] as const;

export type LocaleId = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: LocaleId = "en";

export type LocaleMeta = {
  id: LocaleId;
  /** Native language name shown in the language picker */
  label: string;
};

export const LOCALE_OPTIONS: readonly LocaleMeta[] = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
  { id: "ko", label: "한국어" },
  { id: "ja", label: "日本語" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
];

export function normalizeLocale(value: string | undefined | null): LocaleId {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed && (SUPPORTED_LOCALES as readonly string[]).includes(trimmed)) {
    return trimmed as LocaleId;
  }
  return DEFAULT_LOCALE;
}

export function detectBrowserLocale(): LocaleId {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const primary = navigator.language?.split("-")[0]?.toLowerCase();
  return normalizeLocale(primary);
}
