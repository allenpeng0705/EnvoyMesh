const STORAGE_KEY = "envoymesh:eh-review-min-files";

/** Minimum changed-file count before auto-opening the review panel (0 = always). */
export function getEhReviewMinFiles(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 1;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 1;
    return Math.floor(parsed);
  } catch {
    return 1;
  }
}

export function setEhReviewMinFiles(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(value))));
  } catch {
    // ignore quota / private mode
  }
}
