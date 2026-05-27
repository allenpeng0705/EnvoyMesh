/**
 * H2A (human↔agent) wire channel semantics — Phase 15C.
 * Maps EMP intents to libp2p protocol paths for documentation and tests.
 */
export type EnvoyWireChannel = "chat" | "message" | "data";
/** Intents that MUST use `/envoymesh/chat/0.1.0` (human conversational traffic only). */
export declare const CHAT_PROTOCOL_INTENTS: Set<string>;
/** Intents carried on `/envoymesh/data/0.1.0` (voucher + chunk bodies). */
export declare const DATA_PROTOCOL_INTENTS: Set<string>;
/**
 * Resolve the required libp2p protocol path for an outbound intent.
 * Everything except chat.message and data transfer uses `/envoymesh/message/0.1.0`.
 */
export declare function wireChannelForIntent(intent: string): EnvoyWireChannel;
/** Owner ↔ home agent assist that runs in-process (no peer wire). */
export declare const H2A_LOCAL_PRODUCT_INTENTS: Set<string>;
/** Cross-peer human-initiated agent assist on the message protocol. */
export declare const H2A_WIRE_INTENTS: Set<string>;
export declare function isH2aWireIntent(intent: string): boolean;
export declare function isPeerHumanChatIntent(intent: string): boolean;
//# sourceMappingURL=h2a-wire-semantics.d.ts.map