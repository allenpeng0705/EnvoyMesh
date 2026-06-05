import type { IncomingMessage, ServerResponse } from "node:http";
import {
  beginWebhookRequestPipelineOrReject,
  createWebhookInFlightLimiter,
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "openclaw/plugin-sdk/webhook-ingress";
import { dispatchEnvoymeshAsyncInboundEvent } from "./async-inbound-event.js";
import { sendBridgeMessage } from "./bridge-client.js";
import { isDuplicateAsyncInbound, isDuplicateInbound } from "./dedup.js";
import { rememberMeshPeer } from "./peer-routing.js";
import {
  isEnvoymeshAsyncWebhookPayload,
  type EnvoymeshAsyncInboundMessage,
  type EnvoymeshInboundMessage,
  type EnvoymeshWebhookPayload,
  type ResolvedEnvoymeshAccount,
} from "./types.js";

const MAX_BODY_BYTES = 64 * 1024;
const BODY_TIMEOUT_MS = 5_000;
const webhookInFlightLimiter = createWebhookInFlightLimiter();

export type EnvoymeshWebhookDeliver = (msg: EnvoymeshInboundMessage) => Promise<void>;
export type EnvoymeshAsyncWebhookDeliver = (msg: EnvoymeshAsyncInboundMessage) => Promise<void>;

function toAsyncInboundMessage(
  payload: EnvoymeshWebhookPayload,
): EnvoymeshAsyncInboundMessage | null {
  if (!isEnvoymeshAsyncWebhookPayload(payload)) {
    return null;
  }
  const fromPeerId = (payload.fromPeerId ?? "").trim();
  const messageId = (payload.messageId ?? "").trim();
  const intent = (payload.intent ?? "unknown").trim();
  if (!fromPeerId || !messageId) {
    return null;
  }
  return {
    kind: "async",
    intent,
    correlationId: payload.correlationId?.trim() || undefined,
    fromPeerId,
    remotePeerId: payload.remotePeerId?.trim() || undefined,
    messageId,
    payload: payload.payload ?? null,
  };
}

export type EnvoymeshWebhookHandlerDeps = {
  account: ResolvedEnvoymeshAccount;
  deliver: EnvoymeshWebhookDeliver;
  deliverAsync?: EnvoymeshAsyncWebhookDeliver;
  log?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
};

function validateInboundSecret(
  req: IncomingMessage,
  expected: string,
): boolean {
  const trimmed = expected.trim();
  if (!trimmed) {
    return true;
  }
  const auth = req.headers.authorization;
  return auth === `Bearer ${trimmed}`;
}

function isOwnerAllowed(account: ResolvedEnvoymeshAccount, ownerId: string): boolean {
  if (account.dmPolicy === "disabled") {
    return false;
  }
  if (account.dmPolicy === "open") {
    if (account.allowedOwnerIds.length === 0) {
      return false;
    }
    if (account.allowedOwnerIds.includes("*")) {
      return true;
    }
    return account.allowedOwnerIds.includes(ownerId);
  }
  return account.allowedOwnerIds.includes(ownerId);
}

function parsePayload(raw: string): EnvoymeshWebhookPayload | null {
  try {
    return JSON.parse(raw) as EnvoymeshWebhookPayload;
  } catch {
    return null;
  }
}

function toInboundMessage(payload: EnvoymeshWebhookPayload): EnvoymeshInboundMessage | null {
  if (isEnvoymeshAsyncWebhookPayload(payload)) {
    return null;
  }
  const from = (payload.from ?? "").trim();
  const fromOwnerId = (payload.fromOwnerId ?? "").trim();
  const text = (payload.text ?? "").trim();
  const fromName = (payload.fromName ?? fromOwnerId).trim();
  const correlationId = (payload.correlationId ?? "").trim() || undefined;
  const policyPrompt = (payload.policyPrompt ?? "").trim() || undefined;
  const retrievedContext = (payload.retrievedContext ?? "").trim() || undefined;
  const systemPrompt = (payload.systemPrompt ?? "").trim() || undefined;
  if (!fromOwnerId || !text) {
    return null;
  }
  return {
    from,
    fromOwnerId,
    fromName,
    text,
    policyPrompt,
    retrievedContext,
    systemPrompt,
    correlationId,
  };
}

export function createEnvoymeshWebhookHandler(deps: EnvoymeshWebhookHandlerDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    if (!validateInboundSecret(req, deps.account.inboundSecret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const requestLifecycle = beginWebhookRequestPipelineOrReject({
      req,
      res,
      inFlightLimiter: webhookInFlightLimiter,
      inFlightKey: `envoymesh:${deps.account.accountId}`,
    });
    if (!requestLifecycle.ok) {
      return;
    }

    try {
      let raw = "";
      try {
        raw = await readRequestBodyWithLimit(req, {
          maxBytes: MAX_BODY_BYTES,
          timeoutMs: BODY_TIMEOUT_MS,
        });
      } catch (err) {
        if (isRequestBodyLimitError(err)) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: requestBodyErrorToText(err) }));
          return;
        }
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid body" }));
        return;
      }

      const payload = parsePayload(raw);
      if (!payload) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
        return;
      }

      deps.log?.info?.(`EnvoyMesh webhook received: fromOwnerId=${payload.fromOwnerId ?? ""} text=${(payload.text ?? "").slice(0, 50)} cid=${payload.correlationId ?? ""}`);

      const asyncMsg = toAsyncInboundMessage(payload);
      if (asyncMsg) {
        if (isDuplicateAsyncInbound(asyncMsg.messageId)) {
          deps.log?.info?.(`EnvoyMesh duplicate async skipped: ${asyncMsg.messageId}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", warning: "deduplicated" }));
          return;
        }
        const deliverAsync = deps.deliverAsync ?? dispatchEnvoymeshAsyncInboundEvent;
        try {
          await deliverAsync({ account: deps.account, msg: asyncMsg, log: deps.log });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          deps.log?.error?.(`EnvoyMesh async deliver failed: ${message}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
        return;
      }

      const msg = toInboundMessage(payload);
      if (!msg) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "fromOwnerId and text are required" }));
        return;
      }

      if (!isOwnerAllowed(deps.account, msg.fromOwnerId)) {
        deps.log?.warn?.(`EnvoyMesh inbound denied for owner ${msg.fromOwnerId}`);
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "sender not allowed" }));
        return;
      }

      if (isDuplicateInbound(msg.fromOwnerId, msg.text)) {
        deps.log?.info?.(`EnvoyMesh duplicate inbound skipped for ${msg.fromOwnerId}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", warning: "deduplicated" }));
        return;
      }

      if (msg.from) {
        rememberMeshPeer(msg.fromOwnerId, msg.from);
      }

      if (process.env.ENVOYMESH_SMOKE_ECHO === "1") {
        if (!msg.from?.trim()) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "from (peer id) is required for smoke echo" }));
          return;
        }
        const replyText =
          process.env.ENVOYMESH_SMOKE_REPLY?.trim() ||
          `openclaw live smoke echo: ${msg.text}`;
        try {
          await sendBridgeMessage({
            bridgeUrl: deps.account.bridgeUrl,
            bridgeSecret: deps.account.bridgeSecret,
            to: msg.from,
            text: replyText,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", mode: "smoke-echo" }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          deps.log?.error?.(`EnvoyMesh smoke echo failed: ${message}`);
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
        return;
      }

      try {
        await deps.deliver(msg);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.log?.error?.(`EnvoyMesh inbound deliver failed: ${message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
    } finally {
      requestLifecycle.release();
    }
  };
}
