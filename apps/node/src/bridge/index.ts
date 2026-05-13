import * as http from "node:http";
import type { EnvoyMesh } from "@envoymesh/network";
import { parseChatMessagePayload } from "@envoymesh/protocol";
import type { ExternalAgentGateway } from "../external-agent-gateway.js";
import type { BridgeConfig } from "./config.js";
import { BridgeConfigSchema } from "./config.js";
import {
  forwardToAgent,
  receiveFromAgent,
  type BridgeDeps,
  type BridgeIdentity,
} from "./pipe.js";

export type { BridgeConfig } from "./config.js";
export type { BridgeIdentity } from "./pipe.js";
export { BridgeConfigSchema } from "./config.js";
export { forwardToAgent, receiveFromAgent } from "./pipe.js";

const MAX_BRIDGE_BODY_BYTES = 64 * 1024;

export interface CreateBridgeOptions {
  config: Partial<BridgeConfig>;
  identity: BridgeIdentity;
  mesh: EnvoyMesh;
  /** Resolve an ownerId or peerId to the current libp2p peer ID. */
  getRecipientPeerId: (ownerOrPeerId: string) => Promise<string | null>;
  /** Called when the bridge needs to deliver an envelope to the local node (self-send). */
  onSelfSendEnvelope?: (envelope: any, remotePeerId: string) => Promise<void>;
  /** Gateway for external agent session management and action logging (Phase 9I). */
  gateway?: ExternalAgentGateway;
}

/**
 * Start the bridge: HTTP server (agent callback) + P2P handler (forward to agent).
 * Returns a `stop()` function for graceful shutdown.
 */
export function createBridge(options: CreateBridgeOptions): {
  agentPeerId: string;
  stop: () => Promise<void>;
  _handleMessage: (envelope: any, remotePeerId: string) => Promise<void>;
} {
  const config = BridgeConfigSchema.parse(options.config);
  if (!config.enabled) {
    return { agentPeerId: options.identity.agentPeerId, stop: async () => {}, _handleMessage: async () => {} };
  }

  if (!config.secret) {
    throw new Error("Bridge requires a shared secret when enabled");
  }

  const agentId = options.identity.agentCredential.agentId;

  const deps: BridgeDeps = {
    config,
    identity: options.identity,
    sendChat: async (peerId, envelope) => {
      if (peerId === options.mesh.peerId && options.onSelfSendEnvelope) {
        console.log(`[bridge] self-send reply, routing locally`);
        await options.onSelfSendEnvelope(envelope, options.mesh.peerId);
        return;
      }
      await options.mesh.sendChat(peerId, envelope, {});
    },
    getRecipientPeerId: options.getRecipientPeerId,
    gateway: options.gateway,
    agentId,
  };

  // --- HTTP server: agent → P2P ---
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/bridge/send") {
      res.writeHead(404).end();
      return;
    }

    if (config.secret) {
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${config.secret}`) {
        res.writeHead(401).end(JSON.stringify({ ok: false, reason: "unauthorized" }));
        return;
      }
    }

    // Gateway authorization: reject if agent session is revoked or missing
    if (options.gateway && agentId && !options.gateway.isAuthorized(agentId)) {
      res.writeHead(403).end(JSON.stringify({ ok: false, reason: "agent revoked" }));
      return;
    }

    const httpStartTime = Date.now();
    try {
      const raw = await readBody(req, MAX_BRIDGE_BODY_BYTES);
      const { to, text } = JSON.parse(raw);
      if (typeof to !== "string" || typeof text !== "string" || !to.trim() || !text.trim()) {
        res.writeHead(400).end(JSON.stringify({ ok: false, reason: "to and text are required" }));
        return;
      }

      const result = await receiveFromAgent(deps, { to, text });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, messageId: result.messageId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      console.error(`[bridge] receive failed:`, msg);
      res.writeHead(500).end(JSON.stringify({ ok: false, reason: msg }));
    }
  });

  server.listen(config.listenPort, "127.0.0.1", () => {
    console.log(`[bridge] HTTP server on http://127.0.0.1:${config.listenPort}/bridge/send`);
  });

  // --- P2P handler: P2P → agent ---
  const bridgeHandler = async (envelope: any, remotePeerId: string) => {
    if (envelope.intent !== "chat.message") return;
    if (envelope.recipientPeerId !== options.identity.agentPeerId) return;

    const payload = parseChatMessagePayload(envelope.payload);
    console.log(`[bridge] ${payload.senderOwnerId}: ${payload.text}`);

    try {
      const fwdStartTime = Date.now();
      const replyText = await forwardToAgent(config, {
        senderPeerId: remotePeerId,
        senderOwnerId: payload.senderOwnerId,
        text: payload.text,
      });

      // Log forward action via gateway
      options.gateway?.logAction({
        agentId: agentId ?? "unknown",
        toolName: "bridge.forward_to_agent",
        params: { from: payload.senderOwnerId, textLength: payload.text.length },
        outcome: "success",
        requiresApproval: false,
        durationMs: Date.now() - fwdStartTime,
      });
      options.gateway?.touchAgent(agentId ?? "unknown");

      // If agent returned a synchronous reply, send it back.
      // receiveFromAgent also logs via the gateway via its own deps.
      if (replyText) {
        await receiveFromAgent(deps, {
          to: remotePeerId,
          text: replyText,
        });
      }
    } catch (err) {
      console.error(`[bridge] forward failed:`, err);
      options.gateway?.logAction({
        agentId: agentId ?? "unknown",
        toolName: "bridge.forward_to_agent",
        params: { from: payload.senderOwnerId },
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        requiresApproval: false,
        durationMs: 0,
      });
    }
  };

  return {
    agentPeerId: options.identity.agentPeerId,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    // Exposed for the onMessage callback in index.ts
    _handleMessage: bridgeHandler,
  };
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        req.destroy(new Error("bridge request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
