import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { ExtAgentCommandDescriptor } from "@envoymesh/api";
import "emoji-picker-element";
import { useT } from "../context/I18nContext.js";
import { insertTextAtCaret } from "../lib/insert-text-at-caret.js";
import {
  filterExtAgentModels,
  filterExtAgentSlashCommands,
  isExtAgentSlashSuggestInput,
} from "../lib/ext-agent-slash-commands.js";
import { SmileIcon } from "../icons.js";

const MAX_TEXTAREA_HEIGHT_PX = 120;

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  sendLabel: string;
  disabled?: boolean;
  sendDisabled?: boolean;
  /** When true, Send/Enter work even if the text field is empty (e.g. attachment-only). */
  allowEmptySend?: boolean;
  /** Focus the text field when true (e.g. chat panel became active). */
  autoFocus?: boolean;
  /** Leading controls (attach, vault share, etc.) rendered before the text field. */
  leading?: ReactNode;
  /** Ext Agent slash catalog — when set, typing `/` shows autocomplete. */
  slashCommands?: ExtAgentCommandDescriptor[];
  /** Model ids for `/model <id>` autocomplete. */
  slashModels?: Array<{ id: string; label?: string }>;
  /** When false, hide the emoji picker (e.g. Pi / envoy-harness panels). */
  showEmoji?: boolean;
  /** Cmd/Ctrl+Enter — e.g. EH inject while busy. */
  onModifierEnter?: () => void;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  sendLabel,
  disabled = false,
  sendDisabled,
  allowEmptySend = false,
  autoFocus = false,
  leading,
  slashCommands,
  slashModels,
  showEmoji = true,
  onModifierEnter,
}: ChatComposerProps) {
  const t = useT();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const pickerId = useId();
  const slashListId = useId();

  const slashMatches = useMemo(() => {
    if (!slashCommands?.length) return [];
    if (!isExtAgentSlashSuggestInput(value)) return [];
    return filterExtAgentSlashCommands(slashCommands, value);
  }, [slashCommands, value]);

  const modelMatches = useMemo(() => {
    if (!slashModels?.length) return [];
    return filterExtAgentModels(slashModels, value);
  }, [slashModels, value]);

  const menuMode: "slash" | "model" | null =
    slashMatches.length > 0 ? "slash" : modelMatches.length > 0 ? "model" : null;
  const menuItems =
    menuMode === "slash"
      ? slashMatches.map((c) => ({ key: c.slash, primary: c.slash, secondary: c.summary, args: c.argsHint }))
      : menuMode === "model"
        ? modelMatches.map((m) => ({
            key: m.id,
            primary: m.id,
            secondary: m.label ?? "model",
            args: undefined as string | undefined,
          }))
        : [];
  const slashMenuOpen = menuItems.length > 0;

  useEffect(() => {
    setSlashIndex(0);
  }, [value, slashMenuOpen, menuMode]);

  useEffect(() => {
    if (!slashMenuOpen) return;
    setSlashIndex((i) => Math.min(i, Math.max(0, menuItems.length - 1)));
  }, [menuItems.length, slashMenuOpen]);

  const applySlash = useCallback(
    (cmd: ExtAgentCommandDescriptor) => {
      const next = `${cmd.slash} `;
      onChange(next);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const caret = next.length;
        el.setSelectionRange(caret, caret);
      });
    },
    [onChange],
  );

  const applyModel = useCallback(
    (modelId: string) => {
      const next = `/model ${modelId}`;
      onChange(next);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.length, next.length);
      });
    },
    [onChange],
  );

  const applyActive = useCallback(() => {
    if (menuMode === "slash") {
      const selected = slashMatches[slashIndex] ?? slashMatches[0];
      if (selected) applySlash(selected);
      return;
    }
    if (menuMode === "model") {
      const selected = modelMatches[slashIndex] ?? modelMatches[0];
      if (selected) applyModel(selected.id);
    }
  }, [applyModel, applySlash, menuMode, modelMatches, slashIndex, slashMatches]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    textareaRef.current?.focus();
  }, [autoFocus, disabled]);

  const insertEmoji = useCallback(
    (unicode: string) => {
      const el = textareaRef.current;
      if (!el) {
        onChange(value + unicode);
        return;
      }
      const { value: next, caret } = insertTextAtCaret(el, unicode);
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
        resizeTextarea();
      });
    },
    [onChange, resizeTextarea, value],
  );

  useEffect(() => {
    if (!pickerOpen) return;
    const picker = fieldRef.current?.querySelector("emoji-picker");
    if (!picker) return;

    const onEmojiClick = (event: Event) => {
      const detail = (event as CustomEvent<{ unicode: string }>).detail;
      if (detail?.unicode) {
        insertEmoji(detail.unicode);
      }
    };

    picker.addEventListener("emoji-click", onEmojiClick);
    return () => picker.removeEventListener("emoji-click", onEmojiClick);
  }, [insertEmoji, pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !fieldRef.current) return;
      if (fieldRef.current.contains(target)) return;
      setPickerOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPickerOpen(false);
        textareaRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pickerOpen]);

  const canSend =
    !(sendDisabled ?? disabled) && (value.trim().length > 0 || allowEmptySend);

  return (
    <>
      {leading}
      <div className="chat-composer-field" ref={fieldRef}>
        {showEmoji ? (
          <button
            type="button"
            className={`secondary chat-emoji-btn${pickerOpen ? " is-active" : ""}`}
            title={t("contactChat.emojiPickerTitle")}
            aria-label={t("contactChat.emojiPickerAria")}
            aria-expanded={pickerOpen}
            aria-controls={pickerOpen ? pickerId : undefined}
            disabled={disabled}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <SmileIcon size={18} />
          </button>
        ) : null}
        <textarea
          ref={textareaRef}
          className="chat-composer-textarea"
          rows={1}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          enterKeyHint="send"
          aria-label={placeholder}
          aria-autocomplete={slashCommands?.length ? "list" : undefined}
          aria-controls={slashMenuOpen ? slashListId : undefined}
          aria-activedescendant={
            slashMenuOpen ? `${slashListId}-opt-${slashIndex}` : undefined
          }
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (slashMenuOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashIndex((i) => (i + 1) % menuItems.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                e.preventDefault();
                applyActive();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onChange("");
                return;
              }
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (onModifierEnter && canSend) onModifierEnter();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        {slashMenuOpen ? (
          <ul
            id={slashListId}
            className="chat-slash-suggest"
            role="listbox"
            aria-label={t("contactChat.extAgentSlashSuggestAria")}
          >
            {menuItems.map((item, index) => (
              <li key={item.key} role="presentation">
                <button
                  type="button"
                  id={`${slashListId}-opt-${index}`}
                  role="option"
                  aria-selected={index === slashIndex}
                  className={`chat-slash-suggest__item${index === slashIndex ? " is-active" : ""}`}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    if (menuMode === "model") applyModel(item.key);
                    else {
                      const cmd = slashMatches.find((c) => c.slash === item.key);
                      if (cmd) applySlash(cmd);
                    }
                  }}
                  onMouseEnter={() => setSlashIndex(index)}
                >
                  <span className="chat-slash-suggest__cmd">
                    <span className="chat-slash-suggest__slash">
                      {menuMode === "model" ? `/model ${item.primary}` : item.primary}
                    </span>
                    {item.args ? (
                      <span className="chat-slash-suggest__args">{item.args}</span>
                    ) : null}
                  </span>
                  <span className="chat-slash-suggest__summary">{item.secondary}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {pickerOpen ? (
          <div id={pickerId} className="chat-emoji-picker-popover" role="dialog" aria-label={t("contactChat.emojiPickerTitle")}>
            <emoji-picker className="chat-emoji-picker" />
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onSend} disabled={!canSend}>
        {sendLabel}
      </button>
    </>
  );
}
