import { SettingsAccountTab } from "./SettingsAccountTab.js";
import { SettingsNodeTab } from "./SettingsNodeTab.js";
import { SettingsAITab } from "./SettingsAITab.js";
import { SettingsAppTab } from "./SettingsAppTab.js";
import { SettingsAgentNetworkTab } from "./SettingsAgentNetworkTab.js";
import { useT } from "../../context/I18nContext.js";

export type SettingsTabId =
  | "account"
  | "ai"
  | "agentNetwork"
  | "network"
  | "app";

export function SettingsView({
  tab,
  onTabChange,
}: {
  tab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}) {
  const t = useT();

  return (
    <div className="settings-view">
      <h2>{t("settings.title")}</h2>

      <div className="settings-tabs">
        <button
          type="button"
          className={tab === "account" ? "active" : ""}
          onClick={() => onTabChange("account")}
        >
          {t("settings.tabs.account")}
        </button>
        <button
          type="button"
          className={tab === "ai" ? "active" : ""}
          onClick={() => onTabChange("ai")}
        >
          {t("settings.tabs.ai")}
        </button>
        <button
          type="button"
          className={tab === "agentNetwork" ? "active" : ""}
          onClick={() => onTabChange("agentNetwork")}
        >
          {t("settings.tabs.agentNetwork")}
        </button>
        <button
          type="button"
          className={tab === "network" ? "active" : ""}
          onClick={() => onTabChange("network")}
        >
          {t("settings.tabs.network")}
        </button>
        <button
          type="button"
          className={tab === "app" ? "active" : ""}
          onClick={() => onTabChange("app")}
        >
          {t("settings.tabs.app")}
        </button>
      </div>

      {tab === "account" && <SettingsAccountTab />}
      {tab === "ai" && <SettingsAITab />}
      {tab === "agentNetwork" && <SettingsAgentNetworkTab />}
      {tab === "network" && <SettingsNodeTab />}
      {tab === "app" && <SettingsAppTab />}
    </div>
  );
}
