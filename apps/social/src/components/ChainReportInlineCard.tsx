/**
 * Phase 43D — Inline chain report card for EnvoyAI chat.
 */

import type { ChainReport } from "@envoymesh/protocol";

import { useT } from "../context/I18nContext.js";
import { ChainReportRenderer } from "./ChainReportRenderer.js";

export interface ChainReportInlineCardProps {
  chainId: string;
  report: ChainReport;
  onOpenChains?: () => void;
}

export function ChainReportInlineCard({ chainId, report, onOpenChains }: ChainReportInlineCardProps) {
  const t = useT();

  return (
    <div className="chain-report-inline-card" data-chain-id={chainId}>
      <div className="chain-report-inline-header">
        <strong>{t("chains.report.inlineTitle")}</strong>
        {onOpenChains ? (
          <button type="button" className="btn-sm" onClick={onOpenChains}>
            {t("chains.report.openChains")}
          </button>
        ) : null}
      </div>
      <p className="chain-report-inline-summary">
        {report.executiveSummary?.slice(0, 280) ??
          t("chains.report.untitled")}
      </p>
      <details className="chain-report-inline-details">
        <summary>{t("chains.report.viewFull")}</summary>
        <ChainReportRenderer report={report} />
      </details>
    </div>
  );
}
