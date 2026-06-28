import type { ChatAttachmentTransferEvent } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import type { ChatDeliverResult } from "./chat-outbound-deliver.js";
import { outboundDeliveryTrace } from "./outbound-delivery-trace.js";

const STAGE_PAUSE_MS = 400;
const RETRY_BASE_MS = 800;
const MAX_ATTEMPTS = 3;

export type StagedAttachmentDeliverInput = {
  targetOwnerId: string;
  messageId: string;
  attachmentId: string;
  deliverChat: () => Promise<ChatDeliverResult>;
  deliverShare: () => Promise<void>;
  onEvent?: (event: ChatAttachmentTransferEvent) => void;
};

export type StagedAttachmentDeliverResult = {
  chatDelivered: boolean;
  shareDelivered: boolean;
};

function emit(
  onEvent: StagedAttachmentDeliverInput["onEvent"],
  event: ChatAttachmentTransferEvent,
): void {
  onEvent?.(event);
  outboundDeliveryTrace("attachment", {
    stage: event.stage,
    status: event.status,
    messageId: event.messageId.slice(0, 12),
  });
}

/** Unified chat → share attachment pipeline with stage events. */
export async function deliverStagedChatAttachmentPipeline(
  input: StagedAttachmentDeliverInput,
): Promise<StagedAttachmentDeliverResult> {
  const base = {
    targetOwnerId: input.targetOwnerId,
    messageId: input.messageId,
    attachmentId: input.attachmentId,
  };

  emit(input.onEvent, { ...base, stage: "chat", status: "started" });
  let chatDelivered = false;
  let lastChatErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
    }
    try {
      const result = await input.deliverChat();
      if (result.delivered) {
        chatDelivered = true;
        break;
      }
      lastChatErr = new Error("chat.message not acknowledged");
    } catch (err) {
      lastChatErr = err;
    }
  }

  if (!chatDelivered) {
    emit(input.onEvent, {
      ...base,
      stage: "chat",
      status: "failed",
      reason: lastChatErr instanceof Error ? lastChatErr.message : String(lastChatErr),
    });
    return { chatDelivered: false, shareDelivered: false };
  }

  emit(input.onEvent, { ...base, stage: "chat", status: "completed" });
  await new Promise((resolve) => setTimeout(resolve, STAGE_PAUSE_MS));

  emit(input.onEvent, { ...base, stage: "share", status: "started" });
  let shareDelivered = false;
  let lastShareErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
    }
    try {
      await input.deliverShare();
      shareDelivered = true;
      break;
    } catch (err) {
      lastShareErr = err;
    }
  }

  if (!shareDelivered) {
    emit(input.onEvent, {
      ...base,
      stage: "share",
      status: "failed",
      reason: lastShareErr instanceof Error ? lastShareErr.message : String(lastShareErr),
    });
    return { chatDelivered: true, shareDelivered: false };
  }

  emit(input.onEvent, { ...base, stage: "share", status: "completed" });
  emit(input.onEvent, { ...base, stage: "data", status: "completed" });
  return { chatDelivered: true, shareDelivered: true };
}
