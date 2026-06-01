import { SettingsAccountTab } from "./SettingsAccountTab.js";
import { SettingsNodeTab } from "./SettingsNodeTab.js";
import { SettingsAITab } from "./SettingsAITab.js";
import { SettingsAppTab } from "./SettingsAppTab.js";
import { ActivityView } from "./ActivityView.js";
import { useT } from "../../context/I18nContext.js";

export type SettingsTabId = "account" | "network" | "ai" | "activity" | "privacy" | "devices" | "app";

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
          className={tab === "network" ? "active" : ""}
          onClick={() => onTabChange("network")}
        >
          {t("settings.tabs.network")}
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
          className={tab === "activity" ? "active" : ""}
          onClick={() => onTabChange("activity")}
        >
          {t("settings.tabs.activity")}
        </button>
        <button
          type="button"
          className={tab === "privacy" ? "active" : ""}
          onClick={() => onTabChange("privacy")}
        >
          {t("settings.tabs.privacy")}
        </button>
        <button
          type="button"
          className={tab === "devices" ? "active" : ""}
          onClick={() => onTabChange("devices")}
        >
          {t("settings.tabs.devices")}
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
      {tab === "network" && <SettingsNodeTab />}
      {tab === "ai" && <SettingsAITab />}
      {tab === "activity" && <ActivityView embedded />}
      {tab === "privacy" && <SettingsNodeTab />}
      {tab === "devices" && <SettingsNodeTab />}
      {tab === "app" && <SettingsAppTab />}
    </div>
  );
}
