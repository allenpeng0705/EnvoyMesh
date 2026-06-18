/**
 * Phase 40 — CompositeArtifactRenderer.
 *
 * Renders a `CompositeArtifact` (multi-worker weighted contribution table).
 * Each part is a row showing worker attribution, weight, and the underlying
 * `Artifact` (text / file / structured) delegated to the existing
 * `ArtifactRenderer`. Aggregation kind changes the header copy and
 * weights are normalized for display.
 *
 * Renders inside the chain report under the "Composite artifact" section.
 */

import { useState } from "react";

import type { Artifact, CompositeArtifact } from "@envoymesh/api";

import { ArtifactRenderer } from "./ArtifactRenderer.js";
import { useT } from "../context/I18nContext.js";

const AGG_HEADER_KEY: Record<CompositeArtifact["aggregation"], string> = {
  concatenate: "chains.composite.aggregationConcatenate",
  weighted_concat: "chains.composite.aggregationWeighted",
  merge_structured: "chains.composite.aggregationMergeStructured",
  owner_review: "chains.composite.aggregationOwnerReview",
};

function normalizeWeights(
  weights: number[],
): number[] {
  const total = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
  if (total <= 0) return weights.map(() => 0);
  return weights.map((w) => (w > 0 ? w / total : 0));
}

function formatPercent(n: number): string {
  if (n === 0) return "0%";
  if (n === 1) return "100%";
  return `${(n * 100).toFixed(0)}%`;
}

export interface CompositeArtifactRendererProps {
  artifact: CompositeArtifact;
  /** Inline per-part Artifact (when the part is a leaf artifact). */
  artifactsByPart?: Record<string, Artifact>;
  className?: string;
}

export function CompositeArtifactRenderer({
  artifact,
  artifactsByPart,
  className,
}: CompositeArtifactRendererProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const weights = artifact.parts.map((p) => p.weight);
  const normalized = normalizeWeights(weights);
  const headerKey = AGG_HEADER_KEY[artifact.aggregation];

  return (
    <div
      className={className ?? "composite-artifact"}
      data-kind="composite"
      data-aggregation={artifact.aggregation}
      role="group"
    >
      <div className="composite-artifact-header">
        <span className="composite-artifact-kind">{t(headerKey, artifact.aggregation)}</span>
        <span className="composite-artifact-parts">
          {t("chains.composite.partsCount", { count: artifact.parts.length })}
        </span>
      </div>
      <table className="composite-artifact-table" aria-label={t("chains.composite.tableAriaLabel")}>
        <thead>
          <tr>
            <th scope="col">{t("chains.composite.columnSubtask")}</th>
            <th scope="col">{t("chains.composite.columnWorker")}</th>
            <th scope="col">{t("chains.composite.columnWeight")}</th>
          </tr>
        </thead>
        <tbody>
          {artifact.parts.map((p, i) => (
            <tr key={p.subtaskId + i} className="composite-artifact-row">
              <td>
                <code className="composite-artifact-subtask-id">{p.subtaskId}</code>
                {p.note ? (
                  <div className="composite-artifact-note">{p.note}</div>
                ) : null}
              </td>
              <td>
                <code className="composite-artifact-worker">{p.workerPeerId}</code>
                <div className="composite-artifact-worker-owner">{p.workerOwnerId}</div>
              </td>
              <td>
                <span
                  className="composite-artifact-weight"
                  title={`raw=${p.weight}`}
                >
                  {formatPercent(normalized[i] ?? 0)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {artifactsByPart && Object.keys(artifactsByPart).length > 0 ? (
        <div className="composite-artifact-expand">
          <button
            type="button"
            className="composite-artifact-expand-btn"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          >
            {expanded
              ? t("chains.composite.collapsePartContent")
              : t("chains.composite.expandPartContent")}
          </button>
          {expanded ? (
            <div className="composite-artifact-parts-list">
              {artifact.parts.map((p, i) => {
                const part = artifactsByPart[p.subtaskId];
                if (!part) return null;
                return (
                  <div key={p.subtaskId + i} className="composite-artifact-part-render">
                    <div className="composite-artifact-part-render-label">
                      <code>{p.subtaskId}</code>
                    </div>
                    <ArtifactRenderer artifact={part} />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
