import { randomUUID } from "node:crypto";
import { createAuditEvent, type ChatDraftStore, type LocalTaskStore } from "@envoymesh/local-store";
import { stripModelThinking } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import type { ChatDraftFailure, ChatDraftResult } from "./chat-draft-inbound.js";

/**
 * Generate a contact-chat draft via OpenClaw (contact-scoped knowledge).
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
  /** Contact knowledge ceiling (default public). */
  knowledgeAccess?: "public" | "friends" | "private";
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
    knowledgeAccess = "public",
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
- Use only knowledge appropriate to share with this contact (public/friends ceiling as configured).
- Reply with only the draft text — no preamble, labels, or quotes around it.`;

  let baseContext: Record<string, unknown> = {};
  try {
    const built = buildOpenClawTurnContext ? await buildOpenClawTurnContext() : undefined;
    if (built && typeof built === "object") {
      baseContext = { ...(built as Record<string, unknown>) };
    }
  } catch {
    baseContext = {};
  }

  const context = {
    ...baseContext,
    retrievedContext: {
      knowledgeAccess,
      knowledgeScope: "public" as const,
      contactThreadOwnerId: senderOwnerId,
    },
  };

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
