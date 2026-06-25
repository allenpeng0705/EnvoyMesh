import type { BridgeConfig } from "./config.js";
import { bridgeForwardAuthSecret } from "./config.js";

const ASYNC_REPLY_MAX_BYTES = 128 * 1024;
const ASYNC_REPLY_MAX_PER_MINUTE = 60;

const recentAsyncForwards: number[] = [];

export interface AsyncMeshReplyMessage {
  intent: "discovery.response" | "knowledge.response";
  correlationId?: string;
  senderPeerId: string;
  remotePeerId: string;
  messageId: string;
  payload: unknown;
}

export function resetBridgeAsyncReplyRateLimitForTests(): void {
  recentAsyncForwards.length = 0;
}

export function checkBridgeAsyncReplyRateLimit(now = Date.now()): boolean {
  while (recentAsyncForwards.length > 0 && recentAsyncForwards[0]! < now - 60_000) {
    recentAsyncForwards.shift();
  }
  if (recentAsyncForwards.length >= ASYNC_REPLY_MAX_PER_MINUTE) {
    return false;
  }
  recentAsyncForwards.push(now);
  return true;
}

/**
 * Forward async mesh replies (discovery.response / knowledge.response) to the external agent HTTP endpoint.
 */
export async function forwardAsyncMeshReply(
  config: BridgeConfig,
  msg: AsyncMeshReplyMessage,
): Promise<void> {
  if (!checkBridgeAsyncReplyRateLimit()) {
    throw new Error("bridge async mesh reply rate limit exceeded");
  }

  const payloadJson = JSON.stringify(msg.payload ?? null);
  if (Buffer.byteLength(payloadJson, "utf8") > ASYNC_REPLY_MAX_BYTES) {
    throw new Error("async mesh reply payload too large");
  }

  const body = JSON.stringify({
    type: "mesh.async_reply",
    intent: msg.intent,
    correlationId: msg.correlationId,
    fromPeerId: msg.senderPeerId,
    remotePeerId: msg.remotePeerId,
    messageId: msg.messageId,
    payload: msg.payload,
  });

  if (Buffer.byteLength(body, "utf8") > ASYNC_REPLY_MAX_BYTES) {
    throw new Error("async mesh reply body too large");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = bridgeForwardAuthSecret(config);
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const res = await fetch(config.agentUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Agent returned ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
