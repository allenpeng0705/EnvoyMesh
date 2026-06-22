import { createContext } from "react";
import type { TranslateParams } from "../i18n/translate.js";
import { LOCALE_OPTIONS, type LocaleId } from "../i18n/types.js";

export type TFunction = (
  key: string,
  fallbackOrParams?: TranslateParams | string,
  params?: TranslateParams,
) => string;

export interface I18nContextValue {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: TFunction;
  localeOptions: typeof LOCALE_OPTIONS;
}

/** Context instance — keep in a .ts file so I18nContext.tsx can Fast Refresh. */
export const I18nContext = createContext<I18nContextValue | null>(null);
