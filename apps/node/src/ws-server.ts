import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import type {
  JsonRpcEvent,
  JsonRpcRequest,
  JsonRpcResponse,
  RpcMethods,
} from "@envoymesh/api";
import type { NodeService } from "@envoymesh/api";
import { NodeServiceImpl } from "./node-service-impl.js";
import { routeRpcMethod } from "./json-rpc-router.js";
import {
  runWithRpcCaller,
  localOwnerCaller,
  sessionCallerFromToken,
  stampConfigCallerForSession,
  type RpcCallerContext,
} from "./rpc-caller-context.js";
import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api";
import {
  parseAiBotThreadKey,
  parseBridgeThreadKey,
  parseEnvoyAiProfileId,
  parseFamilyThreadKey,
  isEnvoyAiThreadKey,
} from "@envoymesh/api";
import { SOCIAL_WS_BIND_HOST, TERMINAL_WS_PORT } from "./service-ports.js";
import {
  closeHomeClawCoreWsForCompanion,
  rpcHomeClawCoreWsClose,
  rpcHomeClawCoreWsOpen,
  rpcHomeClawCoreWsSend,
} from "./homeclaw-core-ws.js";
import {
  closeHomeTerminalWsForCompanion,
  rpcHomeTerminalWsClose,
  rpcHomeTerminalWsOpen,
  rpcHomeTerminalWsSend,
} from "./home-terminal-ws.js";
import { isSerializedWsRpcMethod } from "./ws-rpc-concurrency.js";


/**
 * WebSocket server that exposes NodeService via JSON-RPC protocol.
 *
 * Protocol:
 * - Client sends: { id: "msg_123", method: "sendHello", params: { ... } }
 * - Server responds: { id: "msg_123", result: { ... } }
 * - Server pushes events: { event: "hello:request", data: { ... } }
 */
export class WsServer {
  private wss!: WebSocketServer;
  private httpServer: HttpServer | null = null;
  private nodeService!: NodeService;
  private readonly subscriptions = new Map<string, Set<WebSocket>>();
  private readonly clientSubscriptions = new Map<WebSocket, Set<string>>();
  /** Track authenticated thin-client sessions (ws → ownerId). */
  private readonly authenticatedClients = new Map<WebSocket, string>();
  /** Phase 51 — thin-client session caller context (ws → profile binding). */
  private readonly authenticatedSessions = new Map<WebSocket, RpcCallerContext>();
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
   * Optional WAN readiness probe for GET /readyz.
   * /health stays process-liveness only; /readyz may 503 without a live
   * circuit-relay reservation on CGNAT/wan profiles.
   */
  private getReadyz?: () => { ready: boolean; reason?: string };
  /** Per-client queue tail for dial/send RPCs (reads run concurrently). */
  private readonly slowRpcTail = new WeakMap<WebSocket, Promise<void>>();

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
   * Start the WebSocket server
   */
  start(nodeService: NodeService): void {
    this.nodeService = nodeService;

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
            port: this.port,
            uptimeMs: Date.now() - startedAtMs,
            checkedAt: new Date().toISOString(),
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
            port: this.port,
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
      if (err.code === "EADDRINUSE") {
        console.error(
          `[ws-server] Social WebSocket port ${this.port} is already in use — exiting so the desktop shell can retry`,
        );
        process.exit(1);
      }
    });

    this.wss.on("error", (err: Error) => {
      console.error(`[ws-server] WebSocket server error: ${err.message}`);
    });

    // Wire up nodeService events to WebSocket broadcasts
    const nodeServiceImpl = nodeService as NodeServiceImpl;
    console.log(`[ws-server] start: nodeServiceImpl has 'on' method?`, typeof nodeServiceImpl.on);
    if (nodeServiceImpl.on) {
      console.log(`[ws-server] wiring up event handlers`);
      nodeServiceImpl.on("hello:request", (data: unknown) => this.emitEvent("hello:request", data));
      nodeServiceImpl.on("hello:response", (data: unknown) => this.emitEvent("hello:response", data));
      nodeServiceImpl.on("share:agent-proposed", (data: unknown) =>
        this.emitEvent("share:agent-proposed", data),
      );
      nodeServiceImpl.on("chat:message", (data: unknown) => {
        const targets = resolveChatMessageTargetProfiles(data);
        if (targets.length === 0) {
          this.emitEventToProfile(OWNER_FAMILY_PROFILE_ID, "chat:message", data);
        } else {
          for (const profileId of targets) {
            this.emitEventToProfile(profileId, "chat:message", data);
          }
        }
      });
      nodeServiceImpl.on("chat:delivered", (data: unknown) => this.emitEvent("chat:delivered", data));
      // Mesh rooms are owner-only — never broadcast to family-member WS sessions.
      nodeServiceImpl.on("chat:room-updated", (data: unknown) =>
        this.emitEventToProfile(OWNER_FAMILY_PROFILE_ID, "chat:room-updated", data),
      );
      nodeServiceImpl.on("chat:room-removed", (data: unknown) =>
        this.emitEventToProfile(OWNER_FAMILY_PROFILE_ID, "chat:room-removed", data),
      );
      nodeServiceImpl.on("chat:room-message", (data: unknown) =>
        this.emitEventToProfile(OWNER_FAMILY_PROFILE_ID, "chat:room-message", data),
      );
      // Phase 51D — family rooms are profile-scoped (never broadcast to all WS clients).
      // Remap to the same event names/shapes as mesh rooms so EnvoyGo/Social
      // handlers stay shared (`chat:room-updated` payload = room object).
      nodeServiceImpl.on("chat:family-room-updated", (data: unknown) => {
        const row = data as { targetProfileId?: string; room?: unknown };
        const profileId = row?.targetProfileId?.trim();
        if (!profileId || row.room == null) return;
        this.emitEventToProfile(profileId, "chat:room-updated", row.room);
      });
      nodeServiceImpl.on("chat:family-room-message", (data: unknown) => {
        const row = data as {
          targetProfileId?: string;
          roomId?: string;
          message?: unknown;
        };
        const profileId = row?.targetProfileId?.trim();
        if (!profileId) return;
        this.emitEventToProfile(profileId, "chat:room-message", {
          roomId: row.roomId,
          message: row.message,
          kind: "family",
        });
      });
      nodeServiceImpl.on("chat:draft", (data: unknown) =>
        this.emitEventToProfile(OWNER_FAMILY_PROFILE_ID, "chat:draft", data),
      );
      nodeServiceImpl.on("chat:auto-reply-paused", (data: unknown) =>
        this.emitEvent("chat:auto-reply-paused", data),
      );
      nodeServiceImpl.on("agent:activity", (data: unknown) =>
        this.emitEventToProfile(OWNER_FAMILY_PROFILE_ID, "agent:activity", data),
      );
      nodeServiceImpl.on("bond:established", (data: unknown) => this.emitEvent("bond:established", data));
      nodeServiceImpl.on("bond:revoked", (data: unknown) => this.emitEvent("bond:revoked", data));
      nodeServiceImpl.on("profile:updated", (data: unknown) => this.emitEvent("profile:updated", data));
      nodeServiceImpl.on("node:status", (data: unknown) => this.emitEvent("node:status", data));
      nodeServiceImpl.on("node:online", (data: unknown) => this.emitEvent("node:online", data));
      nodeServiceImpl.on("node:ready", (data: unknown) => this.emitEvent("node:ready", data));
      nodeServiceImpl.on("node:offline", (data: unknown) => this.emitEvent("node:offline", data));
      nodeServiceImpl.on("bridge:status", (data: unknown) => this.emitEvent("bridge:status", data));
      nodeServiceImpl.on("config:updated", (data: unknown) =>
        this.emitEvent("config:updated", data),
      );
      nodeServiceImpl.on("home:config-updated", (data: unknown) =>
        this.emitHomeConfigUpdated(data),
      );
      nodeServiceImpl.on("home:bonds-updated", (data: unknown) =>
        this.emitEvent("home:bonds-updated", data),
      );
      nodeServiceImpl.on("home:agent-cards-updated", (data: unknown) =>
        this.emitEvent("home:agent-cards-updated", data),
      );
      nodeServiceImpl.on("p2p:envelope", (data: unknown) => this.emitEvent("p2p:envelope", data));
      nodeServiceImpl.on("crdt:sync", (data: unknown) => this.emitEvent("crdt:sync", data));
      nodeServiceImpl.on("discovery:multihop-update", (data: unknown) =>
        this.emitEvent("discovery:multihop-update", data),
      );
      nodeServiceImpl.on("peer:discovered", (data: unknown) => this.emitEvent("peer:discovered", data));
      nodeServiceImpl.on("peer:lost", (data: unknown) => this.emitEvent("peer:lost", data));
      // Phase 25A — Mesh awareness insights
      nodeServiceImpl.on("agent:awareness", (data: unknown) => this.emitEvent("agent:awareness", data));
      nodeServiceImpl.on("terminal:session-updated", (data: unknown) =>
        this.emitEvent("terminal:session-updated", data),
      );
      nodeServiceImpl.on("terminal:watch-ready", (data: unknown) =>
        this.emitEvent("terminal:watch-ready", data),
      );
      nodeServiceImpl.on("terminal:assistant-proposal", (data: unknown) =>
        this.emitEvent("terminal:assistant-proposal", data),
      );
      // Phase 49D — Pi tool-action confirm dialog.
      nodeServiceImpl.on("pi:proposal", (data: unknown) =>
        this.emitEvent("pi:proposal", data),
      );
      // Phase 25C — Digest ready notification
      // digest:ready not in NodeServiceEvents type — emit directly
      // Phase 38 — Voice/Video Call events
      nodeServiceImpl.callManager.onCallEvent((event) => {
        this.emitEvent(event.type, event);
      });
    } else {
      console.log(`[ws-server] ERROR: nodeServiceImpl.on is not a function!`);
    }

    this.wss.on("connection", (ws: WebSocket, req: any) => {
      console.log(`[ws-server] Client connected`);
      void this.handleConnection(ws, req);
    });

    this.httpServer.listen(this.port, SOCIAL_WS_BIND_HOST, () => {
      console.log(
        `[ws-server] Listening on ws://127.0.0.1:${this.port}${this.path} (bound ${SOCIAL_WS_BIND_HOST})`,
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
        const missed = ((ws as any).missedPongs as number | undefined) ?? 0;
        if (missed >= this.heartbeatMissedPongsTolerance) {
          console.log(
            `[ws-server] Terminating client after ${missed} consecutive missed pongs`,
          );
          ws.terminate();
          return;
        }
        (ws as any).missedPongs = missed + 1;
        ws.ping();
      });
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
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
      if (session.profileId === profileId) return true;
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
      if (session.profileId === target) toClose.push(ws);
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

    // Extract session token from query string.
    // Three states: no token (legacy client), valid token (thin-client), invalid token.
    let isAuthenticated = false;
    let hadToken = false;
    try {
      const url = new URL(req?.url ?? "/ws", "ws://localhost");
      const token = url.searchParams.get("token")?.trim();
      if (token) {
        hadToken = true;
        // Validate against session token store.
        const record = await (this.nodeService as any).lookupSessionToken?.(token);
        if (record) {
          isAuthenticated = true;
          this.authenticatedClients.set(ws, record.ownerId);
          // Prefer boundFamilyProfileId when profileId was corrupted to owner.
          let session = sessionCallerFromToken(record);
          try {
            const profiles = await (this.nodeService as any).listFamilyProfiles?.();
            const match = profiles?.profiles?.find(
              (p: { id: string }) => p.id === session.profileId,
            );
            if (match) {
              session = sessionCallerFromToken({
                ...record,
                profileId: session.profileId,
                isOwnerProfile: match.isOwner === true,
              });
            }
          } catch {
            /* keep heuristic */
          }
          // Persist heal so later reconnects / push keep using Mom/Dad.
          if (
            session.profileId !== OWNER_FAMILY_PROFILE_ID &&
            (record.profileId?.trim() ?? OWNER_FAMILY_PROFILE_ID) ===
              OWNER_FAMILY_PROFILE_ID
          ) {
            void (this.nodeService as NodeServiceImpl)
              .healSessionProfileFromBinding?.(record, session.profileId)
              .catch(() => {
                /* best-effort; this WS already uses the healed profile */
              });
          }
          this.authenticatedSessions.set(ws, session);
          // Do NOT prime thinClientLastRpcAt* here. Auth alone must not
          // suppress push (Android background reconnects would look "online"
          // for 20s with zero user RPCs). Freshness updates only on real RPCs.
          console.log(
            `[ws-server] Client ${clientId} authenticated via session token (owner: ${record.ownerId}, profile: ${session.profileId})`,
          );
        }
      }
    } catch {
      // URL parsing failed — treat as unauthenticated.
    }

    // Store auth state on the ws object.
    (ws as any).isThinClientAuthenticated = isAuthenticated;
    // Track whether a token was attempted — only gate clients that
    // tried to use a token but had an invalid one. Clients without
    // any token (Social UI, Capacitor app) are legacy and unrestricted.
    (ws as any).hadThinClientToken = hadToken;

    // Initialize subscription tracking for this client
    this.clientSubscriptions.set(ws, new Set());

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as JsonRpcRequest;
        // Thin-client RPC activity — drives push skip-if-online freshness.
        const ownerId = this.authenticatedClients.get(ws);
        const session = this.authenticatedSessions.get(ws);
        if (ownerId && message.method !== "on" && message.method !== "off") {
          this.thinClientLastRpcAt.set(ownerId, Date.now());
        }
        if (session && message.method !== "on" && message.method !== "off") {
          this.thinClientLastRpcAtByProfile.set(session.profileId, Date.now());
          // Throttle lastSeenAt writes (~30s) so presence stays fresh without hammering disk.
          const lastTouch = this._lastSeenWriteAtByProfile.get(session.profileId) ?? 0;
          if (Date.now() - lastTouch > 30_000) {
            this._lastSeenWriteAtByProfile.set(session.profileId, Date.now());
            void (this.nodeService as NodeServiceImpl).touchFamilyProfileLastSeen?.(
              session.profileId,
            );
          }
        }
        // Record owner activity for online/offline detection,
        // but skip subscription on/off RPCs — they're infrastructure, not user actions.
        if (message.method !== "on" && message.method !== "off") {
          this.nodeService.recordOwnerActivity();
        }
        this.dispatchRpc(ws, message);
      } catch (error) {
        console.error("[ws-server] Error handling message:", error);
        this.sendError(ws, "unknown", "Failed to process message");
      }
    });

    ws.on("close", () => {
      console.log(`[ws-server] Client ${clientId} disconnected`);
      // Clean up auth tracking.
      const ownerId = this.authenticatedClients.get(ws);
      this.authenticatedClients.delete(ws);
      const session = this.authenticatedSessions.get(ws);
      this.authenticatedSessions.delete(ws);
      if (ownerId && !this.hasClientForOwner(ownerId)) {
        this.thinClientLastRpcAt.delete(ownerId);
      }
      if (session && !this.hasClientForProfile(session.profileId)) {
        this.thinClientLastRpcAtByProfile.delete(session.profileId);
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
      closeHomeClawCoreWsForCompanion(ws);
      closeHomeTerminalWsForCompanion(ws);
      // Notify connection change (after cleanup, count does not include this client)
      this.onConnectionChange?.(this.wss.clients.size);
    });

    ws.on("error", (error: Error) => {
      console.error(`[ws-server] Client ${clientId} error:`, error);
    });

    // Track client for heartbeat. The counter resets on every pong the
    // server receives; missedPongs only climbs when pong responses stall
    // (e.g. the node's event loop is busy with a long sendHello dial).
    (ws as any).missedPongs = 0;
    ws.on("pong", () => {
      (ws as any).missedPongs = 0;
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
    for (const event of allEvents) {
      this.subscribe(ws, event);
    }

    // Send connected event
    const status = this.nodeService.getConnectionStatus();
    this.sendEvent(ws, "connected", {
      peerId: status.peerId,
      multiaddrs: status.multiaddrs,
    });

    // desktop clients register `on("node:status")` via RPC asynchronously; daemon may have
    // emitted running before WsServer listeners existed — replay snapshot after subscriptions settle.
    setTimeout(() => {
      try {
        const impl = this.nodeService as NodeServiceImpl;
        const cs = impl.getConnectionStatus();
        const payload: { status: ReturnType<NodeServiceImpl["getNodeStatus"]>; peerId?: string } = {
          status: impl.getNodeStatus(),
        };
        if (cs.peerId) payload.peerId = cs.peerId;
        if (ws.readyState === WebSocket.OPEN) {
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

    if (isSerializedWsRpcMethod(message.method)) {
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

    // Handle event subscription methods specially
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

    // Gate: only enforce auth for clients that attempted token-based
    // authentication but failed. Legacy clients (Social UI, Capacitor
    // app) connect without a token and are unrestricted.
    const isAuth = (ws as any).isThinClientAuthenticated === true;
    const hadToken = (ws as any).hadThinClientToken === true;
    // Pre-auth pairing RPCs: pair + family-invite profile preview.
    if (
      hadToken &&
      !isAuth &&
      method !== "pairThinClient" &&
      method !== "previewFamilyInvite"
    ) {
      // Use the explicit UNAUTHORIZED code so the EnvoyGo mobile client
      // can map this to a typed `UnauthorizedException` and stop
      // treating it as a transient transport failure. The message
      // string is unchanged for back-compat with older EnvoyGo builds
      // and with the Social UI / Capacitor app.
      this.sendError(ws, id ?? "unknown", "Authentication required", "UNAUTHORIZED");
      return;
    }

    if (method === "homeClawCoreWsOpen") {
      try {
        const cfg = await this.nodeService.getNodeConfig();
        const err = await rpcHomeClawCoreWsOpen(
          ws,
          (params ?? {}) as { pathWithQuery: string },
          cfg.homeClawCoreBaseUrl,
          (event, data) => this.sendEvent(ws, event, data),
        );
        this.sendResponse(ws, String(id), err === null ? { ok: true } : { ok: false, error: err });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.sendResponse(ws, String(id), { ok: false, error: errorMessage });
      }
      return;
    }

    if (method === "homeClawCoreWsSend") {
      const err = rpcHomeClawCoreWsSend(ws, (params ?? {}) as { text: string });
      this.sendResponse(ws, String(id), err === null ? { ok: true } : { ok: false, error: err });
      return;
    }

    if (method === "homeClawCoreWsClose") {
      rpcHomeClawCoreWsClose(ws);
      this.sendResponse(ws, String(id), { ok: true });
      return;
    }

    if (method === "homeTerminalWsOpen") {
      try {
        const err = await rpcHomeTerminalWsOpen(
          ws,
          (params ?? {}) as { pathWithQuery: string },
          TERMINAL_WS_PORT,
          (event, data) => this.sendEvent(ws, event, data),
        );
        this.sendResponse(ws, String(id), err === null ? { ok: true } : { ok: false, error: err });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.sendResponse(ws, String(id), { ok: false, error: errorMessage });
      }
      return;
    }

    if (method === "homeTerminalWsSend") {
      const err = rpcHomeTerminalWsSend(ws, (params ?? {}) as { dataBase64: string; sessionId?: string });
      this.sendResponse(ws, String(id), err === null ? { ok: true } : { ok: false, error: err });
      return;
    }

    if (method === "homeTerminalWsClose") {
      rpcHomeTerminalWsClose(ws, (params ?? {}) as { sessionId?: string });
      this.sendResponse(ws, String(id), { ok: true });
      return;
    }

    // Route RPC to NodeService
    try {
      const result = await this.routeToNodeService(ws, method as RpcMethods, params ?? {});
      this.sendResponse(ws, id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendResponse(ws, id, undefined, { code: "ERROR", message: errorMessage });
    }
  }

  private async routeToNodeService(
    ws: WebSocket,
    method: RpcMethods,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const session = this.authenticatedSessions.get(ws);
    const caller = session ?? localOwnerCaller("");
    return runWithRpcCaller(caller, () => routeRpcMethod(this.nodeService, method, params));
  }

  /**
   * Phase 51 — broadcast config with per-session caller identity + secret redaction.
   * Never forward the emitter's `callerFamilyProfileId` (usually owner) to family
   * member sessions — that flipped EnvoyGo Mom/Dad devices to Owner.
   */
  private emitHomeConfigUpdated(data: unknown): void {
    const listeners = this.subscriptions.get("home:config-updated");
    if (!listeners) return;
    const payload = data as { config?: Record<string, unknown> };
    const fullConfig = payload?.config;
    for (const ws of listeners) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (!fullConfig) {
        this.sendEvent(ws, "home:config-updated", data);
        continue;
      }
      const session = this.authenticatedSessions.get(ws);
      const config = stampConfigCallerForSession({ ...fullConfig }, session);
      this.sendEvent(ws, "home:config-updated", { config });
    }
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
        if (ws.readyState === WebSocket.OPEN) {
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
    const target = profileId.trim() || OWNER_FAMILY_PROFILE_ID;
    const listeners = this.subscriptions.get(event);
    if (!listeners) return;
    for (const ws of listeners) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const session = this.authenticatedSessions.get(ws);
      if (!session) {
        // Untokened local clients (desktop Social) → owner only.
        if (target === OWNER_FAMILY_PROFILE_ID) {
          this.sendEvent(ws, event, data);
        }
        continue;
      }
      if (session.profileId === target) {
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

/**
 * Create a WebSocket server for NodeService API
 */
export function createWsServer(port?: number, path?: string): WsServer {
  return new WsServer(port, path);
}

/**
 * Phase 51 — which family profile(s) should receive a live `chat:message`.
 * Empty → treat as owner-only (mesh / unknown).
 */
export function resolveChatMessageTargetProfiles(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const msg = data as {
    sender?: { ownerId?: string };
    recipient?: { ownerId?: string };
  };
  const candidates = [msg.sender?.ownerId, msg.recipient?.ownerId]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const profiles = new Set<string>();
  for (const key of candidates) {
    const family = parseFamilyThreadKey(key);
    if (family) {
      profiles.add(family.profileIdA);
      profiles.add(family.profileIdB);
      continue;
    }
    const bot = parseAiBotThreadKey(key);
    if (bot?.profileId) {
      profiles.add(bot.profileId);
      continue;
    }
    const bridge = parseBridgeThreadKey(key);
    if (bridge) {
      profiles.add(bridge.profileId);
      continue;
    }
    const envoyAi = parseEnvoyAiProfileId(key);
    if (envoyAi) {
      profiles.add(envoyAi);
      continue;
    }
    if (isEnvoyAiThreadKey(key) && key === "__envoy_ai__") {
      profiles.add(OWNER_FAMILY_PROFILE_ID);
    }
  }
  return [...profiles];
}