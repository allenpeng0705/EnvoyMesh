/**
 * Compact ⋯ menu for Coding sidebar rows (project / workspace).
 * Actions only affect Coding UI — never disk folders or files
 * (except “Open in file manager”, which reveals the path on the home node).
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

export type CodingSidebarMenuProps = {
  testId: string;
  ariaLabel: string;
  removeLabel: string;
  onRemove: () => void;
  /** Project settings sheet. */
  settingsLabel?: string;
  onOpenSettings?: () => void;
  /** Reveal project folder on the home node. */
  revealLabel?: string;
  onReveal?: () => void;
  /** Optional archive / unarchive (History-as-list-power). */
  archiveLabel?: string;
  onArchive?: () => void;
  /** Phase 68-C6 — add heartbeat for this workspace. */
  heartbeatLabel?: string;
  onAddHeartbeat?: () => void;
};

export function CodingSidebarMenu({
  testId,
  ariaLabel,
  removeLabel,
  onRemove,
  settingsLabel,
  onOpenSettings,
  revealLabel,
  onReveal,
  archiveLabel,
  onArchive,
  heartbeatLabel,
  onAddHeartbeat,
}: CodingSidebarMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
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
      x: rect ? rect.right - 160 : e.clientX,
      y: rect ? rect.bottom + 4 : e.clientY,
    });
    setOpen(true);
  };

  const runAction = (action: () => void) => {
    setOpen(false);
    window.setTimeout(() => action(), 0);
  };

  return (
    <div
      className="ai-bot-row-menu"
      data-testid={`${testId}-wrap`}
      onClick={stopRowClick}
      onMouseDown={stopRowClick}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`ai-bot-row-menu-btn${open ? " ai-bot-row-menu-btn--open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
        data-testid={`${testId}-btn`}
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
              data-testid={testId}
              style={{
                position: "fixed",
                left: pos.x,
                top: pos.y,
                zIndex: 10000,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {settingsLabel && onOpenSettings ? (
                <div
                  className="context-menu-item"
                  role="menuitem"
                  data-testid={`${testId}-settings`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runAction(onOpenSettings);
                  }}
                >
                  {settingsLabel}
                </div>
              ) : null}
              {revealLabel && onReveal ? (
                <div
                  className="context-menu-item"
                  role="menuitem"
                  data-testid={`${testId}-reveal`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runAction(onReveal);
                  }}
                >
                  {revealLabel}
                </div>
              ) : null}
              {heartbeatLabel && onAddHeartbeat ? (
                <div
                  className="context-menu-item"
                  role="menuitem"
                  data-testid={`${testId}-heartbeat`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runAction(onAddHeartbeat);
                  }}
                >
                  {heartbeatLabel}
                </div>
              ) : null}
              {archiveLabel && onArchive ? (
                <div
                  className="context-menu-item"
                  role="menuitem"
                  data-testid={`${testId}-archive`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runAction(onArchive);
                  }}
                >
                  {archiveLabel}
                </div>
              ) : null}
              <div
                className="context-menu-item context-menu-item--danger"
                role="menuitem"
                data-testid={`${testId}-remove`}
                onMouseDown={(e) => {
                  // Prevent the triggering click from falling through onto a
                  // ConfirmDialog overlay mounted in the same gesture.
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  runAction(onRemove);
                }}
              >
                {removeLabel}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
