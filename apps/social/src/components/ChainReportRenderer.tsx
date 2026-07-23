/**
 * Phase 40 — ChainReportRenderer.
 *
 * Renders a published `ChainReport`:
 *   - header (chainId, total cost, duration, worker peer-ids)
 *   - executive summary (markdown body)
 *   - sections with citations (click → jumps to a tree node)
 *   - composite artifact (delegated to CompositeArtifactRenderer)
 *
 * Phase 47C — iteration draft sections (`Draft N` / `Final (round N)`) render
 * as an accordion timeline; other sections stay expanded.
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

const DRAFT_HEADING_RE = /^(Draft\s+(\d+)|Final\s*\(round\s+(\d+)\))$/i;

function parseIterationHeading(heading: string | undefined): {
  kind: "draft" | "final";
  round: number;
} | null {
  if (!heading) return null;
  const m = DRAFT_HEADING_RE.exec(heading.trim());
  if (!m) return null;
  if (m[2]) return { kind: "draft", round: Number(m[2]) };
  if (m[3]) return { kind: "final", round: Number(m[3]) };
  return null;
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
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const draftSections = sections.filter((s) => parseIterationHeading(s.heading));
  const bodySections = sections.filter((s) => !parseIterationHeading(s.heading));
  const draftCount = draftSections.length;

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

      {draftCount > 1 ? (
        <section className="chain-report-drafts" data-testid="chain-report-drafts">
          {draftSections.map((section, idx) => {
            const parsed = parseIterationHeading(section.heading)!;
            const label =
              parsed.kind === "final"
                ? t("chains.iteration.finalRound", { round: parsed.round })
                : t("chains.iteration.draftRound", { round: parsed.round });
            const isLast = idx === draftCount - 1;
            return (
              <details
                key={`draft-${idx}`}
                className="chain-report-draft"
                open={isLast}
                data-testid={`chain-report-draft-${parsed.round}`}
              >
                <summary className="chain-report-draft-summary">{label}</summary>
                <Markdown text={section.bodyMarkdown} className="message-text" />
              </details>
            );
          })}
        </section>
      ) : null}

      {(draftCount <= 1 ? sections : bodySections).length > 0 ? (
        <section className="chain-report-sections">
          {(draftCount <= 1 ? sections : bodySections).map((section, idx) => (
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
