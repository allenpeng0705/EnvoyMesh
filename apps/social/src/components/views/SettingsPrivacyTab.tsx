import { useCallback } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useOptimisticToggle } from "../../hooks/useOptimisticToggle.js";

export function SettingsPrivacyTab() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();

  const killSwitchToggle = useOptimisticToggle(
    nodeConfig?.autonomousKillSwitch ?? false,
    async (autonomousKillSwitch) => {
      await nodeService.updateNodeConfig({ autonomousKillSwitch });
      await refreshNodeConfig();
    },
  );

  const trustModeToggle = useOptimisticToggle(
    nodeConfig?.trustModeEnabled ?? false,
    async (trustModeEnabled) => {
      await nodeService.updateNodeConfig({ trustModeEnabled });
      await refreshNodeConfig();
    },
  );

  const handleClearAllData = useCallback(async () => {
    if (!window.confirm(t("settings.privacy.clearDataConfirm"))) {
      return;
    }
    try {
      await nodeService.clearAllUserData();
      await refreshNodeConfig();
    } catch (e) {
      console.error("Failed to clear data:", e);
    }
  }, [nodeService, refreshNodeConfig, t]);

  return (
    <>
      <section className="settings-section">
        <h3>{t("settings.privacy.autonomy.title")}</h3>
        <p className="section-desc">
          {t("settings.privacy.autonomy.desc")}
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.privacy.autonomy.killSwitch")}</strong>
            <span className="toggle-desc">{t("settings.privacy.autonomy.killSwitchDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={killSwitchToggle.checked}
              onChange={killSwitchToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.privacy.trustMode.title")}</h3>
        <p className="section-desc">
          {t("settings.privacy.trustMode.desc")}
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.privacy.trustMode.enable")}</strong>
            <span className="toggle-desc">{t("settings.privacy.trustMode.enableDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={trustModeToggle.checked}
              onChange={trustModeToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.privacy.dataManagement.title")}</h3>
        <p className="section-desc">
          {t("settings.privacy.dataManagement.desc")}
        </p>
        <div className="settings-buttons">
          <button
            type="button"
            className="settings-button"
            onClick={handleClearAllData}
          >
            {t("settings.privacy.dataManagement.clearAllData")}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.privacy.sharing.title")}</h3>
        <p className="section-desc">
          {t("settings.privacy.sharing.desc")}
        </p>
        <dl className="settings-list">
          <dt>{t("settings.privacy.sharing.knowledgeSyndication")}</dt>
          <dd>
            <select
              className="settings-input"
              value={nodeConfig?.knowledgeSyndicationMaxSensitivity ?? ""}
              onChange={async (e) => {
                const value = e.target.value;
                await nodeService.updateNodeConfig({
                  knowledgeSyndicationMaxSensitivity:
                    value === "" ? null : (value as "public" | "friends" | "private"),
                });
                await refreshNodeConfig();
              }}
            >
              <option value="">{t("settings.privacy.sharing.bondOnly")}</option>
              <option value="public">{t("settings.privacy.sharing.public")}</option>
              <option value="friends">{t("settings.privacy.sharing.friends")}</option>
              <option value="private">{t("settings.privacy.sharing.private")}</option>
            </select>
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              {t("settings.privacy.sharing.syndicationHint")}
            </p>
          </dd>
        </dl>
      </section>
    </>
  );
}
