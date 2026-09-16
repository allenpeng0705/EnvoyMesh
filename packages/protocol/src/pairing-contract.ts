/**
 * Pairing contract — the payloads a QR code carries.
 *
 * ## Why these live in `protocol`
 *
 * `PairingPayload` and `PairWithHomeNodeParams` were declared in `ws-protocol.ts`,
 * which is `product-bound` because it carries the 400-method RPC union. Every
 * module that needed one of them therefore became product-bound too — including
 * `pairing-token.ts` and `envoy-pair-uri.ts` (the token codec and the URI
 * builder), which name no product concept and import nothing else from the api
 * package. Two type imports were the entire coupling.
 *
 * Moving them here makes the pairing path reusable, which matters for more than
 * tidiness: a second EnvoyMesh product (see `@envoymesh/reuse-host`) can then
 * speak **the same QR format** instead of inventing its own. A pairing code that
 * only its issuing product can read is not a pairing code.
 *
 * `@envoymesh/api` re-exports both, so no importer changed.
 */

/**
 * Pairing payload for QR-code mobile pairing (Phase 10A).
 *
 * Encoded as `envoy://pair?wsUrl=...&relayPeerId=...&agentPeerId=...`
 * Displayed as a QR code in the Social UI for the mobile app to scan.
 */
export interface PairingPayload {
  /** WebSocket URL the mobile app connects to. Either the home node's direct LAN WS URL, or the relay's public WS URL when relay-proxy is configured. */
  wsUrl: string;
  /**
   * Direct LAN WebSocket URL of the home node (e.g. `ws://192.168.x.x:3030/ws`).
   * When present, the mobile app will prefer this URL for ongoing traffic (lowest latency, no relay).
   * The relay URL is used as a fallback when the LAN is unreachable (e.g. mobile on cellular).
   */
  lanWsUrl?: string;
  /**
   * Home node's libp2p peer ID (optional).
   * When connecting through a relay, this is passed as the `target` query param so the relay knows which node to proxy to.
   */
  relayPeerId?: string;
  /**
   * Relay's public WebSocket URL (optional).
   * When present, the QR encodes this relay URL instead of the direct LAN wsUrl, so mobile can connect from any network.
   */
  relayWsUrl?: string;
  /**
   * Additional Envoy relay WebSocket base URLs (optional).
   * Compact QR field so EnvoyGo can try US/EU/… relays when the primary
   * `relayWsUrl` is unreachable. Does not include the built-in community relay.
   */
  relayWsUrls?: string[];
  /** Bridge agent peer ID (optional — present when bridge is enabled) */
  agentPeerId?: string;
  /** Bridge agent public key PEM (optional) */
  agentPubKey?: string;
  /** Bridge agent display name from bridge-config.json (optional) */
  agentName?: string;
  /**
   * Which app minted this code (`"EnvoyMesh"`, `"EnvoyDev"`, …).
   *
   * A phone app belongs to the same product as the desktop app it pairs with, so the
   * code says who made it and the node checks it on exchange. Without this, any
   * EnvoyMesh-family phone app could pair with any desktop app — which is not what
   * "EnvoyDev's app pairs with EnvoyDev" means. Absent on codes minted before the
   * field existed, and treated as "any app" for exactly that reason.
   */
  app?: string;
  /** Pairing token for owner verification (optional) */
  token?: string;
  /** Owner's public key PEM (Phase 11 — for shared-identity pairing, public info safe for QR) */
  ownerPublicKey?: string;
  /** Owner ID e.g. envoy:owner:... (Phase 11 — for shared-identity pairing) */
  ownerId?: string;
  /** Home node's libp2p peer ID for mobile → home routing (bridge agent transport). */
  homeNodePeerId?: string;
  /**
   * Bootstrap peer multiaddrs the home node uses (optional).
   * When present, EnvoyGo tries these as last-resort fallback candidates
   * when the relay URL is unreachable. Useful when the operator has
   * configured additional relay or bootstrap peers that are WebSocket-accessible.
   */
  bootstrapPeers?: string[];
  /**
   * Bootstrap preset names for compact QR encoding (optional).
   * EnvoyGo resolves these to full multiaddr strings using the same
   * preset registry as the home node. E.g. "public-libp2p-am6".
   */
  bootstrapPresetNames?: string[];
}

/** Params decoded from an `envoy://pair` URI for mobile shared-identity pairing. */
export interface PairWithHomeNodeParams {
  wsUrl: string;
  /** Which app minted the code — see {@link PairingPayload.app}. */
  app?: string;
  /**
   * Direct LAN WebSocket URL of the home node (optional).
   * When present, the mobile uses this for ongoing traffic when reachable, falling back to `wsUrl` (relay) otherwise.
   */
  lanWsUrl?: string;
  token: string;
  ownerPublicKey: string;
  ownerId: string;
  agentPeerId?: string;
  agentPubKey?: string;
  relayPeerId?: string;
  /**
   * Extra Envoy relay WebSocket bases (optional) — same meaning as
   * {@link PairingPayload.relayWsUrls}. Carried on the URI as a comma-joined
   * `relayWsUrls` query value so a QR can advertise fallback relays.
   */
  relayWsUrls?: string[];
  homeNodePeerId?: string;
  agentName?: string;
}
