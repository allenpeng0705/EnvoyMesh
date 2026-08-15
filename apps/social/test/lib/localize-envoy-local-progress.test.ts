import { describe, expect, it } from "vitest";
import {
  envoyLocalInstallStepIndex,
  localizeEnvoyLocalDownloadProgress,
  localizeEnvoyLocalInstallStep,
} from "../../src/lib/localize-envoy-local-progress.js";
import type { TFunction } from "../../src/context/i18n-context.js";

const t: TFunction = (key, fallbackOrParams, params) => {
  const inline = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
  const p = typeof fallbackOrParams === "string" ? params : fallbackOrParams;
  let out = inline ?? key;
  if (key === "knowledge.embedGate.phaseDetecting") out = "Detecting platform…";
  if (key === "knowledge.embedGate.phaseDownloadingRuntime") out = "Downloading llama.cpp runtime…";
  if (key === "knowledge.embedGate.phaseStarting") out = "Starting embedder…";
  if (key === "knowledge.embedGate.phaseExtracting") out = "Extracting runtime…";
  if (key === "knowledge.embedGate.phaseDownloadingModel") out = "Downloading embedding model…";
  if (key === "knowledge.embedGate.phaseDownloading") out = "Downloading…";
  if (key === "knowledge.embedGate.phaseDownloadingNamed") out = "Downloading {name}…";
  if (key === "settings.ai.envoyLocal.statusDownloading") out = "Downloading…";
  if (key === "settings.ai.envoyLocal.statusDetecting") out = "Detecting…";
  if (key === "settings.ai.envoyLocal.statusDownloadingRuntime") out = "Downloading runtime…";
  if (key === "settings.ai.envoyLocal.statusDownloadingModel") out = "Downloading model…";
  if (key === "settings.ai.envoyLocal.statusStarting") out = "Starting…";
  if (key === "settings.ai.envoyLocal.statusExtracting") out = "Extracting…";
  if (key === "settings.ai.envoyLocal.progressDownloadingNamed") out = "Downloading {name}…";
  if (!p) return out;
  return out.replace(/\{(\w+)\}/g, (_, name: string) => String(p[name] ?? `{${name}}`));
};

describe("localizeEnvoyLocalDownloadProgress", () => {
  it("maps each pipeline phase to a distinct label", () => {
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        phase: "detecting",
        label: "Detecting platform",
        ns: "knowledge.embedGate",
      }),
    ).toBe("Detecting platform…");
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        phase: "downloading-runtime",
        label: "Downloading llama-b1234-bin-macos-arm64.tar.gz",
        ns: "knowledge.embedGate",
      }),
    ).toBe("Downloading llama-b1234-bin-macos-arm64.tar.gz…");
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        phase: "extracting-runtime",
        label: "Extracting llama-server",
        ns: "settings.ai.envoyLocal",
      }),
    ).toBe("Extracting…");
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        phase: "downloading-model",
        ns: "knowledge.embedGate",
      }),
    ).toBe("Downloading embedding model…");
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        label: "Starting embed llama-server",
        ns: "knowledge.embedGate",
      }),
    ).toBe("Starting embedder…");
  });

  it("exposes install step order for checklist UI", () => {
    expect(envoyLocalInstallStepIndex("detecting")).toBe(0);
    expect(envoyLocalInstallStepIndex("starting")).toBe(4);
    expect(envoyLocalInstallStepIndex("idle")).toBe(-1);
    expect(localizeEnvoyLocalInstallStep(t, "downloading-model", "knowledge.embedGate")).toBe(
      "Downloading embedding model…",
    );
  });
});
