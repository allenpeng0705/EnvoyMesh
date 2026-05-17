import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { Markdown } from "../Markdown.js";
export function AIChatPanel() {
    const nodeService = useNodeService();
    const { nodeConfig } = useNodeState();
    const [aiMessages, setAiMessages] = useState([]);
    const [aiInput, setAiInput] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const sendAiMessage = async (question) => {
        if (!question.trim() || isAiLoading)
            return;
        const userMsg = { role: "user", text: question.trim(), timestamp: new Date().toISOString() };
        setAiMessages((prev) => [...prev, userMsg]);
        setAiInput("");
        setIsAiLoading(true);
        try {
            const answer = await nodeService.knowledgeQuery(question);
            setAiMessages((prev) => [...prev, { role: "ai", text: answer, timestamp: new Date().toISOString() }]);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : "Failed to get AI response";
            setAiMessages((prev) => [...prev, { role: "ai", text: `Error: ${msg}`, timestamp: new Date().toISOString() }]);
        }
        finally {
            setIsAiLoading(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "chat-header", children: [_jsx("span", { className: "chat-name", children: "Envoy AI" }), _jsx("span", { className: "ai-status", children: nodeConfig?.modelProviders?.mode === "disabled" ? "AI Disabled" :
                            nodeConfig?.modelProviders?.mode === "mock" ? "Mock Mode" :
                                `Model: ${nodeConfig?.modelProviders?.modelName ?? "Not set"}` })] }), _jsxs("div", { className: "ai-messages", children: [aiMessages.length === 0 ? (_jsxs("div", { className: "ai-empty", children: [_jsx("p", { children: "Chat with your AI assistant" }), _jsx("small", { children: "Ask questions, get help with tasks, or just have a conversation" }), _jsxs("div", { className: "ai-suggestions", children: [_jsx("button", { onClick: () => setAiInput("What can you help me with?"), children: "What can you help me with?" }), _jsx("button", { onClick: () => setAiInput("Summarize my recent conversations"), children: "Summarize my recent conversations" }), _jsx("button", { onClick: () => setAiInput("Help me draft a message"), children: "Help me draft a message" })] })] })) : (aiMessages.map((msg, i) => (_jsxs("div", { className: `ai-message ${msg.role}`, children: [_jsx("span", { className: "ai-message-role", children: msg.role === "user" ? "You" : "AI" }), _jsx(Markdown, { text: msg.text, className: "ai-message-text" })] }, i)))), isAiLoading && (_jsxs("div", { className: "ai-message ai", children: [_jsx("span", { className: "ai-message-role", children: "AI" }), _jsx("p", { className: "ai-message-text ai-loading", children: "Thinking..." })] }))] }), _jsxs("div", { className: "ai-input-area", children: [_jsx("input", { type: "text", className: "ai-input", placeholder: "Ask the AI anything...", value: aiInput, onChange: (e) => setAiInput(e.target.value), onKeyDown: async (e) => {
                            if (e.key === "Enter" && aiInput.trim() && !isAiLoading) {
                                await sendAiMessage(aiInput);
                            }
                        } }), _jsx("button", { className: "ai-send", onClick: async () => { if (aiInput.trim() && !isAiLoading)
                            await sendAiMessage(aiInput); }, disabled: !aiInput.trim() || isAiLoading, children: "Send" })] })] }));
}
//# sourceMappingURL=AIChatPanel.js.map