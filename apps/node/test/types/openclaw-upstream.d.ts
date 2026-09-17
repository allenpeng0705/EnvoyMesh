/**
 * Ambient types for the OpenClaw upstream checkout (`packages/openclaw`).
 *
 * Why this file is here and not beside the module it describes: `packages/
 * openclaw` is **gitignored** (`.gitignore:43`) and untracked — it is a local
 * checkout, and `git ls-files packages/openclaw` is empty. A `.d.ts` written
 * inside it would compile on this machine and evaporate for everyone else, so
 * the declaration lives in the tracked test tree instead.
 *
 * The wildcard is deliberately anchored to the one filename the node tests
 * import (`context-compose.js`), not a blanket `declare module "*.js"`. A
 * blanket wildcard would silently type *any* unresolved `.js` import as this
 * shape; this pattern can only ever match that single module.
 */

declare module "*/context-compose.js" {
  /** The message the OpenClaw extension composes a system prompt from. */
  export interface EnvoyMeshGroupComposeMessage {
    /** Legacy name for the policy text. */
    systemPrompt?: string;
    /** Current name for the policy text; wins over `systemPrompt`. */
    policyPrompt?: string;
    /** Retrieved EnvoyMesh context, appended after the policy. */
    retrievedContext?: string;
  }

  /**
   * Compose the group system prompt. Returns `undefined` when both the policy
   * and the retrieved context are empty — the runtime's `parts.length > 0`
   * branch, which the test above pins.
   */
  export function composeEnvoyMeshGroupSystemPrompt(
    msg: EnvoyMeshGroupComposeMessage,
  ): string | undefined;
}
