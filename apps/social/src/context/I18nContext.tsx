import { useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useNodeState } from "./NodeStateContext.js";
import { MESSAGES } from "../i18n/messages/index.js";
import { translate } from "../i18n/translate.js";
import { LOCALE_OPTIONS, normalizeLocale, type LocaleId } from "../i18n/types.js";
import { I18nContext, type I18nContextValue, type TFunction } from "./i18n-context.js";

export type { TFunction, I18nContextValue } from "./i18n-context.js";

export function I18nProvider({ children }: { children: ReactNode }) {
  const { appSettings, setAppSettings } = useNodeState();
  const locale = normalizeLocale(appSettings.locale);

  const setLocale = useCallback(
    (next: LocaleId) => {
      setAppSettings({ ...appSettings, locale: next });
    },
    [appSettings, setAppSettings],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback<TFunction>(
    (key, fallbackOrParams, params) =>
      translate(MESSAGES[locale], key, fallbackOrParams, params),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, localeOptions: LOCALE_OPTIONS }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n() must be inside <I18nProvider>");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}

/** For tests — avoids NodeStateProvider dependency. */
export function I18nTestProvider({
  children,
  locale = "en",
}: {
  children: ReactNode;
  locale?: LocaleId;
}) {
  const t = useCallback<TFunction>(
    (key, fallbackOrParams, params) =>
      translate(MESSAGES[locale], key, fallbackOrParams, params),
    [locale],
  );
  const value = useMemo(
    () => ({
      locale,
      setLocale: () => {},
      t,
      localeOptions: LOCALE_OPTIONS,
    }),
    [locale, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
