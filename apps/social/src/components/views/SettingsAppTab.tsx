import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import { DEFAULT_APP_SETTINGS } from "../../lib/storage.js";
import type { ThemeMode } from "../../context/ThemeContext.js";

function notificationPermissionHint(): string | null {
  if (typeof Notification === "undefined") {
    return "Browser notifications are not available in this environment.";
  }
  if (Notification.permission === "denied") {
    return "Notifications are blocked in your browser. Enable them in site settings to receive alerts.";
  }
  return null;
}

export function SettingsAppTab() {
  const { appSettings, setAppSettings } = useNodeState();
  const { theme, setTheme } = useTheme();
  const [wsUrlDraft, setWsUrlDraft] = useState(appSettings.wsUrl);
  const [notificationHint, setNotificationHint] = useState<string | null>(() =>
    appSettings.notificationsEnabled ? notificationPermissionHint() : null,
  );

  useEffect(() => {
    setWsUrlDraft(appSettings.wsUrl);
  }, [appSettings.wsUrl]);

  useEffect(() => {
    if (!appSettings.notificationsEnabled) {
      setNotificationHint(null);
      return;
    }
    setNotificationHint(notificationPermissionHint());
  }, [appSettings.notificationsEnabled]);

  const themeOptions: { value: ThemeMode; label: string; desc: string }[] = [
    { value: "system", label: "System", desc: "Follow your device settings" },
    { value: "light", label: "Light", desc: "Always use light appearance" },
    { value: "dark", label: "Dark", desc: "Always use dark appearance" },
  ];

  return (
    <section className="settings-section">
      <div className="settings-card">
        <h4>Appearance</h4>
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
        <h4>Connection</h4>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">WebSocket URL</div>
            <div className="settings-row-hint">Node backend endpoint</div>
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
            Apply URL
          </button>
          <button
            type="button"
            className="settings-cancel-btn"
            onClick={() => setWsUrlDraft(appSettings.wsUrl)}
          >
            Reset
          </button>
        </div>
        <p className="settings-hint" style={{ marginTop: "6px" }}>
          Reconnects automatically when you apply a new URL (no page reload required).
        </p>
      </div>

      <div className="settings-card">
        <h4>Behavior</h4>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Auto Connect</div>
            <div className="settings-row-hint">Connect automatically on startup</div>
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
            <div className="settings-row-label">Notifications</div>
            <div className="settings-row-hint">Enable notifications for new messages</div>
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
                  setNotificationHint(
                    enabled ? notificationPermissionHint() : null,
                  );
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
            <div className="settings-row-label">Connection Status</div>
            <div className="settings-row-hint">Show P2P/Relay indicator in chat</div>
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
