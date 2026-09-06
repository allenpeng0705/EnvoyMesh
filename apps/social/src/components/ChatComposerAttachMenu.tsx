import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../context/I18nContext.js";
import { AddIcon, AttachIcon, P2PIcon } from "../icons.js";

export interface ChatComposerAttachMenuProps {
  attachDisabled?: boolean;
  shareDisabled?: boolean;
  /** When false, only the attach-file action is shown (group / family). Default true. */
  showShareVault?: boolean;
  onAttachFile: () => void;
  onShareVault?: () => void;
}

/**
 * Compact "+" overflow for attach-file (+ optional vault-share) so the composer
 * can keep Mic + emoji visible without crowding the text field.
 */
export function ChatComposerAttachMenu({
  attachDisabled = false,
  shareDisabled = false,
  showShareVault = true,
  onAttachFile,
  onShareVault,
}: ChatComposerAttachMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const shareEnabled = showShareVault && typeof onShareVault === "function";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="chat-attach-menu" ref={rootRef}>
      <button
        type="button"
        className={`chat-composer-icon-btn chat-attach-menu-btn${open ? " is-active" : ""}`}
        title={t("contactChat.moreAttachTitle", "Add attachment")}
        aria-label={t("contactChat.moreAttachAria", "Add attachment")}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        disabled={attachDisabled && (!shareEnabled || shareDisabled)}
        onClick={() => setOpen((v) => !v)}
      >
        <AddIcon size={18} />
      </button>
      {open ? (
        <div id={menuId} className="chat-attach-menu-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            className="chat-attach-menu-item"
            disabled={attachDisabled}
            onClick={() => {
              setOpen(false);
              onAttachFile();
            }}
          >
            <AttachIcon size={16} aria-hidden />
            <span>{t("contactChat.attachFileTitle")}</span>
          </button>
          {shareEnabled ? (
            <button
              type="button"
              role="menuitem"
              className="chat-attach-menu-item"
              disabled={shareDisabled}
              onClick={() => {
                setOpen(false);
                onShareVault?.();
              }}
            >
              <P2PIcon size={16} aria-hidden />
              <span>{t("contactChat.shareVaultTitle")}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
