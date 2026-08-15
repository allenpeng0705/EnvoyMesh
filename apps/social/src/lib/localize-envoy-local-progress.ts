/**
 * Map Envoy Local / embed download progress to localized UI copy.
 * Node emits English `download.label` strings — never show those raw in Social.
 */
import type { TFunction } from "../context/i18n-context.js";

/** Ordered install pipeline shared by chat Local and Knowledge embed. */
export const ENVOY_LOCAL_INSTALL_STEPS = [
  "detecting",
  "downloading-runtime",
  "extracting-runtime",
  "downloading-model",
  "starting",
] as const;

export type EnvoyLocalInstallStep = (typeof ENVOY_LOCAL_INSTALL_STEPS)[number];

export type EnvoyLocalProgressNs = "knowledge.embedGate" | "settings.ai.envoyLocal";

export function envoyLocalInstallStepIndex(phase?: string | null): number {
  const p = (phase ?? "").trim();
  const idx = ENVOY_LOCAL_INSTALL_STEPS.indexOf(p as EnvoyLocalInstallStep);
  return idx;
}

function stepLabel(
  t: TFunction,
  step: EnvoyLocalInstallStep,
  ns: EnvoyLocalProgressNs,
): string {
  const isEmbed = ns === "knowledge.embedGate";
  switch (step) {
    case "detecting":
      return isEmbed
        ? t("knowledge.embedGate.phaseDetecting")
        : t("settings.ai.envoyLocal.statusDetecting", "Detecting…");
    case "downloading-runtime":
      return isEmbed
        ? t("knowledge.embedGate.phaseDownloadingRuntime")
        : t("settings.ai.envoyLocal.statusDownloadingRuntime", "Downloading runtime…");
    case "extracting-runtime":
      return isEmbed
        ? t("knowledge.embedGate.phaseExtracting")
        : t("settings.ai.envoyLocal.statusExtracting", "Extracting…");
    case "downloading-model":
      return isEmbed
        ? t("knowledge.embedGate.phaseDownloadingModel")
        : t("settings.ai.envoyLocal.statusDownloadingModel", "Downloading model…");
    case "starting":
      return isEmbed
        ? t("knowledge.embedGate.phaseStarting")
        : t("settings.ai.envoyLocal.statusStarting");
  }
}

export function localizeEnvoyLocalInstallStep(
  t: TFunction,
  step: EnvoyLocalInstallStep,
  ns: EnvoyLocalProgressNs,
): string {
  return stepLabel(t, step, ns);
}

export function localizeEnvoyLocalDownloadProgress(
  t: TFunction,
  opts: {
    phase?: string | null;
    label?: string | null;
    /** i18n key prefix — Knowledge gate vs Settings AI. */
    ns: EnvoyLocalProgressNs;
  },
): string {
  const phase = (opts.phase ?? "").trim();
  const label = (opts.label ?? "").trim();
  const isEmbed = opts.ns === "knowledge.embedGate";

  // Prefer explicit pipeline phase so UI never collapses to a single "Installing…".
  const stepIdx = envoyLocalInstallStepIndex(phase);
  if (stepIdx >= 0) {
    const step = ENVOY_LOCAL_INSTALL_STEPS[stepIdx]!;
    if (step === "downloading-runtime" || step === "downloading-model") {
      const named = /^Downloading\s+(.+)$/i.exec(label);
      if (named?.[1]) {
        return isEmbed
          ? t("knowledge.embedGate.phaseDownloadingNamed", { name: named[1].trim() })
          : t("settings.ai.envoyLocal.progressDownloadingNamed", "Downloading {name}…", {
              name: named[1].trim(),
            });
      }
    }
    return stepLabel(t, step, opts.ns);
  }

  if (phase === "extracting" || /^Extracting\b/i.test(label)) {
    return stepLabel(t, "extracting-runtime", opts.ns);
  }
  if (/^Starting\b/i.test(label)) {
    return stepLabel(t, "starting", opts.ns);
  }
  if (/^Detecting\b/i.test(label)) {
    return stepLabel(t, "detecting", opts.ns);
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
