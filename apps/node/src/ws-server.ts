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
    if (nodeServiceImpl.on) {
      nodeServiceImpl.on("hello:request", (data: unknown) => this.emitEvent("hello:request", data));
      nodeServiceImpl.on("hello:response", (data: unknown) => this.emitEvent("hello:response", data));
      nodeServiceImpl.on("chat:message", (data: unknown) => this.emitEvent("chat:message", data));
      nodeServiceImpl.on("bond:established", (data: unknown) => this.emitEvent("bond:established", data));
    }

    this.wss.on("connection", (ws: WebSocket) => {
      console.log(`[ws-server] Client connected`);
      void this.handleConnection(ws);
    });

    this.wss.on("listening", () => {
      console.log(`[ws-server] Listening on ws://localhost:${this.port}${this.path}`);
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
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

    // Send connected event
    const status = this.nodeService.getConnectionStatus();
    this.sendEvent(ws, "connected", {
      peerId: status.peerId,
      multiaddrs: status.multiaddrs,
    });
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
      case "getNodeConfig":
        return this.getNodeConfig();
      case "updateNodeConfig":
        return this.updateNodeConfig(params as any);
      case "listRelays":
        return this.listRelays();
      case "addRelay":
        return this.addRelay(params as any);
      case "removeRelay":
        return this.removeRelay(params as any);
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  // ============================================
  // Node Configuration (placeholder implementations)
  // ============================================

  private getNodeConfig() {
    // Would return current node configuration
    return {
      profileDir: "",
      discoveryProfile: "wan-default",
      relayEnabled: true,
      relayServerEnabled: false,
      configuredRelays: [],
      advertiseAddrs: [],
      bootstrapPeers: [],
    };
  }

  private updateNodeConfig(_params: {
    discoveryProfile?: string;
    relayEnabled?: boolean;
    relayServerEnabled?: boolean;
    advertiseAddrs?: string[];
    bootstrapPeers?: string[];
  }) {
    // Would update node configuration
    return { success: true };
  }

  private listRelays() {
    // Would return configured relays
    return [];
  }

  private addRelay(_params: { addr: string; level?: number; region?: string }) {
    // Would add a relay
    return { success: true, relayId: randomUUID() };
  }

  private removeRelay(_params: { relayId: string }) {
    // Would remove a relay
    return { success: true };
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