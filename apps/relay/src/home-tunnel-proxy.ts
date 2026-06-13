/**
 * Home-tunnel-proxy state machine for the standalone relay server.
 *
 * Extracted from `apps/relay/src/index.ts` so it can be unit-tested in
 * isolation against a real `ws.Server` (see
 * `apps/relay/test/home-tunnel-recovery.test.ts`).
 *
 * Owns:
 *   - The `/ws/home` WebSocketServer (where the home node registers its
 *     persistent tunnel).
 *   - A `Map<peerId, WebSocket>` of currently registered home tunnels.
 *   - A `Map<key, ProxyChannelState>` of in-flight mobile proxy
 *     channels, keyed by `<homePeerId>|<channelId>`. The state lives
 *     here (not inside any per-tunnel closure) so it survives a
 *     home-tunnel drop and can be re-claimed when a new tunnel arrives.
 *
 * Does NOT own:
 *   - The HTTP server (caller wires `handleHomeUpgrade` /
 *     `handleProxyUpgrade` into its own `httpServer.on("upgrade")`).
 *   - The libp2p fallback for mobile proxies (`handleProxyConnection`).
 *     The caller decides whether to use this module or the libp2p dial
 *     path; the new module only handles the home-tunnel route.
 *
 * I4 contract: when the home's `/ws/home` socket drops, the mobile's
 * WebSocket is **not** closed. Instead, the channel is marked
 * `orphaned` and any frames the mobile sends during the down window
 * are buffered in `state.earlyBuffer`. When a new home tunnel is
 * registered for the same peer, the orphan is re-claimed: an `open`
 * frame is re-issued on the new tunnel, and the buffered frames are
 * flushed to the home once `open-ack` arrives. The mobile receives
 * `tunnel-down` and `tunnel-up` push events so its UI can show a
 * "reconnecting…" indicator.
 */

import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";

// ============================================================================
// Public types
// ============================================================================

/**
 * Per-channel state. Lives in the module-level `proxyChannels` map so
 * it survives a home-tunnel drop and can be re-claimed.
 */
export interface ProxyChannelState {
  mobile: WebSocket;
  token: string;
  peerId: string;
  channelId: string;
  /** True after the first `open-ack`; resets to false on re-claim. */
  active: boolean;
  /** True when the home tunnel was lost but the mobile is still around. */
  orphaned: boolean;
  /** Frames from the mobile received before the first `open-ack` or
   *  while orphaned; flushed on the next `open-ack`. */
  earlyBuffer: string[];
}

export interface HomeTunnelProxyOptions {
  /** Maximum concurrent home tunnels. Beyond this, /ws/home upgrades
   *  are rejected with 503. */
  maxHomeTunnels: number;
  /** Maximum concurrent mobile-proxy connections. Beyond this, mobile
   *  upgrades are closed with 1013. */
  maxProxyConnections: number;
  /** Per-frame data size cap (bytes). The home chunks PTY output to
   *  64KB so 128KB is plenty of headroom for base64 inflation. */
  maxHomeTunnelDataBytes: number;
  /** Optional log prefix (defaults to "[relay]"). */
  logPrefix?: string;
}

export interface HomeTunnelProxy {
  /**
   * Run the /ws/home upgrade: validates the request, upgrades the
   * socket via the inner `homeWss`, and registers the resulting
   * WebSocket as a home tunnel. Returns the WebSocket on success, or
   * null if the upgrade was rejected (an HTTP error was already
   * written to `socket`).
   */
  handleHomeUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    peerId: string,
  ): Promise<WebSocket | null>;

  /**
   * The shared `{ noServer: true }` WebSocketServer used to upgrade
   * mobile proxy connections. The caller wires this into its own
   * `httpServer.on("upgrade")` handler and calls
   * `proxyWss.handleUpgrade(req, socket, head, callback)` itself,
   * passing the upgraded WebSocket to `attachMobileProxy` (or its
   * own fallback path if no home tunnel is registered).
   */
  readonly proxyWss: WebSocketServer;

  /**
   * Attach an already-upgraded mobile WebSocket to the home tunnel
   * for `targetPeerId`. If no home tunnel is registered, calls
   * `fallback` (typically a libp2p dial path) so the caller can
   * route the connection elsewhere.
   */
  attachMobileProxy(
    ws: WebSocket,
    targetPeerId: string,
    token: string,
    fallback: (ws: WebSocket) => void,
  ): void;

  /** True iff a home tunnel is currently registered for `peerId`. */
  hasHomeTunnel(peerId: string): boolean;

  /** Snapshot for monitoring / tests. */
  stats(): { homeTunnels: number; channels: number; orphans: number };

  /**
   * Stop the proxy: close all client sockets and the internal
   * WebSocketServers. Idempotent.
   */
  shutdown(): Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Maximum milliseconds to wait for the home to send `open-ack` after
 * the relay issues `open` on the tunnel. If the home doesn't claim
 * the channel in this window, the mobile is closed.
 */
const HOME_CLAIM_TIMEOUT_MS = 10_000;

export function createHomeTunnelProxy(opts: HomeTunnelProxyOptions): HomeTunnelProxy {
  const {
    maxHomeTunnels,
    maxProxyConnections,
    maxHomeTunnelDataBytes,
    logPrefix = "[relay]",
  } = opts;

  // ---- Module-level state ----
  const homeWss = new WebSocketServer({ noServer: true });
  const proxyWss = new WebSocketServer({ noServer: true });
  const homeTunnels = new Map<string, WebSocket>();
  const proxyChannels = new Map<string, ProxyChannelState>();
  const proxyClaimResolvers = new Map<string, () => void>();
  const proxyConnByTarget = new Map<string, Set<WebSocket>>();
  let proxyConnTotal = 0;
  let stopped = false;

  // ---- Helpers ----
  const log = (msg: string): void => {
    // eslint-disable-next-line no-console
    console.log(`${logPrefix} ${msg}`);
  };
  const warn = (msg: string): void => {
    // eslint-disable-next-line no-console
    console.warn(`${logPrefix} ${msg}`);
  };
  const channelKey = (peerId: string, channelId: string): string =>
    `${peerId}|${channelId}`;

  /**
   * Send a frame to the home's current tunnel for `peerId`. If the
   * tunnel is missing or not open, this is a no-op.
   */
  const sendToHome = (peerId: string, obj: unknown): void => {
    const t = homeTunnels.get(peerId);
    if (!t || t.readyState !== WebSocket.OPEN) return;
    try { t.send(JSON.stringify(obj)); } catch { /* ignore */ }
  };

  /**
   * Send a text frame to a mobile WebSocket. Best-effort; ignores
   * failures.
   */
  const sendToMobile = (mobile: WebSocket, text: string): void => {
    if (mobile.readyState !== WebSocket.OPEN) return;
    try { mobile.send(text); } catch { /* ignore */ }
  };

  // ==========================================================================
  // handleHomeTunnel — registered on every /ws/home upgrade.
  // ==========================================================================
  function handleHomeTunnel(ws: WebSocket, peerId: string, remoteAddr?: string, remotePort?: number): void {
    // Replace any previous tunnel.
    const prev = homeTunnels.get(peerId);
    if (prev && prev !== ws && prev.readyState === WebSocket.OPEN) {
      try { prev.close(1000, "replaced by newer tunnel"); } catch { /* ignore */ }
    }
    homeTunnels.set(peerId, ws);
    log(`home-tunnel: registered ${peerId.slice(0, 12)}… (total=${homeTunnels.size})`);

    // Acknowledge the registration so the home node knows the tunnel is up.
    sendToMobile(ws, JSON.stringify({ type: "home-tunnel-ack", peerId }));

    // Send the relay-observed public address so the home node can advertise it.
    // This lets the home node be reachable via DHT even when behind NAT.
    if (remoteAddr && remotePort) {
      // Skip loopback / link-local — these are not useful for external callers.
      if (remoteAddr !== "127.0.0.1" && remoteAddr !== "::1" && !remoteAddr.startsWith("fe80:")) {
        const observedMultiaddr = `/ip4/${remoteAddr}/tcp/${remotePort}`;
        sendToMobile(ws, JSON.stringify({ type: "observed-addr", addr: observedMultiaddr }));
      }
    }

    // Keepalive: respond to ping with pong, and send periodic pings.
    ws.on("ping", () => {
      ws.pong();
    });
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 25_000);
    ws.on("close", () => clearInterval(pingInterval));
    ws.on("error", () => clearInterval(pingInterval));

    // On every (re)open of the tunnel, walk the module-level
    // `proxyChannels` for entries belonging to this peerId that are
    // orphaned, and re-issue the `open` frame on the new tunnel. The
    // home will then dial a fresh local ws-server connection and
    // respond with `open-ack`. Until that happens, the mobile
    // continues to send JSON-RPC and PTY frames, which we accumulate
    // in `state.earlyBuffer` and flush on `open-ack`. We deliberately
    // do NOT clear the buffer here: any frames the mobile sent during
    // the tunnel-down window are unsent (the old tunnel is dead) and
    // must be forwarded to the new home.
    const reclaimOrphans = (): void => {
      let reclaimed = 0;
      for (const [key, state] of proxyChannels.entries()) {
        if (state.peerId !== peerId) continue;
        if (!state.orphaned) continue;
        if (state.mobile.readyState !== WebSocket.OPEN) {
          // Mobile gave up while we were down. Drop the entry.
          proxyChannels.delete(key);
          proxyClaimResolvers.delete(state.channelId);
          continue;
        }
        state.orphaned = false;
        state.active = false; // waiting for new open-ack
        // Set up a fresh claim promise for the new tunnel.
        let resolver: () => void = () => {};
        const claimPromise = new Promise<void>((resolve) => { resolver = resolve; });
        proxyClaimResolvers.set(state.channelId, resolver);
        sendToHome(peerId, {
          type: "open",
          channelId: state.channelId,
          token: state.token,
          targetPeerId: peerId,
        });
        // Notify the mobile of the re-claim attempt (best-effort UX).
        sendToMobile(state.mobile, JSON.stringify({
          event: "tunnel-up",
          data: { peerId },
        }));
        reclaimed++;
      }
      if (reclaimed > 0) {
        log(
          `home-tunnel: re-claiming ${reclaimed} orphaned channel(s) for ${peerId.slice(0, 12)}… on new tunnel`,
        );
      }
    };
    // The home may have already opened the underlying socket by the
    // time we attach this listener, so also run reclaim once
    // synchronously to cover the case where the upgrade completed and
    // `open` already fired.
    reclaimOrphans();
    ws.on("open", reclaimOrphans);

    ws.on("message", (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
      const text = typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
          ? raw.toString("utf-8")
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString("utf-8")
            : new TextDecoder().decode(new Uint8Array(raw as ArrayBuffer));
      let env: { type?: string; channelId?: string; data?: string };
      try {
        env = JSON.parse(text) as typeof env;
      } catch (err) {
        warn(`home-tunnel: bad frame from ${peerId.slice(0, 12)}…: ${(err as Error).message}`);
        return;
      }

      if (env.type === "open-ack" && typeof env.channelId === "string") {
        // Home node has opened its end of the channel. The channel
        // state lives in the module-level `proxyChannels` map.
        const key = channelKey(peerId, env.channelId);
        const state = proxyChannels.get(key);
        if (state) {
          state.active = true;
          // Flush any frames the mobile sent while we were waiting
          // for the claim (first time) OR while the previous tunnel
          // was dead (re-claim). The buffer is per-channel and
          // survives the tunnel drop intentionally.
          if (state.earlyBuffer.length > 0 && ws.readyState === WebSocket.OPEN) {
            for (const bufferedText of state.earlyBuffer) {
              try {
                ws.send(JSON.stringify({
                  type: "data",
                  channelId: env.channelId,
                  data: bufferedText,
                }));
              } catch { /* ignore */ }
            }
            state.earlyBuffer.length = 0;
          }
          sendToMobile(state.mobile, JSON.stringify({
            event: "connected",
            data: { relayProxied: true },
          }));
          log(
            `home-tunnel: channel ${env.channelId.slice(0, 8)}… opened by ${peerId.slice(0, 12)}…`,
          );
        } else {
          // No proxy state for this channel — likely the home
          // responded to an `open` we never sent. Drop quietly.
          warn(
            `home-tunnel: open-ack for unknown channel ${env.channelId.slice(0, 8)}…`,
          );
        }
        const resolver = proxyClaimResolvers.get(env.channelId);
        if (resolver) {
          proxyClaimResolvers.delete(env.channelId);
          resolver();
        }
        return;
      }

      if (env.type === "close" && typeof env.channelId === "string") {
        // Home explicitly closed this channel (e.g. session ended).
        // Tear down the proxy state and close the mobile side.
        const key = channelKey(peerId, env.channelId);
        const state = proxyChannels.get(key);
        if (state) {
          proxyChannels.delete(key);
          proxyClaimResolvers.delete(env.channelId);
          if (state.mobile.readyState === WebSocket.OPEN) {
            try { state.mobile.close(); } catch { /* ignore */ }
          }
        }
        const resolver = proxyClaimResolvers.get(env.channelId);
        if (resolver) {
          proxyClaimResolvers.delete(env.channelId);
          resolver();
        }
        return;
      }

      if (env.type === "data" && typeof env.channelId === "string" && typeof env.data === "string") {
        // Cap per-frame data size to prevent a runaway home-side
        // producer from ballooning memory and WebSocket text-frame
        // size. The home now chunks PTY output to 64KB so the
        // configured cap is plenty of headroom for base64 inflation.
        if (env.data.length > maxHomeTunnelDataBytes) {
          warn(
            `home-tunnel: dropping oversized frame (${env.data.length} > ${maxHomeTunnelDataBytes}) channel=${env.channelId.slice(0, 8)}…`,
          );
          return;
        }
        const state = proxyChannels.get(channelKey(peerId, env.channelId));
        if (state) {
          sendToMobile(state.mobile, env.data);
        }
        return;
      }
    });

    ws.on("close", () => {
      if (homeTunnels.get(peerId) === ws) {
        homeTunnels.delete(peerId);
      }
      // Mark every channel belonging to this peerId as orphaned.
      // The mobile's WebSocket is intentionally kept open — a new
      // tunnel will arrive shortly and re-claim the channels (see
      // the `reclaimOrphans` closure above). If the mobile
      // disconnects in the meantime, it will be removed from
      // `proxyChannels` in its own `ws.on("close")` handler. If the
      // mobile has already gone away, drop the entry outright.
      let orphaned = 0;
      for (const [key, state] of proxyChannels.entries()) {
        if (state.peerId !== peerId) continue;
        if (state.mobile.readyState !== WebSocket.OPEN) {
          proxyChannels.delete(key);
          proxyClaimResolvers.delete(state.channelId);
          continue;
        }
        state.orphaned = true;
        state.active = false;
        // Notify the mobile of the drop (best-effort UX).
        sendToMobile(state.mobile, JSON.stringify({
          event: "tunnel-down",
          data: { peerId },
        }));
        orphaned++;
      }
      // Reject any in-flight claim promises so proxy-side `await`
      // does not hang. The next tunnel's `open` will set up new
      // promises.
      for (const resolver of proxyClaimResolvers.values()) {
        resolver();
      }
      proxyClaimResolvers.clear();
      log(
        `home-tunnel: ${peerId.slice(0, 12)}… disconnected (total=${homeTunnels.size}, orphaned=${orphaned})`,
      );
    });

    ws.on("error", (err) => {
      warn(`home-tunnel: ${peerId.slice(0, 12)}… error: ${err.message}`);
    });
  }

  // ==========================================================================
  // handleProxyViaHomeTunnel — invoked from the /ws upgrade handler
  // when the target peer has a registered home tunnel.
  // ==========================================================================
  function handleProxyViaHomeTunnel(ws: WebSocket, targetPeerId: string, token: string): void {
    const channelId = randomChannelId();
    const initialTunnel = homeTunnels.get(targetPeerId);
    if (!initialTunnel || initialTunnel.readyState !== WebSocket.OPEN) {
      try { ws.close(1011, "home tunnel not available"); } catch { /* ignore */ }
      return;
    }
    if (proxyConnTotal >= maxProxyConnections) {
      try { ws.close(1013, "relay proxy connections full"); } catch { /* ignore */ }
      return;
    }
    proxyConnTotal++;
    const conns = proxyConnByTarget.get(targetPeerId) ?? new Set();
    conns.add(ws);
    proxyConnByTarget.set(targetPeerId, conns);
    log(
      `home-tunnel-proxy: connecting to ${targetPeerId.slice(0, 12)}… via tunnel channel=${channelId.slice(0, 8)}… (total=${proxyConnTotal})`,
    );

    const proxyKey = channelKey(targetPeerId, channelId);
    const state: ProxyChannelState = {
      mobile: ws,
      token,
      peerId: targetPeerId,
      channelId,
      active: false,
      orphaned: false,
      earlyBuffer: [],
    };
    proxyChannels.set(proxyKey, state);

    // Set up the FIRST claim promise. The `handleHomeTunnel` message
    // handler replaces the resolver in `proxyClaimResolvers` on
    // re-claim, so this `firstClaim` only resolves for the very
    // first open-ack. The 10s timeout below uses it to detect "home
    // never opened the channel at all" (different from "tunnel is
    // down, will re-claim").
    let firstResolver: () => void = () => {};
    const firstClaim = new Promise<void>((resolve) => { firstResolver = resolve; });
    proxyClaimResolvers.set(channelId, firstResolver);

    // Ask the home to open a local ws-server connection for us on
    // the current tunnel. (We already verified the tunnel is OPEN
    // above, and registered state in `proxyChannels`, so this is
    // always safe.)
    sendToHome(targetPeerId, {
      type: "open",
      channelId,
      token,
      targetPeerId,
    });

    const claimTimer = setTimeout(() => {
      if (state.active) return;
      // If currently orphaned, the claim timeout applies to a
      // previous re-claim attempt. Do not kill the mobile — the next
      // re-claim will give the home another chance.
      if (state.orphaned) return;
      proxyChannels.delete(proxyKey);
      proxyClaimResolvers.delete(channelId);
      try { ws.close(1011, "home tunnel did not claim channel"); } catch { /* ignore */ }
      warn(
        `home-tunnel-proxy: home did not claim channel ${channelId.slice(0, 8)}… within 10s`,
      );
    }, HOME_CLAIM_TIMEOUT_MS);

    // The claim promise is mainly used to drive the 10s timeout. The
    // actual early-buffer flush happens inside `handleHomeTunnel`'s
    // `open-ack` branch (it has direct access to `state` and `ws`).
    void firstClaim.then(() => {
      if (state.active) clearTimeout(claimTimer);
    });

    ws.on("message", (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
      const text = typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
          ? raw.toString("utf-8")
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString("utf-8")
            : new TextDecoder().decode(new Uint8Array(raw as ArrayBuffer));
      // Buffer if we haven't been claimed yet, OR if the channel is
      // currently orphaned (tunnel drop). Anything in the buffer is
      // forwarded to the new tunnel when the re-claim's open-ack
      // arrives (see `handleHomeTunnel`'s `open-ack` branch).
      if (!state.active || state.orphaned) {
        state.earlyBuffer.push(text);
        return;
      }
      const t = homeTunnels.get(targetPeerId);
      if (!t || t.readyState !== WebSocket.OPEN) {
        // Tunnel died between open-ack and now; buffer and let the
        // re-claim flush.
        state.earlyBuffer.push(text);
        return;
      }
      try {
        t.send(JSON.stringify({ type: "data", channelId, data: text }));
      } catch { /* ignore */ }
    });

    ws.on("close", () => {
      clearTimeout(claimTimer);
      proxyChannels.delete(proxyKey);
      proxyClaimResolvers.delete(channelId);
      const s = proxyConnByTarget.get(targetPeerId);
      if (s) {
        s.delete(ws);
        if (s.size === 0) proxyConnByTarget.delete(targetPeerId);
      }
      proxyConnTotal--;
      // Tell the current tunnel (if any) to close the channel.
      const t = homeTunnels.get(targetPeerId);
      if (t && t.readyState === WebSocket.OPEN) {
        try { t.send(JSON.stringify({ type: "close", channelId })); } catch { /* ignore */ }
      }
      log(
        `home-tunnel-proxy: mobile disconnected from ${targetPeerId.slice(0, 12)}… (total=${proxyConnTotal})`,
      );
    });

    ws.on("error", () => {
      try { ws.close(); } catch { /* ignore */ }
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================
  return {
    async handleHomeUpgrade(req, socket, head, peerId) {
      if (!peerId) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\nMissing peerId");
        socket.destroy();
        return null;
      }
      if (homeTunnels.size >= maxHomeTunnels && !homeTunnels.has(peerId)) {
        socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\nToo many home tunnels");
        socket.destroy();
        return null;
      }
      // Capture the relay-observed source address of this connection.
      const remoteAddr = req.socket.remoteAddress;
      const remotePort = req.socket.remotePort;
      return new Promise<WebSocket | null>((resolve) => {
        homeWss.handleUpgrade(req, socket, head, (ws) => {
          handleHomeTunnel(ws, peerId, remoteAddr, remotePort);
          resolve(ws);
        });
      });
    },

    proxyWss,

    attachMobileProxy(ws, targetPeerId, token, fallback) {
      if (homeTunnels.has(targetPeerId)) {
        handleProxyViaHomeTunnel(ws, targetPeerId, token);
      } else {
        fallback(ws);
      }
    },

    hasHomeTunnel(peerId) {
      const t = homeTunnels.get(peerId);
      return !!t && t.readyState === WebSocket.OPEN;
    },

    stats() {
      let orphans = 0;
      for (const state of proxyChannels.values()) {
        if (state.orphaned) orphans++;
      }
      return {
        homeTunnels: homeTunnels.size,
        channels: proxyChannels.size,
        orphans,
      };
    },

    async shutdown() {
      if (stopped) return;
      stopped = true;
      // Close all mobile clients.
      for (const state of proxyChannels.values()) {
        if (state.mobile.readyState === WebSocket.OPEN) {
          try { state.mobile.close(1011, "relay shutting down"); } catch { /* ignore */ }
        }
      }
      proxyChannels.clear();
      proxyClaimResolvers.clear();
      proxyConnByTarget.clear();
      proxyConnTotal = 0;
      // Close all home tunnels.
      for (const t of homeTunnels.values()) {
        if (t.readyState === WebSocket.OPEN) {
          try { t.close(1001, "relay shutting down"); } catch { /* ignore */ }
        }
      }
      homeTunnels.clear();
      // Close the WebSocketServers.
      await Promise.all([
        new Promise<void>((resolve) => { homeWss.close(() => resolve()); }),
        new Promise<void>((resolve) => { proxyWss.close(() => resolve()); }),
      ]);
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a channel id. Uses the standard `crypto.randomUUID` if
 * available; falls back to a Math.random() string for older runtimes.
 * The id is included in every relay <-> home frame and in the
 * `homeTerminalWs:rx` push event to the mobile.
 */
function randomChannelId(): string {
  try {
    // Node 19+ has globalThis.crypto.randomUUID.
    return globalThis.crypto.randomUUID();
  } catch {
    return `ch-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }
}
