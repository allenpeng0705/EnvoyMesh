import { WebSocketServer, WebSocket } from "ws";
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
import { TERMINAL_WS_PORT } from "./service-ports.js";
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
  private nodeService!: NodeService;
  private readonly subscriptions = new Map<string, Set<WebSocket>>();
  private readonly clientSubscriptions = new Map<WebSocket, Set<string>>();
  /** Track authenticated thin-client sessions (token → ws). */
  private readonly authenticatedClients = new Map<WebSocket, string>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs = 30000; // 30 seconds
  private onConnectionChange?: (connectedCount: number) => void;

  constructor(
    private readonly port: number = 3030,
    private readonly path: string = "/ws",
    opts?: { onConnectionChange?: (connectedCount: number) => void },
  ) {
    this.onConnectionChange = opts?.onConnectionChange;
  }

  /**
   * Start the WebSocket server
   */
  start(nodeService: NodeService): void {
    this.nodeService = nodeService;
    this.wss = new WebSocketServer({ port: this.port, path: this.path });

    // Handle WebSocket server errors gracefully to prevent crashes
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
      nodeServiceImpl.on("chat:message", (data: unknown) => this.emitEvent("chat:message", data));
      nodeServiceImpl.on("chat:delivered", (data: unknown) => this.emitEvent("chat:delivered", data));
      nodeServiceImpl.on("chat:room-updated", (data: unknown) => this.emitEvent("chat:room-updated", data));
      nodeServiceImpl.on("chat:room-removed", (data: unknown) => this.emitEvent("chat:room-removed", data));
      nodeServiceImpl.on("chat:room-message", (data: unknown) => this.emitEvent("chat:room-message", data));
      nodeServiceImpl.on("chat:draft", (data: unknown) => this.emitEvent("chat:draft", data));
      nodeServiceImpl.on("chat:auto-reply-paused", (data: unknown) =>
        this.emitEvent("chat:auto-reply-paused", data),
      );
      nodeServiceImpl.on("agent:activity", (data: unknown) => this.emitEvent("agent:activity", data));
      nodeServiceImpl.on("bond:established", (data: unknown) => this.emitEvent("bond:established", data));
      nodeServiceImpl.on("bond:revoked", (data: unknown) => this.emitEvent("bond:revoked", data));
      nodeServiceImpl.on("profile:updated", (data: unknown) => this.emitEvent("profile:updated", data));
      nodeServiceImpl.on("node:status", (data: unknown) => this.emitEvent("node:status", data));
      nodeServiceImpl.on("node:online", (data: unknown) => this.emitEvent("node:online", data));
      nodeServiceImpl.on("node:offline", (data: unknown) => this.emitEvent("node:offline", data));
      nodeServiceImpl.on("bridge:status", (data: unknown) => this.emitEvent("bridge:status", data));
      nodeServiceImpl.on("p2p:envelope", (data: unknown) => this.emitEvent("p2p:envelope", data));
      nodeServiceImpl.on("crdt:sync", (data: unknown) => this.emitEvent("crdt:sync", data));
      nodeServiceImpl.on("discovery:multihop-update", (data: unknown) =>
        this.emitEvent("discovery:multihop-update", data),
      );
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

    this.wss.on("listening", () => {
      console.log(`[ws-server] Listening on ws://localhost:${this.port}${this.path}`);
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          console.log("[ws-server] Terminating inactive client");
          ws.terminate();
          return;
        }
        (ws as any).isAlive = false;
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
    this.wss.close();
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
          console.log(`[ws-server] Client ${clientId} authenticated via session token (owner: ${record.ownerId})`);
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

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as JsonRpcRequest;
        // Record owner activity for online/offline detection,
        // but skip subscription on/off RPCs — they're infrastructure, not user actions.
        if (message.method !== "on" && message.method !== "off") {
          this.nodeService.recordOwnerActivity();
        }
        await this.handleMessage(ws, message);
      } catch (error) {
        console.error("[ws-server] Error handling message:", error);
        this.sendError(ws, "unknown", "Failed to process message");
      }
    });

    ws.on("close", () => {
      console.log(`[ws-server] Client ${clientId} disconnected`);
      // Clean up auth tracking.
      this.authenticatedClients.delete(ws);
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

    // Track client for heartbeat
    (ws as any).isAlive = true;
    ws.on("pong", () => {
      (ws as any).isAlive = true;
    });

    // Auto-subscribe to all events for this client (push all events without explicit "on" subscription)
    const allEvents = [
      "hello:request",
      "hello:response",
      "social.intro:propose",
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
      // Phase 38 — voice/video call events
      "call:incoming",
      "call:answered",
      "call:rejected",
      "call:ended",
      "call:remote-mute",
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
        }
      } catch (e) {
        console.warn("[ws-server] deferred node:status snapshot failed:", e);
      }
    }, 350);

    // Send node:ready after a short delay to indicate node is fully initialized
    setTimeout(() => {
      this.sendEvent(ws, "node:ready", { timestamp: Date.now() });
    }, 1000);
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
    if (hadToken && !isAuth && method !== "pairThinClient") {
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
      const err = rpcHomeTerminalWsSend(ws, (params ?? {}) as { dataBase64: string });
      this.sendResponse(ws, String(id), err === null ? { ok: true } : { ok: false, error: err });
      return;
    }

    if (method === "homeTerminalWsClose") {
      rpcHomeTerminalWsClose(ws);
      this.sendResponse(ws, String(id), { ok: true });
      return;
    }

    // Route RPC to NodeService
    try {
      const result = await this.routeToNodeService(method as RpcMethods, params ?? {});
      this.sendResponse(ws, id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendResponse(ws, id, undefined, { code: "ERROR", message: errorMessage });
    }
  }

  private async routeToNodeService(method: RpcMethods, params: Record<string, unknown>): Promise<unknown> {
    return routeRpcMethod(this.nodeService, method, params);
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