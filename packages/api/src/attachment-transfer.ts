/** Stages of a chat attachment outbound pipeline (metadata → share → bytes). */
export type AttachmentTransferStage = "chat" | "share" | "data";

export type AttachmentTransferStatus = "started" | "completed" | "failed";

/** Progress event for voice notes and file attachments in 1:1 chat. */
export type ChatAttachmentTransferEvent = {
  targetOwnerId: string;
  messageId: string;
  attachmentId: string;
  stage: AttachmentTransferStage;
  status: AttachmentTransferStatus;
  reason?: string;
};
