import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { I18nTestProvider } from "../../src/context/I18nContext.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import type { LocaleId } from "../../src/i18n/types.js";

export function renderWithI18n(ui: ReactElement, options?: RenderOptions & { locale?: LocaleId }) {
  const { locale = "en", ...renderOptions } = options ?? {};
  return render(
    <I18nTestProvider locale={locale}>
      <ToastProvider>{ui}</ToastProvider>
    </I18nTestProvider>,
    renderOptions,
  );
}
