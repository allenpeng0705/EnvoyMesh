/**
 * Map Envoy Local / embed download progress to localized UI copy.
 * Node emits English `download.label` strings — never show those raw in Social.
 */
import type { TFunction } from "../context/i18n-context.js";

export function localizeEnvoyLocalDownloadProgress(
  t: TFunction,
  opts: {
    phase?: string | null;
    label?: string | null;
    /** i18n key prefix — Knowledge gate vs Settings AI. */
    ns: "knowledge.embedGate" | "settings.ai.envoyLocal";
  },
): string {
  const phase = (opts.phase ?? "").trim();
  const label = (opts.label ?? "").trim();
  const isEmbed = opts.ns === "knowledge.embedGate";

  if (phase === "starting" || /^Starting\b/i.test(label)) {
    return isEmbed
      ? t("knowledge.embedGate.phaseStarting")
      : t("settings.ai.envoyLocal.statusStarting");
  }
  if (
    phase === "extracting-runtime" ||
    phase === "extracting" ||
    /^Extracting\b/i.test(label)
  ) {
    return isEmbed
      ? t("knowledge.embedGate.phaseExtracting")
      : t("settings.ai.envoyLocal.statusExtracting", "Extracting…");
  }

  const named = /^Downloading\s+(.+)$/i.exec(label);
  if (named?.[1]) {
    return isEmbed
      ? t("knowledge.embedGate.phaseDownloadingNamed", { name: named[1].trim() })
      : t("settings.ai.envoyLocal.progressDownloadingNamed", "Downloading {name}…", {
          name: named[1].trim(),
        });
  }

  return isEmbed
    ? t("knowledge.embedGate.phaseDownloading")
    : t("settings.ai.envoyLocal.statusDownloading");
}
