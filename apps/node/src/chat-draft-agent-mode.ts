import { randomUUID } from "node:crypto";
import { createAuditEvent, type ChatDraftStore, type LocalTaskStore } from "@envoymesh/local-store";
import { stripModelThinking } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import type { ChatDraftFailure, ChatDraftResult } from "./chat-draft-inbound.js";

/**
 * Generate a contact-chat draft via OpenClaw (owner-scoped knowledge + tools).
 * Used when per-contact Agent Mode is enabled.
 */
export async function generateAgentModeChatDraft(input: {
  envelope: EnvoyEnvelope;
  senderOwnerId: string;
  senderDisplayName: string;
  chatText: string;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  threadKey: string;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  draftStore: ChatDraftStore;
  askOpenClaw: (prompt: string, context?: unknown) => Promise<string>;
  buildOpenClawTurnContext?: () => Promise<unknown>;
  ensureOpenClawReady?: () => boolean | Promise<boolean>;
}): Promise<ChatDraftResult | ChatDraftFailure> {
  const {
    envelope,
    senderOwnerId,
    senderDisplayName,
    chatText,
    remotePeerId,
    receivedAt,
    correlationId,
    threadKey,
    taskStore,
    draftStore,
    askOpenClaw,
    buildOpenClawTurnContext,
    ensureOpenClawReady,
  } = input;

  if (ensureOpenClawReady) {
    const ready = await Promise.resolve(ensureOpenClawReady());
    if (!ready) {
      return { ok: false, reason: "OpenClaw not available" };
    }
  }

  const prompt = `You are drafting a reply for the owner's contact chat (Agent Mode).

Contact: "${senderDisplayName}" (${senderOwnerId})

Inbound message:
"""
${chatText}
"""

Task: draft a short reply (1–3 sentences) the owner can send to this contact.
Guidelines:
- Match the tone and topic of the inbound message.
- You may use owner knowledge, local files, and tools when needed.
- Reply with only the draft text — no preamble, labels, or quotes around it.`;

  let context: unknown;
  try {
    context = buildOpenClawTurnContext ? await buildOpenClawTurnContext() : undefined;
  } catch {
    context = undefined;
  }

  let rawText: string;
  try {
    rawText = await askOpenClaw(prompt, context);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `OpenClaw draft failed: ${reason}` };
  }

  const draftText = stripModelThinking(rawText).trim();
  if (!draftText) {
    return { ok: false, reason: "OpenClaw returned empty draft" };
  }

  const draftId = randomUUID();
  const createdAt = new Date().toISOString();
  const draft = {
    draftId,
    threadPeerOwnerId: threadKey,
    inReplyToMessageId: envelope.messageId,
    text: draftText,
    createdAt,
  };

  await draftStore.save(draft);

  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "model.routed",
      intent: "chat.message",
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: `chat draft created (agent mode/OpenClaw): id=${draftId}`,
      createdAt: new Date().toISOString(),
    }),
  );

  return {
    ok: true,
    draft: {
      draftId,
      text: draftText,
      inReplyToMessageId: envelope.messageId,
      createdAt,
    },
    auditWritten: true,
  };
}
