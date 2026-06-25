import * as http from "node:http";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  parseChatMessagePayload,
  parseDiscoveryResponsePayload,
  parseKnowledgeResponsePayload,
} from "@envoymesh/protocol";
import type { SubmitAgentShareProposalParams } from "@envoymesh/api";
import type { AiIdentity } from "@envoymesh/api";
import type { ExternalAgentGateway } from "../external-agent-gateway.js";
import type { ToolDefinition, ToolResult } from "../tool-registry.js";
import type { BridgeConfig } from "./config.js";
import { applyBridgeConfigResolution, BridgeConfigSchema } from "./config.js";
import { forwardAsyncMeshReply } from "./async-mesh-reply.js";
import {
  forwardToAgent,
  receiveFromAgent,
  type BridgeDeps,
  type BridgeIdentity,
} from "./pipe.js";

export type { BridgeConfig, ExtAgentEntry } from "./config.js";
export {
  BridgeConfigSchema,
  ExtAgentEntrySchema,
  applyBridgeConfigResolution,
  bridgeForwardAuthSecret,
  resolveActiveExtAgent,
  resolveAssistantAgentUrl,
  resolveBridgeStatusAgentType,
  probeExtAgentHealth,
  extAgentHealthUrl,
  probeAllExtAgents,
} from "./config.js";
export type { BridgeIdentity } from "./pipe.js";
export { forwardToAgent, receiveFromAgent } from "./pipe.js";
export { forwardAsyncMeshReply, resetBridgeAsyncReplyRateLimitForTests } from "./async-mesh-reply.js";

const MAX_BRIDGE_BODY_BYTES = 64 * 1024;

export interface CreateBridgeOptions {
  config: Partial<BridgeConfig>;
  identity: BridgeIdentity;
  mesh: EnvoyMesh;
  /** Resolve an ownerId or peerId to the current libp2p peer ID. */
  getRecipientPeerId: (ownerOrPeerId: string) => Promise<string | null>;
  /**
   * Resolve outbound dial hints for a recipient peer — peer directory
   * listen addrs + synthetic relay circuit paths. Used so the bridge's
   * reply to a NAT-traversed mobile (e.g. a paired phone) can be re-dialed
   * if the original libp2p connection has dropped while the agent was
   * thinking. Optional.
   */
  getRecipientDialHints?: (peerId: string) => Promise<string[] | undefined>;
  /** Called when the bridge needs to deliver an envelope to the local node (self-send). */
  onSelfSendEnvelope?: (envelope: any, remotePeerId: string) => Promise<void>;
  /** Gateway for external agent session management and action logging (Phase 9I). */
  gateway?: ExternalAgentGateway;
  /** Persist agent-proposed vault shares for owner review (FS-E). */
  submitAgentShareProposal?: (params: SubmitAgentShareProposalParams) => Promise<unknown>;
  /** Run ToolRegistry tools for external agents (ADB-E). */
  executeTool?: (toolName: string, params: Record<string, unknown>) => Promise<ToolResult>;
  /** List registered agent tools. */
  listTools?: () => ToolDefinition[];
  /** Live AI identity from node config (transparent prefix enforcement). */
  getAiIdentity?: () => AiIdentity | undefined;
  /** Resolves pending OpenClaw ask() calls when bridge receives a reply. */
  resolveOpenClawReply?: (correlationId: string, text: string) => void;
}

/**
 * Start the bridge: HTTP server (agent callback) + P2P handler (forward to agent).
 * Returns a `stop()` function for graceful shutdown.
 */
export function createBridge(options: CreateBridgeOptions): {
  agentPeerId: string;
  stop: () => Promise<void>;
  updateConfig: (config: BridgeConfig) => void;
  getConfig: () => ReturnType<typeof applyBridgeConfigResolution>;
  _handleMessage: (envelope: any, remotePeerId: string) => Promise<void>;
} {
  let runtimeConfig = applyBridgeConfigResolution(BridgeConfigSchema.parse(options.config));
  if (!runtimeConfig.enabled) {
    return {
      agentPeerId: options.identity.agentPeerId,
      stop: async () => {},
      updateConfig: () => {},
      getConfig: () => runtimeConfig,
      _handleMessage: async () => {},
    };
  }
  const secretTrimmed = runtimeConfig.secret?.trim() ?? "";

  const agentId = options.identity.agentCredential.agentId;

  const deps: BridgeDeps = {
    config: runtimeConfig,
    identity: options.identity,
    sendChat: async (peerId, envelope, options2) => {
      if (peerId === options.mesh.peerId && options.onSelfSendEnvelope) {
        console.log(`[bridge] self-send reply to=${peerId.slice(0, 20)}… intent=${envelope.intent}`);
        await options.onSelfSendEnvelope(envelope, options.mesh.peerId);
        return;
      }
      // Resolve dial hints for the recipient (peer directory listen addrs +
      // synthetic relay circuit paths) so a NAT-traversed peer like a paired
      // mobile can be reached even when the original libp2p connection has
      // dropped. `receiveFromAgent` already passes the hints it fetched; if
      // a caller didn't supply any, fetch a fresh set here as a final safety
      // net before redialing.
      let dialHints = options2?.dialHints;
      if (!dialHints || dialHints.length === 0) {
        if (options.getRecipientDialHints) {
          try {
            dialHints = await options.getRecipientDialHints(peerId);
          } catch (err) {
            console.warn(
              `[bridge] getRecipientDialHints failed for ${peerId.slice(0, 20)}…:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
      console.log(
        `[bridge] P2P send to=${peerId.slice(0, 20)}… intent=${envelope.intent} dialHints=${dialHints?.length ?? 0}`,
      );
      try {
        await options.mesh.sendChat(peerId, envelope, { ...(dialHints ? { dialHints } : {}) });
        console.log(`[bridge] P2P send succeeded`);
      } catch (err) {
        console.error(`[bridge] P2P send FAILED: ${err instanceof Error ? err.message : err}`);
        throw err;
      }
    },
    getRecipientPeerId: options.getRecipientPeerId,
    getRecipientDialHints: options.getRecipientDialHints,
    gateway: options.gateway,
    agentId,
    getAiIdentity: options.getAiIdentity,
    resolveOpenClawReply: options.resolveOpenClawReply,
  };

  // --- HTTP server: agent → P2P / tools ---
  const server = http.createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    console.log(`[bridge] HTTP ${req.method} ${path} from=${req.socket?.remoteAddress ?? "?"}`);

    if (req.method === "GET" && path === "/bridge/list-tools") {
      if (secretTrimmed) {
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${secretTrimmed}`) {
          res.writeHead(401).end(JSON.stringify({ ok: false, reason: "unauthorized" }));
          return;
        }
      }
      if (!options.listTools) {
        res.writeHead(501).end(JSON.stringify({ ok: false, reason: "listTools not configured" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tools: options.listTools() }));
      return;
    }

    if (req.method !== "POST") {
      console.log(`[bridge] HTTP rejecting: method=${req.method} (not POST)`);
      res.writeHead(404).end();
      return;
    }

    if (
      path !== "/bridge/send" &&
      path !== "/bridge/agent-share-proposal" &&
      path !== "/bridge/execute-tool"
    ) {
      console.log(`[bridge] HTTP rejecting: unknown path="${path}"`);
      res.writeHead(404).end();
      return;
    }

    if (secretTrimmed) {
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${secretTrimmed}`) {
        console.log(`[bridge] HTTP rejecting: auth mismatch (got="${auth?.slice(0, 30) ?? "none"}")`);
        res.writeHead(401).end(JSON.stringify({ ok: false, reason: "unauthorized" }));
        return;
      }
    }

    // Gateway authorization: reject if agent session is revoked or missing
    if (options.gateway && agentId && !options.gateway.isAuthorized(agentId)) {
      console.log(`[bridge] HTTP rejecting: agent not authorized (agentId=${agentId})`);
      res.writeHead(403).end(JSON.stringify({ ok: false, reason: "agent revoked" }));
      return;
    }

    if (path === "/bridge/agent-share-proposal") {
      if (!options.submitAgentShareProposal) {
        res.writeHead(501).end(JSON.stringify({ ok: false, reason: "submitAgentShareProposal not configured" }));
        return;
      }
      try {
        const raw = await readBody(req, MAX_BRIDGE_BODY_BYTES);
        const body = JSON.parse(raw) as Record<string, unknown>;
        const targetOwnerId = body.targetOwnerId;
        const vaultRelativePath = body.vaultRelativePath;
        const sensitivity = body.sensitivity;
        const summary = body.summary;
        if (typeof targetOwnerId !== "string" || !targetOwnerId.trim()) {
          res.writeHead(400).end(JSON.stringify({ ok: false, reason: "targetOwnerId required" }));
          return;
        }
        if (typeof vaultRelativePath !== "string" || !vaultRelativePath.trim()) {
          res.writeHead(400).end(JSON.stringify({ ok: false, reason: "vaultRelativePath required" }));
          return;
        }
        if (sensitivity !== "public" && sensitivity !== "friends" && sensitivity !== "private") {
          res.writeHead(400).end(JSON.stringify({ ok: false, reason: "sensitivity must be public|friends|private" }));
          return;
        }
        const proposal = await options.submitAgentShareProposal({
          targetOwnerId: targetOwnerId.trim(),
          vaultRelativePath: vaultRelativePath.trim(),
          sensitivity,
          summary: typeof summary === "string" ? summary : undefined,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, proposal }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Internal error";
        console.error(`[bridge] agent-share-proposal failed:`, msg);
        res.writeHead(500).end(JSON.stringify({ ok: false, reason: msg }));
      }
      return;
    }

    if (path === "/bridge/execute-tool") {
      if (!options.executeTool) {
        res.writeHead(501).end(JSON.stringify({ ok: false, reason: "executeTool not configured" }));
        return;
      }
      try {
        const raw = await readBody(req, MAX_BRIDGE_BODY_BYTES);
        const body = JSON.parse(raw) as Record<string, unknown>;
        const toolName = body.toolName;
        const params = body.params;
        if (typeof toolName !== "string" || !toolName.trim()) {
          res.writeHead(400).end(JSON.stringify({ ok: false, reason: "toolName required" }));
          return;
        }
        const result = await options.executeTool(
          toolName.trim(),
          params && typeof params === "object" && !Array.isArray(params)
            ? (params as Record<string, unknown>)
            : {},
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: result.ok, result }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Internal error";
        console.error(`[bridge] execute-tool failed:`, msg);
        res.writeHead(500).end(JSON.stringify({ ok: false, reason: msg }));
      }
      return;
    }

    try {
      const raw = await readBody(req, MAX_BRIDGE_BODY_BYTES);
      const body = JSON.parse(raw) as Record<string, unknown>;
      const to = body.to;
      const text = body.text;
      const correlationId = body.correlationId;
      if (typeof to !== "string" || typeof text !== "string" || !to.trim() || !text.trim()) {
        console.log(`[bridge] HTTP rejecting: missing to/text (to=${JSON.stringify(to)}, text_len=${typeof text === "string" ? text.length : typeof text})`);
        res.writeHead(400).end(JSON.stringify({ ok: false, reason: "to and text are required" }));
        return;
      }

      // Sync H2A ask(): resolve pending OpenClaw reply without P2P chat delivery.
      if (typeof correlationId === "string" && correlationId.trim()) {
        console.log(`[bridge] OpenClaw sync reply cid=${correlationId.trim()} len=${text.length}`);
        options.resolveOpenClawReply?.(correlationId.trim(), text);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, mode: "sync-reply" }));
        return;
      }

      const result = await receiveFromAgent(deps, { to, text });
      console.log(`[bridge] receiveFromAgent ok: msgId=${result.messageId} toPeerId=${result.recipientPeerId?.slice(0, 20)}…`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, messageId: result.messageId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      console.error(`[bridge] receive failed:`, msg);
      res.writeHead(500).end(JSON.stringify({ ok: false, reason: msg }));
    }
  });

  server.listen(runtimeConfig.listenPort, "127.0.0.1", () => {
    console.log(
      `[bridge] HTTP on http://127.0.0.1:${runtimeConfig.listenPort}/bridge/send, ` +
        `/bridge/agent-share-proposal, /bridge/execute-tool, GET /bridge/list-tools`,
    );
  });

  // --- P2P handler: P2P → agent ---
  const bridgeHandler = async (envelope: any, remotePeerId: string) => {
    console.log(`[bridge] inbound intent=${envelope.intent} from=${envelope.senderPeerId?.slice(0, 20)} to=${envelope.recipientPeerId?.slice(0, 20)}`);
    if (envelope.recipientPeerId !== options.identity.agentPeerId) {
      console.log(`[bridge] message for different recipient: ${envelope.recipientPeerId} !== ${options.identity.agentPeerId}`);
      return;
    }

    if (envelope.intent === "discovery.response" || envelope.intent === "knowledge.response") {
      void (async () => {
        const fwdStartTime = Date.now();
        try {
          const payload =
            envelope.intent === "discovery.response"
              ? parseDiscoveryResponsePayload(envelope.payload)
              : parseKnowledgeResponsePayload(envelope.payload);
          await forwardAsyncMeshReply(runtimeConfig, {
            intent: envelope.intent,
            correlationId: envelope.correlationId,
            senderPeerId: envelope.senderPeerId,
            remotePeerId,
            messageId: envelope.messageId,
            payload,
          });
          options.gateway?.logAction({
            agentId: agentId ?? "unknown",
            toolName: "bridge.forward_async_mesh_reply",
            params: { intent: envelope.intent, correlationId: envelope.correlationId },
            outcome: "success",
            requiresApproval: false,
            durationMs: Date.now() - fwdStartTime,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[bridge] async mesh reply forward failed (${envelope.intent}):`, err);
          options.gateway?.logAction({
            agentId: agentId ?? "unknown",
            toolName: "bridge.forward_async_mesh_reply",
            params: {
              intent: envelope.intent,
              correlationId: envelope.correlationId,
              messageId: envelope.messageId,
            },
            outcome: "error",
            error: errorMessage,
            requiresApproval: false,
            durationMs: Date.now() - fwdStartTime,
          });
        }
      })();
      return;
    }

    if (envelope.intent !== "chat.message") {
      console.log(`[bridge] skipping unsupported intent: ${envelope.intent}`);
      return;
    }

    const payload = parseChatMessagePayload(envelope.payload);
    console.log(`[bridge] ${payload.senderOwnerId}: ${payload.text}`);

    // Fire-and-forget: forward to external agent without blocking the sendChat RPC.
    // The agent's reply comes back via HTTP POST to /bridge/send (async path).
    // We intentionally do NOT process synchronous replies from forwardToAgent —
    // agents like HomeClaw send replies via _reply_to_bridge which POSTs to
    // /bridge/send, and processing both paths would cause duplicate messages.
    const fwdPromise = (async () => {
      try {
        const fwdStartTime = Date.now();
        await forwardToAgent(runtimeConfig, {
          senderPeerId: remotePeerId,
          senderOwnerId: payload.senderOwnerId,
          text: payload.text,
        });

        options.gateway?.logAction({
          agentId: agentId ?? "unknown",
          toolName: "bridge.forward_to_agent",
          params: { from: payload.senderOwnerId, textLength: payload.text.length },
          outcome: "success",
          requiresApproval: false,
          durationMs: Date.now() - fwdStartTime,
        });
        options.gateway?.touchAgent(agentId ?? "unknown");
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
    })();
    void fwdPromise;
  };

  return {
    agentPeerId: options.identity.agentPeerId,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    updateConfig: (next: BridgeConfig) => {
      runtimeConfig = applyBridgeConfigResolution(BridgeConfigSchema.parse(next));
      deps.config = runtimeConfig;
      console.log(
        `[bridge] config updated: active=${runtimeConfig.resolvedActiveExtAgentId ?? "legacy"} ` +
          `url=${runtimeConfig.agentUrl}`,
      );
    },
    getConfig: () => runtimeConfig,
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
