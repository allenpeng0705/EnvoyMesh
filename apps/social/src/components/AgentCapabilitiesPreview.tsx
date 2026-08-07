import { useId, useState, type MouseEvent } from "react";
import { useT } from "../context/I18nContext.js";
import { ModalPortal } from "./ModalPortal.js";

const PREVIEW_LIMIT = 3;

export interface AgentCapabilitiesPreviewProps {
  /** Tags to preview (Agent Network skills). */
  tags: readonly string[];
  /** Compact chips for crowded worker rows (Team jobs). Default false = panel layout. */
  compact?: boolean;
  /** Optional title override for the popup. */
  title?: string;
  /** Optional display label for each tag (e.g. localized skill names). */
  labelFor?: (tag: string) => string;
}

/**
 * Shows up to 3 tags inline; "+N more" opens a modal with the full list.
 * Used on Team worker rows for Agent Network skills (not mesh capability IDs).
 */
export function AgentCapabilitiesPreview({
  tags,
  compact = false,
  title,
  labelFor,
}: AgentCapabilitiesPreviewProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  if (tags.length === 0) return null;

  const preview = tags.slice(0, PREVIEW_LIMIT);
  const hiddenCount = tags.length - preview.length;
  const heading = title ?? t("settings.agentNetwork.membership.skills", "Skills");
  const label = (tag: string) => (labelFor ? labelFor(tag) : tag);

  const openModal = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <div
        className={
          compact
            ? "agent-caps-preview agent-caps-preview--compact"
            : "agent-caps-preview"
        }
        data-testid="agent-caps-preview"
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="agent-caps-preview__list" aria-label={heading}>
          {preview.map((cap) => (
            <li key={cap} className="agent-caps-preview__item">
              <code>{label(cap)}</code>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <button
            type="button"
            className="agent-caps-preview__more"
            onClick={openModal}
            data-testid="agent-caps-more"
          >
            {t("agentCard.capabilitiesMore", "+{count} more", { count: String(hiddenCount) })}
          </button>
        ) : null}
      </div>

      {open ? (
        <ModalPortal>
          <div
            className="modal-overlay"
            role="presentation"
            onClick={() => setOpen(false)}
            data-testid="agent-caps-modal-overlay"
          >
            <div
              className="modal-panel agent-caps-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id={titleId}>{heading}</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setOpen(false)}
                  aria-label={t("common.close", "Close")}
                >
                  ×
                </button>
              </div>
              <ul className="agent-caps-modal__list" data-testid="agent-caps-modal-list">
                {tags.map((cap) => (
                  <li key={cap} className="agent-caps-modal__item">
                    <code>{label(cap)}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
