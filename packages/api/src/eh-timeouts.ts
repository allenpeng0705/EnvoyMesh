/**
 * Shared long-run budgets for Envoy Harness chat (Codex / DeepSeek shaped).
 *
 * Non-blocking chat uses `startEnvoyHarnessTurn` (short RPC) + `eh:turn_*`
 * notifications. `askEnvoyHarness` remains for legacy blocking callers.
 */

/** WebSocket blocking `askEnvoyHarness` (orchestration / legacy). */
export const EH_ASK_WS_TIMEOUT_MS = 900_000; // 15 minutes

/** WebSocket `startEnvoyHarnessTurn` ack (turn runs on node). */
export const EH_START_TURN_WS_TIMEOUT_MS = 30_000;

/** In-process ACP `session/prompt` (node → harness). */
export const EH_PROMPT_ACP_TIMEOUT_MS = 900_000;
