/**
 * Model-only user-role context (skill catalog, memory index, plan)
 * must not appear as human chat bubbles in EH / Social / EnvoyGo.
 */
/** True when `text` is turn-context injection, not a human prompt. */
export function isEphemeralUserContextText(text) {
    const trimmed = text.trim();
    if (trimmed.length === 0)
        return false;
    if (trimmed.startsWith("<available_skills>"))
        return true;
    if (trimmed.startsWith("ACTIVE PLAN (approved at"))
        return true;
    if (trimmed.startsWith("Available memories (read with"))
        return true;
    if (trimmed.startsWith("[system] Your previous response"))
        return true;
    return false;
}
/** Skip model-only user messages when building chat transcripts. */
export function isEphemeralUserMessage(msg) {
    if (msg.role !== "user")
        return false;
    const text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    return isEphemeralUserContextText(text);
}
/**
 * Insert ephemeral turn context immediately before this turn's user
 * prompt (the trailing user message). Not persisted to the session.
 */
export function injectEphemeralUserContext(messages, ephemeralText) {
    if (ephemeralText.length === 0)
        return [...messages];
    const ephemeral = {
        role: "user",
        content: [{ type: "text", text: ephemeralText }],
    };
    const copy = [...messages];
    const last = copy[copy.length - 1];
    if (last?.role === "user") {
        copy.splice(copy.length - 1, 0, ephemeral);
        return copy;
    }
    copy.push(ephemeral);
    return copy;
}
//# sourceMappingURL=ephemeral-user-context.js.map