import { useEffect, useRef, useState } from "react";
import { useI18n, useT } from "../context/I18nContext.js";
import { LanguageIcon } from "../icons.js";
import type { LocaleId } from "../i18n/types.js";

export function LocaleSwitcher() {
  const t = useT();
  const { locale, setLocale, localeOptions } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentLabel = localeOptions.find((opt) => opt.id === locale)?.label ?? locale;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pickLocale = (next: LocaleId) => {
    setLocale(next);
    setOpen(false);
  };

  return (
    <div className="locale-switcher" ref={rootRef}>
      <button
        type="button"
        className="theme-toggle-btn locale-switcher__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t("header.language", { language: currentLabel })}
        aria-label={t("header.languageMenu", { language: currentLabel })}
      >
        <LanguageIcon size={16} />
      </button>
      {open && (
        <ul className="locale-switcher__menu" role="listbox" aria-label={t("header.languagePicker")}>
          {localeOptions.map((opt) => (
            <li key={opt.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={locale === opt.id}
                className={`locale-switcher__option${locale === opt.id ? " active" : ""}`}
                onClick={() => pickLocale(opt.id)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
