/**
 * H2A (human↔agent) wire channel semantics — Phase 15C.
 * Maps EMP intents to libp2p protocol paths for documentation and tests.
 */
/** Intents that MUST use `/envoymesh/chat/0.1.0` (human conversational traffic only). */
export const CHAT_PROTOCOL_INTENTS = new Set(["chat.message"]);
/** Intents carried on `/envoymesh/data/0.1.0` (voucher + chunk bodies). */
export const DATA_PROTOCOL_INTENTS = new Set([
    "share.chunk",
    "share.voucher",
]);
/**
 * Resolve the required libp2p protocol path for an outbound intent.
 * Everything except chat.message and data transfer uses `/envoymesh/message/0.1.0`.
 */
export function wireChannelForIntent(intent) {
    if (CHAT_PROTOCOL_INTENTS.has(intent))
        return "chat";
    if (DATA_PROTOCOL_INTENTS.has(intent))
        return "data";
    return "message";
}
/** Owner ↔ home agent assist that runs in-process (no peer wire). */
export const H2A_LOCAL_PRODUCT_INTENTS = new Set([
    "knowledge.query.local",
    "document.agent.turn",
]);
/** Cross-peer human-initiated agent assist on the message protocol. */
export const H2A_WIRE_INTENTS = new Set([
    "knowledge.query",
    "knowledge.response",
    "discovery.request",
    "discovery.response",
]);
export function isH2aWireIntent(intent) {
    return H2A_WIRE_INTENTS.has(intent);
}
export function isPeerHumanChatIntent(intent) {
    return intent === "chat.message";
}
//# sourceMappingURL=h2a-wire-semantics.js.map