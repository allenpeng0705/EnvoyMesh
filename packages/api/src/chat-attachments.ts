import type { ChatRoomAttachment } from "@envoymesh/protocol";
import type { ChatAttachment } from "./node-service.js";

const AUDIO_MIME_PREFIXES = ["audio/", "video/"];

export function resolveInboundChatDisplayText(
  text: string,
  _attachments?: unknown[],
): string {
  return text || "";
}

export const ENVOY_AI_THREAD_KEY = "envoy:ai";

export function isAudioMimeType(mimeType?: string): boolean {
  if (!mimeType) return false;
  return AUDIO_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
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
