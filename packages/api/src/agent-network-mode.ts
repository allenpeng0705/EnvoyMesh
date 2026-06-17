/**
 * AI Engine Mode (Phase 32, renamed from "Agent Network Mode").
 *
 * The home node can run two AI engines in parallel:
 *   - **Built-in OpenClaw** ("EnvoyAI") — in-process, has direct vault + mesh + tools access.
 *   - **Ext Agent** ("Agent Bridge") — out-of-process, talks to an external agent like HomeClaw
 *     over HTTP.
 *
 * Either can be enabled or disabled independently. This helper computes the
 * derived `AiEngineMode` from the two boolean flags. It is consumed by
 * the social UI's `AgentSettings` section and the mobile thin-client to
 * render a single "AI Engine" chip.
 *
 * (Note: the separate top-level Settings → "Agent Network" tab is about
 * onboarding other nodes — pairing, fleet manifest, company invites —
 * not the AI engine on this home node.)
 *
 * **D1C defaults:** when both flags are absent (fresh install), the mode is
 * `"openclaw-only"` — built-in OpenClaw ships on, the Ext Agent bridge is opt-in.
 */

export type AiEngineMode = "off" | "openclaw-only" | "ext-only" | "both";

/**
 * Compute the current AI engine mode from the two boolean flags.
 *
 * - `bridgeEnabled === undefined` is treated as `false` (D1C: opt-in).
 * - `openclawEnabled === undefined` is treated as `true` (D1C: ships on).
 *
 * Callers that need to display the *configured* state should pass the
 * raw flags from `NodeConfig`. Callers that need to display the *effective*
 * state should pass `(await getBridgeStatus()).enabled` and
 * `(await getOpenClawStatus()).enabled` instead.
 */
export function computeAiEngineMode(
  bridgeEnabled: boolean | undefined,
  openclawEnabled: boolean | undefined,
): AiEngineMode {
  const bridge = bridgeEnabled === true;
  const openclaw = openclawEnabled !== false; // default true when absent
  if (bridge && openclaw) return "both";
  if (openclaw) return "openclaw-only";
  if (bridge) return "ext-only";
  return "off";
}

/**
 * Human-readable label for a mode, in English. Use as the i18n key
 * (`settings.ai.aiEngine.mode${capitalize(mode)}`) when localizing.
 */
export const AI_ENGINE_MODE_KEYS: Record<AiEngineMode, string> = {
  "both": "modeBoth",
  "openclaw-only": "modeOpenclawOnly",
  "ext-only": "modeExtOnly",
  "off": "modeOff",
};
