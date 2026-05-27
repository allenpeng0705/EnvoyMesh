/** Run an approved queue item (Phase 13 — send_chat uses honest agent role). */
export async function executeApprovedAction(item, deps) {
    switch (item.actionType) {
        case "send_chat": {
            const targetOwnerId = item.context.contactOwnerId?.trim();
            const text = item.draftContent?.trim();
            if (!targetOwnerId) {
                return { ok: false, reason: "send_chat approval missing context.contactOwnerId" };
            }
            if (!text) {
                return { ok: false, reason: "send_chat approval missing draftContent" };
            }
            const result = await deps.sendAgentChat(targetOwnerId, text);
            return { ok: true, actionType: "send_chat", messageId: result.messageId };
        }
        case "discovery_forward": {
            if (!deps.forwardDiscovery) {
                return { ok: false, reason: "discovery_forward executor not configured" };
            }
            let parsed;
            try {
                parsed = JSON.parse(item.draftContent);
            }
            catch {
                return { ok: false, reason: "discovery_forward approval has invalid draftContent JSON" };
            }
            const result = await deps.forwardDiscovery(parsed);
            if (!result.ok) {
                return { ok: false, reason: result.error ?? "discovery forward failed" };
            }
            return { ok: true, actionType: "discovery_forward" };
        }
        default:
            return {
                ok: false,
                reason: `action type "${item.actionType}" is not executable yet`,
            };
    }
}
//# sourceMappingURL=approval-executor.js.map