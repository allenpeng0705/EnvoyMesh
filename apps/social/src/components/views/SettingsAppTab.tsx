import { useNodeState } from "../../context/NodeStateContext.js";

export function SettingsAppTab() {
  const { appSettings, setAppSettings } = useNodeState();

  return (
    <section className="settings-section">
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
