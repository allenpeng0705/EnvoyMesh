/**
 * Phase 59D — per attachment × worker delivery chips + Retry.
 */

import type { ChainGetStateResult } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";

export interface ChainInputDeliveriesProps {
  deliveries: NonNullable<ChainGetStateResult["inputDeliveries"]>;
  attachments?: ChainGetStateResult["inputAttachments"];
  allowRetry?: boolean;
  busyKey?: string | null;
  onRetry?: (input: { workerPeerId: string; sourceRelativePath: string }) => void;
}

function shortPeer(peerId: string): string {
  return peerId.length > 14 ? `${peerId.slice(0, 12)}…` : peerId;
}

function labelFor(
  sourceRelativePath: string,
  attachments: ChainGetStateResult["inputAttachments"],
): string {
  const att = attachments?.find(
    (a) => a.sourceRelativePath.replace(/^[\\/]+/, "") === sourceRelativePath,
  );
  return att?.label?.trim() || att?.fileName || sourceRelativePath.split("/").pop() || sourceRelativePath;
}

export function ChainInputDeliveries({
  deliveries,
  attachments,
  allowRetry = false,
  busyKey = null,
  onRetry,
}: ChainInputDeliveriesProps) {
  const t = useT();
  if (!deliveries.length) return null;

  return (
    <div className="chain-input-deliveries" data-testid="chain-input-deliveries">
      <p className="chain-live-steps__inputs-title">{t("chains.detail.deliveryTitle")}</p>
      <ul className="chain-input-deliveries__list">
        {deliveries.map((d) => {
          const source = d.sourceRelativePath.replace(/^[\\/]+/, "");
          const key = `${d.workerPeerId}::${source}`;
          const phaseLabel = t(`chains.detail.deliveryPhase.${d.phase}`, d.phase);
          const showRetry =
            allowRetry &&
            onRetry &&
            (d.phase === "failed" || d.phase === "transferring");
          const busy = busyKey === key;
          return (
            <li
              key={key}
              className="chain-input-deliveries__item"
              data-testid={`chain-input-delivery-${d.phase}`}
              data-phase={d.phase}
            >
              <span className="chain-input-deliveries__main">
                <code>[{labelFor(source, attachments)}]</code>
                <span aria-hidden="true"> → </span>
                <span>{shortPeer(d.workerPeerId)}</span>
                <span aria-hidden="true"> · </span>
                <span data-phase={d.phase}>{phaseLabel}</span>
              </span>
              {d.phase === "failed" && d.error ? (
                <span className="chain-input-deliveries__error" title={d.error}>
                  {d.error.slice(0, 80)}
                </span>
              ) : null}
              {showRetry ? (
                <button
                  type="button"
                  className="secondary btn-sm"
                  disabled={busy}
                  data-testid="chain-input-delivery-retry"
                  onClick={() =>
                    onRetry({ workerPeerId: d.workerPeerId, sourceRelativePath: source })
                  }
                >
                  {busy ? t("chains.detail.deliveryRetrying") : t("chains.detail.deliveryRetry")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
