/** Phase 45D — cross-view Browser navigation helpers. */

const PENDING_URL_KEY = "envoymesh:browser-pending-url";
export const OPEN_BROWSER_EVENT = "envoymesh:open-browser";

export function setPendingBrowserUrl(url: string): void {
  try {
    sessionStorage.setItem(PENDING_URL_KEY, url);
  } catch {
    /* ignore quota / private mode */
  }
}

export function takePendingBrowserUrl(): string | null {
  try {
    const url = sessionStorage.getItem(PENDING_URL_KEY);
    if (url) sessionStorage.removeItem(PENDING_URL_KEY);
    return url;
  } catch {
    return null;
  }
}

/** Ask App to switch to Browser and load `url`. */
export function openBrowserAt(url: string): void {
  setPendingBrowserUrl(url);
  window.dispatchEvent(
    new CustomEvent(OPEN_BROWSER_EVENT, { detail: { url } }),
  );
}
