/**
 * Phase 45 — Article-style markdown editor (Medium/LinkedIn-like, still markdown).
 *
 * Toolbar: Title, Heading, bold, italic, lists, quote, link, image, divider.
 * Output is GFM markdown (text + optional inline images) for mesh publish.
 */
import { useCallback, useRef, useState } from "react";
import { useT } from "../context/I18nContext.js";
import { Markdown } from "./Markdown.js";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** Softer article typography (default true). */
  articleMode?: boolean;
  "data-testid"?: string;
}

const MAX_INLINE_IMAGE_BYTES = 450 * 1024;

type EditorTab = "write" | "preview" | "split";

function wrapOrInsert(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = "text",
): { next: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end);
  const inner = selected.length > 0 ? selected : placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  const selStart = start + before.length;
  const selEnd = selStart + inner.length;
  return { next, selStart, selEnd };
}

function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
): { next: string; selStart: number; selEnd: number } {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n").map((line) => {
    const trimmed = line.replace(/^\s+/, "");
    if (trimmed.startsWith(prefix)) return line;
    if (!trimmed) return `${prefix}`;
    return `${prefix}${trimmed}`;
  });
  const replaced = lines.join("\n");
  const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
  return {
    next,
    selStart: lineStart,
    selEnd: lineStart + replaced.length,
  };
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("only_images"));
      return;
    }
    if (file.size > MAX_INLINE_IMAGE_BYTES) {
      reject(new Error("too_large"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("read_failed"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 14,
  disabled,
  articleMode = true,
  "data-testid": testId = "markdown-editor",
}: MarkdownEditorProps) {
  const t = useT();
  const [tab, setTab] = useState<EditorTab>("write");
  const [toolError, setToolError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyEdit = useCallback(
    (edit: { next: string; selStart: number; selEnd: number }) => {
      onChange(edit.next);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(edit.selStart, edit.selEnd);
      });
    },
    [onChange],
  );

  const withSelection = useCallback(
    (fn: (value: string, start: number, end: number) => { next: string; selStart: number; selEnd: number }) => {
      const el = textareaRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      applyEdit(fn(value, start, end));
      setTab((mode) => (mode === "preview" ? "write" : mode));
    },
    [applyEdit, value],
  );

  const insertLink = () => {
    const url = window.prompt(
      t("browser.author.editor.linkUrlPrompt", "Link URL (https://… or envoy://…)"),
      "https://",
    );
    if (!url?.trim()) return;
    const defaultLabel = t("browser.author.editor.linkTextDefault", "link");
    const label = window.prompt(
      t("browser.author.editor.linkTextPrompt", "Link text"),
      defaultLabel,
    ) || defaultLabel;
    withSelection((v, start, end) => {
      const selected = v.slice(start, end);
      const text = selected || label;
      return wrapOrInsert(v, start, end, "[", `](${url.trim()})`, text);
    });
  };

  const insertImageFile = async (file: File | null) => {
    if (!file) return;
    setToolError(null);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      const alt =
        file.name.replace(/\.[^.]+$/, "") ||
        t("browser.author.editor.imageAltDefault", "image");
      withSelection((v, start, end) => {
        const snippet = `\n\n![${alt}](${dataUrl})\n\n`;
        const next = v.slice(0, start) + snippet + v.slice(end);
        const caret = start + snippet.length;
        return { next, selStart: caret, selEnd: caret };
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "only_images") {
        setToolError(t("browser.author.editor.onlyImages", "Only image files can be inserted"));
      } else if (code === "too_large") {
        setToolError(
          t(
            "browser.author.editor.imageTooLarge",
            "Image is too large (max {maxKiB} KiB). Use Photo publish for large galleries.",
            { maxKiB: Math.round(MAX_INLINE_IMAGE_BYTES / 1024) },
          ),
        );
      } else {
        setToolError(t("browser.author.editor.imageReadFailed", "Failed to read image"));
      }
    }
  };

  const tools: Array<{
    id: string;
    label: string;
    title: string;
    run: () => void;
  }> = [
    {
      id: "h1",
      label: t("browser.author.editor.title", "Title"),
      title: t("browser.author.editor.titleHint", "Title (heading 1)"),
      run: () => withSelection((v, s, e) => prefixLines(v, s, e, "# ")),
    },
    {
      id: "h2",
      label: t("browser.author.editor.heading", "Heading"),
      title: t("browser.author.editor.headingHint", "Section heading (heading 2)"),
      run: () => withSelection((v, s, e) => prefixLines(v, s, e, "## ")),
    },
    {
      id: "bold",
      label: "B",
      title: t("browser.author.editor.bold", "Bold"),
      run: () =>
        withSelection((v, s, e) =>
          wrapOrInsert(v, s, e, "**", "**", t("browser.author.editor.placeholderBold", "bold")),
        ),
    },
    {
      id: "italic",
      label: "I",
      title: t("browser.author.editor.italic", "Italic"),
      run: () =>
        withSelection((v, s, e) =>
          wrapOrInsert(v, s, e, "*", "*", t("browser.author.editor.placeholderItalic", "italic")),
        ),
    },
    {
      id: "ul",
      label: t("browser.author.editor.bulletListLabel", "• List"),
      title: t("browser.author.editor.bulletList", "Bullet list"),
      run: () => withSelection((v, s, e) => prefixLines(v, s, e, "- ")),
    },
    {
      id: "ol",
      label: t("browser.author.editor.numberedListLabel", "1. List"),
      title: t("browser.author.editor.numberedList", "Numbered list"),
      run: () => withSelection((v, s, e) => prefixLines(v, s, e, "1. ")),
    },
    {
      id: "quote",
      label: t("browser.author.editor.quote", "Quote"),
      title: t("browser.author.editor.quote", "Quote"),
      run: () => withSelection((v, s, e) => prefixLines(v, s, e, "> ")),
    },
    {
      id: "link",
      label: t("browser.author.editor.link", "Link"),
      title: t("browser.author.editor.linkHint", "Insert link"),
      run: insertLink,
    },
    {
      id: "image",
      label: t("browser.author.editor.image", "Image"),
      title: t("browser.author.editor.imageHint", "Insert image"),
      run: () => fileInputRef.current?.click(),
    },
    {
      id: "hr",
      label: "—",
      title: t("browser.author.editor.divider", "Divider"),
      run: () =>
        withSelection((v, s, e) => {
          const snippet = "\n\n---\n\n";
          const next = v.slice(0, s) + snippet + v.slice(e);
          const caret = s + snippet.length;
          return { next, selStart: caret, selEnd: caret };
        }),
    },
  ];

  const showWrite = tab === "write" || tab === "split";
  const showPreview = tab === "preview" || tab === "split";

  return (
    <div
      className={`markdown-editor${articleMode ? " markdown-editor--article" : ""}`}
      data-testid={testId}
    >
      <div className="markdown-editor__chrome">
        <div
          className="markdown-editor__toolbar"
          role="toolbar"
          aria-label={t("browser.author.editor.formatting", "Formatting")}
        >
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={`markdown-editor__tool${tool.id === "bold" ? " markdown-editor__tool--bold" : ""}${tool.id === "italic" ? " markdown-editor__tool--italic" : ""}`}
              title={tool.title}
              aria-label={tool.title}
              data-testid={`markdown-editor-tool-${tool.id}`}
              disabled={disabled}
              onClick={tool.run}
            >
              {tool.label}
            </button>
          ))}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="markdown-editor__file"
            data-testid="markdown-editor-image-input"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              void insertImageFile(file);
            }}
          />
        </div>
        <div
          className="markdown-editor__tabs"
          role="tablist"
          aria-label={t("browser.author.editor.mode", "Editor mode")}
        >
          {(
            [
              ["write", t("browser.author.editor.write", "Write")],
              ["split", t("browser.author.editor.split", "Split")],
              ["preview", t("browser.author.editor.preview", "Preview")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "is-active" : undefined}
              onClick={() => setTab(id)}
              data-testid={`markdown-editor-${id}-tab`}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {toolError ? (
        <p className="markdown-editor__error" data-testid="markdown-editor-error" role="alert">
          {toolError}
        </p>
      ) : null}

      <div className={`markdown-editor__panes markdown-editor__panes--${tab}`}>
        {showWrite ? (
          <textarea
            ref={textareaRef}
            className="markdown-editor__textarea"
            data-testid="markdown-editor-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
          />
        ) : null}
        {showPreview ? (
          <div className="markdown-editor__preview" data-testid="markdown-editor-preview">
            {value.trim() ? (
              <Markdown text={value} className="markdown-editor__preview-body" />
            ) : (
              <p className="field-desc">
                {t("browser.author.editor.emptyPreview", "Nothing to preview yet.")}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
