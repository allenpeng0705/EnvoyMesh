/**
 * Phase 40 — ChainReportRenderer.
 *
 * Renders a published `ChainReport`:
 *   - header (chainId, total cost, duration, worker peer-ids)
 *   - executive summary (markdown body)
 *   - sections with citations (click → jumps to a tree node)
 *   - composite artifact (delegated to CompositeArtifactRenderer)
 *
 * The `onCitationClick` callback lets a parent mount the report next to a
 * `ChainTreeView` and deep-link a citation to the corresponding subtask.
 */

import type {
  Artifact,
  ChainReport,
  CompositeArtifact,
} from "@envoymesh/api";

import { Markdown } from "./Markdown.js";
import { CompositeArtifactRenderer } from "./CompositeArtifactRenderer.js";
import { useT, type TFunction } from "../context/I18nContext.js";

function formatDateTime(iso: string | undefined, t: TFunction): string {
  if (!iso) return t("chains.report.unknownTime");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function formatUsd(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function findComposite(report: ChainReport): CompositeArtifact | undefined {
  // The orchestrator may attach a composite artifact either to the
  // report-level `executiveArtifact` or inline on a section. Search both.
  const exec = report.executiveArtifact;
  if (exec && typeof exec === "object" && (exec as { kind?: string }).kind === "composite") {
    return exec as CompositeArtifact;
  }
  for (const s of report.sections ?? []) {
    const inline = (s as unknown as { artifact?: Artifact }).artifact;
    if (inline && inline.kind === "composite") {
      return inline as CompositeArtifact;
    }
  }
  return undefined;
}

export interface ChainReportRendererProps {
  report: ChainReport;
  className?: string;
  onCitationClick?: (subtaskId: string) => void;
  /** Optional inline per-part artifacts for composite parts. */
  artifactsByPart?: Record<string, Artifact>;
}

function computeTotalCostUsd(report: ChainReport): number {
  const workerTotal = (report.chainSummary?.workerAllocations ?? []).reduce(
    (s, a) => s + (typeof a.committedUsd === "number" ? a.committedUsd : 0),
    0,
  );
  const synth = report.chainSummary?.synthesisCostUsd ?? 0;
  return workerTotal + synth;
}

export function ChainReportRenderer({
  report,
  className,
  onCitationClick,
  artifactsByPart,
}: ChainReportRendererProps) {
  const t = useT();
  const composite = findComposite(report);
  const totalCostUsd = computeTotalCostUsd(report);
  const durationMs = report.chainSummary?.durationMs ?? 0;

  return (
    <article
      className={className ?? "chain-report"}
      data-chain-id={report.chainId}
      role="article"
    >
      <header className="chain-report-header">
        <h2 className="chain-report-title">{t("chains.report.title")}</h2>
        <dl className="chain-report-meta">
          <div>
            <dt>{t("chains.report.chainId")}</dt>
            <dd>
              <code>{report.chainId}</code>
            </dd>
          </div>
          <div>
            <dt>{t("chains.report.totalCost")}</dt>
            <dd>{formatUsd(totalCostUsd)}</dd>
          </div>
          {report.chainSummary?.synthesisCostUsd !== undefined ? (
            <div>
              <dt>{t("chains.report.synthesisCost")}</dt>
              <dd>{formatUsd(report.chainSummary.synthesisCostUsd)}</dd>
            </div>
          ) : null}
          {durationMs > 0 ? (
            <div>
              <dt>{t("chains.report.duration")}</dt>
              <dd>{formatDuration(durationMs)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("chains.report.started")}</dt>
            <dd>{formatDateTime(report.createdAt, t)}</dd>
          </div>
        </dl>
      </header>

      {composite && composite.parts.length > 0 ? (
        <section className="chain-report-executive">
          <h3>{t("chains.report.executiveSummary")}</h3>
          <CompositeArtifactRenderer artifact={composite} artifactsByPart={artifactsByPart} />
        </section>
      ) : null}

      {Array.isArray(report.sections) && report.sections.length > 0 ? (
        <section className="chain-report-sections">
          {report.sections.map((section, idx) => (
            <div
              key={idx}
              className="chain-report-section"
              data-subtask-id={section.citations?.[0]?.subtaskId}
            >
              <h3 className="chain-report-section-title">
                {section.heading ?? t("chains.report.sectionUntitled", { index: idx + 1 })}
              </h3>
              <Markdown text={section.bodyMarkdown} className="message-text" />
              {Array.isArray(section.citations) && section.citations.length > 0 ? (
                <div className="chain-report-citations">
                  <span className="chain-report-citations-label">
                    {t("chains.report.citations")}
                  </span>
                  {section.citations.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className="chain-report-citation"
                      onClick={() => c.subtaskId && onCitationClick?.(c.subtaskId)}
                      disabled={!c.subtaskId || !onCitationClick}
                      title={c.subtaskId}
                    >
                      {c.subtaskId ?? t("chains.report.citationUnattributed")}
                      {c.snippet ? <span className="chain-report-citation-snippet"> — {c.snippet.slice(0, 60)}…</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </article>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs > 0 ? ` ${rs}s` : ""}`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm > 0 ? ` ${rm}m` : ""}`;
}
