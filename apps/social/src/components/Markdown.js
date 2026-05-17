import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
// Configure marked for safe rendering
marked.setOptions({
    breaks: true, // single newlines → <br>
    gfm: true, // GitHub Flavored Markdown (tables, strikethrough, etc.)
});
export function Markdown({ text, className }) {
    const html = useMemo(() => {
        try {
            const raw = marked.parse(text, { async: false });
            return DOMPurify.sanitize(raw);
        }
        catch {
            // Fallback: render as plain text if parsing fails
            return DOMPurify.sanitize(text);
        }
    }, [text]);
    return (_jsx("span", { className: className, dangerouslySetInnerHTML: { __html: html } }));
}
//# sourceMappingURL=Markdown.js.map