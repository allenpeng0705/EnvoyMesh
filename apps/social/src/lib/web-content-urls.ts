/**
 * Phase 45 Pass 2 — named mesh-content shortcuts so users never type
 * `envoy://envoy:owner:…` by hand for common published surfaces.
 */
import { buildEnvoyUrl } from "@envoymesh/api";

export type WebContentSurface = "profile" | "blog" | "photowall" | "notes";

/** Canonical listing / root paths published by `publishWebContentEntry`. */
export function webContentUrl(ownerId: string, surface: WebContentSurface): string {
  switch (surface) {
    case "profile":
      return buildEnvoyUrl(ownerId);
    case "blog":
      return buildEnvoyUrl(ownerId, "blog/");
    case "photowall":
      return buildEnvoyUrl(ownerId, "photos/");
    case "notes":
      return buildEnvoyUrl(ownerId, "notes/");
  }
}

/** Custom section URL (`envoy://owner/{slug}/`). */
export function sectionContentUrl(ownerId: string, slug: string): string {
  const clean = slug.trim().replace(/^\/+|\/+$/g, "");
  return buildEnvoyUrl(ownerId, `${clean}/`);
}
