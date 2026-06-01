import { useMemo, useState, type ReactNode } from "react";
import { useT } from "../context/I18nContext.js";
import { CopyIcon, RemoveIcon } from "../icons.js";
import type { MessageStackPosition } from "../lib/chat-message-stack.js";
import { stackPositionClass } from "../lib/chat-message-stack.js";
import type { MessageVisualVariant } from "../lib/chat-thread-kind.js";

interface ChatMessageBubbleProps {
  variant: MessageVisualVariant;
  position: MessageStackPosition;
  senderLabel?: string;
  /** Verified agent badge override (Phase 13B). */
  actorBadge?: string;
  timeLabel?: string;
  deliveryReceipt?: "pending" | "sent" | "delivered" | "read" | "failed";
  /** Overrides default delivery label (e.g. partial group delivery). */
  deliveryDetail?: string;
  copyText?: string;
  onDelete?: () => void;
  children: ReactNode;
}

/** One bubble in a grouped chat stack. */
export function ChatMessageBubble({
  variant,
  position,
  senderLabel,
  actorBadge,
  timeLabel,
  deliveryReceipt,
  deliveryDetail,
  copyText,
  onDelete,
  children,
}: ChatMessageBubbleProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const showMeta = position === "single" || position === "last";

  const deliveryLabel = useMemo(() => {
    if (deliveryDetail) return deliveryDetail;
    if (!deliveryReceipt) return "";
    const labels = {
      pending: t("messageBubble.deliveryPending"),
      sent: t("messageBubble.deliverySent"),
      delivered: t("messageBubble.deliveryDelivered"),
      read: t("messageBubble.deliveryRead"),
      failed: t("messageBubble.deliveryFailed"),
    } as const;
    return labels[deliveryReceipt];
  }, [deliveryDetail, deliveryReceipt, t]);

  const variantBadge = useMemo(() => {
    const badges: Record<MessageVisualVariant, string> = {
      outgoing: t("messageBubble.you"),
      "outgoing-agent": t("messageBubble.yourAgent"),
      "incoming-peer": "",
      "incoming-agent": t("messageBubble.agent"),
      "ai-outgoing": t("messageBubble.you"),
      "ai-incoming": t("messageBubble.envoyAi"),
    };
    return badges[variant];
  }, [t, variant]);

  const badge =
    actorBadge ??
    (variant === "incoming-peer" && senderLabel
      ? String(senderLabel)
      : variantBadge);

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
      <div className="message-bubble-body">{children}</div>
      {showDelivery || trimmedCopyText || onDelete ? (
        <div className="message-bubble-footer">
          {showDelivery ? (
            <span className={`message-delivery-status status-${deliveryReceipt}`}>
              {deliveryLabel}
            </span>
          ) : null}
          {trimmedCopyText || onDelete ? (
            <div className="message-bubble-actions">
              {trimmedCopyText ? (
                <button
                  type="button"
                  className={`message-copy-btn${copied ? " is-copied" : ""}`}
                  aria-label={copied ? t("messageBubble.copied") : t("messageBubble.copyMessage")}
                  title={copied ? t("messageBubble.copied") : t("messageBubble.copyMessage")}
                  onClick={() => void handleCopy()}
                >
                  <CopyIcon size={14} />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="message-delete-btn"
                  aria-label={t("messageBubble.deleteMessage")}
                  title={t("messageBubble.deleteMessage")}
                  onClick={onDelete}
                >
                  <RemoveIcon size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
