import { describe, expect, it } from "vitest";
import { localizeEnvoyLocalDownloadProgress } from "../../src/lib/localize-envoy-local-progress.js";
import type { TFunction } from "../../src/context/i18n-context.js";

const t: TFunction = (key, fallbackOrParams, params) => {
  const inline = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
  const p = typeof fallbackOrParams === "string" ? params : fallbackOrParams;
  let out = inline ?? key;
  if (key === "knowledge.embedGate.phaseStarting") out = "Starting embedder…";
  if (key === "knowledge.embedGate.phaseExtracting") out = "Extracting runtime…";
  if (key === "knowledge.embedGate.phaseDownloading") out = "Downloading…";
  if (key === "knowledge.embedGate.phaseDownloadingNamed") out = "Downloading {name}…";
  if (key === "settings.ai.envoyLocal.statusDownloading") out = "Downloading…";
  if (key === "settings.ai.envoyLocal.statusStarting") out = "Starting…";
  if (key === "settings.ai.envoyLocal.statusExtracting") out = "Extracting…";
  if (key === "settings.ai.envoyLocal.progressDownloadingNamed") out = "Downloading {name}…";
  if (!p) return out;
  return out.replace(/\{(\w+)\}/g, (_, name: string) => String(p[name] ?? `{${name}}`));
};

describe("localizeEnvoyLocalDownloadProgress", () => {
  it("maps English node labels to localized phases", () => {
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        label: "Downloading qwen3-embedding-0.6b.gguf",
        ns: "knowledge.embedGate",
      }),
    ).toBe("Downloading qwen3-embedding-0.6b.gguf…");
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        label: "Starting embed llama-server",
        ns: "knowledge.embedGate",
      }),
    ).toBe("Starting embedder…");
    expect(
      localizeEnvoyLocalDownloadProgress(t, {
        phase: "extracting-runtime",
        label: "Extracting llama-server",
        ns: "settings.ai.envoyLocal",
      }),
    ).toBe("Extracting…");
  });
});
