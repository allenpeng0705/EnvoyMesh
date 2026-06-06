/** Social UI JSON-RPC + events (Phase 19). */
export const SOCIAL_WS_PORT = 3030;

/** External agent HTTP bridge (`POST /bridge/send`). Phase 9K — established before terminals. */
export const BRIDGE_HTTP_PORT = 3031;

/** Terminal PTY attach WebSocket (Phase 30). Must not share BRIDGE_HTTP_PORT. */
export const TERMINAL_WS_PORT = 3032;
