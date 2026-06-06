import { useCallback, useState } from "react";
import type {
  AnswerFormat,
  OpenLocalFileParams,
  StructuredBlock,
} from "@envoymesh/api";
import {
  chatMessageTextForDisplay,
  inferFileFromStructuredCard,
  isOpenFileCtaAction,
  stripModelThinking,
  type AiIdentity,
} from "@envoymesh/api";
import { Markdown } from "./Markdown.js";

export interface AnswerRendererProps {
  text: string;
  format?: AnswerFormat;
  blocks?: StructuredBlock[];
  className?: string;
  identity?: AiIdentity | null;
  onOpenFile?: (params: OpenLocalFileParams) => Promise<void>;
  openFileLabel?: string;
  openingFileLabel?: string;
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

function BlockCard({
  block,
  onOpenFile,
  openFileLabel,
  openingFileLabel,
  busy,
}: {
  block: Extract<StructuredBlock, { type: "card" }>;
  onOpenFile?: (params: OpenLocalFileParams) => Promise<void>;
  openFileLabel: string;
  openingFileLabel: string;
  busy: boolean;
}) {
  const fileTarget = inferFileFromStructuredCard(block);
  const showOpen = Boolean(fileTarget && onOpenFile);
  const ctaLabel =
    block.cta?.label ??
    (showOpen || isOpenFileCtaAction(block.cta?.action) ? openFileLabel : undefined);

  const handleOpen = () => {
    if (!fileTarget || !onOpenFile || busy) return;
    void onOpenFile(fileTarget);
  };

  return (
    <div className={`answer-block-card${showOpen ? " answer-block-card--interactive" : ""}`} role="group">
      <div className="answer-block-card-title">{block.title}</div>
      {block.subtitle ? <div className="answer-block-card-subtitle">{block.subtitle}</div> : null}
      {block.meta && block.meta.length > 0 ? (
        <ul className="answer-block-card-meta">
          {block.meta.map((m, idx) => (
            <li key={idx}>{m}</li>
          ))}
        </ul>
      ) : null}
      {showOpen && ctaLabel ? (
        <button
          type="button"
          className="answer-block-card-cta"
          disabled={busy}
          onClick={handleOpen}
        >
          {busy ? openingFileLabel : ctaLabel}
        </button>
      ) : block.cta && !showOpen ? (
        <span className="answer-block-card-cta answer-block-card-cta--static">{block.cta.label}</span>
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

export function AnswerRenderer({
  text,
  format,
  blocks,
  className = "message-text",
  identity,
  onOpenFile,
  openFileLabel = "Open",
  openingFileLabel = "Opening…",
}: AnswerRendererProps) {
  const display = chatMessageTextForDisplay(stripModelThinking(text), identity);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  const handleOpenFile = useCallback(
    async (params: OpenLocalFileParams) => {
      if (!onOpenFile) return;
      setOpeningPath(params.relativePath);
      try {
        await onOpenFile(params);
      } finally {
        setOpeningPath(null);
      }
    },
    [onOpenFile],
  );

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
                return (
                  <BlockCard
                    key={idx}
                    block={block}
                    onOpenFile={handleOpenFile}
                    openFileLabel={openFileLabel}
                    openingFileLabel={openingFileLabel}
                    busy={openingPath !== null}
                  />
                );
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

  if (format === "plain") {
    return (
      <div className={className}>
        <p className="answer-plain">{display}</p>
      </div>
    );
  }

  return <Markdown text={display} className={className} />;
}
