import type { ReactNode } from "react";
import type { MessageStackPosition } from "../lib/chat-message-stack.js";
import { stackPositionClass } from "../lib/chat-message-stack.js";
import type { MessageVisualVariant } from "../lib/chat-thread-kind.js";

interface ChatMessageBubbleProps {
  variant: MessageVisualVariant;
  position: MessageStackPosition;
  senderLabel?: string;
  timeLabel?: string;
  deliveryReceipt?: "pending" | "sent" | "delivered" | "read" | "failed";
  children: ReactNode;
}

const DELIVERY_LABEL: Record<NonNullable<ChatMessageBubbleProps["deliveryReceipt"]>, string> = {
  pending: "Sending…",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

const VARIANT_BADGE: Record<MessageVisualVariant, string> = {
  outgoing: "You",
  "incoming-peer": "",
  "incoming-agent": "Agent",
  "ai-outgoing": "You",
  "ai-incoming": "Envoy AI",
};

/** One bubble in a grouped chat stack. */
export function ChatMessageBubble({
  variant,
  position,
  senderLabel,
  timeLabel,
  deliveryReceipt,
  children,
}: ChatMessageBubbleProps) {
  const showMeta = position === "single" || position === "last";
  const badge =
    variant === "incoming-peer" && senderLabel
      ? String(senderLabel)
      : VARIANT_BADGE[variant];

  const showMetaRow = showMeta && (badge || timeLabel != null || deliveryReceipt != null);

  return (
    <div className={`message-bubble ${variant} ${stackPositionClass(position)}`}>
      {showMetaRow ? (
        <div className="message-bubble-meta">
          {badge ? <span className="message-bubble-badge">{badge}</span> : null}
          {timeLabel != null ? (
            <span className="message-bubble-time">{timeLabel}</span>
          ) : null}
          {deliveryReceipt != null ? (
            <span className={`message-delivery-status status-${deliveryReceipt}`}>
              {DELIVERY_LABEL[deliveryReceipt]}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="message-bubble-body">{children}</div>
    </div>
  );
}
