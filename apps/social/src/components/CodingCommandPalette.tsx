/**
 * Coding Cmd/Ctrl+K command palette — projects, workspaces, files, actions.
 * Metadata only; not transcript search.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../context/I18nContext.js";
import { ModalPortal } from "./ModalPortal.js";
import {
  filterCodingPaletteItems,
  type CodingPaletteItem,
} from "../lib/coding-palette-items.js";

export type CodingCommandPaletteProps = {
  open: boolean;
  items: CodingPaletteItem[];
  onClose: () => void;
  onSelect: (item: CodingPaletteItem) => void;
};

export function CodingCommandPalette({
  open,
  items,
  onClose,
  onSelect,
}: CodingCommandPaletteProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => filterCodingPaletteItems(items, query),
    [items, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) =>
          filtered.length === 0 ? 0 : Math.min(i + 1, filtered.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) onSelect(item);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, activeIndex, onClose, onSelect]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${activeIndex}"]`,
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open, filtered]);

  if (!open) return null;

  const kindLabel = (kind: CodingPaletteItem["kind"]) => {
    switch (kind) {
      case "project":
        return t("codingView.searchKindProject", "Project");
      case "workspace":
        return t("codingView.searchKindWorkspace", "Workspace");
      case "file":
        return t("codingView.searchKindFile", "File");
      case "action":
      default:
        return t("codingView.searchKindAction", "Action");
    }
  };

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-palette-overlay"
        role="presentation"
        data-testid="coding-command-palette"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="coding-palette-panel"
          role="dialog"
          aria-modal="true"
          aria-label={t("codingView.searchTitle", "Search Coding")}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="search"
            className="coding-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "codingView.searchPlaceholder",
              "Search projects, workspaces, files…",
            )}
            aria-label={t("codingView.searchTitle", "Search Coding")}
            data-testid="coding-palette-input"
            autoComplete="off"
            spellCheck={false}
          />
          <div
            ref={listRef}
            className="coding-palette-list"
            role="listbox"
            data-testid="coding-palette-list"
          >
            {filtered.length === 0 ? (
              <p className="coding-palette-empty" data-testid="coding-palette-empty">
                {t("codingView.searchEmpty", "No matches.")}
              </p>
            ) : (
              filtered.map((item, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-palette-index={index}
                    data-testid={`coding-palette-item-${item.id}`}
                    className={`coding-palette-item${active ? " coding-palette-item--active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelect(item)}
                  >
                    <span className="coding-palette-item__kind">
                      {kindLabel(item.kind)}
                    </span>
                    <span className="coding-palette-item__body">
                      <span className="coding-palette-item__label">
                        {item.label}
                      </span>
                      {item.detail ? (
                        <span className="coding-palette-item__detail">
                          {item.detail}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="coding-palette-hint">
            {t(
              "codingView.searchHint",
              "↑↓ to move · Enter to open · Esc to close",
            )}
          </p>
        </div>
      </div>
    </ModalPortal>
  );
}
