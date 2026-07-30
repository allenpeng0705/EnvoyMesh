/**
 * "⋯" overlay on an AI bot sidebar row — same chrome as Ext Agent switcher:
 * full-width thread row + absolute icon button that stops row click.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import type { AiBotDefinition } from "@envoymesh/api";
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

export interface AiBotRowMenuProps {
  bot: AiBotDefinition;
  onEdit: (bot: AiBotDefinition) => void;
  onDelete: (bot: AiBotDefinition) => void;
}

export function AiBotRowMenu({ bot, onEdit, onDelete }: AiBotRowMenuProps) {
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
      data-testid={`ai-bot-row-menu-wrap-${bot.id}`}
      onClick={stopRowClick}
      onMouseDown={stopRowClick}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`ai-bot-row-menu-btn${open ? " ai-bot-row-menu-btn--open" : ""}`}
        aria-label={t("chat.botMenuAria", "Bot options")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("chat.botMenuAria", "Bot options")}
        data-testid={`ai-bot-row-menu-btn-${bot.id}`}
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
              data-testid={`ai-bot-row-menu-${bot.id}`}
              style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 10000 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="context-menu-item"
                role="menuitem"
                data-testid={`ai-bot-row-menu-edit-${bot.id}`}
                onClick={() => {
                  setOpen(false);
                  onEdit(bot);
                }}
              >
                {t("settings.ai.aiBots.edit", "Edit")}
              </div>
              <div className="context-menu-divider" role="separator" />
              <div
                className="context-menu-item context-menu-item--danger"
                role="menuitem"
                data-testid={`ai-bot-row-menu-delete-${bot.id}`}
                onClick={() => {
                  setOpen(false);
                  onDelete(bot);
                }}
              >
                {t("settings.ai.aiBots.delete", "Delete")}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
