/**
 * "⋯" overlay on a Coding-section envoy-harness row — remove thread from sidebar.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import type { EhChatTaskSummary } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { MoreIcon } from "../icons.js";

const MENU_PAD = 8;

function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxX = Math.max(MENU_PAD, window.innerWidth - width - MENU_PAD);
  const maxY = Math.max(MENU_PAD, window.innerHeight - height - MENU_PAD);
  return {
    x: Math.min(Math.max(MENU_PAD, x), maxX),
    y: Math.min(Math.max(MENU_PAD, y), maxY),
  };
}

export interface EhChatRowMenuProps {
  chat: EhChatTaskSummary;
  onRemove: (chat: EhChatTaskSummary) => void;
  /** Change the agent used by this task only. */
  onAgentSettings?: (chat: EhChatTaskSummary) => void;
  /** History-as-list-power — archive / unarchive this task. */
  archiveLabel?: string;
  onArchive?: (chat: EhChatTaskSummary) => void;
  /** Phase 68-C6 — add heartbeat for this EH task. */
  onAddHeartbeat?: (chat: EhChatTaskSummary) => void;
}

export function EhChatRowMenu({
  chat,
  onRemove,
  onAgentSettings,
  archiveLabel,
  onArchive,
  onAddHeartbeat,
}: EhChatRowMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !pos) return;
    const el = menuRef.current;
    const next = clampMenuPosition(pos.x, pos.y, el.offsetWidth, el.offsetHeight);
    if (next.x !== pos.x || next.y !== pos.y) setPos(next);
  }, [open, pos]);

  const stopRowClick = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const toggleMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    setPos({
      x: rect ? rect.right - 140 : e.clientX,
      y: rect ? rect.bottom + 4 : e.clientY,
    });
    setOpen(true);
  };

  return (
    <div
      className="ai-bot-row-menu"
      data-testid={`eh-chat-row-menu-wrap-${chat.id}`}
      onClick={stopRowClick}
      onMouseDown={stopRowClick}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`ai-bot-row-menu-btn${open ? " ai-bot-row-menu-btn--open" : ""}`}
        aria-label={t(
          "codingView.taskActionsAria",
          "Task actions",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("codingView.taskActionsAria", "Task actions")}
        data-testid={`eh-chat-row-menu-btn-${chat.id}`}
        onClick={toggleMenu}
      >
        <MoreIcon size={16} className="ai-bot-row-menu-btn-icon" />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              className="context-menu ai-bot-row-menu-popup"
              role="menu"
              data-testid={`eh-chat-row-menu-${chat.id}`}
              style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 10000 }}
              onClick={(e) => e.stopPropagation()}
            >
              {onAgentSettings ? (
                <div
                  className="context-menu-item"
                  role="menuitem"
                  data-testid={`eh-chat-row-menu-agent-${chat.id}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    window.setTimeout(() => onAgentSettings(chat), 0);
                  }}
                >
                  {t("codingView.taskAgentSettings", "Agent settings")}
                </div>
              ) : null}
              {onAddHeartbeat ? (
                <div
                  className="context-menu-item"
                  role="menuitem"
                  data-testid={`eh-chat-row-menu-heartbeat-${chat.id}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    window.setTimeout(() => onAddHeartbeat(chat), 0);
                  }}
                >
                  {t("codingView.heartbeatAdd", "Add heartbeat…")}
                </div>
              ) : null}
              {archiveLabel && onArchive ? (
                <div
                  className="context-menu-item"
                  role="menuitem"
                  data-testid={`eh-chat-row-menu-archive-${chat.id}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    window.setTimeout(() => onArchive(chat), 0);
                  }}
                >
                  {archiveLabel}
                </div>
              ) : null}
              <div
                className="context-menu-item context-menu-item--danger"
                role="menuitem"
                data-testid={`eh-chat-row-menu-remove-${chat.id}`}
                onMouseDown={(e) => {
                  // Prevent the triggering click from falling through onto a
                  // ConfirmDialog overlay mounted in the same gesture.
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  window.setTimeout(() => onRemove(chat), 0);
                }}
              >
                {t("codingView.remove", "Remove")}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
