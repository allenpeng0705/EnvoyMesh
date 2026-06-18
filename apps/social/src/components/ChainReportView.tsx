/**
 * Phase 41D — ChainReportView component.
 *
 * Fetches and renders a completed chain's published report.
 * Wraps the existing ChainReportRenderer with loading/error states.
 */

import React, { useEffect, useState } from "react";
import { useNodeService } from "../hooks/useNodeService.js";
import { useT } from "../context/I18nContext.js";
import { ChainReportRenderer } from "./ChainReportRenderer.js";
import type { ChainReport } from "@envoymesh/protocol";

interface ChainReportViewProps {
  chainId: string;
  onClose: () => void;
}

export function ChainReportView({ chainId, onClose }: ChainReportViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [report, setReport] = useState<ChainReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await nodeService.chainGetReport({ chainId });
        if (!cancelled) {
          if (result.report) {
            setReport(result.report as ChainReport);
          } else {
            setReport(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setReport(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, nodeService]);

  return (
    <div className="chain-report-view">
      <div className="chain-report-header">
        <strong>{t("chains.report.title")}</strong>
        <button
          className="btn-close"
          onClick={onClose}
          aria-label={t("chains.back")}
        >
          ✕
        </button>
      </div>

      {loading && (
        <p className="chain-report-loading">{t("chains.loading")}</p>
      )}

      {error && (
        <p className="chain-report-error">
          {t("chains.report.loadError", { error })}
        </p>
      )}

      {!loading && !error && !report && (
        <p className="chain-report-empty">
          {t("chains.report.notAvailable")}
        </p>
      )}

      {!loading && !error && report && (
        <ChainReportRenderer report={report} />
      )}
    </div>
  );
}
