/**
 * Phase 45D — Markdown editor with live preview.
 */
import { useState } from "react";
import { Markdown } from "./Markdown.js";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  "data-testid"?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 12,
  disabled,
  "data-testid": testId = "markdown-editor",
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");

  return (
    <div className="markdown-editor" data-testid={testId}>
      <div className="markdown-editor__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "write"}
          className={tab === "write" ? "is-active" : undefined}
          onClick={() => setTab("write")}
          data-testid="markdown-editor-write-tab"
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "preview"}
          className={tab === "preview" ? "is-active" : undefined}
          onClick={() => setTab("preview")}
          data-testid="markdown-editor-preview-tab"
        >
          Preview
        </button>
      </div>
      {tab === "write" ? (
        <textarea
          className="markdown-editor__textarea"
          data-testid="markdown-editor-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
        />
      ) : (
        <div className="markdown-editor__preview" data-testid="markdown-editor-preview">
          {value.trim() ? (
            <Markdown text={value} />
          ) : (
            <p className="field-desc">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
