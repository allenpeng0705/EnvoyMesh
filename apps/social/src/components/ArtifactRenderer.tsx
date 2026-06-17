/**
 * Phase 34: renderer for the typed `Artifact` discriminated union that
 * `task.result` envelopes carry on the wire. Three branches:
 *   - `text`        → markdown (or plain `<pre>` for text/plain + JSON)
 *   - `file`        → card with displayName + size + hash + Open button (stub for v1)
 *   - `structured`  → collapsible JSON via `<details>` / `<summary>`
 *
 * Shares the `.answer-block-*` design vocabulary from `AnswerRenderer.tsx`
 * (see `styles.css`). Unknown kinds are an exhaustive `never` and are
 * rendered as a tiny "unsupported artifact" fallback so the user sees
 * something instead of nothing.
 */

import { useCallback, useState } from "react";
import type {
  Artifact,
  FileArtifact,
  OpenLocalFileParams,
  StructuredArtifact,
  TextArtifact,
} from "@envoymesh/api";
import { Markdown } from "./Markdown.js";
import { useToastOptional } from "../hooks/useToast.js";
import { useT } from "../context/I18nContext.js";

export interface ArtifactRendererProps {
  artifact: Artifact;
  className?: string;
  /** Phase 34 v1: file Open is a stub (toast only). Real vault-open RPC is a follow-up. */
  onOpenLocalFile?: (params: OpenLocalFileParams) => Promise<void>;
}

const STRUCTURED_JSON_LIMIT_BYTES = 32 * 1024;

function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function TextArtifactView({ artifact }: { artifact: TextArtifact }) {
  const mime = artifact.mimeType?.toLowerCase();
  // text/markdown (with optional +suffix) → reuse the markdown renderer
  if (mime?.startsWith("text/markdown") || mime === "text/x-markdown") {
    return (
      <div className="artifact artifact-text" data-kind="text">
        <Markdown text={artifact.content} className="message-text" />
      </div>
    );
  }
  // application/json → pretty-printed JSON inside a <pre>
  if (mime === "application/json") {
    return (
      <div className="artifact artifact-text" data-kind="text">
        <pre className="artifact-plain-json">{artifact.content}</pre>
      </div>
    );
  }
  // text/plain and anything else → preserve whitespace
  return (
    <div className="artifact artifact-text" data-kind="text">
      <pre className="artifact-plain-text">{artifact.content}</pre>
    </div>
  );
}

function FileArtifactView({
  artifact,
  onOpenLocalFile,
}: {
  artifact: FileArtifact;
  onOpenLocalFile?: (params: OpenLocalFileParams) => Promise<void>;
}) {
  const t = useT();
  const toast = useToastOptional();
  const [opening, setOpening] = useState(false);

  const handleOpen = useCallback(async () => {
    if (onOpenLocalFile) {
      // Try the real opener; if it throws, fall back to the stub toast so the
      // user always gets feedback.
      setOpening(true);
      try {
        await onOpenLocalFile({
          source: "vault",
          relativePath: artifact.vaultPath,
        });
      } catch {
        toast?.showToast(
          t("artifactRenderer.openFileToast", "File open is coming in the next release"),
          "info",
        );
      } finally {
        setOpening(false);
      }
      return;
    }
    // No opener wired yet — show the Phase 34 v1 stub toast.
    toast?.showToast(
      t("artifactRenderer.openFileToast", "File open is coming in the next release"),
      "info",
    );
  }, [onOpenLocalFile, artifact.vaultPath, artifact.contentHash, toast, t]);

  return (
    <div className="artifact artifact-file" data-kind="file" role="group">
      <div className="artifact-file-title">
        {artifact.displayName ?? artifact.vaultPath}
      </div>
      <ul className="artifact-file-meta">
        {artifact.mimeType ? <li className="artifact-file-meta-item">{artifact.mimeType}</li> : null}
        {typeof artifact.sizeBytes === "number" ? (
          <li className="artifact-file-meta-item">{formatBytes(artifact.sizeBytes)}</li>
        ) : null}
        <li className="artifact-file-meta-item artifact-file-meta-hash">
          {artifact.contentHash.slice(0, 16)}
          {artifact.contentHash.length > 16 ? "…" : ""}
        </li>
      </ul>
      <button
        type="button"
        className="artifact-file-cta"
        disabled={opening}
        onClick={() => void handleOpen()}
        title={t("artifactRenderer.openFileTitle", "File open is coming in the next release")}
      >
        {t("artifactRenderer.openFile", "Open")}
      </button>
    </div>
  );
}

function StructuredArtifactView({ artifact }: { artifact: StructuredArtifact }) {
  const [expanded, setExpanded] = useState(false);
  let json: string;
  let truncated = false;
  try {
    const full = JSON.stringify(artifact.data, null, 2);
    if (full.length > STRUCTURED_JSON_LIMIT_BYTES) {
      json = full.slice(0, STRUCTURED_JSON_LIMIT_BYTES) + "\n…";
      truncated = true;
    } else {
      json = full;
    }
  } catch (err) {
    json = `/* unserialisable: ${err instanceof Error ? err.message : String(err)} */`;
  }
  return (
    <div className="artifact artifact-structured" data-kind="structured">
      <button
        type="button"
        className="artifact-structured-summary"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span className="artifact-structured-schema">{artifact.schemaRef}</span>
        <span className="artifact-structured-toggle">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <pre className="artifact-structured-pre" data-truncated={truncated ? "true" : "false"}>
          {json}
        </pre>
      ) : null}
    </div>
  );
}

export function ArtifactRenderer({ artifact, className, onOpenLocalFile }: ArtifactRendererProps) {
  switch (artifact.kind) {
    case "text":
      return (
        <div className={className}>
          <TextArtifactView artifact={artifact} />
        </div>
      );
    case "file":
      return (
        <div className={className}>
          <FileArtifactView artifact={artifact} onOpenLocalFile={onOpenLocalFile} />
        </div>
      );
    case "structured":
      return (
        <div className={className}>
          <StructuredArtifactView artifact={artifact} />
        </div>
      );
    default: {
      // Exhaustive `never` — TS will fail the build if a new kind is added
      // without a renderer. The runtime fallback logs so the user sees
      // something instead of silence.
      const _exhaustive: never = artifact;
      void _exhaustive;
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[ArtifactRenderer] unknown artifact kind", artifact);
      }
      return (
        <div className={className}>
          <div className="artifact artifact-unknown" data-kind="unknown">
            Unsupported artifact
          </div>
        </div>
      );
    }
  }
}

export interface ArtifactListProps {
  artifacts: Artifact[];
  className?: string;
  onOpenLocalFile?: ArtifactRendererProps["onOpenLocalFile"];
}

export function ArtifactList({ artifacts, className, onOpenLocalFile }: ArtifactListProps) {
  if (artifacts.length === 0) return null;
  return (
    <div className={className ?? "artifact-list"} role="list">
      {artifacts.map((artifact, idx) => (
        <div key={idx} role="listitem" className="artifact-list-item">
          <ArtifactRenderer artifact={artifact} onOpenLocalFile={onOpenLocalFile} />
        </div>
      ))}
    </div>
  );
}
