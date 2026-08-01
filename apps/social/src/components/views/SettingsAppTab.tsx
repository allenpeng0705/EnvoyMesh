import { useEffect, useState } from "react";
import { useTheme } from "../../context/ThemeContext.js";
import { useI18n, useT } from "../../context/I18nContext.js";
import { ActivityView } from "./ActivityView.js";
import { AuthorizedDevicesSection } from "./AuthorizedDevicesSection.js";
import {
  getTauriAppLogPaths,
  isTauriShell,
  revealTauriLogDir,
  type AppLogPaths,
} from "../../lib/tauri-shell.js";
import {
  checkDesktopUpdate,
  installDesktopUpdate,
  type DesktopUpdateHandle,
  type UpdateInstallProgress,
} from "../../lib/tauri-updater.js";
import type { ThemeMode } from "../../context/ThemeContext.js";
import type { LocaleId } from "../../i18n/types.js";

export function SettingsAppTab() {
  const t = useT();
  const { locale, setLocale, localeOptions } = useI18n();
  const { theme, setTheme } = useTheme();
  const tauriShell = isTauriShell();
  const [logPaths, setLogPaths] = useState<AppLogPaths | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<DesktopUpdateHandle | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<UpdateInstallProgress | null>(null);

  useEffect(() => {
    if (!tauriShell) return;
    void getTauriAppLogPaths().then(setLogPaths);
  }, [tauriShell]);

  async function onCheckForUpdates() {
    setUpdateBusy(true);
    setUpdateError(null);
    setUpdateMessage(null);
    setPendingUpdate(null);
    setInstallProgress(null);
    const result = await checkDesktopUpdate();
    setUpdateBusy(false);
    if (result.status === "unavailable") {
      setUpdateMessage(t("settings.app.updateUnavailable"));
      return;
    }
    if (result.status === "up-to-date") {
      setUpdateMessage(t("settings.app.upToDate"));
      return;
    }
    if (result.status === "error") {
      setUpdateError(t("settings.app.updateError", { reason: result.reason }));
      return;
    }
    setPendingUpdate(result.update);
    setUpdateMessage(t("settings.app.updateAvailable", { version: result.update.version }));
  }

  async function onInstallUpdate() {
    if (!pendingUpdate) return;
    setUpdateBusy(true);
    setUpdateError(null);
    setInstallProgress({ phase: "stopping-node" });
    const result = await installDesktopUpdate(pendingUpdate, setInstallProgress);
    if (!result.ok) {
      setUpdateBusy(false);
      setInstallProgress(null);
      setUpdateError(t("settings.app.updateError", { reason: result.reason }));
    }
    // On success the process relaunches; no further UI work.
  }
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

      {tauriShell ? (
        <div className="settings-card">
          <h4>{t("settings.app.updatesTitle")}</h4>
          <p className="settings-hint">{t("settings.app.updatesHint")}</p>
          <div className="settings-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="secondary"
              disabled={updateBusy}
              onClick={() => void onCheckForUpdates()}
            >
              {updateBusy && !installProgress
                ? t("settings.app.checkingUpdates")
                : t("settings.app.checkForUpdates")}
            </button>
            {pendingUpdate ? (
              <button
                type="button"
                disabled={updateBusy}
                onClick={() => void onInstallUpdate()}
              >
                {updateBusy ? t("settings.app.installingUpdate") : t("settings.app.downloadAndInstall")}
              </button>
            ) : null}
          </div>
          {updateMessage ? <p className="settings-hint">{updateMessage}</p> : null}
          {pendingUpdate?.body ? (
            <p className="settings-hint">
              <strong>{t("settings.app.updateNotes")}: </strong>
              {pendingUpdate.body}
            </p>
          ) : null}
          {installProgress?.phase === "downloading" ? (
            <p className="muted">
              {t("settings.app.updateProgressDownload", {
                percent:
                  installProgress.total && installProgress.total > 0
                    ? String(Math.min(100, Math.round((installProgress.downloaded / installProgress.total) * 100)))
                    : "…",
              })}
            </p>
          ) : null}
          {installProgress?.phase === "installing" || installProgress?.phase === "relaunching" ? (
            <p className="muted">{t("settings.app.updateProgressInstall")}</p>
          ) : null}
          {updateError ? <p className="muted" role="alert">{updateError}</p> : null}
        </div>
      ) : null}

      {tauriShell ? (
        <div className="settings-card">
          <h4>{t("settings.app.logsTitle")}</h4>
          <p className="settings-hint">{t("settings.app.logsHint")}</p>
          {logPaths ? (
            <dl className="settings-dl settings-dl--compact">
              <dt>{t("settings.app.logsDir")}</dt>
              <dd>
                <code className="settings-code-block">{logPaths.logsDir}</code>
              </dd>
              <dt>{t("settings.app.nodeLog")}</dt>
              <dd>
                <code className="settings-code-block">{logPaths.nodeLog}</code>
              </dd>
              <dt>{t("settings.app.socialLog")}</dt>
              <dd>
                <code className="settings-code-block">{logPaths.socialLog}</code>
              </dd>
            </dl>
          ) : (
            <p className="muted">{t("settings.app.logsLoading")}</p>
          )}
          <button type="button" className="secondary" onClick={() => void revealTauriLogDir()}>
            {t("settings.app.openLogsFolder")}
          </button>
        </div>
      ) : null}

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
