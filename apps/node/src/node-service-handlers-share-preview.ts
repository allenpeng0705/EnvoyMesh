/**
 * Inbound intent handlers — Phase 1: share.preview.
 *
 * Extracted from `_handleInboundMessage` in `node-service-impl.ts`.
 * Each intent handler becomes a small runtime function so it can be
 * tested in isolation.
 */
import { parseSharePreviewPayload } from "@envoymesh/protocol";

export interface SharePreviewContext {
  recordInboundPullSharePreview(input: {
    previewMessageId: string;
    inReplyToRequestMsgId: string;
    senderPeerId: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
  }): boolean;
  linkOutboundSharePreviewFromInbound(messageId: string, inReplyTo: string): void;
}

/** Returns true if the handler consumed the envelope. */
export function handleSharePreviewViaRuntime(
  ctx: SharePreviewContext,
  envelope: {
    messageId: string;
    payload: unknown;
  },
  remotePeerId: string,
): boolean {
  try {
    const previewPayload = parseSharePreviewPayload(envelope.payload);
    if (previewPayload.isFileTransfer && !previewPayload.refused) {
      const recorded = ctx.recordInboundPullSharePreview({
        previewMessageId: envelope.messageId,
        inReplyToRequestMsgId: previewPayload.inReplyTo,
        senderPeerId: remotePeerId,
        previewText: previewPayload.previewText ?? "",
        sensitivity: previewPayload.sensitivity as "public" | "friends" | "private",
      });
      if (!recorded) {
        ctx.linkOutboundSharePreviewFromInbound(
          envelope.messageId,
          previewPayload.inReplyTo,
        );
      }
    }
  } catch {
    /* ignore invalid preview */
  }
  return true;
}