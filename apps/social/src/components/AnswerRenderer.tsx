import type {
  AnswerFormat,
  StructuredBlock,
} from "@envoymesh/api";
import { chatMessageTextForDisplay, stripModelThinking, type AiIdentity } from "@envoymesh/api";
import { Markdown } from "./Markdown.js";

export interface AnswerRendererProps {
  text: string;
  format?: AnswerFormat;
  blocks?: StructuredBlock[];
  className?: string;
  identity?: AiIdentity | null;
}

function CheckIcon() {
  return (
    <svg
      className="answer-block-list-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
    >
      <path
        d="M3 8.5l3 3 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BlockList({ block }: { block: Extract<StructuredBlock, { type: "list" }> }) {
  const Tag = block.ordered ? "ol" : "ul";
  const className = `answer-block-list${block.style === "check" ? " answer-block-list--check" : ""}`;
  return (
    <Tag className={className}>
      {block.items.map((item, idx) => (
        <li key={idx} className="answer-block-list-item">
          {block.style === "check" ? <CheckIcon /> : null}
          <span>{item}</span>
        </li>
      ))}
    </Tag>
  );
}

function BlockCard({ block }: { block: Extract<StructuredBlock, { type: "card" }> }) {
  return (
    <div className="answer-block-card" role="group">
      <div className="answer-block-card-title">{block.title}</div>
      {block.subtitle ? <div className="answer-block-card-subtitle">{block.subtitle}</div> : null}
      {block.meta && block.meta.length > 0 ? (
        <ul className="answer-block-card-meta">
          {block.meta.map((m, idx) => (
            <li key={idx}>{m}</li>
          ))}
        </ul>
      ) : null}
      {block.cta ? (
        <button
          type="button"
          className="answer-block-card-cta"
          data-cta-action={block.cta.action}
        >
          {block.cta.label}
        </button>
      ) : null}
    </div>
  );
}

function BlockStatus({ block }: { block: Extract<StructuredBlock, { type: "status" }> }) {
  return (
    <div className={`answer-block-status answer-block-status--${block.tone}`} role="status">
      {block.text}
    </div>
  );
}

function BlockParagraph({ block }: { block: Extract<StructuredBlock, { type: "paragraph" }> }) {
  return <p className="answer-block-paragraph">{block.text}</p>;
}

export function AnswerRenderer({ text, format, blocks, className = "message-text", identity }: AnswerRendererProps) {
  const display = chatMessageTextForDisplay(stripModelThinking(text), identity);

  // structured → render blocks (plus the text as a fallback if the LLM
  // didn't put a leading paragraph block in).
  if (format === "structured" && blocks && blocks.length > 0) {
    return (
      <div className={className}>
        <div className="answer-blocks">
          {blocks.map((block, idx) => {
            switch (block.type) {
              case "paragraph":
                return <BlockParagraph key={idx} block={block} />;
              case "list":
                return <BlockList key={idx} block={block} />;
              case "card":
                return <BlockCard key={idx} block={block} />;
              case "status":
                return <BlockStatus key={idx} block={block} />;
              default: {
                const _exhaustive: never = block;
                void _exhaustive;
                return null;
              }
            }
          })}
        </div>
        {display && !blocks.some((b) => b.type === "paragraph" && b.text === display) ? (
          <p className="answer-block-fallback">{display}</p>
        ) : null}
      </div>
    );
  }

  // plain → render as plain text (preserve newlines, no Markdown parsing).
  if (format === "plain") {
    return (
      <div className={className}>
        <p className="answer-plain">{display}</p>
      </div>
    );
  }

  // markdown (default) → existing Markdown renderer.
  return <Markdown text={display} className={className} />;
}
