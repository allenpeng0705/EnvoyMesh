/**
 * Compact RAG index status for Knowledge → Browse.
 */
import { useEffect, useState } from "react";
import type { RagIndexStatus } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { openContentKnowledge } from "../../lib/content-knowledge-nav.js";

export function KnowledgeIndexChip() {
  const t = useT();
  const nodeService = useNodeService();
  const [status, setStatus] = useState<RagIndexStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await nodeService.getRagIndexStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };
    void refresh();
    const off = nodeService.on("rag:reindex", (progress) => {
      setStatus((prev) => ({
        isIndexing:
          progress.phase !== "done" && progress.phase !== "idle" && progress.phase !== "error",
        progress,
        lastCompletedAt: progress.phase === "done" ? progress.updatedAt : prev?.lastCompletedAt,
        trackedDocuments: prev?.trackedDocuments ?? 0,
        embedderModelKey: prev?.embedderModelKey,
        lastEmbedError: progress.phase === "error" ? progress.message : prev?.lastEmbedError,
        lastEmbedErrorAt:
          progress.phase === "error" ? progress.updatedAt : prev?.lastEmbedErrorAt,
      }));
    });
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => {
      cancelled = true;
      off();
      window.clearInterval(timer);
    };
  }, [nodeService]);

  if (!status) return null;

  const { progress } = status;
  let label: string;
  let tone: "ok" | "busy" | "warn" = "ok";
  if (status.isIndexing) {
    tone = "busy";
    label = t("knowledge.browse.indexIndexing", {
      processed: progress.processed,
      total: progress.total,
    });
  } else if (progress.phase === "error" || status.lastEmbedError) {
    tone = "warn";
    label = t("knowledge.browse.indexError");
  } else if (status.trackedDocuments > 0) {
    const linked = status.linkedObsidianNoteCount ?? 0;
    label =
      linked > 0
        ? t("knowledge.browse.indexReadyLinked", {
            count: status.trackedDocuments,
            linked,
          })
        : t("knowledge.browse.indexReady", { count: status.trackedDocuments });
    if (status.lastExternalKbError) tone = "warn";
  } else {
    tone = "warn";
    label = t("knowledge.browse.indexEmpty");
  }

  return (
    <button
      type="button"
      className={`knowledge-index-chip knowledge-index-chip--${tone}`}
      data-testid="knowledge-index-chip"
      onClick={() => openContentKnowledge("setup")}
      title={t("knowledge.browse.indexChipTitle")}
    >
      {label}
    </button>
  );
}
