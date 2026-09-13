import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
// The JSON-RPC envelope comes from `@envoymesh/protocol`, not
// `@envoymesh/api`: the wire types are shared by both ends of the socket, and
// importing the product package for them would keep this transport bound to the
// product's whole 436-method surface (E9).
import type {
  JsonRpcEvent,
  JsonRpcRequest,
  JsonRpcResponse,
} from "@envoymesh/protocol";
import {
  CORE_EVENT_DISPOSITIONS,
  HOST_WS_BIND_HOST,
  dispatchEvent,
  mergeEventDispositions,
  type EventDelivery,
  type EventDisposition,
  type HostNodeService,
  type HostNodeStatus,
  type HostCallEvent,
  type HostRpcDispatcher,
  type HostEventHandler,
  type HostSession,
  type SessionIdentityResolver,
  type SessionPayloadTransform,
  type SocketMethodPort,
} from "./ws-host-contract.js";
import { rpcErrorCode } from "./rpc-error-code.js";

/**
 * Per-socket state the host attaches to a WebSocket.
 *
 * Declared as a type so the host can read and write these fields without
 * `(ws as any)` — the last casts in this file, and a plain readability issue
 * rather than a boundary one (socket bookkeeping, never a service member).
 * H4 removed every *service* cast; this removes the rest.
 */
interface HostSocketState {
  /** Consecutive missed heartbeat pongs; 3 terminates the socket. */
  missedPongs?: number;
  /** Set once a session token authenticated this socket. */
  isThinClientAuthenticated?: boolean;
  /** Set when a token was attempted (valid or not), for gate decisions. */
  hadThinClientToken?: boolean;
  /**
   * Set when the socket's peer is on this machine (`127.0.0.1`, `::1`, or the
   * IPv4-mapped form).
   *
   * This is the fact the transport has and the product does not: the resolver is
   * handed a *token*, never a socket, so a product cannot tell the owner's own UI
   * from a device on the network. Without it, "no token" had to mean "trusted" —
   * see the gate in `dispatchRpc`.
   */
  isLoopbackPeer?: boolean;
}

/**
 * Is this address on the machine the host runs on?
 *
 * `::ffff:127.0.0.1` is what a dual-stack Node socket reports for an IPv4 loopback
 * peer, and `0.0.0.0`/`::` are bind addresses, not peers — a peer never has them, so
 * treating either as local would be a hole rather than a convenience.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  const raw = address?.trim();
  if (!raw) return false;
  const bare = raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
  return bare === "127.0.0.1" || bare === "::1" || bare.startsWith("127.");
}

/** View a socket as carrying the host's per-socket state. */
function hostState(ws: WebSocket): HostSocketState {
  return ws as unknown as HostSocketState;
}

/** EM-R — one JSON-RPC handler invocation (per message per WebSocket). */
interface RpcInvocation {
  ws: WebSocket;
}


/**
 * WebSocket server that exposes NodeService via JSON-RPC protocol.
 *
 * Protocol:
 * - Client sends: { id: "msg_123", method: "sendHello", params: { ... } }
 * - Server responds: { id: "msg_123", result: { ... } }
 * - Server pushes events: { event: "hello:request", data: { ... } }
 */
/**
 * Everything a product supplies to start a host.
 *
 * Two ports are **required** because a host without them cannot do its job —
 * `sessionIdentity` (who is this?) and `dispatch` (run this call under the right
 * authority). Every other field is optional, and each default is the *strict*
 * one: no extra events, no pre-auth methods, nothing transformed, nothing
 * serialized, payloads delivered exactly as emitted.
 *
 * Note what is **not** here: no router, no caller model, no settings, no method
 * catalog. Each of those was once read directly out of the product, which is
 * what made the transport unpackageable (§6.1 H1–H5).
 */
/**
 * Who a host says it is on `/health`.
 *
 * Deliberately small and non-secret: a product name, a mesh peer id and the owner
 * id — exactly what a second process needs to tell "my node" from "some other
 * product's node on the same port".
 */
export interface HealthIdentity {
  app?: string;
  peerId?: string;
  ownerId?: string;
}

export interface WsServerOptions<TCaller = unknown> {
  /**
   * Resolve a session token to a caller. **Required**: a host with no resolver
   * cannot authenticate any client, and untokened clients would silently
   * receive nothing, so `start()` throws rather than degrading.
   */
  sessionIdentity: SessionIdentityResolver<TCaller>;

  /**
   * Dispatch one RPC under the right caller context. **Required**: the host
   * says *who* is asking, never *what they may do*.
   */
  dispatch: HostRpcDispatcher<TCaller>;

  /**
   * The product's event dispositions, merged over `CORE_EVENT_DISPOSITIONS`.
   * Optional, so a product with no extra events gets the core vocabulary alone.
   */
  eventDispositions?: Readonly<Record<string, EventDisposition>>;

  /**
   * Product methods that need the client connection itself — a streaming
   * pass-through, an attach/close pair. Called **before** `dispatch`, after the
   * authentication gate; return `true` when the method was handled.
   */
  socketMethods?: SocketMethodPort<TCaller>;

  /**
   * Methods a client may call **before** authenticating.
   *
   * Data, not code: the host must not know that `previewFamilyInvite` names a
   * family invite. Empty when not supplied, which is the strict default.
   *
   * Reachability is still subject to the access gate: a pre-auth method is callable
   * from this machine without a token, and from the network only with a valid one.
   */
  preAuthMethods?: readonly string[];

  /**
   * Methods that additionally require the caller to be **on this machine**.
   *
   * The strongest of the gates, and the one a local attach belongs behind: it mints a
   * session, so reachable from the network it would let any device issue itself a
   * credential. Product data again — the host does not know what
   * `attachLocalProduct` means, only that it must never be callable off-machine.
   */
  loopbackOnlyMethods?: readonly string[];

  /**
   * What one session may receive, when it differs from the raw payload.
   *
   * Optional: a product whose events are the same for everyone passes nothing
   * and every session receives exactly what was emitted.
   */
  transformForSession?: SessionPayloadTransform<TCaller>;

  /**
   * Whether a caller that is neither on this machine nor authenticated may call
   * non-pre-auth methods. Default `true`.
   *
   * Set to `false` only for a host that is *meant* to serve an open network surface
   * — and say why in the code, because the default is the difference between "my
   * paired phone can reach me" and "anyone on the Wi-Fi can read my profile".
   */
  allowUnauthenticatedNonLoopback?: boolean;

  /**
   * Whether this method must run **one at a time** on its connection.
   *
   * The predicate, not a list: `@envoymesh/node-core`'s predecessor named 31
   * product methods (`sendChat`, `runSocialProxyPass`, …) inside the transport,
   * which is fine as *data* and wrong as *code* — a new product has none of
   * them. Serialization itself is the host's: a slow dial must not block reads
   * on the same socket. Absent → everything runs concurrently.
   */
  shouldSerializeMethod?: (method: string) => boolean;

  /**
   * What to do when the listener cannot bind.
   *
   * Absent → the desktop host's behaviour, unchanged: log, and on `EADDRINUSE`
   * `process.exit(1)` so the Tauri guardian respawns it. That is the right
   * choice for the product's own process and the wrong one for a library: a
   * second product embedding this transport must be able to *report* an
   * occupied port instead of being killed by it. Supplying a handler takes over
   * the decision — `waitUntilListening()` rejects either way.
   */
  onListenError?: (err: NodeJS.ErrnoException) => void;
}

/**
 * Whether a socket may receive events at all.
 *
 * The same rule the RPC gate applies, in the one other place it has to hold: **the owner's own
 * machine, or a session.** It exists separately because the event path never reached that gate —
 * `on`/`off` answered before it, the connection handler auto-subscribed every socket regardless of
 * where it came from, and `emitEvent` wrote to every subscriber without asking who they were.
 *
 * That combination is the bug class this file already documents once for RPCs: the host binds
 * `0.0.0.0` so paired phones can reach it, and auth used to be enforced only for clients that
 * *attempted* a token and failed. The same shape of hole on the push channel, measured: a tokenless
 * client on the LAN received `node:status`, `node:ready` and every broadcast the node emitted, on a
 * socket whose first RPC was correctly refused. Fixing the RPC side alone left this open.
 *
 * Loopback covers the owner's own UI (which carries no token by design); an authenticated session
 * covers phones and family members, whose token is resolved at connect. Everything else receives
 * nothing until it has a session.
 */
export function canReceiveEvents(state: {
  isLoopbackPeer?: boolean;
  isThinClientAuthenticated?: boolean;
}): boolean {
  return state.isLoopbackPeer === true || state.isThinClientAuthenticated === true;
}

export class WsServer<TCaller = unknown> {
  private wss!: WebSocketServer;
  private httpServer: HttpServer | null = null;
  private nodeService!: HostNodeService;
  private _transformForSession: SessionPayloadTransform<TCaller> | undefined;
  private _socketMethods: SocketMethodPort<TCaller> | undefined;
  private _preAuthMethods: ReadonlySet<string> = new Set();
  /** See `WsServerOptions.loopbackOnlyMethods`. */
  private _loopbackOnlyMethods: ReadonlySet<string> = new Set();
  /** See `WsServerOptions.allowUnauthenticatedNonLoopback`. */
  private _requireAuthForNonLoopback = true;
  private _shouldSerializeMethod: (method: string) => boolean = () => false;
  /**
   * H2 — the session-identity port. The host resolves a token through this and
   * never inspects what the product's identity model contains.
   */
  private _sessionIdentity!: SessionIdentityResolver<TCaller>;
  /** Scope key for untokened loopback clients; supplied by the resolver. */
  private _localScopeKey = "";
  /** Injected RPC dispatcher — see {@link HostRpcDispatcher}. */
  private _dispatch!: HostRpcDispatcher<TCaller>;
  private readonly subscriptions = new Map<string, Set<WebSocket>>();
  private readonly clientSubscriptions = new Map<WebSocket, Set<string>>();
  /** Track authenticated thin-client sessions (ws → ownerId). */
  private readonly authenticatedClients = new Map<WebSocket, string>();
  /** Phase 51 — thin-client session caller context (ws → profile binding). */
  private readonly authenticatedSessions = new Map<WebSocket, HostSession<TCaller>>();
  /**
   * Last RPC timestamp per thin-client owner. Heartbeat pongs do NOT update
   * this — only real client messages. Used so a backgrounded EnvoyGo with a
   * half-open WS does not suppress chat pushes forever.
   */
  private readonly thinClientLastRpcAt = new Map<string, number>();
  /** Phase 51 — last RPC per family profile (for isProfileOnline later). */
  private readonly thinClientLastRpcAtByProfile = new Map<string, number>();
  /** Phase 51 — throttle disk writes for profile lastSeenAt. */
  private readonly _lastSeenWriteAtByProfile = new Map<string, number>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs = 30000; // 30 seconds
  /**
   * How many consecutive missed pongs to tolerate before terminating a
   * client. The runtime can be busy for tens of seconds on a single
   * `sendHello` dial (e.g. the sponsor-friend auto-trigger path
   * dials multiple private addresses that ECONNREFUSED, each taking
   * the full 3.5s dial timeout). One missed pong is too aggressive —
   * the node is healthy, it's just slow. 3 missed pongs (90s of slack)
   * gives long-running RPCs room to finish without the WS server
   * tearing down the social-app connection.
   */
  private readonly heartbeatMissedPongsTolerance = 3;
  private onConnectionChange?: (connectedCount: number) => void;
  /**
   * Bind-failure policy — see {@link WsServerOptions.onListenError}. Absent
   * keeps the desktop host's log-and-exit behaviour.
   */
  private onListenError?: (err: NodeJS.ErrnoException) => void;
  /**
   * Settles when the listener is bound, so a caller that must know the real
   * port (`port: 0`) can wait for it instead of guessing.
   */
  private listening: Promise<void> | null = null;
  /** Resolve/reject pair of {@link listening}; `null` once settled. */
  private listeningPending: { resolve: () => void; reject: (err: Error) => void } | null = null;
  /** The port the OS actually bound; see {@link boundPort}. */
  private _boundPort: number | null = null;
  /**
   * Optional WAN readiness probe for GET /readyz.
   * /health stays process-liveness only; /readyz may 503 without a live
   * circuit-relay reservation on CGNAT/wan profiles.
   */
  private getReadyz?: () => { ready: boolean; reason?: string };
  /** Who this host is, for `/health` — see {@link setHealthIdentity}. */
  private getHealthIdentity?: () => HealthIdentity;
  /** Per-client queue tail for dial/send RPCs (reads run concurrently). */
  private readonly slowRpcTail = new WeakMap<WebSocket, Promise<void>>();
  /**
   * EM-R — per-invocation context of the WebSocket RPC handler currently
   * executing. Lets a self-revoking device (whose `revokeThinClient`
   * force-closes its own socket) defer that close until its JSON-RPC response
   * is written, instead of dropping the response on a CLOSING socket.
   */
  private readonly activeRpcWs = new AsyncLocalStorage<RpcInvocation>();
  /**
   * EM-R — self-revoke closes parked by `disconnectClientsForDevice`, keyed by
   * the RPC invocation that parked them. Only that invocation's handler closes
   * the socket (in its `finally`, right after `sendResponse`) — a concurrent
   * read RPC on the same socket must not close it early.
   */
  private readonly deferredDeviceClose = new Map<WebSocket, RpcInvocation>();

  constructor(
    private readonly port: number = 3030,
    private readonly path: string = "/ws",
    opts?: { onConnectionChange?: (connectedCount: number) => void },
  ) {
    this.onConnectionChange = opts?.onConnectionChange;
  }

  /** Bind /readyz semantics (call after mesh identity is known). */
  setReadyzProbe(fn: () => { ready: boolean; reason?: string }): void {
    this.getReadyz = fn;
  }

  /**
   * What `/health` says this host is.
   *
   * The endpoint's body is otherwise identical in **every** product built on this
   * transport (`{"ok":true,"service":"envoymesh-home-ws",…}`), which makes
   * "something answered on 3030" useless as a liveness signal: the desktop
   * guardian and the CLI watchdog both accept any `200`, so a *different* product
   * holding the port can convince them the node they care about is healthy — while
   * it is actually wedged. Callers supply who they are once identity is known; the
   * probe side then checks it (see `@envoymesh/node-core`'s `probeNodeEndpoint`).
   *
   * Optional on purpose: a host with no identity yet still serves `/health`, and
   * the consumers report `identityUnknown` rather than pretending it matched.
   */
  setHealthIdentity(fn: () => HealthIdentity): void {
    this.getHealthIdentity = fn;
  }

  /**
   * Start the WebSocket server
   */
  start(nodeService: HostNodeService, options: WsServerOptions<TCaller>): void {
    this.nodeService = nodeService;
    if (!options?.sessionIdentity) {
      // A host with no identity resolver cannot authenticate ANY client, and
      // untokened clients would receive nothing. Fail loudly rather than
      // degrade silently: this is a wiring bug, not a runtime condition.
      throw new Error(
        "WsServer.start requires a sessionIdentity resolver (H2). " +
          "Pass { sessionIdentity: createSocialSessionIdentityResolver(nodeService) }.",
      );
    }
    this._sessionIdentity = options.sessionIdentity;
    this._localScopeKey = options.sessionIdentity.localScopeKey;
    this._dispatch = options.dispatch;
    this._transformForSession = options.transformForSession;
    this._socketMethods = options.socketMethods;
    this._preAuthMethods = new Set(options.preAuthMethods ?? []);
    this._loopbackOnlyMethods = new Set(options.loopbackOnlyMethods ?? []);
    this._shouldSerializeMethod = options.shouldSerializeMethod ?? (() => false);
    this.onListenError = options.onListenError;
    this._requireAuthForNonLoopback = options.allowUnauthenticatedNonLoopback !== true;
    this._boundPort = null;
    this.listening = new Promise<void>((resolve, reject) => {
      this.listeningPending = { resolve, reject };
    });
    // Only a consumer that awaits `waitUntilListening()` observes a rejection;
    // the desktop host does not await it, so mark the promise handled here —
    // otherwise a bind failure would also surface as an unhandled rejection.
    this.listening.catch(() => undefined);

    const startedAtMs = Date.now();
    this.httpServer = createServer((req, res) => {
      // External supervisors (Tauri guardian, curl/systemd watchdog) probe
      // GET /health. If the event loop is wedged, the probe times out even
      // though the TCP port still LISTENs — that is the signal to kill/respawn.
      const pathname = (req.url ?? "/").split("?")[0] ?? "/";
      if (req.method === "GET" && pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            service: "envoymesh-home-ws",
            path: this.path,
            port: this.boundPort,
            uptimeMs: Date.now() - startedAtMs,
            checkedAt: new Date().toISOString(),
            // Identity, when the host knows it — what makes `200` mean *this* node
            // rather than "something is listening on the port".
            ...(this.getHealthIdentity?.() ?? {}),
          }),
        );
        return;
      }
      if (req.method === "GET" && pathname === "/readyz") {
        const probe = this.getReadyz?.() ?? { ready: true };
        const status = probe.ready ? 200 : 503;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: probe.ready,
            ready: probe.ready,
            reason: probe.reason,
            service: "envoymesh-home-ws",
            path: this.path,
            port: this.boundPort,
            uptimeMs: Date.now() - startedAtMs,
            checkedAt: new Date().toISOString(),
          }),
        );
        return;
      }
      res.writeHead(426, { "Content-Type": "text/plain" });
      res.end("Upgrade Required");
    });

    this.wss = new WebSocketServer({ noServer: true });

    this.httpServer.on("upgrade", (req, socket, head) => {
      const pathname = req.url?.split("?")[0] ?? "";
      if (pathname !== this.path) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit("connection", ws, req);
      });
    });

    this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
      console.error(`[ws-server] HTTP server error: ${err.message}`);
      // Settle the listen promise first: a consumer awaiting it must fail rather
      // than hang, and this must happen even when the policy below is to exit.
      this.settleListening(err);
      if (err.code === "EADDRINUSE") {
        if (this.onListenError) {
          // A product that embeds the transport decides for itself whether an
          // occupied port is fatal — killing the process is not a library's call.
          this.onListenError(err);
          return;
        }
        console.error(
          `[ws-server] Social WebSocket port ${this.port} is already in use — exiting so the desktop shell can retry`,
        );
        process.exit(1);
      }
    });

    this.wss.on("error", (err: Error) => {
      console.error(`[ws-server] WebSocket server error: ${err.message}`);
    });

    // Wire up nodeService events to WebSocket broadcasts (H1).
    //
    // The policy is DATA: `CORE_EVENT_DISPOSITIONS` is the reusable host's
    // vocabulary, `SOCIAL_EVENT_DISPOSITIONS` is the product's. This loop only
    // applies it. Previously 36 call sites sat here with the routing policy
    // written inline — which is how the transport came to know what a family
    // profile and a family room are (§2.5, §6.1 H1).
    // The host's own vocabulary plus whatever the product supplies. The host
    // does NOT import the product's table: a host that did could not be
    // packaged without it. `index.ts` (the composition root) passes it in.
    const dispositions = mergeEventDispositions(
      CORE_EVENT_DISPOSITIONS,
      options.eventDispositions ?? {},
    );
    const hostHandlers: Record<string, HostEventHandler> = {
      // These two need the socket bookkeeping, so they stay host-side.
      "bridge:status": (data) => this.emitBridgeStatus(data),
      "home:config-updated": (data) => this.emitHomeConfigUpdated(data),
    };
    const delivery: EventDelivery = {
      broadcast: (event, data) => this.emitEvent(event, data),
      toProfile: (profileId, event, data) => this.emitEventToProfile(profileId, event, data),
    };

    if (typeof nodeService.on === "function") {
      console.log(
        `[ws-server] wiring ${Object.keys(dispositions).length} event dispositions`,
      );
      for (const [name, disposition] of Object.entries(dispositions)) {
        nodeService.on(name, (data: unknown) => {
          // `dispatchEvent` warns in non-production for an unknown event or an
          // unknown handler name, so a typo cannot pass as a silent no-op.
          void dispatchEvent(name, disposition, data, delivery, hostHandlers);
        });
      }
    } else {
      console.log(`[ws-server] ERROR: nodeService.on is not a function!`);
    }

    // Phase 38 — voice/video call events (H4 ✅).
    //
    // `onCallEvent` is a **typed channel on the `NodeService` interface**; only
    // the implementation field it delegates to is impl-only. The host was
    // bypassing the interface to reach that field, which is why this line used
    // to need a cast to the concrete implementation class. It does not any more
    // — and no `NodeServiceEvents` change was needed, because call events were
    // never emitter events: they already had a typed channel of their own.
    //
    // Kept explicit rather than folded into the disposition table: the client
    // event *name* is `event.type`, chosen per-event by the payload, so this is
    // not a static disposition.
    nodeService.onCallEvent((event: HostCallEvent) => {
      this.emitEvent(event.type, event);
    });

    this.wss.on("connection", (ws: WebSocket, req: any) => {
      console.log(`[ws-server] Client connected`);
      void this.handleConnection(ws, req);
    });

    this.httpServer.listen(this.port, HOST_WS_BIND_HOST, () => {
      // Learn the real port before settling: with `port: 0` the OS chose it,
      // and `boundPort` is the only way a caller can dial this host.
      const address = this.httpServer?.address();
      if (address && typeof address === "object") {
        this._boundPort = address.port;
      }
      this.settleListening();
      console.log(
        `[ws-server] Listening on ws://127.0.0.1:${this.boundPort}${this.path} (bound ${HOST_WS_BIND_HOST})`,
      );
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        // We use a missed-pongs counter instead of a single isAlive flag
        // so the server can ride out a long `sendHello` dial without
        // tearing down a healthy client. One missed pong is normal under
        // load (libp2p dialing private addresses can monopolize the
        // event loop for tens of seconds); only N consecutive misses
        // (default 3, ~90s of slack) actually terminate.
        const missed = hostState(ws).missedPongs ?? 0;
        if (missed >= this.heartbeatMissedPongsTolerance) {
          console.log(
            `[ws-server] Terminating client after ${missed} consecutive missed pongs`,
          );
          ws.terminate();
          return;
        }
        hostState(ws).missedPongs = missed + 1;
        ws.ping();
      });
    }, this.heartbeatIntervalMs);
  }

  /**
   * Resolve or reject {@link listening}, at most once.
   *
   * Called from the `listening` callback, from a bind error, and from `stop()` —
   * so a consumer awaiting `waitUntilListening()` always settles, and never
   * hangs on a host that failed to bind or was stopped before it could.
   */
  private settleListening(err?: Error): void {
    const pending = this.listeningPending;
    if (!pending) return;
    this.listeningPending = null;
    if (err) pending.reject(err);
    else pending.resolve();
  }

  /**
   * Resolves once the listener is bound (or the host was stopped before it could
   * bind); rejects if it could not bind.
   *
   * Needed for `port: 0`, where the OS picks the port: `boundPort` is only final
   * after this resolves, so a caller that prints a URL or builds a pairing URI
   * must await it — otherwise it publishes port `0`, which nobody can dial.
   */
  waitUntilListening(): Promise<void> {
    return this.listening ?? Promise.resolve();
  }

  /**
   * The port actually bound.
   *
   * Equal to the requested port, except when that was `0` — then this is the
   * port the OS chose. Reports the requested port before the listener is up.
   */
  get boundPort(): number {
    if (this._boundPort !== null) return this._boundPort;
    const address = this.httpServer?.address();
    if (address && typeof address === "object") return address.port;
    return this.port;
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    // A deliberate stop is not a bind failure: settle (don't reject) so an
    // awaiting consumer is released instead of hanging.
    this.settleListening();
    this.wss?.close();
    this.httpServer?.close();
    this.httpServer = null;
  }

  /**
   * Phase 42I — returns true if at least one authenticated thin-client
   * WebSocket is currently connected for `ownerId`.
   *
   * Used to gate VoIP push dispatch: if the phone already has an active
   * WS session, the `call:incoming` event reaches it directly and a VoIP
   * push would only produce a confusing double prompt (in-app overlay +
   * native CallKit). The push fires only when no authenticated client is
   * connected for the owner.
   */
  hasClientForOwner(ownerId: string): boolean {
    for (const id of this.authenticatedClients.values()) {
      if (id === ownerId) return true;
    }
    return false;
  }

  /** Phase 51 — true when any authenticated WS is bound to this family profile. */
  hasClientForProfile(profileId: string): boolean {
    for (const session of this.authenticatedSessions.values()) {
      if (session.scopeKey === profileId) return true;
    }
    return false;
  }

  hasRecentlyActiveClientForProfile(
    profileId: string,
    maxIdleMs: number = 20_000,
  ): boolean {
    if (!this.hasClientForProfile(profileId)) return false;
    const last = this.thinClientLastRpcAtByProfile.get(profileId);
    if (last == null) return false;
    return Date.now() - last <= maxIdleMs;
  }

  /**
   * Phase 51 — force-close authenticated WebSockets locked to a family
   * profile (after deactivate / wipe). Returns how many sockets were closed.
   */
  disconnectClientsForProfile(profileId: string): number {
    const target = profileId.trim();
    if (!target) return 0;
    const toClose: WebSocket[] = [];
    for (const [ws, session] of this.authenticatedSessions) {
      if (session.scopeKey === target) toClose.push(ws);
    }
    for (const ws of toClose) {
      try {
        ws.close(4001, "family profile revoked");
      } catch {
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
      }
    }
    return toClose.length;
  }

  /**
   * EM-R — force-close authenticated WebSockets bound to a thin-client
   * deviceId (after `revokeThinClient`). Returns how many sockets were closed.
   *
   * Self-revoke: when the device being revoked is the session that is
   * *currently executing* this RPC (tracked via `activeRpcWs`), the close is
   * deferred until the RPC handler has written its JSON-RPC response
   * (`flushDeferredDeviceClose` runs right after `sendResponse`). Closing
   * synchronously would race the response out of a CLOSING socket. Every
   * other device closes synchronously, exactly as before.
   */
  disconnectClientsForDevice(deviceId: string): number {
    const target = deviceId.trim();
    if (!target) return 0;
    const toClose: WebSocket[] = [];
    for (const [ws, session] of this.authenticatedSessions) {
      if (session.deviceId === target) toClose.push(ws);
    }
    const selfInvocation = this.activeRpcWs.getStore();
    for (const ws of toClose) {
      if (selfInvocation && ws === selfInvocation.ws) {
        // The caller's own socket is mid-RPC: park the close here and let the
        // parking RPC's handler close it immediately after sendResponse.
        this.deferredDeviceClose.set(ws, selfInvocation);
        continue;
      }
      try {
        ws.close(4001, "device revoked");
      } catch {
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
      }
    }
    return toClose.length;
  }

  /** EM-R — close a socket parked by `disconnectClientsForDevice` (called right after the parking RPC's response is sent). */
  private flushDeferredDeviceClose(ws: WebSocket, invocation: RpcInvocation): void {
    if (this.deferredDeviceClose.get(ws) !== invocation) return;
    this.deferredDeviceClose.delete(ws);
    try {
      ws.close(4001, "device revoked");
    } catch {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * True when EnvoyGo is connected AND recently sent an RPC (default 20s).
   * Used for chat/bond/feed push skip-if-online — a zombie background WS
   * without recent RPCs must NOT suppress pushes (iOS suspends JS; the
   * TCP socket can linger while the app cannot show in-app events).
   */
  hasRecentlyActiveClientForOwner(
    ownerId: string,
    maxIdleMs: number = 20_000,
  ): boolean {
    if (!this.hasClientForOwner(ownerId)) return false;
    const last = this.thinClientLastRpcAt.get(ownerId);
    if (last == null) return false;
    return Date.now() - last <= maxIdleMs;
  }

  private async handleConnection(ws: WebSocket, req?: any): Promise<void> {
    const clientId = randomUUID();

    // Notify connection change
    this.onConnectionChange?.(this.wss.clients.size);

    // Where this socket came from. Recorded before any gate decision, because it is
    // the one fact that separates the owner's own UI (loopback) from a device on the
    // network — see the gate in `dispatchRpc`.
    hostState(ws).isLoopbackPeer = isLoopbackAddress(req?.socket?.remoteAddress);

    // The message handler is attached **now**, before the auth await, and the auth
    // state is awaited inside it. Otherwise a frame that arrives while
    // `resolveSession` is still running is emitted with no listener attached and is
    // *silently dropped* — `ws` is an EventEmitter, and an event with no listener does
    // not queue. A client that sends on `open` then loses its first request and hangs
    // until it times out. (Found by verifying a real product attach against a running
    // node: the socket authenticated, the request never arrived, the caller timed out.)
    let settleAuth: () => void = () => undefined;
    const authSettled = new Promise<void>((resolve) => {
      settleAuth = resolve;
    });
    // The listener is attached *here*, and the dispatching handler is installed later
    // (it is a big function that reads the auth state). Frames that arrive in between
    // are queued rather than dropped, because an EventEmitter emits into nothing when
    // no listener is attached.
    let handleRpc: ((data: Buffer) => void) | null = null;
    const queuedRpc: Buffer[] = [];
    ws.on("message", (data: Buffer) => {
      if (!handleRpc) {
        queuedRpc.push(data);
        return;
      }
      handleRpc(data);
    });

    // Extract session token from query string.
    // Three states: no token (legacy client), valid token (thin-client), invalid token.
    let isAuthenticated = false;
    let hadToken = false;
    try {
      const url = new URL(req?.url ?? "/ws", "ws://localhost");
      const token = url.searchParams.get("token")?.trim();
      if (token) {
        hadToken = true;
        // H2 — the host asks one question and the product answers it. No
        // family-profile lookup, no binding repair, no `as any` casts: those
        // live in the injected resolver (`social-ws-policy.ts`).
        const resolved = await this._sessionIdentity.resolveSession(token);
        if (resolved) {
          isAuthenticated = true;
          this.authenticatedClients.set(ws, resolved.ownerId);
          this.authenticatedSessions.set(ws, resolved);
          // Do NOT prime thinClientLastRpcAt* here. Auth alone must not
          // suppress push (Android background reconnects would look "online"
          // for 20s with zero user RPCs). Freshness updates only on real RPCs.
          console.log(
            `[ws-server] Client ${clientId} authenticated via session token ` +
              `(owner: ${resolved.ownerId}, scope: ${resolved.scopeKey})`,
          );
        }
      }
    } catch {
      // URL parsing failed — treat as unauthenticated.
    }

    // Release any message that arrived while the token was being resolved.
    settleAuth();
    // Store auth state on the ws object.
    hostState(ws).isThinClientAuthenticated = isAuthenticated;
    // Track whether a token was attempted — only gate clients that
    // tried to use a token but had an invalid one. Clients without
    // any token (Social UI, Capacitor app) are legacy and unrestricted.
    hostState(ws).hadThinClientToken = hadToken;

    // Initialize subscription tracking for this client
    this.clientSubscriptions.set(ws, new Set());

    const onRpcMessage = async (data: Buffer): Promise<void> => {
      // Wait for the token to be resolved: the gate below reads that state, and this
      // handler may already be running for a frame that beat the resolver.
      await authSettled;
      try {
        const message = JSON.parse(data.toString()) as JsonRpcRequest;
        // Thin-client RPC activity — drives push skip-if-online freshness.
        const ownerId = this.authenticatedClients.get(ws);
        const session = this.authenticatedSessions.get(ws);
        if (ownerId && message.method !== "on" && message.method !== "off") {
          this.thinClientLastRpcAt.set(ownerId, Date.now());
        }
        if (session && message.method !== "on" && message.method !== "off") {
          this.thinClientLastRpcAtByProfile.set(session.scopeKey, Date.now());
          // Throttle lastSeenAt writes (~30s) so presence stays fresh without hammering disk.
          const lastTouch = this._lastSeenWriteAtByProfile.get(session.scopeKey) ?? 0;
          if (Date.now() - lastTouch > 30_000) {
            this._lastSeenWriteAtByProfile.set(session.scopeKey, Date.now());
            this._sessionIdentity.noteSessionActivity?.(session);
          }
        }
        // Record owner activity for online/offline detection,
        // but skip subscription on/off RPCs — they're infrastructure, not user actions.
        if (message.method !== "on" && message.method !== "off") {
          this.nodeService.noteClientActivity();
        }
        this.dispatchRpc(ws, message);
      } catch (error) {
        console.error("[ws-server] Error handling message:", error);
        this.sendError(ws, "unknown", "Failed to process message");
      }
    };
    handleRpc = (data: Buffer) => {
      void onRpcMessage(data);
    };
    for (const pending of queuedRpc.splice(0)) {
      handleRpc(pending);
    }

    ws.on("close", () => {
      console.log(`[ws-server] Client ${clientId} disconnected`);
      // Clean up auth tracking.
      const ownerId = this.authenticatedClients.get(ws);
      this.authenticatedClients.delete(ws);
      const session = this.authenticatedSessions.get(ws);
      this.authenticatedSessions.delete(ws);
      // Drop any parked EM-R self-revoke close (socket is already gone).
      this.deferredDeviceClose.delete(ws);
      if (ownerId && !this.hasClientForOwner(ownerId)) {
        this.thinClientLastRpcAt.delete(ownerId);
      }
      if (session && !this.hasClientForProfile(session.scopeKey)) {
        this.thinClientLastRpcAtByProfile.delete(session.scopeKey);
      }
      // Clean up subscriptions
      const subs = this.clientSubscriptions.get(ws);
      if (subs) {
        for (const event of subs) {
          const listeners = this.subscriptions.get(event);
          if (listeners) {
            listeners.delete(ws);
          }
        }
        this.clientSubscriptions.delete(ws);
      }
      this._socketMethods?.closed?.(ws);
      // Notify connection change (after cleanup, count does not include this client)
      this.onConnectionChange?.(this.wss.clients.size);
    });

    ws.on("error", (error: Error) => {
      console.error(`[ws-server] Client ${clientId} error:`, error);
    });

    // Track client for heartbeat. The counter resets on every pong the
    // server receives; missedPongs only climbs when pong responses stall
    // (e.g. the node's event loop is busy with a long sendHello dial).
    hostState(ws).missedPongs = 0;
    ws.on("pong", () => {
      hostState(ws).missedPongs = 0;
    });

    // Auto-subscribe to all events for this client (push all events without explicit "on" subscription)
    const allEvents = [
      "hello:request",
      "hello:response",
      "social.intro:propose",
      "feed:notify",
      "content:engage",
      "share:agent-proposed",
      "chat:message",
      "chat:delivered",
      "chat:room-updated",
      "chat:room-removed",
      "chat:room-message",
      "chat:draft",
      "chat:auto-reply-paused",
      "agent:activity",
      "bond:established",
      "bond:revoked",
      "profile:updated",
      "node:status",
      "node:online",
      "node:offline",
      "peer:discovered",
      "peer:lost",
      "bridge:status",
      "p2p:envelope",
      "crdt:sync",
      "discovery:multihop-update",
      "trigger:fired",
      "digest:ready",
      "homeclawCoreWs:rx",
      "homeTerminalWs:rx",
      "terminal:rx",
      "homeTerminalWs:closed",
      "terminal:session-updated",
      "terminal:watch-ready",
      "terminal:assistant-proposal",
      // Phase 49D — Pi tool-action confirm dialog
      "pi:proposal",
      // Envoy Harness (coding chat / TUI docks)
      "eh:turn_started",
      "eh:turn_token",
      "eh:turn_complete",
      "eh:turn_hints",
      "eh:prompt_busy",
      "eh:activity",
      "eh:files_changed",
      "eh:permission",
      "eh:user_question",
      "eh:timeline",
      // Phase 38 — voice/video call events
      "call:incoming",
      "call:reinvite",
      "call:answered",
      "call:rejected",
      "call:ended",
      "call:remote-mute",
      "call:ice-candidate",
      "call:error",
    ];
    // Only for a socket that may receive events at all. A tokenless client from the network is not
    // one: its subscription list would be filled the moment the node emitted. Authentication is
    // resolved at connect from the query token (above), so nothing legitimate lands here later.
    if (canReceiveEvents(hostState(ws))) {
      for (const event of allEvents) {
        this.subscribe(ws, event);
      }
    }

    // Send connected event — to a socket that may receive events, for the same reason as above: it
    // carries the node's peer id and addresses, which is the owner's information, and an
    // unauthenticated client on the network has no business learning it. A client that paired with a
    // token is authenticated by this point (the token is resolved at connect), so phones still get it.
    if (canReceiveEvents(hostState(ws))) {
      const status = this.nodeService.getConnectionStatus();
      this.sendEvent(ws, "connected", {
        peerId: status.peerId,
        multiaddrs: status.multiaddrs,
      });
    }

    // desktop clients register `on("node:status")` via RPC asynchronously; daemon may have
    // emitted running before WsServer listeners existed — replay snapshot after subscriptions settle.
    setTimeout(() => {
      try {
        // Both members are on `NodeService` — no cast needed (H4).
        const cs = this.nodeService.getConnectionStatus();
        const payload: { status: HostNodeStatus; peerId?: string } = {
          status: this.nodeService.getNodeStatus(),
        };
        if (cs.peerId) payload.peerId = cs.peerId;
        // Gated here too, and this one was found by a **consumer's** smoke test rather than by the
        // tests written for this fix: `emitEvent` was guarded, but `node:ready` goes straight to the
        // socket, so a tokenless client on the LAN still received it — the leak surviving in the one
        // push that does not travel through the delivery table. A guard on the paths you thought of is
        // not a guard on the path you did not.
        if (ws.readyState === WebSocket.OPEN && canReceiveEvents(hostState(ws))) {
          this.emitEvent("node:status", payload);
          if (payload.status === "running") {
            this.sendEvent(ws, "node:ready", { timestamp: Date.now() });
          }
        }
      } catch (e) {
        console.warn("[ws-server] deferred node:status snapshot failed:", e);
      }
    }, 350);
  }

  /**
   * Fast read RPCs (listChatHistory, getPeerConnectionInfo, …) run concurrently.
   * Dial/send RPCs serialize per WebSocket so one slow warm does not block reads.
   */
  private dispatchRpc(ws: WebSocket, message: JsonRpcRequest): void {
    const run = () =>
      this.handleMessage(ws, message).catch((error) => {
        console.error("[ws-server] RPC failed:", error);
        if (message.id !== undefined) {
          this.sendError(ws, message.id, "Failed to process message");
        }
      });

    if (this._shouldSerializeMethod(message.method)) {
      const prev = this.slowRpcTail.get(ws) ?? Promise.resolve();
      const next = prev.then(run);
      this.slowRpcTail.set(
        ws,
        next.then(
          () => undefined,
          () => undefined,
        ),
      );
      return;
    }

    void run();
  }

  private async handleMessage(ws: WebSocket, message: JsonRpcRequest): Promise<void> {
    const { id, method, params } = message;

    // Gate: a caller must be **the owner's machine** or hold a valid session.
    //
    // This used to be weaker: auth was enforced only for clients that *attempted* a
    // token and failed, so a client with no token was unrestricted regardless of
    // where it connected from — and the host binds `0.0.0.0` so paired phones can
    // reach it, which meant any device on the network could read the owner's surface
    // (verified: `listFamilyProfiles` answered an unauthenticated client on the LAN).
    // The stated reason was "Social UI, Capacitor app … legacy and unrestricted"; the
    // Capacitor app has since been deleted, and the Social UI connects over loopback,
    // so loopback-or-session preserves every legitimate flow and closes the rest.
    const isAuth = hostState(ws).isThinClientAuthenticated === true;
    const hadToken = hostState(ws).hadThinClientToken === true;
    const isLoopbackPeer = hostState(ws).isLoopbackPeer === true;
    // The strongest gate: a method that hands out a session may not be reachable from
    // the network at all, authenticated or not. Checked before the general gate so the
    // refusal is unambiguous — "not from this machine" is a different answer from
    // "authenticate first", and a caller should be able to tell them apart.
    if (this._loopbackOnlyMethods.has(method) && !isLoopbackPeer) {
      this.sendError(
        ws,
        id ?? "unknown",
        "This can only be done from the machine running the node",
        "UNAUTHORIZED",
      );
      return;
    }
    // Methods a client may call before authenticating are **product data**
    // (`preAuthMethods`), not names written here — EnvoyMesh's are the pairing
    // call and the family-invite preview, and the host does not know that.
    if (!this._preAuthMethods.has(method)) {
      const refuse = (hadToken && !isAuth) || (!isAuth && !isLoopbackPeer && this._requireAuthForNonLoopback);
      if (refuse) {
        // Use the explicit UNAUTHORIZED code so the EnvoyGo mobile client
        // can map this to a typed `UnauthorizedException` and stop
        // treating it as a transient transport failure. The message
        // string is unchanged for back-compat with older EnvoyGo builds.
        this.sendError(ws, id ?? "unknown", "Authentication required", "UNAUTHORIZED");
        return;
      }
    }

    // Event subscription, **after** the gate. It used to sit at the top of this method, which made
    // `on` a way to subscribe without ever authenticating — while `emitEvent` delivered to whatever
    // was subscribed. A subscription is a standing request for data, so it answers to the same rule
    // as a read: the owner's machine, or a session.
    if (method === "on") {
      const eventName = (params?.event as string) ?? "";
      this.subscribe(ws, eventName);
      this.sendResponse(ws, id, { success: true });
      return;
    }

    if (method === "off") {
      const eventName = (params?.event as string) ?? "";
      this.unsubscribe(ws, eventName);
      this.sendResponse(ws, id, { success: true });
      return;
    }

    // Product methods that need the connection itself. The host does not know
    // what they are or how many there are: `socketMethods.handle` answers, and
    // `true` means "already replied, stop" (§2.5 (c)).
    //
    // They hand the caller a **live stream** — a terminal, an agent core — so they
    // require the owner's scope, and that check has to live here rather than in the
    // dispatcher: `socketMethods` runs *before* it, which is also where a product's
    // allow-list lives. Without this, an attached product or a family session could open
    // a terminal through the one path that has no allow-list at all. A tokenless client
    // is the owner's own UI, which is why an absent session is allowed.
    const socketSession = this.authenticatedSessions.get(ws);
    if (this._socketMethods && socketSession && socketSession.isOwnerScope !== true) {
      this.sendError(ws, id ?? "unknown", "Only the node owner can do that", "UNAUTHORIZED");
      return;
    }
    if (this._socketMethods) {
      const handled = await this._socketMethods.handle({
        connection: ws,
        method,
        params: params ?? {},
        session: this.authenticatedSessions.get(ws),
        send: (event, data) => this.sendEvent(ws, event, data),
        ok: (result) => this.sendResponse(ws, String(id), result),
        fail: (message) =>
          this.sendResponse(ws, String(id), { ok: false, error: message }),
      });
      if (handled) return;
    }

    // Route RPC to NodeService
    // The activeRpcWs context lets `revokeThinClient` know when it is running
    // on the caller's own socket so a self-revoke defers its close until the
    // response below is written (see disconnectClientsForDevice). The per-
    // invocation token stops a concurrent read RPC on the same socket from
    // flushing the parked close early.
    const invocation: RpcInvocation = { ws };
    try {
      const result = await this.activeRpcWs.run(invocation, () =>
        this.routeToNodeService(ws, method, params ?? {}),
      );
      this.sendResponse(ws, id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendResponse(ws, id, undefined, { code: rpcErrorCode(errorMessage), message: errorMessage });
    } finally {
      this.flushDeferredDeviceClose(ws, invocation);
    }
  }

  private async routeToNodeService(
    ws: WebSocket,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const session = this.authenticatedSessions.get(ws);
    // The dispatcher owns the caller context and the authorisation policy; the
    // host only says *who* is asking, never *what they may do*.
    return this._dispatch(method, params, session);
  }

  /**
   * Phase 51 — broadcast config with per-session caller identity + secret redaction.
   * Never forward the emitter's `callerFamilyProfileId` (usually owner) to family
   * member sessions — that flipped EnvoyGo Mom/Dad devices to Owner.
   */
  private async emitHomeConfigUpdated(data: unknown): Promise<void> {
    // The host no longer inspects the payload. It used to read `data.config` to
    // decide whether there was anything to stamp; the *shape* of a config is
    // product knowledge, and the decision now belongs to `transformForSession`,
    // which returns the payload unchanged when there is nothing to stamp.
    await this.emitToSubscribers("home:config-updated", data);
  }

  /**
   * Deliver one event to this event's subscribers, transformed per session.
   *
   * ## A throwing transform denies one socket, not the whole fan-out
   *
   * The per-session policy is product code, and product code can throw. The first
   * version of this loop `await`ed the transform with no guard, so a throw aborted
   * delivery for **every subscriber after the failing one** — including the owner —
   * and surfaced as an unhandled rejection, because the caller is
   * `void dispatchEvent(…)` in the disposition loop.
   *
   * The fail mode is *closed*: the payload is **not** sent to the socket whose
   * transform threw. There is no generic "restricted" form of an arbitrary event,
   * so the host cannot mask it on the product's behalf — and sending the raw
   * payload is precisely the leak this per-session path exists to prevent.
   */
  private async emitToSubscribers(event: string, data: unknown): Promise<void> {
    const listeners = this.subscriptions.get(event);
    if (!listeners) return;
    for (const ws of listeners) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      let payload: unknown;
      try {
        payload = await this.transformForSession(event, data, this.authenticatedSessions.get(ws));
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[ws-server] per-session policy for "${event}" threw — dropping it for one ` +
              "client rather than delivering the untransformed payload:",
            error,
          );
        }
        continue;
      }
      this.sendEvent(ws, event, payload);
    }
  }

  /**
   * Fan out bridge:status with per-session `enabled` masking.
   * Family profiles without `extAgentEnabled` must never see enabled:true
   * (otherwise EnvoyGo re-shows the Ext Agent chat row after a real push).
   */
  private async emitBridgeStatus(data: unknown): Promise<void> {
    // Masking is the product's rule now; see `social-session-delivery.ts`.
    await this.emitToSubscribers("bridge:status", data);
  }

  /**
   * Apply the product's per-session policy, or pass the payload through.
   *
   * A session-less socket (a client that has not authenticated) gets the raw
   * payload: the host has nobody to ask the product about, and every path that
   * reaches here has already passed the caller's own gates.
   */
  private async transformForSession(
    event: string,
    data: unknown,
    session: HostSession<TCaller> | undefined,
  ): Promise<unknown> {
    if (!session || !this._transformForSession) return data;
    return this._transformForSession(event, data, session);
  }

  // ============================================
  // Event Subscription Management
  // ============================================

  private subscribe(ws: WebSocket, event: string): void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(ws);

    const clientSubs = this.clientSubscriptions.get(ws);
    if (clientSubs) {
      clientSubs.add(event);
    }
  }

  private unsubscribe(ws: WebSocket, event: string): void {
    const listeners = this.subscriptions.get(event);
    if (listeners) {
      listeners.delete(ws);
    }

    const clientSubs = this.clientSubscriptions.get(ws);
    if (clientSubs) {
      clientSubs.delete(event);
    }
  }

  /**
   * Emit an event to all subscribed clients
   */
  emitEvent(event: string, data: unknown): void {
    const listeners = this.subscriptions.get(event);
    if (listeners) {
      for (const ws of listeners) {
        // Checked here as well as at subscription time: this is the line that actually writes the
        // owner's data to a socket, and a subscription list is not a permission.
        if (ws.readyState === WebSocket.OPEN && canReceiveEvents(hostState(ws))) {
          this.sendEvent(ws, event, data);
        }
      }
    }
  }

  /**
   * Phase 51 — emit an event only to WebSocket clients bound to `profileId`.
   * Local Social clients (no session token) are treated as the owner profile.
   */
  emitEventToProfile(profileId: string, event: string, data: unknown): void {
    const target = profileId.trim() || this._localScopeKey;
    const listeners = this.subscriptions.get(event);
    if (!listeners) return;
    for (const ws of listeners) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (!canReceiveEvents(hostState(ws))) continue;
      const session = this.authenticatedSessions.get(ws);
      if (!session) {
        // Untokened local clients (desktop Social) → owner only.
        if (target === this._localScopeKey) {
          this.sendEvent(ws, event, data);
        }
        continue;
      }
      if (session.scopeKey === target) {
        this.sendEvent(ws, event, data);
      }
    }
  }

  // ============================================
  // Message Sending Helpers
  // ============================================

  private sendResponse(ws: WebSocket, id: string, result?: unknown, error?: { code: string; message: string }): void {
    const response: JsonRpcResponse = { id };
    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }
    ws.send(JSON.stringify(response));
  }

  private sendError(ws: WebSocket, id: string, message: string, code: string = "ERROR"): void {
    this.sendResponse(ws, id, undefined, { code, message });
  }

  private sendEvent(ws: WebSocket, event: string, data: unknown): void {
    const message: JsonRpcEvent = { event, data };
    ws.send(JSON.stringify(message));
  }
}

// `createWsServer(port?, path?)` used to live here: a two-line wrapper around the
// constructor that nothing in the repo ever called. It is not exported from this
// package — a factory that cannot supply the required `WsServerOptions` is a
// trap on a new public surface, and `new WsServer(port, path)` is already the
// whole of it.

