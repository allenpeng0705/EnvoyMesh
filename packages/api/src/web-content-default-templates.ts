/**
 * Bundled default mesh-site templates (Profile / Blog / PhotoWall).
 *
 * Every node seeds these locally via `ensureDefaultWebSite`. Templates live
 * here so desktop node, mobile/home, and Social share one source of truth —
 * not invented contact content in the UI.
 */

export const DEFAULT_WEB_SITE_SURFACES = ["profile", "blog", "photowall"] as const;
export type DefaultWebSiteSurface = (typeof DEFAULT_WEB_SITE_SURFACES)[number];

/** Listing entry used when regenerating Blog / PhotoWall indexes. */
export interface WebContentListingItem {
  path: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  updatedAt: string;
}

export interface PhotosGalleryListing {
  name: string;
  count: number;
}

/** Default Profile page (`index.md`). */
export function buildDefaultProfileMarkdown(input: {
  ownerId: string;
  displayName: string;
}): string {
  const displayName = input.displayName.trim() || "Me";
  const ownerId = input.ownerId.trim();
  return [
    `# ${displayName}`,
    "",
    "Welcome to my EnvoyMesh site.",
    "",
    "This is your default Profile page. Edit it anytime from Browser → **New…** → Profile page.",
    "",
    `- [Blog](envoy://${ownerId}/blog/)`,
    `- [PhotoWall](envoy://${ownerId}/photos/)`,
    "",
  ].join("\n");
}

export interface ProfileMarkdownInput {
  displayName: string;
  username?: string;
  bio?: string;
  hobbies?: string[];
  knowledge?: string[];
  capabilities?: Array<{ tag?: string; type?: string; descriptor?: string }>;
  ownerId: string;
}

export function buildProfileMarkdown(input: ProfileMarkdownInput): string {
  const { displayName, username, bio, hobbies, knowledge, capabilities, ownerId } = input;
  const lines: string[] = [];

  lines.push(`# ${displayName}`);
  lines.push("");

  if (username) {
    lines.push(`@${username}`);
    lines.push("");
  }

  if (bio) {
    lines.push(bio);
    lines.push("");
  }

  if (hobbies && hobbies.length > 0) {
    lines.push("## Interests");
    lines.push("");
    for (const hobby of hobbies) {
      lines.push(`- ${hobby}`);
    }
    lines.push("");
  }

  if (knowledge && knowledge.length > 0) {
    lines.push("## Knowledge");
    lines.push("");
    for (const item of knowledge) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (capabilities && capabilities.length > 0) {
    lines.push("## Capabilities");
    lines.push("");
    for (const cap of capabilities) {
      const label = "tag" in cap ? cap.tag : "type" in cap ? cap.type : "descriptor" in cap ? cap.descriptor : "";
      if (label) {
        lines.push(`- ${label}`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`- [Blog](envoy://${ownerId}/blog/)`);
  lines.push(`- [PhotoWall](envoy://${ownerId}/photos/)`);
  lines.push("");

  return lines.join("\n");
}

/** Blog listing (`blog/index.md`) — empty or with posts. */
export function buildBlogIndexMarkdown(
  ownerId: string,
  posts: readonly WebContentListingItem[],
): string {
  const sorted = [...posts].sort((a, b) => {
    const ta = a.publishedAt ?? a.updatedAt;
    const tb = b.publishedAt ?? b.updatedAt;
    return tb.localeCompare(ta);
  });
  const lines = ["# Blog", ""];
  if (sorted.length === 0) {
    lines.push("_No posts yet._", "");
    return lines.join("\n");
  }
  for (const post of sorted) {
    const href = `envoy://${ownerId}/${post.path}`;
    const date = (post.publishedAt ?? post.updatedAt).slice(0, 10);
    const summary = post.summary?.trim() ? ` — ${post.summary.trim()}` : "";
    lines.push(`- [${post.title}](${href}) (${date})${summary}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** PhotoWall gallery page (`photos/{gallery}/index.md`). */
export function buildPhotoWallMarkdown(
  ownerId: string,
  gallery: string,
  photos: readonly WebContentListingItem[],
): string {
  const sorted = [...photos].sort((a, b) => {
    const ta = a.publishedAt ?? a.updatedAt;
    const tb = b.publishedAt ?? b.updatedAt;
    return tb.localeCompare(ta);
  });
  const lines = [`# PhotoWall — ${gallery}`, ""];
  if (sorted.length === 0) {
    lines.push("_No photos yet._", "");
    return lines.join("\n");
  }
  for (const photo of sorted) {
    const href = `envoy://${ownerId}/${photo.path}`;
    lines.push(`[![${photo.title}](${href})](${href})`);
    lines.push("");
    lines.push(`**[${photo.title}](${href})**`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Photos root (`photos/index.md`). */
export function buildPhotosRootMarkdown(
  ownerId: string,
  galleries: readonly PhotosGalleryListing[],
): string {
  const lines = ["# Photos", ""];
  if (galleries.length === 0) {
    lines.push("_No galleries yet._", "");
    return lines.join("\n");
  }
  for (const g of galleries) {
    const href = `envoy://${ownerId}/photos/${g.name}/`;
    lines.push(`- [${g.name}](${href}) (${g.count} photo${g.count === 1 ? "" : "s"})`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Map a library path to a default surface label, when it matches the
 * conventional seeded layout (used for Browser empty-state copy).
 */
export function defaultWebSurfaceForPath(path: string): DefaultWebSiteSurface | null {
  const p = path.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p || p === "index.md" || p === "index.html") return "profile";
  if (p === "blog" || p.startsWith("blog/")) return "blog";
  if (p === "photos" || p.startsWith("photos/")) return "photowall";
  return null;
}
