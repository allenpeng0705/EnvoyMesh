import { useEffect, useId, useRef, useState } from "react";
import type { AgentDraftAttachment } from "../lib/agent-attachments.js";
import { attachmentBasename } from "../lib/agent-attachments.js";

export interface AgentAttachmentChipsProps {
  attachments: AgentDraftAttachment[];
  onRemove?: (id: string) => void;
  /** Clear all drafts (composer only). */
  onClearAll?: () => void;
  /** Read-only chips in a sent bubble. */
  readOnly?: boolean;
}

/**
 * Compact attach badge (e.g. "📎 3") that opens a details popover.
 * Keeps the composer text field full-width — never a full-row bar.
 */
export function AgentAttachmentChips({
  attachments,
  onRemove,
  onClearAll,
  readOnly = false,
}: AgentAttachmentChipsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (attachments.length === 0) setOpen(false);
  }, [attachments.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (attachments.length === 0) return null;

  const count = attachments.length;
  const label =
    count === 1
      ? attachments[0]!.name?.trim() || attachmentBasename(attachments[0]!.path)
      : `${count}`;

  return (
    <div
      ref={rootRef}
      className={`agent-attachment-badge${open ? " is-open" : ""}${readOnly ? " is-readonly" : ""}`}
    >
      <button
        type="button"
        className="agent-attachment-badge-btn"
        aria-expanded={open}
        aria-controls={panelId}
        title={
          count === 1
            ? attachments[0]!.path
            : `${count} attached files — click for details`
        }
        onClick={() => setOpen((v) => !v)}
      >
        <span className="agent-attachment-badge-icon" aria-hidden>
          📎
        </span>
        <span className="agent-attachment-badge-count">{label}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="agent-attachment-popover"
          role="list"
          aria-label="Attached files"
        >
          <div className="agent-attachment-popover-head">
            <span>
              {count} file{count === 1 ? "" : "s"}
            </span>
            {!readOnly && onClearAll ? (
              <button
                type="button"
                className="agent-attachment-popover-clear"
                onClick={() => {
                  setOpen(false);
                  onClearAll();
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
          {attachments.map((att) => {
            const name = att.name?.trim() || attachmentBasename(att.path);
            const isImage = att.mimeType?.startsWith("image/") && att.previewUrl;
            return (
              <div
                key={att.id}
                className="agent-attachment-popover-row"
                role="listitem"
              >
                {isImage ? (
                  <img
                    className="agent-attachment-chip-thumb"
                    src={att.previewUrl}
                    alt=""
                  />
                ) : (
                  <span className="agent-attachment-chip-icon" aria-hidden>
                    📎
                  </span>
                )}
                <div className="agent-attachment-popover-meta">
                  <div className="agent-attachment-popover-name" title={att.path}>
                    {name}
                  </div>
                  <div className="agent-attachment-popover-path" title={att.path}>
                    {att.path}
                  </div>
                </div>
                {!readOnly && onRemove ? (
                  <button
                    type="button"
                    className="agent-attachment-chip-remove"
                    aria-label={`Remove ${name}`}
                    onClick={() => onRemove(att.id)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
