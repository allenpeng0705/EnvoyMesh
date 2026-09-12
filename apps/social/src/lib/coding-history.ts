/**
 * Coding left-rail History filters (not a separate nav tab).
 * @see docs/product_coding_tab_design.md §0
 */

import type { CodingUiBucket } from "@envoymesh/api";
import type { CodingArchiveKind } from "./coding-archive.js";
import { codingArchiveKey } from "./coding-archive.js";

export type CodingHistoryFilter =
  | "all"
  | "needs_you"
  | "recent"
  | "archived";

export const CODING_HISTORY_FILTERS: readonly CodingHistoryFilter[] = [
  "all",
  "needs_you",
  "recent",
  "archived",
] as const;

/** Recent = lastUsed within this many days. */
export const CODING_RECENT_DAYS = 14;

const FILTER_STORAGE_KEY = "envoymesh.codingHistoryFilter";
const FLAT_STORAGE_KEY = "envoymesh.codingHistoryFlat";

export type CodingHistoryRowMeta = {
  kind: CodingArchiveKind;
  id: string;
  lastUsedAt: string;
  /** EH uiBucket; ignored for pi/ext unless set. */
  uiBucket?: CodingUiBucket | null;
  /**
   * Ext probe: `install` counts as needs-you.
   * Pi has no durable needs-you signal in C1.
   */
  extNeedsInstall?: boolean;
};

export function codingHistoryArchiveKey(row: CodingHistoryRowMeta): string {
  return codingArchiveKey(row.kind, row.id);
}

export function codingRowNeedsYou(row: CodingHistoryRowMeta): boolean {
  if (row.kind === "eh") {
    const b = row.uiBucket;
    return b === "needs_input" || b === "attention" || b === "failed";
  }
  if (row.kind === "ext" && row.extNeedsInstall) return true;
  return false;
}

export function codingRowIsRecent(
  lastUsedAt: string,
  nowMs = Date.now(),
  days = CODING_RECENT_DAYS,
): boolean {
  const t = Date.parse(lastUsedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= days * 24 * 60 * 60 * 1000;
}

/**
 * Apply History filter. Archived rows are hidden from All / Recent / Needs you.
 */
export function codingRowMatchesFilter(
  row: CodingHistoryRowMeta,
  filter: CodingHistoryFilter,
  archived: ReadonlySet<string>,
  nowMs = Date.now(),
): boolean {
  const key = codingHistoryArchiveKey(row);
  const isArchived = archived.has(key);
  if (filter === "archived") return isArchived;
  if (isArchived) return false;
  if (filter === "needs_you") return codingRowNeedsYou(row);
  if (filter === "recent") return codingRowIsRecent(row.lastUsedAt, nowMs);
  return true;
}

export function loadCodingHistoryFilter(): CodingHistoryFilter {
  try {
    const raw =
      sessionStorage.getItem(FILTER_STORAGE_KEY) ??
      localStorage.getItem(FILTER_STORAGE_KEY);
    if (
      raw === "all" ||
      raw === "needs_you" ||
      raw === "recent" ||
      raw === "archived"
    ) {
      return raw;
    }
  } catch {
    /* private mode */
  }
  return "all";
}

export function saveCodingHistoryFilter(filter: CodingHistoryFilter): void {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, filter);
    localStorage.setItem(FILTER_STORAGE_KEY, filter);
  } catch {
    /* private mode */
  }
}

export function loadCodingHistoryFlatMode(): boolean {
  try {
    const raw =
      sessionStorage.getItem(FLAT_STORAGE_KEY) ??
      localStorage.getItem(FLAT_STORAGE_KEY);
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

export function saveCodingHistoryFlatMode(flat: boolean): void {
  try {
    const v = flat ? "1" : "0";
    sessionStorage.setItem(FLAT_STORAGE_KEY, v);
    localStorage.setItem(FLAT_STORAGE_KEY, v);
  } catch {
    /* private mode */
  }
}
