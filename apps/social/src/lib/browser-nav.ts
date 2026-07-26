/** Phase 45D — cross-view Browser navigation helpers. */

const PENDING_URL_KEY = "envoymesh:browser-pending-url";
const PENDING_INBOX_PUBLISHER_KEY = "envoymesh:inbox-pending-publisher";
const PENDING_AUTHOR_TEMPLATE_KEY = "envoymesh:browser-pending-author-template";
export const OPEN_BROWSER_EVENT = "envoymesh:open-browser";
export const OPEN_INBOX_EVENT = "envoymesh:open-inbox";
/** Fired after a successful web publish so My site section lists reload. */
export const WEB_SECTIONS_CHANGED_EVENT = "envoymesh:web-sections-changed";

export function notifyWebSectionsChanged(): void {
  window.dispatchEvent(new CustomEvent(WEB_SECTIONS_CHANGED_EVENT));
}

export type PendingAuthorTemplate =
  | "blog-post"
  | "note"
  | "profile"
  | "photo"
  | "file"
  | "section";

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

/** True when a URL or author template is waiting for Explore to mount. */
export function hasPendingBrowserOpen(): boolean {
  try {
    return Boolean(
      sessionStorage.getItem(PENDING_URL_KEY) ||
        sessionStorage.getItem(PENDING_AUTHOR_TEMPLATE_KEY),
    );
  } catch {
    return false;
  }
}

/** Ask App to switch to Browser and load `url`. */
export function openBrowserAt(url: string): void {
  setPendingBrowserUrl(url);
  window.dispatchEvent(
    new CustomEvent(OPEN_BROWSER_EVENT, { detail: { url } }),
  );
}

/** Ask App to open Browser authoring with a template selected. */
export function openBrowserAuthor(template: PendingAuthorTemplate): void {
  try {
    sessionStorage.setItem(PENDING_AUTHOR_TEMPLATE_KEY, template);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent(OPEN_BROWSER_EVENT, { detail: { authorTemplate: template } }),
  );
}

export function takePendingAuthorTemplate(): PendingAuthorTemplate | null {
  try {
    const raw = sessionStorage.getItem(PENDING_AUTHOR_TEMPLATE_KEY);
    if (raw) sessionStorage.removeItem(PENDING_AUTHOR_TEMPLATE_KEY);
    if (
      raw === "blog-post" ||
      raw === "note" ||
      raw === "profile" ||
      raw === "photo" ||
      raw === "file" ||
      raw === "section"
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/** Ask App to open Chat → Inbox, optionally focusing one publisher’s feed rows. */
export function openChatInbox(opts?: { publisherOwnerId?: string }): void {
  const id = opts?.publisherOwnerId?.trim() || "";
  try {
    if (id) sessionStorage.setItem(PENDING_INBOX_PUBLISHER_KEY, id);
    else sessionStorage.removeItem(PENDING_INBOX_PUBLISHER_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent(OPEN_INBOX_EVENT, {
      detail: { publisherOwnerId: id || undefined },
    }),
  );
}

/** Current Feeds publisher filter (persists across Inbox remount until cleared). */
export function getInboxPublisherFilter(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INBOX_PUBLISHER_KEY);
  } catch {
    return null;
  }
}

/** Clear Feeds publisher filter (e.g. Inbox “Show all”). */
export function clearInboxPublisherFilter(): void {
  try {
    sessionStorage.removeItem(PENDING_INBOX_PUBLISHER_KEY);
  } catch {
    /* ignore */
  }
}
