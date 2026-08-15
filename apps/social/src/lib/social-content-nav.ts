/**
 * Open Content → Feed / Blog (card UI) for a contact — not Browser markdown.
 */
const PENDING_PEER_OWNER_KEY = "envoymesh:social-content-peer-owner";
const PENDING_SURFACE_KEY = "envoymesh:social-content-surface";

export const OPEN_SOCIAL_CONTENT_EVENT = "envoymesh:open-social-content";

export type SocialContentSurface = "feed" | "blog";

export type OpenSocialContentDetail = {
  surface: SocialContentSurface;
  ownerId: string;
};

export function openSocialContent(surface: SocialContentSurface, ownerId: string): void {
  const id = ownerId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(PENDING_PEER_OWNER_KEY, id);
    sessionStorage.setItem(PENDING_SURFACE_KEY, surface);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent<OpenSocialContentDetail>(OPEN_SOCIAL_CONTENT_EVENT, {
      detail: { surface, ownerId: id },
    }),
  );
}

export function takePendingSocialContentPeer(): {
  surface: SocialContentSurface;
  ownerId: string;
} | null {
  try {
    const ownerId = sessionStorage.getItem(PENDING_PEER_OWNER_KEY)?.trim() ?? "";
    const surface = sessionStorage.getItem(PENDING_SURFACE_KEY);
    sessionStorage.removeItem(PENDING_PEER_OWNER_KEY);
    sessionStorage.removeItem(PENDING_SURFACE_KEY);
    if (!ownerId) return null;
    if (surface !== "feed" && surface !== "blog") return null;
    return { surface, ownerId };
  } catch {
    return null;
  }
}

export function getSocialContentPeerFilter(): string | null {
  try {
    return sessionStorage.getItem(PENDING_PEER_OWNER_KEY);
  } catch {
    return null;
  }
}

export function clearSocialContentPeerFilter(): void {
  try {
    sessionStorage.removeItem(PENDING_PEER_OWNER_KEY);
    sessionStorage.removeItem(PENDING_SURFACE_KEY);
  } catch {
    /* ignore */
  }
}
