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
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs = 30000; // 30 seconds

  constructor(private readonly port: number = 3030, private readonly path: string = "/ws") {
  }

  /**
   * Start the WebSocket server
   */
  start(nodeService: NodeService): void {
    this.nodeService = nodeService;
    this.wss = new WebSocketServer({ port: this.port, path: this.path });

    // Wire up nodeService events to WebSocket broadcasts
    const nodeServiceImpl = nodeService as NodeServiceImpl;
    console.log(`[ws-server] start: nodeServiceImpl has 'on' method?`, typeof nodeServiceImpl.on);
    if (nodeServiceImpl.on) {
      console.log(`[ws-server] wiring up event handlers`);
      nodeServiceImpl.on("hello:request", (data: unknown) => this.emitEvent("hello:request", data));
      nodeServiceImpl.on("hello:response", (data: unknown) => this.emitEvent("hello:response", data));
      nodeServiceImpl.on("chat:message", (data: unknown) => this.emitEvent("chat:message", data));
      nodeServiceImpl.on("bond:established", (data: unknown) => this.emitEvent("bond:established", data));
      nodeServiceImpl.on("bond:revoked", (data: unknown) => this.emitEvent("bond:revoked", data));
      nodeServiceImpl.on("node:status", (data: unknown) => this.emitEvent("node:status", data));
    } else {
      console.log(`[ws-server] ERROR: nodeServiceImpl.on is not a function!`);
    }

    this.wss.on("connection", (ws: WebSocket) => {
      console.log(`[ws-server] Client connected`);
      void this.handleConnection(ws);
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

  private async handleConnection(ws: WebSocket): Promise<void> {
    const clientId = randomUUID();

    // Initialize subscription tracking for this client
    this.clientSubscriptions.set(ws, new Set());

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as JsonRpcRequest;
        await this.handleMessage(ws, message);
      } catch (error) {
        console.error("[ws-server] Error handling message:", error);
        this.sendError(ws, "unknown", "Failed to process message");
      }
    });

    ws.on("close", () => {
      console.log(`[ws-server] Client ${clientId} disconnected`);
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
      "chat:message",
      "bond:established",
      "bond:revoked",
      "node:status",
      "node:online",
      "node:offline",
      "peer:discovered",
      "peer:lost",
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
    const ns = this.nodeService;
    switch (method) {
      case "getProfile":
        return ns.getProfile();
      case "getHumanProfile":
        return ns.getHumanProfile();
      case "updateHumanProfile":
        return ns.updateHumanProfile(params as any);
      case "sendHello":
        return ns.sendHello(
          params.targetOwnerId as string,
          params.profile as any,
          params.message as string,
        );
      case "acceptHello":
        return ns.acceptHello(params.messageId as string);
      case "declineHello":
        return ns.declineHello(params.messageId as string, params.reason as string | undefined);
      case "blockPeer":
        return ns.blockPeer(params.peerOwnerId as string);
      case "unblockPeer":
        return ns.unblockPeer(params.peerOwnerId as string);
      case "revokeBond":
        return ns.revokeBond(params.peerOwnerId as string);
      case "getBonds":
        return ns.getBonds();
      case "sendChat":
        return ns.sendChat(params.targetOwnerId as string, params.text as string);
      case "listChatHistory":
        return ns.listChatHistory(params.peerOwnerId as string, params.limit as number | undefined);
      case "markRead":
        return ns.markRead(params.targetOwnerId as string, params.upToMessageId as string | undefined);
      case "searchPeers":
        return ns.searchPeers(params as any);
      case "shareFile":
        return ns.shareFile(params.targetOwnerId as string, params as any);
      case "acceptShare":
        return ns.acceptShare(params.shareId as string, params.savePath as string);
      case "declineShare":
        return ns.declineShare(params.shareId as string);
      case "getConnectionStatus":
        return ns.getConnectionStatus();
      case "getPeerConnectionInfo":
        return ns.getPeerConnectionInfo(params.peerOwnerId as string);
      case "getNodeConfig":
        return ns.getNodeConfig();
      case "updateNodeConfig":
        return ns.updateNodeConfig(params as any);
      case "listRelays":
        return ns.listRelays();
      case "addRelay":
        return ns.addRelay(params.addr as string, params.level as number | undefined, params.region as string | undefined);
      case "removeRelay":
        return ns.removeRelay(params.relayId as string);
      case "initNode":
        return await ns.initNode(params.profileDir as string, params.options as any);
      case "getNodeStatus":
        return { status: ns.getNodeStatus() };
      case "startNode":
        await ns.startNode();
        return { success: true };
      case "stopNode":
        await ns.stopNode();
        return { success: true };
      case "advertiseTopic":
        await ns.advertiseTopic(params.topic as string);
        return { success: true };
      case "stopAdvertiseTopic":
        await ns.stopAdvertiseTopic(params.topic as string);
        return { success: true };
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  // ============================================
  // Event Subscription Management
  // ============================================

  private subscribe(ws: WebSocket, event: string): void {
    console.log(`[ws-server] subscribe: ${event}`);
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
    console.log(`[ws-server] emitEvent: ${event}`, data);
    const listeners = this.subscriptions.get(event);
    console.log(`[ws-server] listeners for ${event}: ${listeners?.size ?? 0}`);
    if (listeners) {
      for (const ws of listeners) {
        if (ws.readyState === WebSocket.OPEN) {
          console.log(`[ws-server] sending event ${event} to a client, readyState=${ws.readyState}`);
          this.sendEvent(ws, event, data);
        } else {
          console.log(`[ws-server] skipping client - not OPEN, readyState=${ws.readyState}`);
        }
      }
    } else {
      console.log(`[ws-server] no listeners for ${event}!`);
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

  private sendError(ws: WebSocket, id: string, message: string): void {
    this.sendResponse(ws, id, undefined, { code: "ERROR", message });
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