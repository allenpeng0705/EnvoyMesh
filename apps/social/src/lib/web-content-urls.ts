/**
 * Phase 45 Pass 2 — named mesh-content shortcuts so users never type
 * `envoy://envoy:owner:…` by hand for common published surfaces.
 */
import { buildEnvoyUrl, photoWallCanonicalPath } from "@envoymesh/api";

export type WebContentSurface = "profile" | "blog" | "photowall" | "notes" | "feeds";

/** Canonical listing / root paths published by `publishWebContentEntry`. */
export function webContentUrl(ownerId: string, surface: WebContentSurface): string {
  switch (surface) {
    case "profile":
      return buildEnvoyUrl(ownerId);
    case "blog":
      return buildEnvoyUrl(ownerId, "blog/");
    case "photowall":
      // Open the default gallery directly — skip the multi-gallery listing.
      return buildEnvoyUrl(ownerId, photoWallCanonicalPath());
    case "notes":
      return buildEnvoyUrl(ownerId, "notes/");
    case "feeds":
      return buildEnvoyUrl(ownerId, "feeds/");
  }
}

/** Custom section URL (`envoy://owner/{slug}/`). */
export function sectionContentUrl(ownerId: string, slug: string): string {
  const clean = slug.trim().replace(/^\/+|\/+$/g, "");
  return buildEnvoyUrl(ownerId, `${clean}/`);
}
