import { useTheme } from "../../context/ThemeContext.js";
import { useI18n, useT } from "../../context/I18nContext.js";
import { ActivityView } from "./ActivityView.js";
import { AuthorizedDevicesSection } from "./AuthorizedDevicesSection.js";
import type { ThemeMode } from "../../context/ThemeContext.js";
import type { LocaleId } from "../../i18n/types.js";

export function SettingsAppTab() {
  const t = useT();
  const { locale, setLocale, localeOptions } = useI18n();
  const { theme, setTheme } = useTheme();
  // Connection and Behavior sections were moved to the Network tab —
  // they are network-shape settings (WebSocket URL, auto-connect,
  // notifications, P2P/Relay indicator) and belong alongside the rest
  // of the network configuration.

  const themeOptions: { value: ThemeMode; label: string; desc: string }[] = [
    { value: "system", label: t("settings.appearance.system"), desc: t("settings.appearance.systemDesc") },
    { value: "light", label: t("settings.appearance.light"), desc: t("settings.appearance.lightDesc") },
    { value: "dark", label: t("settings.appearance.dark"), desc: t("settings.appearance.darkDesc") },
  ];

  return (
    <section className="settings-section">
      <div className="settings-card">
        <h4>{t("settings.language.title")}</h4>
        <p className="settings-hint">{t("settings.language.hint")}</p>
        <div className="settings-radio-group">
          {localeOptions.map((opt) => (
            <label
              key={opt.id}
              className={`settings-radio-option ${locale === opt.id ? "active" : ""}`}
              onClick={() => setLocale(opt.id as LocaleId)}
            >
              <span className={`settings-radio ${locale === opt.id ? "checked" : ""}`} />
              <div className="radio-content">
                <div className="mode-title">{opt.label}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="settings-card">
        <h4>{t("settings.appearance.title")}</h4>
        <div className="settings-radio-group">
          {themeOptions.map((opt) => (
            <label
              key={opt.value}
              className={`settings-radio-option ${theme === opt.value ? "active" : ""}`}
              onClick={() => setTheme(opt.value)}
            >
              <span className={`settings-radio ${theme === opt.value ? "checked" : ""}`} />
              <div className="radio-content">
                <div className="mode-title">{opt.label}</div>
                <div className="field-desc">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Authorized Devices — moved from the Account tab. Device
          management is housekeeping/audit information and pairs
          naturally with the other App-shaped items in this tab. */}
      <AuthorizedDevicesSection />

      {/* Activity — embedded here so a single "App" tab covers everything
          the user previously had to visit via a separate tab. The
          embedded flag hides the ActivityView's own h2/lede. */}
      <div className="settings-card">
        <h4>{t("settings.app.activityTitle")}</h4>
        <p className="settings-hint">{t("settings.app.activityDesc")}</p>
        <ActivityView embedded />
      </div>
    </section>
  );
}
