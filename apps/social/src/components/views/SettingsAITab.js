import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
const EMPTY_RULE_FORM = {
    name: "",
    category: "availability",
    priority: 1,
    keywords: "",
    regex: "",
    isGreeting: false,
    accessLevel: "",
    actionType: "draft",
    identityOverride: "",
    template: "",
};
function defaultAiSettings() {
    return {
        status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
        identity: { mode: "transparent" },
        defaultModeForNewContacts: "manual",
        rules: [],
    };
}
export function SettingsAITab() {
    const nodeService = useNodeService();
    const { nodeConfig, refreshNodeConfig } = useNodeState();
    const aiSettings = nodeConfig?.aiSettings ?? defaultAiSettings();
    const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);
    const updateAiSettings = async (partial) => {
        await nodeService.updateNodeConfig({
            aiSettings: { ...aiSettings, ...partial },
        });
        await refreshNodeConfig();
    };
    // ---- Rule CRUD ----
    const handleAddRule = async () => {
        if (!ruleForm.name.trim()) {
            alert("Please enter a rule name");
            return;
        }
        const newRule = {
            id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            enabled: true,
            name: ruleForm.name.trim(),
            category: ruleForm.category,
            priority: ruleForm.priority,
            trigger: {
                ...(ruleForm.keywords.trim() ? { keywords: ruleForm.keywords.split(",").map(k => k.trim()).filter(Boolean) } : {}),
                ...(ruleForm.regex.trim() ? { messageContains: ruleForm.regex.trim() } : {}),
                ...(ruleForm.isGreeting ? { isGreeting: true } : {}),
                ...(ruleForm.accessLevel ? { contactAiAccessLevel: [ruleForm.accessLevel] } : {}),
            },
            action: {
                type: ruleForm.actionType,
                ...(ruleForm.template.trim() ? { template: ruleForm.template.trim() } : {}),
                ...(ruleForm.identityOverride ? { aiIdentityOverride: ruleForm.identityOverride } : {}),
            },
        };
        const currentRules = aiSettings.rules ?? [];
        await updateAiSettings({ rules: [...currentRules, newRule] });
        setRuleForm({
            ...EMPTY_RULE_FORM,
            priority: currentRules.length > 0 ? Math.max(...currentRules.map(r => r.priority)) + 1 : 1,
        });
    };
    const handleDeleteRule = async (ruleId) => {
        const newRules = aiSettings.rules.filter(r => r.id !== ruleId);
        await updateAiSettings({ rules: newRules });
    };
    // ---- Helpers ----
    const currentStatus = aiSettings.status;
    return (_jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "AI Assistant Settings" }), _jsx("p", { className: "section-desc", children: "Configure how the AI responds on your behalf." }), _jsx("h4", { children: "Status" }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "Online Assistant" }), _jsx("span", { className: "toggle-desc", children: "Suggest drafts when you are online" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: currentStatus.onlineAssistantEnabled, onChange: async (e) => {
                                    await updateAiSettings({
                                        status: { ...currentStatus, onlineAssistantEnabled: e.target.checked },
                                    });
                                } }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "Offline Agent" }), _jsx("span", { className: "toggle-desc", children: "Handle chats when you are away" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: currentStatus.offlineAgentEnabled, onChange: async (e) => {
                                    await updateAiSettings({
                                        status: { ...currentStatus, offlineAgentEnabled: e.target.checked },
                                    });
                                } }), _jsx("span", { className: "toggle-slider" })] })] }), _jsx("h4", { children: "Status Detection" }), _jsx("p", { className: "field-desc", children: "Choose how your online status is determined." }), _jsx("div", { className: "settings-radio-group", children: ["automatic", "manual"].map((mode) => (_jsxs("label", { className: `settings-radio-option ${currentStatus.statusMode === mode ? "active" : ""}`, children: [_jsx("input", { type: "radio", name: "status-mode", value: mode, checked: currentStatus.statusMode === mode, onChange: async () => {
                                await updateAiSettings({ status: { ...currentStatus, statusMode: mode } });
                            } }), _jsxs("div", { className: "radio-content", children: [_jsx("strong", { children: mode === "automatic" ? "Automatic" : "Manual" }), _jsx("span", { children: mode === "automatic" ? "Detect based on activity (typing, mouse movement)" : "Set your status manually below" })] })] }, mode))) }), currentStatus.statusMode === "manual" && (_jsxs("div", { className: "settings-toggle-row", style: { marginTop: "0.75rem" }, children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "Current Status" }), _jsx("span", { className: "toggle-desc", children: "Set whether you appear online or away" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: currentStatus.isOnlineManual ?? true, onChange: async (e) => {
                                    await updateAiSettings({ status: { ...currentStatus, isOnlineManual: e.target.checked } });
                                } }), _jsx("span", { className: "toggle-slider" })] })] })), _jsx("h4", { children: "AI Identity" }), _jsx("p", { className: "field-desc", children: "How the AI presents itself in responses." }), _jsx("div", { className: "identity-mode-options", children: Object.entries({
                    invisible: { title: "Invisible", desc: "Responds as if it were you", example: `Example: "Yeah, I can do that."` },
                    transparent: { title: "Transparent", desc: "Prefix messages with [AI Agent]", example: `Example: "[AI Agent]: I'm checking..."` },
                    defensive: { title: "Defensive (Gatekeep)", desc: "Acts as gatekeeper when you are away", example: `Example: "I've received your message and will notify them when back."` },
                }).map(([mode, info]) => (_jsxs("label", { className: `identity-mode-option ${aiSettings.identity.mode === mode ? "active" : ""}`, children: [_jsx("input", { type: "radio", name: "ai-identity", value: mode, checked: aiSettings.identity.mode === mode, onChange: async () => {
                                await updateAiSettings({ identity: { ...aiSettings.identity, mode } });
                            } }), _jsxs("div", { className: "identity-mode-content", children: [_jsx("strong", { children: info.title }), _jsx("span", { children: info.desc }), _jsx("small", { children: info.example })] })] }, mode))) }), _jsx("h4", { children: "Default Mode for New Contacts" }), _jsx("p", { className: "field-desc", children: "The default AI mode when you start a chat with a new contact." }), _jsxs("select", { className: "settings-select", value: aiSettings.defaultModeForNewContacts, onChange: async (e) => {
                    await updateAiSettings({ defaultModeForNewContacts: e.target.value });
                }, children: [_jsx("option", { value: "manual", children: "Manual (safest \u2014 you type everything)" }), _jsx("option", { value: "assistant", children: "Assistant (AI suggests drafts)" }), _jsx("option", { value: "auto", children: "Auto-Reply (AI responds automatically, requires trust)" })] }), _jsx("h4", { children: "AI Rules" }), _jsx("p", { className: "field-desc", children: "Rules define how the AI responds to specific triggers." }), aiSettings.rules.length > 0 ? (_jsx("div", { className: "rules-list", children: aiSettings.rules.map((rule) => (_jsxs("div", { className: "rule-item", children: [_jsxs("div", { className: "rule-item-header", children: [_jsx("span", { className: "rule-item-name", children: rule.name }), _jsx("span", { className: "rule-item-category", children: rule.category })] }), _jsxs("div", { className: "rule-item-triggers", children: [rule.trigger.isGreeting && "Greetings ", rule.trigger.keywords && rule.trigger.keywords.length > 0 && `Keywords: ${rule.trigger.keywords.join(", ")} `, rule.trigger.messageContains && `Regex: ${rule.trigger.messageContains}`, rule.trigger.contactAiAccessLevel && rule.trigger.contactAiAccessLevel.length > 0 && ` Access: ${rule.trigger.contactAiAccessLevel.join(", ")}`, !rule.trigger.isGreeting && (!rule.trigger.keywords || rule.trigger.keywords.length === 0) && !rule.trigger.messageContains && "No triggers (catch-all)"] }), _jsxs("div", { className: "rule-item-actions", children: ["Action: ", rule.action.type, rule.action.template && ` — "${rule.action.template.slice(0, 50)}${rule.action.template.length > 50 ? "..." : ""}"`, rule.action.aiIdentityOverride && ` | Identity: ${rule.action.aiIdentityOverride}`] }), _jsx("div", { className: "rule-item-controls", children: _jsx("button", { className: "delete", onClick: () => handleDeleteRule(rule.id), children: "Delete" }) })] }, rule.id))) })) : (_jsx("p", { className: "field-desc", style: { marginBottom: "1rem" }, children: "No rules configured. Add a rule below." })), _jsxs("div", { className: "add-rule-form", children: [_jsx("h5", { children: "Add New Rule" }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Rule Name" }), _jsx("input", { type: "text", placeholder: "e.g., Greeting Response", value: ruleForm.name, onChange: (e) => setRuleForm({ ...ruleForm, name: e.target.value }) })] }), _jsxs("div", { className: "form-row", children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Category" }), _jsxs("select", { value: ruleForm.category, onChange: (e) => setRuleForm({ ...ruleForm, category: e.target.value }), children: [_jsx("option", { value: "availability", children: "Availability" }), _jsx("option", { value: "capability", children: "Capability" }), _jsx("option", { value: "catch_all", children: "Catch-all" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Priority (lower = first)" }), _jsx("input", { type: "number", value: ruleForm.priority, min: 1, max: 100, onChange: (e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 1 }) })] })] }), _jsxs("div", { className: "form-row", children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Trigger: Keywords (comma-separated)" }), _jsx("input", { type: "text", placeholder: "e.g., help, question, support", value: ruleForm.keywords, onChange: (e) => setRuleForm({ ...ruleForm, keywords: e.target.value }) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Trigger: Message Regex" }), _jsx("input", { type: "text", placeholder: "e.g., \\\\b(help|support)\\\\b", value: ruleForm.regex, onChange: (e) => setRuleForm({ ...ruleForm, regex: e.target.value }) })] })] }), _jsxs("div", { className: "form-row", children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Trigger: Greeting?" }), _jsxs("select", { value: ruleForm.isGreeting ? "true" : "", onChange: (e) => setRuleForm({ ...ruleForm, isGreeting: e.target.value === "true" }), children: [_jsx("option", { value: "", children: "Any" }), _jsx("option", { value: "true", children: "Yes (match greetings)" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Trigger: AI Access Level" }), _jsxs("select", { value: ruleForm.accessLevel, onChange: (e) => setRuleForm({ ...ruleForm, accessLevel: e.target.value }), children: [_jsx("option", { value: "", children: "Any" }), _jsx("option", { value: "full", children: "Full access only" }), _jsx("option", { value: "assistant_only", children: "Assistant only" })] })] })] }), _jsxs("div", { className: "form-row", children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Action Type" }), _jsxs("select", { value: ruleForm.actionType, onChange: (e) => setRuleForm({ ...ruleForm, actionType: e.target.value }), children: [_jsx("option", { value: "draft", children: "Draft (suggest reply)" }), _jsx("option", { value: "auto_send", children: "Auto-send (send directly)" }), _jsx("option", { value: "gatekeep", children: "Gatekeep (polite refusal)" }), _jsx("option", { value: "defer", children: "Defer (ask owner)" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Identity Override" }), _jsxs("select", { value: ruleForm.identityOverride, onChange: (e) => setRuleForm({ ...ruleForm, identityOverride: e.target.value }), children: [_jsx("option", { value: "", children: "Use default" }), _jsx("option", { value: "invisible", children: "Invisible (as owner)" }), _jsx("option", { value: "transparent", children: "Transparent ([AI])" }), _jsx("option", { value: "defensive", children: "Defensive (gatekeep)" })] })] })] }), _jsxs("div", { className: "form-group", children: [_jsxs("label", { children: ["Response Template (optional, use ", "{ownerName}", " for owner's name)"] }), _jsx("textarea", { placeholder: "e.g., Hi {ownerName} is currently away. I'll let them know you reached out!", value: ruleForm.template, onChange: (e) => setRuleForm({ ...ruleForm, template: e.target.value }) })] }), _jsx("div", { className: "form-actions", children: _jsx("button", { className: "btn-primary", onClick: handleAddRule, children: "Add Rule" }) })] })] }));
}
//# sourceMappingURL=SettingsAITab.js.map