import { useNodeState } from "../../context/NodeStateContext.js";

export function SettingsAppTab() {
  const { appSettings, setAppSettings } = useNodeState();

  return (
    <section className="settings-section">
      <h3>App Settings</h3>
      <dl className="settings-list">
        <dt>WebSocket URL</dt>
        <dd>
          <input
            type="text"
            className="settings-input"
            value={appSettings.wsUrl}
            onChange={(e) => setAppSettings({ ...appSettings, wsUrl: e.target.value })}
          />
        </dd>

        <dt>Auto Connect</dt>
        <dd>
          <input
            type="checkbox"
            checked={appSettings.autoConnect}
            onChange={(e) => setAppSettings({ ...appSettings, autoConnect: e.target.checked })}
          />
          <label>Connect automatically on startup</label>
        </dd>

        <dt>Notifications</dt>
        <dd>
          <input
            type="checkbox"
            checked={appSettings.notificationsEnabled}
            onChange={(e) => setAppSettings({ ...appSettings, notificationsEnabled: e.target.checked })}
          />
          <label>Enable notifications for new messages</label>
        </dd>

        <dt>Show Connection Status</dt>
        <dd>
          <input
            type="checkbox"
            checked={appSettings.showConnectionStatus}
            onChange={(e) => setAppSettings({ ...appSettings, showConnectionStatus: e.target.checked })}
          />
          <label>Show P2P/Relay indicator in chat</label>
        </dd>
      </dl>
    </section>
  );
}
