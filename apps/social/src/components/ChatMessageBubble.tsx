import { useState, type ReactNode } from "react";
import { CopyIcon, RemoveIcon } from "../icons.js";
import type { MessageStackPosition } from "../lib/chat-message-stack.js";
import { stackPositionClass } from "../lib/chat-message-stack.js";
import type { MessageVisualVariant } from "../lib/chat-thread-kind.js";

interface ChatMessageBubbleProps {
  variant: MessageVisualVariant;
  position: MessageStackPosition;
  senderLabel?: string;
  timeLabel?: string;
  deliveryReceipt?: "pending" | "sent" | "delivered" | "read" | "failed";
  copyText?: string;
  onDelete?: () => void;
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
  copyText,
  onDelete,
  children,
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const showMeta = position === "single" || position === "last";
  const badge =
    variant === "incoming-peer" && senderLabel
      ? String(senderLabel)
      : VARIANT_BADGE[variant];

  const showMetaRow = showMeta && (badge || timeLabel != null);
  const showDelivery = deliveryReceipt != null;
  const trimmedCopyText = copyText?.trim() ?? "";

  async function handleCopy() {
    if (!trimmedCopyText) return;
    try {
      await navigator.clipboard.writeText(trimmedCopyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — selection + manual copy still works
    }
  }

  return (
    <div className={`message-bubble ${variant} ${stackPositionClass(position)}`}>
      {showMetaRow ? (
        <div className="message-bubble-meta">
          {badge ? <span className="message-bubble-badge">{badge}</span> : null}
          {timeLabel != null ? (
            <span className="message-bubble-time">{timeLabel}</span>
          ) : null}
        </div>
      ) : null}
      <div className="message-bubble-body">
        {(trimmedCopyText || onDelete) ? (
          <div className="message-bubble-actions">
            {trimmedCopyText ? (
              <button
                type="button"
                className={`message-copy-btn${copied ? " is-copied" : ""}`}
                aria-label={copied ? "Copied" : "Copy message"}
                title={copied ? "Copied" : "Copy message"}
                onClick={() => void handleCopy()}
              >
                <CopyIcon size={14} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="message-delete-btn"
                aria-label="Delete message"
                title="Delete message"
                onClick={onDelete}
              >
                <RemoveIcon size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
      {showDelivery ? (
        <div className="message-bubble-footer">
          <span className={`message-delivery-status status-${deliveryReceipt}`}>
            {DELIVERY_LABEL[deliveryReceipt]}
          </span>
        </div>
      ) : null}
    </div>
  );
}
