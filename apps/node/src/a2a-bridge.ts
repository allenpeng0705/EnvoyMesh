/**
 * Phase 48C/48D — A2A Agent Card + JSON-RPC path constants.
 *
 * Re-exports the canonical builders and HTTP handlers from
 * `@envoymesh/api`. Kept as a node-side module for backwards
 * compatibility with code that imported from `apps/node/src/a2a-bridge.ts`
 * before 48C.
 *
 * Design: docs/a2a-mcp-interop-design.md §4.4 / §6.4.
 */

export {
  handleA2AAgentCardRequest,
  handleA2ARelayAgentCardRequest,
  relayEnvoyAgentCard,
  toA2AAgentCard,
  type A2AAgentCard,
  type A2ACardHttpRequest,
  type A2ACardHttpResponse,
  type EnvoyAgentCard,
  type RelayCardInfo,
} from "@envoymesh/api";

/**
 * Phase 48D — well-known path where the A2A JSON-RPC endpoint is
 * mounted on the *relay's public* HTTP server. The node's local
 * bridge server uses `/a2a/jsonrpc` (the home-side default in
 * `node-config-store.a2aBridge.homeA2aPath`) — these are intentionally
 * different paths because the relay serves the public gateway URL
 * while the node serves the loopback bridge URL.
 */
export const A2A_JSONRPC_PATH = "/.well-known/a2a/jsonrpc";