/**
 * Open another user's published profile in Content → Explore.
 * Used by Discover search / People nearby cards.
 */
import { openBrowserAt } from "./browser-nav.js";
import { webContentUrl } from "./web-content-urls.js";

export function openPeerProfile(ownerId: string | undefined | null): boolean {
  const id = ownerId?.trim() ?? "";
  if (!id.startsWith("envoy:owner:")) return false;
  openBrowserAt(webContentUrl(id, "profile"));
  return true;
}
