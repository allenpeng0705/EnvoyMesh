import { useNodeState } from "../../context/NodeStateContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import type { ThemeMode } from "../../context/ThemeContext.js";

export function SettingsAppTab() {
  const { appSettings, setAppSettings } = useNodeState();
  const { theme, setTheme } = useTheme();

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
          value={appSettings.wsUrl}
          onChange={(e) => setAppSettings({ ...appSettings, wsUrl: e.target.value })}
        />
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
              onChange={(e) => setAppSettings({ ...appSettings, notificationsEnabled: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
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
