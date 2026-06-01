import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import { useI18n, useT } from "../../context/I18nContext.js";
import { DEFAULT_APP_SETTINGS } from "../../lib/storage.js";
import type { ThemeMode } from "../../context/ThemeContext.js";
import type { LocaleId } from "../../i18n/types.js";

function notificationPermissionHint(t: (key: string) => string): string | null {
  if (typeof Notification === "undefined") {
    return t("settings.behavior.notifyUnavailable");
  }
  if (Notification.permission === "denied") {
    return t("settings.behavior.notifyBlocked");
  }
  return null;
}

export function SettingsAppTab() {
  const t = useT();
  const { locale, setLocale, localeOptions } = useI18n();
  const { appSettings, setAppSettings } = useNodeState();
  const { theme, setTheme } = useTheme();
  const [wsUrlDraft, setWsUrlDraft] = useState(appSettings.wsUrl);
  const [notificationHint, setNotificationHint] = useState<string | null>(() =>
    appSettings.notificationsEnabled ? notificationPermissionHint(t) : null,
  );

  useEffect(() => {
    setWsUrlDraft(appSettings.wsUrl);
  }, [appSettings.wsUrl]);

  useEffect(() => {
    if (!appSettings.notificationsEnabled) {
      setNotificationHint(null);
      return;
    }
    setNotificationHint(notificationPermissionHint(t));
  }, [appSettings.notificationsEnabled, t]);

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

      <div className="settings-card">
        <h4>{t("settings.connection.title")}</h4>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.connection.wsUrl")}</div>
            <div className="settings-row-hint">{t("settings.connection.wsHint")}</div>
          </div>
        </div>
        <input
          type="text"
          className="settings-input"
          value={wsUrlDraft}
          onChange={(e) => setWsUrlDraft(e.target.value)}
        />
        <div className="settings-buttons" style={{ marginTop: "8px" }}>
          <button
            type="button"
            className="settings-save-btn"
            onClick={() => {
              setAppSettings({
                ...appSettings,
                wsUrl: wsUrlDraft.trim() || DEFAULT_APP_SETTINGS.wsUrl,
              });
            }}
          >
            {t("settings.connection.applyUrl")}
          </button>
          <button type="button" className="settings-cancel-btn" onClick={() => setWsUrlDraft(appSettings.wsUrl)}>
            {t("common.reset")}
          </button>
        </div>
        <p className="settings-hint" style={{ marginTop: "6px" }}>
          {t("settings.connection.applyNote")}
        </p>
      </div>

      <div className="settings-card">
        <h4>{t("settings.behavior.title")}</h4>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.behavior.autoConnect")}</div>
            <div className="settings-row-hint">{t("settings.behavior.autoConnectHint")}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={appSettings.autoConnect}
              onChange={(e) => setAppSettings({ ...appSettings, autoConnect: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.behavior.notifications")}</div>
            <div className="settings-row-hint">{t("settings.behavior.notificationsHint")}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={appSettings.notificationsEnabled}
              onChange={(e) => {
                void (async () => {
                  const enabled = e.target.checked;
                  if (
                    enabled &&
                    typeof Notification !== "undefined" &&
                    Notification.permission === "default"
                  ) {
                    await Notification.requestPermission();
                  }
                  setAppSettings({ ...appSettings, notificationsEnabled: enabled });
                  setNotificationHint(enabled ? notificationPermissionHint(t) : null);
                })();
              }}
            />
            <span className="slider" />
          </label>
        </div>
        {notificationHint ? (
          <p className="settings-hint" role="alert" style={{ marginTop: "6px" }}>
            {notificationHint}
          </p>
        ) : null}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.behavior.connectionStatus")}</div>
            <div className="settings-row-hint">{t("settings.behavior.connectionStatusHint")}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={appSettings.showConnectionStatus}
              onChange={(e) => setAppSettings({ ...appSettings, showConnectionStatus: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </div>
    </section>
  );
}
