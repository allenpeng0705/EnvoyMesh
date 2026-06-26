import type { ChatRoomAttachment } from "@envoymesh/protocol";
import type { ChatAttachment } from "./node-service.js";

/** Shown in chat UI / AI assist when a voice note has no transcription. */
export const AUDIO_MESSAGE_FALLBACK_TEXT =
  "[Audio message — no transcription available]";

export function isAudioMimeType(mimeType: string | undefined): boolean {
  const base = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return base.startsWith("audio/");
}

export function hasAudioChatAttachments(
  attachments: ReadonlyArray<{ mimeType?: string }> | undefined,
): boolean {
  return attachments?.some((att) => isAudioMimeType(att.mimeType)) ?? false;
}

/** True when [text] is the standard voice-note placeholder (not a real transcription). */
export function isAudioPlaceholderChatText(text: string | undefined): boolean {
  return text?.trim() === AUDIO_MESSAGE_FALLBACK_TEXT;
}

/** Persist/display text for inbound or outbound audio-only chat messages. */
export function resolveInboundChatDisplayText(
  text: string,
  attachments?: ReadonlyArray<{ mimeType?: string }>,
): string {
  if (text.trim()) {
    return text;
  }
  if (hasAudioChatAttachments(attachments)) {
    return AUDIO_MESSAGE_FALLBACK_TEXT;
  }
  return text;
}

export function deferredDirectChatAttachmentKey(
  peerOwnerId: string,
  messageId: string,
  attachmentId: string,
): string {
  return `${peerOwnerId.trim()}\n${messageId.trim()}\n${attachmentId.trim()}`;
}

function chatAttachmentSensitivity(
  sensitivity: ChatRoomAttachment["sensitivity"],
): ChatAttachment["sensitivity"] {
  return sensitivity === "trusted" ? "friends" : sensitivity;
}

/** Map wire chat attachments to local chat message content (optional vault paths after transfer). */
export function chatWireAttachmentsToContent(
  wire: ChatRoomAttachment[] | undefined,
  localVaultById?: Map<string, string>,
): ChatAttachment[] | undefined {
  if (!wire?.length) return undefined;
  return wire.map((att) => ({
    id: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    sizeBytes: att.sizeBytes,
    sensitivity: chatAttachmentSensitivity(att.sensitivity),
    ...(localVaultById?.get(att.id) ? { vaultRelativePath: localVaultById.get(att.id) } : {}),
  }));
}
