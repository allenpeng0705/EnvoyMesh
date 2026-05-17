import { useState } from "react";
import { SettingsNodeTab } from "./SettingsNodeTab.js";
import { SettingsAITab } from "./SettingsAITab.js";
import { SettingsAppTab } from "./SettingsAppTab.js";

export function SettingsView() {
  const [settingsTab, setSettingsTab] = useState<"node" | "ai" | "app">("node");

  return (
    <div className="settings-view">
      <h2>Settings</h2>

      <div className="settings-tabs">
        <button
          className={settingsTab === "node" ? "active" : ""}
          onClick={() => setSettingsTab("node")}
        >
          Node
        </button>
        <button
          className={settingsTab === "ai" ? "active" : ""}
          onClick={() => setSettingsTab("ai")}
        >
          AI
        </button>
        <button
          className={settingsTab === "app" ? "active" : ""}
          onClick={() => setSettingsTab("app")}
        >
          App
        </button>
      </div>

      {settingsTab === "node" && <SettingsNodeTab />}
      {settingsTab === "ai" && <SettingsAITab />}
      {settingsTab === "app" && <SettingsAppTab />}
    </div>
  );
}
