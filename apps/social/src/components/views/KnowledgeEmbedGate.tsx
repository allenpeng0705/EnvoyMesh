/**
 * Full-panel gate when Envoy Local embed is required but not ready.
 * Download runs in the background; user can retry or open Setup.
 */
import type { EnvoyLocalEmbedStatus } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import type { KnowledgeEmbedGateKind } from "../../hooks/useEnvoyLocalEmbedReadiness.js";
import {
  ENVOY_LOCAL_INSTALL_STEPS,
  envoyLocalInstallStepIndex,
  localizeEnvoyLocalDownloadProgress,
  localizeEnvoyLocalInstallStep,
} from "../../lib/localize-envoy-local-progress.js";

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
  const showProgress = kind === "downloading" || inFlight;
  const stepIndex = showProgress
    ? Math.max(0, envoyLocalInstallStepIndex(status?.phase))
    : -1;

  const title = showProgress
    ? progressLabel
    : kind === "error"
      ? t("knowledge.embedGate.titleError")
      : t("knowledge.embedGate.titleNeeded");

  const body = showProgress
    ? t("knowledge.embedGate.bodyDownloading")
    : kind === "error"
      ? t("knowledge.embedGate.bodyError")
      : t("knowledge.embedGate.bodyNeeded");

  return (
    <div className="knowledge-embed-gate" data-testid="knowledge-embed-gate" role="status">
      <div className="knowledge-embed-gate__card">
        <h3 data-testid="knowledge-embed-gate-title">{title}</h3>
        <p>{body}</p>
        {errorText ? (
          <p className="knowledge-embed-gate__error" role="alert">
            {errorText}
          </p>
        ) : null}
        {showProgress ? (
          <div className="envoy-local-download-progress knowledge-embed-gate__progress">
            <ol
              className="knowledge-embed-gate__steps"
              data-testid="knowledge-embed-gate-steps"
              aria-label={t("knowledge.embedGate.stepsAria")}
            >
              {ENVOY_LOCAL_INSTALL_STEPS.map((step, i) => {
                const state =
                  i < stepIndex ? "done" : i === stepIndex ? "current" : "pending";
                const mark = state === "done" ? "✓" : state === "current" ? "→" : "·";
                const stateLabel =
                  state === "done"
                    ? t("knowledge.embedGate.stepDone")
                    : state === "current"
                      ? t("knowledge.embedGate.stepCurrent")
                      : t("knowledge.embedGate.stepPending");
                return (
                  <li
                    key={step}
                    className={`knowledge-embed-gate__step knowledge-embed-gate__step--${state}`}
                    data-testid={`knowledge-embed-gate-step-${step}`}
                    data-state={state}
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    <span className="knowledge-embed-gate__step-mark" aria-hidden>
                      {mark}
                    </span>
                    <span className="knowledge-embed-gate__step-label">
                      {localizeEnvoyLocalInstallStep(t, step, "knowledge.embedGate")}
                    </span>
                    <span className="visually-hidden">{stateLabel}</span>
                  </li>
                );
              })}
            </ol>
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
              ? progressLabel
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
