/**
 * EM-R — stable JSON-RPC `error.code` derivation for catalog-token errors.
 *
 * New RPCs (askHomeModel, revokeThinClient) throw `Error`s whose message
 * starts with a stable catalog token — `cloud-approval-needed: …`,
 * `model-not-configured: …`, `semantic-firewall: …`, `prompt-too-large: …`,
 * `owner-only: …` (thin-client-protocol error catalog). Both JSON-RPC
 * transports (direct WebSocket + libp2p client-proxy) previously serialized
 * every failure as `code: "ERROR"`, so mobile clients could only pattern-match
 * on the message text. This helper lifts the leading token into `error.code`.
 *
 * Messages that do not start with a known token keep the legacy `"ERROR"`
 * code — no behavior change for existing methods.
 */

const KNOWN_RPC_ERROR_TOKENS = new Set([
  "cloud-approval-needed",
  "model-not-configured",
  "semantic-firewall",
  "prompt-too-large",
  "owner-only",
])

/**
 * Return the leading catalog token of a thrown Error message (the substring
 * before the first `:`) when it is one of the known tokens, else `"ERROR"`.
 */
export function rpcErrorCode(message: string): string {
  const colon = message.indexOf(":")
  if (colon > 0) {
    const token = message.slice(0, colon)
    if (KNOWN_RPC_ERROR_TOKENS.has(token)) return token
  }
  return "ERROR"
}
