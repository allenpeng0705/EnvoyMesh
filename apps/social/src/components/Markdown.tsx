import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,       // single newlines → <br>
  gfm: true,          // GitHub Flavored Markdown (tables, strikethrough, etc.)
});

export interface MarkdownProps {
  text: string;
  className?: string;
}

export function Markdown({ text, className }: MarkdownProps) {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(text, { async: false }) as string;
      return DOMPurify.sanitize(raw, {
      // Allow inline article images inserted as data: URLs in the composer.
      ADD_DATA_URI_TAGS: ["img"],
    });
    } catch {
      // Fallback: render as plain text if parsing fails
      return DOMPurify.sanitize(text);
    }
  }, [text]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
