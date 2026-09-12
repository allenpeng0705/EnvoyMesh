/** Deep-link → top Coding view. */

export const OPEN_CODING_EVENT = "envoymesh:open-coding";

/** Session flag set when opening a mesh peer-review invite (read-only). */
export const CODING_REVIEW_READONLY_KEY = "coding-review-readonly";

export type OpenCodingDetail = {
  /** Optional home EH `chatId` to focus. */
  chatId?: string;
  /** Optional Pi (or other TUI) terminal session id. */
  sessionId?: string;
  /** Harness hint for create / focus (C1.3+). */
  harness?: "envoy-harness" | "pi";
  /** Open create sheet for a new session. */
  startNew?: boolean;
  /** Phase 68-C2 — open EH workspace in read-only review mode. */
  reviewOnly?: boolean;
};

let pending: OpenCodingDetail | null = null;

export function takePendingCodingOpen(): OpenCodingDetail | null {
  const next = pending;
  pending = null;
  return next;
}

export function openCoding(detail: OpenCodingDetail = {}): void {
  pending = detail;
  if (detail.reviewOnly) {
    try {
      sessionStorage.setItem(CODING_REVIEW_READONLY_KEY, "1");
    } catch {
      // ignore quota / private mode
    }
  } else if (detail.chatId || detail.sessionId || detail.startNew) {
    try {
      sessionStorage.removeItem(CODING_REVIEW_READONLY_KEY);
    } catch {
      // ignore
    }
  }
  window.dispatchEvent(
    new CustomEvent<OpenCodingDetail>(OPEN_CODING_EVENT, { detail }),
  );
}

/** True when Coding should treat the next/current EH open as review-only. */
export function isCodingReviewReadonly(): boolean {
  try {
    return sessionStorage.getItem(CODING_REVIEW_READONLY_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearCodingReviewReadonly(): void {
  try {
    sessionStorage.removeItem(CODING_REVIEW_READONLY_KEY);
  } catch {
    // ignore
  }
}
