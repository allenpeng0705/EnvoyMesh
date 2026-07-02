/** HomeRemote status for paired mobile clients (Phase 30E). */
export interface HomeRemoteStatus {
  paired: boolean;
  homeOnline: boolean;
  terminalsAvailable: boolean;
  /** True when paired mobile Assistant RPCs are proxied to the home node (Slice 4). */
  assistantProxied?: boolean;
  /**
   * Currently active home-remote transport.
   *  - `"lan"`     — direct LAN WebSocket (same WiFi, no relay)
   *  - `"libp2p"`  — direct libp2p stream to the home node's
   *                  `CLIENT_PROXY_PROTOCOL` (e.g. relayed through a public
   *                  libp2p circuit relay, no EnvoyMesh relay in the path)
   *  - `"tunnel"`  — relay-proxied WebSocket (EnvoyMesh relay is in the path;
   *                  used as the always-works fallback)
   *  - `null`      — not connected
   *
   * The mobile app prefers `lan` when reachable, then `libp2p` when the home
   * has a public libp2p circuit reservation, falling back to `tunnel`. A
   * background sweep periodically re-tries higher-priority transports and
   * upgrades the active one as soon as a better option is reachable.
   */
  transport?: "lan" | "libp2p" | "tunnel" | null;
}

export interface HomeTerminalWsOpenParams {
  pathWithQuery: string;
}

export interface HomeTerminalWsSendParams {
  dataBase64: string;
  /** Required when multiple PTY tunnels are open for one companion. */
  sessionId?: string;
}

export interface HomeTerminalWsCloseParams {
  sessionId?: string;
}

export interface HomeTerminalWsRxEvent {
  sessionId?: string;
  dataBase64: string;
}

export interface HomeTerminalWsClosedEvent {
  sessionId?: string;
}

export interface HomeTerminalWsRpcResult {
  ok: boolean;
  error?: string;
}
