import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { SettingsNodeTab } from "./SettingsNodeTab.js";
import { SettingsAITab } from "./SettingsAITab.js";
import { SettingsAppTab } from "./SettingsAppTab.js";
export function SettingsView() {
    const [settingsTab, setSettingsTab] = useState("node");
    return (_jsxs("div", { className: "settings-view", children: [_jsx("h2", { children: "Settings" }), _jsxs("div", { className: "settings-tabs", children: [_jsx("button", { className: settingsTab === "node" ? "active" : "", onClick: () => setSettingsTab("node"), children: "Node" }), _jsx("button", { className: settingsTab === "ai" ? "active" : "", onClick: () => setSettingsTab("ai"), children: "AI" }), _jsx("button", { className: settingsTab === "app" ? "active" : "", onClick: () => setSettingsTab("app"), children: "App" })] }), settingsTab === "node" && _jsx(SettingsNodeTab, {}), settingsTab === "ai" && _jsx(SettingsAITab, {}), settingsTab === "app" && _jsx(SettingsAppTab, {})] }));
}
//# sourceMappingURL=SettingsView.js.map