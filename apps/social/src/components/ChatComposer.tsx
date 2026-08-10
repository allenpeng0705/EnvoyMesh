import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import "emoji-picker-element";
import { useT } from "../context/I18nContext.js";
import { insertTextAtCaret } from "../lib/insert-text-at-caret.js";
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
  /** Focus the text field when true (e.g. chat panel became active). */
  autoFocus?: boolean;
  /** Leading controls (attach, vault share, etc.) rendered before the text field. */
  leading?: ReactNode;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  sendLabel,
  disabled = false,
  sendDisabled,
  autoFocus = false,
  leading,
}: ChatComposerProps) {
  const t = useT();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerId = useId();

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

  const canSend = !(sendDisabled ?? disabled) && value.trim().length > 0;

  return (
    <>
      {leading}
      <div className="chat-composer-field" ref={fieldRef}>
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
        <textarea
          ref={textareaRef}
          className="chat-composer-textarea"
          rows={1}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          enterKeyHint="send"
          aria-label={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
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
