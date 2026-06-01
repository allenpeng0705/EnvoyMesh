import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useNodeState } from "./NodeStateContext.js";
import { MESSAGES } from "../i18n/messages/index.js";
import { translate, type TranslateParams } from "../i18n/translate.js";
import { LOCALE_OPTIONS, normalizeLocale, type LocaleId } from "../i18n/types.js";

export type TFunction = (key: string, params?: TranslateParams) => string;

interface I18nContextValue {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: TFunction;
  localeOptions: typeof LOCALE_OPTIONS;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export { I18nContext };

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
    (key, params) => translate(MESSAGES[locale], key, params),
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
    (key, params) => translate(MESSAGES[locale], key, params),
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
