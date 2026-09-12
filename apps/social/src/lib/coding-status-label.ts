/**
 * Map Coding UI buckets / panel probe state → short user-facing status text.
 */

import type { CodingUiBucket } from "@envoymesh/api";

type TFn = (key: string, fallback: string, vars?: Record<string, string | number>) => string;

/** Sidebar / header chip for EH `uiBucket` (done → Idle). */
export function codingUiBucketLabel(
  t: TFn,
  bucket: CodingUiBucket | undefined | null,
): string {
  switch (bucket) {
    case "needs_input":
      return t("codingView.statusNeedsInput", "Needs input");
    case "failed":
      return t("codingView.statusFailed", "Failed");
    case "attention":
      return t("codingView.statusAttention", "Attention");
    case "running":
      return t("codingView.statusRunning", "Running");
    case "done":
    default:
      return t("codingView.statusIdle", "Idle");
  }
}

/** Sidebar chip only for actionable / in-progress states (not Ready/Idle). */
export function codingUiBucketShowsChip(
  bucket: CodingUiBucket | undefined | null,
): boolean {
  return (
    bucket === "needs_input" ||
    bucket === "attention" ||
    bucket === "failed" ||
    bucket === "running"
  );
}

export type ExtProbeStatus = "ready" | "install" | "unknown" | "busy";

export function codingExtStatusLabel(t: TFn, status: ExtProbeStatus | null): string {
  switch (status) {
    case "busy":
      return t("codingView.statusBusy", "Busy");
    case "ready":
      return t("codingView.harnessReady", "Ready");
    case "install":
      return t("codingView.harnessNeedsInstall", "Install");
    case "unknown":
      return t("codingView.harnessProbeUnknown", "Check install");
    default:
      return t("codingView.statusIdle", "Idle");
  }
}

/** Ext row chip: Install / Busy / Check install — not Ready. */
export function codingExtStatusShowsChip(status: ExtProbeStatus | null): boolean {
  return status === "busy" || status === "install" || status === "unknown";
}

export function codingUiBucketDotClass(
  bucket: CodingUiBucket | undefined | null,
): string {
  return `coding-status-dot coding-status-dot--${bucket ?? "done"}`;
}
