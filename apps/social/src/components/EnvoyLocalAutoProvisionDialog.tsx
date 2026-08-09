/**
 * Consent dialog before first Envoy Local download (llama.cpp + one GGUF).
 * Shown when the node reports `suggestAutoProvision` (no cloud/Ollama, assets missing).
 */
import { useEffect, useState } from "react";
import type { EnvoyLocalStatus } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { useToastOptional } from "../hooks/useToast.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

function formatApproxSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "a few hundred MB to several GB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `≈${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `≈${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

const MAX_PROBE_ATTEMPTS = 12;
const PROBE_BASE_DELAY_MS = 750;

export function EnvoyLocalAutoProvisionDialog({
  onOpenSettingsAi,
}: {
  /** After user accepts, open Settings → AI so download progress is visible. */
  onOpenSettingsAi?: () => void;
}) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToastOptional();
  const [offer, setOffer] = useState<EnvoyLocalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed || busy || offer) return;
    let cancelled = false;

    void (async () => {
      for (let attempt = 1; attempt <= MAX_PROBE_ATTEMPTS && !cancelled; attempt++) {
        try {
          const st = await nodeService.getEnvoyLocalStatus();
          if (cancelled) return;
          if (st.suggestAutoProvision) {
            setOffer(st);
            return;
          }
          // Status ok and no offer — stop retrying this session.
          return;
        } catch {
          // Node / RPC not ready yet — back off and retry.
          await new Promise((r) => setTimeout(r, PROBE_BASE_DELAY_MS * attempt));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nodeService, dismissed, busy, offer]);

  if (!offer || busy) return null;

  const modelLabel = offer.recommendedModelLabel ?? offer.recommendedModelId ?? "GGUF";
  const sizeLabel = formatApproxSize(offer.recommendedModelApproxBytes);
  const hardware = offer.hardwareSummary ?? "";

  return (
    <ConfirmDialog
      title={t("settings.ai.envoyLocal.autoProvisionTitle")}
      message={t("settings.ai.envoyLocal.autoProvisionMessage", {
        model: modelLabel,
        size: sizeLabel,
        hardware,
      })}
      confirmLabel={t("settings.ai.envoyLocal.autoProvisionConfirm")}
      cancelLabel={t("settings.ai.envoyLocal.autoProvisionCancel")}
      onCancel={() => {
        setDismissed(true);
        setOffer(null);
        void nodeService.declineEnvoyLocalAutoProvision().catch(() => undefined);
      }}
      onConfirm={() => {
        setBusy(true);
        setDismissed(true);
        setOffer(null);
        showToast(t("settings.ai.envoyLocal.autoProvisionStarted"), "info");
        onOpenSettingsAi?.();
        void (async () => {
          try {
            const st = await nodeService.enableEnvoyLocal();
            if (st.phase === "error" || st.lastError) {
              showToast(
                t("settings.ai.envoyLocal.enableFailed") +
                  (st.lastError ? `: ${st.lastError}` : ""),
                "error",
              );
            } else {
              showToast(t("settings.ai.envoyLocal.enableOk"), "success");
            }
          } catch (e) {
            showToast(
              t("settings.ai.envoyLocal.enableFailed") +
                `: ${e instanceof Error ? e.message : String(e)}`,
              "error",
            );
          } finally {
            setBusy(false);
          }
        })();
      }}
    />
  );
}
