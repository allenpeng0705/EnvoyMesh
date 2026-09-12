import {
  chatMessageTextForDisplay,
  parseCodingReviewRef,
  stripModelThinking,
  type AiIdentity,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { openCoding } from "../lib/open-coding-nav.js";
import { Markdown } from "./Markdown.js";

interface ChatMessageTextProps {
  text: string;
  className?: string;
  /** Strips configured debug prefix from message body for display. */
  identity?: AiIdentity | null;
}

function humanTextWithoutMarker(text: string): string {
  const markerIdx = text.indexOf("[envoymesh-coding-review]");
  if (markerIdx < 0) return text;
  return text.slice(0, markerIdx).trimEnd();
}

export function ChatMessageText({
  text,
  className = "message-text",
  identity,
}: ChatMessageTextProps) {
  const t = useT();
  const { humanProfile } = useNodeState();
  const display = chatMessageTextForDisplay(stripModelThinking(text), identity);
  const reviewRef = parseCodingReviewRef(display);
  const body = reviewRef ? humanTextWithoutMarker(display) : display;
  const localOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const sameHome =
    !reviewRef || !localOwnerId || reviewRef.ownerId === localOwnerId;

  return (
    <>
      <Markdown text={body} className={className} />
      {reviewRef ? (
        <div
          className="chat-coding-review-cta"
          data-testid="chat-coding-review-cta"
        >
          {!sameHome ? (
            <p className="chat-coding-review-cta__hint">
              {t(
                "codingView.inviteReviewOpenOnOwnerHome",
                "Open on the owner’s home node to review this workspace.",
              )}
            </p>
          ) : null}
          <button
            type="button"
            className="primary"
            data-testid="chat-coding-review-open"
            onClick={() => {
              openCoding({
                chatId: reviewRef.chatId,
                reviewOnly: true,
                harness: "envoy-harness",
              });
            }}
          >
            {t("codingView.openReview", "Open review")}
          </button>
        </div>
      ) : null}
    </>
  );
}
