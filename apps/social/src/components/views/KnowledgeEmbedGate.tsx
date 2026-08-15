/**
 * Full-panel gate when Envoy Local embed is required but not ready.
 * Download runs in the background; user can retry or open Setup.
 */
import type { EnvoyLocalEmbedStatus } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import type { KnowledgeEmbedGateKind } from "../../hooks/useEnvoyLocalEmbedReadiness.js";
import { localizeEnvoyLocalDownloadProgress } from "../../lib/localize-envoy-local-progress.js";

export function KnowledgeEmbedGate(props: {
  kind: KnowledgeEmbedGateKind;
  status: EnvoyLocalEmbedStatus | null;
  loadError?: string | null;
  inFlight: boolean;
  /** Hide “Open Setup” when already on Setup. Default true. */
  showSetupLink?: boolean;
  onDownload: () => void;
  onOpenSetup: () => void;
}) {
  const t = useT();
  const {
    kind,
    status,
    loadError,
    inFlight,
    showSetupLink = true,
    onDownload,
    onOpenSetup,
  } = props;

  if (kind === "ready" || kind === "not-required") return null;

  const fraction =
    typeof status?.download?.fraction === "number"
      ? Math.max(0, Math.min(1, status.download.fraction))
      : undefined;
  const progressLabel = localizeEnvoyLocalDownloadProgress(t, {
    phase: status?.phase,
    label: status?.download?.label,
    ns: "knowledge.embedGate",
  });
  const errorText = status?.lastError?.trim() || loadError?.trim() || null;

  const title =
    kind === "downloading"
      ? t("knowledge.embedGate.titleDownloading")
      : kind === "error"
        ? t("knowledge.embedGate.titleError")
        : t("knowledge.embedGate.titleNeeded");

  const body =
    kind === "downloading"
      ? t("knowledge.embedGate.bodyDownloading")
      : kind === "error"
        ? t("knowledge.embedGate.bodyError")
        : t("knowledge.embedGate.bodyNeeded");

  return (
    <div className="knowledge-embed-gate" data-testid="knowledge-embed-gate" role="status">
      <div className="knowledge-embed-gate__card">
        <h3>{title}</h3>
        <p>{body}</p>
        {errorText ? (
          <p className="knowledge-embed-gate__error" role="alert">
            {errorText}
          </p>
        ) : null}
        {kind === "downloading" || inFlight ? (
          <div className="envoy-local-download-progress knowledge-embed-gate__progress">
            <p className="settings-hint">
              {progressLabel}
              {fraction != null ? ` (${Math.round(fraction * 100)}%)` : ""}
            </p>
            <div className="settings-progress-bar" aria-hidden>
              <div
                className="settings-progress-fill"
                style={{
                  width: fraction != null ? `${Math.round(fraction * 100)}%` : "15%",
                  opacity: fraction != null ? 1 : 0.55,
                }}
              />
            </div>
            {typeof status?.download?.bytesReceived === "number" &&
            typeof status?.download?.bytesTotal === "number" &&
            status.download.bytesTotal > 0 ? (
              <p className="settings-hint">
                {t("knowledge.embedGate.progressBytes", {
                  received: formatBytes(status.download.bytesReceived),
                  total: formatBytes(status.download.bytesTotal),
                })}
              </p>
            ) : null}
            <p className="field-desc">{t("knowledge.embedGate.backgroundHint")}</p>
          </div>
        ) : null}
        <div className="knowledge-embed-gate__actions">
          <button
            type="button"
            className="primary"
            data-testid="knowledge-embed-gate-download"
            disabled={inFlight}
            onClick={() => onDownload()}
          >
            {inFlight
              ? t("knowledge.embedGate.downloading")
              : kind === "error"
                ? t("knowledge.embedGate.retry")
                : t("knowledge.embedGate.download")}
          </button>
          {showSetupLink ? (
            <button
              type="button"
              className="secondary"
              data-testid="knowledge-embed-gate-setup"
              onClick={() => onOpenSetup()}
            >
              {t("knowledge.embedGate.openSetup")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
