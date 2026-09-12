/**
 * Coding sidebar status buckets — derived from EH agent state (not a wire enum).
 * @see docs/product_coding_tab_design.md §2
 */

import type { EhAgentStateName } from "./eh-timeline.js";

export type CodingUiBucket =
  | "needs_input"
  | "failed"
  | "attention"
  | "running"
  | "done";

/** Sidebar sort: needs_input → failed → attention → running → done. */
export const CODING_UI_BUCKET_SORT_ORDER: readonly CodingUiBucket[] = [
  "needs_input",
  "failed",
  "attention",
  "running",
  "done",
] as const;

export function codingUiBucketRank(bucket: CodingUiBucket): number {
  const i = CODING_UI_BUCKET_SORT_ORDER.indexOf(bucket);
  return i >= 0 ? i : CODING_UI_BUCKET_SORT_ORDER.length;
}

export type DeriveCodingUiBucketInput = {
  state: EhAgentStateName;
  /** Outstanding file change-set / `eh:files_changed` awaiting review. */
  hasOutstandingFileChanges?: boolean;
  /**
   * Pending permission or user-question even if state lags
   * (e.g. still `thinking` while a sheet is open).
   */
  hasPendingPermissionOrQuestion?: boolean;
};

/**
 * Map `EhAgentStateName` (+ pending review / permission) → UI bucket.
 * `cancelled` → `failed` for C1 (open product question may later map to `done`).
 */
export function deriveCodingUiBucket(
  input: DeriveCodingUiBucketInput,
): CodingUiBucket {
  const {
    state,
    hasOutstandingFileChanges = false,
    hasPendingPermissionOrQuestion = false,
  } = input;

  if (
    hasPendingPermissionOrQuestion ||
    state === "waiting_for_approval" ||
    state === "waiting_for_answer"
  ) {
    return "needs_input";
  }

  if (state === "failed" || state === "cancelled") {
    return "failed";
  }

  if (
    state === "submitting" ||
    state === "thinking" ||
    state === "running_tool" ||
    state === "verifying" ||
    state === "reconnecting"
  ) {
    return "running";
  }

  if (state === "completed" && hasOutstandingFileChanges) {
    return "attention";
  }

  // ready | completed (no pending review)
  return "done";
}
