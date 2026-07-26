/**
 * Bundled default mesh-site templates (Profile / Blog / PhotoWall).
 *
 * Every node seeds these locally via `ensureDefaultWebSite`. Templates live
 * here so desktop node, mobile/home, and Social share one source of truth —
 * not invented contact content in the UI.
 */

export const DEFAULT_WEB_SITE_SURFACES = ["profile", "blog", "photowall"] as const;
export type DefaultWebSiteSurface = (typeof DEFAULT_WEB_SITE_SURFACES)[number];

/** Default PhotoWall gallery folder seeded for every node. */
export const DEFAULT_PHOTO_GALLERY = "wall";

/** Human title for a gallery page (`wall` → Photos; others keep their name). */
export function photoWallPageTitle(gallery: string): string {
  return gallery === DEFAULT_PHOTO_GALLERY ? "Photos" : gallery;
}

/** Canonical PhotoWall browse path (skips the multi-gallery listing). */
export function photoWallCanonicalPath(gallery: string = DEFAULT_PHOTO_GALLERY): string {
  return `photos/${gallery}/`;
}

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
    `- [PhotoWall](envoy://${ownerId}/${photoWallCanonicalPath()})`,
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
  lines.push(`- [PhotoWall](envoy://${ownerId}/${photoWallCanonicalPath()})`);
  lines.push("");

  return lines.join("\n");
}

export interface ProfilePortalPhoto {
  title: string;
  url: string;
}

export interface ProfilePortalInput extends ProfileMarkdownInput {
  avatarUrl?: string;
  photos?: readonly ProfilePortalPhoto[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chipRow(label: string, items: string[]): string {
  if (items.length === 0) return "";
  const chips = items
    .map((item) => `<span class="em-chip">${escapeHtml(item)}</span>`)
    .join("");
  return `<section class="em-section"><h2>${escapeHtml(label)}</h2><div class="em-chips">${chips}</div></section>`;
}

/**
 * Self-contained HTML Profile portal (`index.html`).
 * Marker class `em-profile-portal` lets Social / EnvoyGo detect and enhance rendering.
 */
export function buildProfilePortalHtml(input: ProfilePortalInput): string {
  const displayName = input.displayName.trim() || "Me";
  const ownerId = input.ownerId.trim();
  const username = input.username?.trim();
  const bio = input.bio?.trim();
  const photos = input.photos ?? [];
  const avatarUrl = input.avatarUrl?.trim();

  const hobbies = (input.hobbies ?? []).map((h) => h.trim()).filter(Boolean);
  const knowledge = (input.knowledge ?? []).map((k) => k.trim()).filter(Boolean);
  const capabilities = (input.capabilities ?? [])
    .map((cap) => {
      const label =
        "tag" in cap && cap.tag
          ? cap.tag
          : "type" in cap && cap.type
            ? cap.type
            : "descriptor" in cap && cap.descriptor
              ? cap.descriptor
              : "";
      return label.trim();
    })
    .filter(Boolean);

  const initial = escapeHtml((displayName[0] ?? "?").toUpperCase());
  const avatar = avatarUrl
    ? `<img class="em-avatar" src="${escapeHtml(avatarUrl)}" alt="" />`
    : `<div class="em-avatar em-avatar--fallback" aria-hidden="true">${initial}</div>`;

  const mosaic =
    photos.length === 0
      ? `<p class="em-empty">No photos yet.</p>`
      : `<div class="em-mosaic">${photos
          .map(
            (p, i) =>
              `<a class="em-mosaic__tile" href="${escapeHtml(p.url)}" style="animation-delay:${(i % 8) * 40}ms"><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.title)}" loading="lazy" /></a>`,
          )
          .join("")}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(displayName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
<style>
:root {
  --ink: #1c1917;
  --muted: #78716c;
  --paper: #f7f1e8;
  --band: #2a2520;
  --accent: #c45c26;
  --line: rgba(28, 25, 23, 0.12);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body.em-profile-portal,
.em-profile-portal {
  font-family: "Source Sans 3", "Segoe UI", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(196, 92, 38, 0.12), transparent 60%),
    linear-gradient(180deg, #efe6d8 0%, var(--paper) 42%, #f3eee6 100%);
  min-height: 100vh;
  line-height: 1.5;
}
.em-wrap { max-width: 52rem; margin: 0 auto; padding: 0 1.25rem 3rem; }
.em-hero {
  margin: 0 -1.25rem 2rem;
  padding: 2.75rem 1.25rem 2.25rem;
  background:
    linear-gradient(135deg, rgba(42, 37, 32, 0.94), rgba(42, 37, 32, 0.82)),
    repeating-linear-gradient(-12deg, transparent, transparent 11px, rgba(255,255,255,0.03) 11px, rgba(255,255,255,0.03) 12px);
  color: #faf7f2;
  animation: em-rise 0.7s ease both;
}
.em-hero-inner { max-width: 52rem; margin: 0 auto; display: flex; gap: 1.25rem; align-items: center; }
.em-avatar {
  width: 6.5rem; height: 6.5rem; border-radius: 50%;
  object-fit: cover; flex-shrink: 0;
  border: 3px solid rgba(250, 247, 242, 0.55);
  box-shadow: 0 12px 32px rgba(0,0,0,0.35);
}
.em-avatar--fallback {
  display: grid; place-items: center;
  background: var(--accent); color: #fff;
  font-family: Fraunces, Georgia, serif; font-size: 2.4rem; font-weight: 700;
}
.em-hero h1 {
  margin: 0; font-family: Fraunces, Georgia, serif;
  font-size: clamp(2rem, 5vw, 2.85rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1;
}
.em-username { margin: 0.35rem 0 0; color: rgba(250,247,242,0.72); font-weight: 600; }
.em-bio { margin: 0.85rem 0 0; max-width: 36rem; color: rgba(250,247,242,0.88); font-size: 1.05rem; white-space: pre-wrap; }
.em-section { margin: 1.75rem 0; animation: em-rise 0.7s ease both; }
.em-section h2 {
  margin: 0 0 0.75rem; font-family: Fraunces, Georgia, serif;
  font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em;
}
.em-chips { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.em-chip {
  display: inline-block; padding: 0.28rem 0.7rem;
  border: 1px solid var(--line); border-radius: 999px;
  background: rgba(255,255,255,0.55); font-size: 0.88rem; color: var(--ink);
}
.em-mosaic {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.65rem;
}
.em-mosaic__tile {
  aspect-ratio: 1; overflow: hidden; border-radius: 0.4rem;
  border: 1px solid var(--line); background: #e7dfd3;
  animation: em-rise 0.55s ease both; display: block;
}
.em-mosaic__tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.35s ease; }
.em-mosaic__tile:hover img { transform: scale(1.04); }
.em-empty { color: var(--muted); font-style: italic; margin: 0; }
@keyframes em-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 560px) {
  .em-hero-inner { flex-direction: column; text-align: center; }
  .em-bio { margin-left: auto; margin-right: auto; }
}
</style>
</head>
<body>
<div class="em-profile-portal">
<header class="em-hero">
  <div class="em-hero-inner">
    ${avatar}
    <div>
      <h1>${escapeHtml(displayName)}</h1>
      ${username ? `<p class="em-username">@${escapeHtml(username)}</p>` : ""}
      ${bio ? `<p class="em-bio">${escapeHtml(bio)}</p>` : ""}
    </div>
  </div>
</header>
<main class="em-wrap">
  ${chipRow("Interests", hobbies)}
  ${chipRow("Knowledge", knowledge)}
  ${chipRow("Capabilities", capabilities)}
  <section class="em-section">
    <h2>Photos</h2>
    ${mosaic}
  </section>
</main>
</div>
</body>
</html>`;
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

/**
 * Feed / Friend Circle listing (`feeds/index.md`) — reverse-chron posts for
 * contact archive browse (Emily → Allen's Feed via library.read).
 */
export function buildFeedIndexMarkdown(
  ownerId: string,
  posts: readonly WebContentListingItem[],
): string {
  const sorted = [...posts].sort((a, b) => {
    const ta = a.publishedAt ?? a.updatedAt;
    const tb = b.publishedAt ?? b.updatedAt;
    return tb.localeCompare(ta);
  });
  const lines = ["# Feed", ""];
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
  const lines = [`# ${photoWallPageTitle(gallery)}`, ""];
  if (sorted.length === 0) {
    lines.push("_No photos yet._", "");
    return lines.join("\n");
  }
  for (const photo of sorted) {
    const href = `envoy://${ownerId}/${photo.path}`;
    // Keep alt generic so filenames/titles never surface as visible gallery text.
    lines.push(`[![Photo](${href})](${href})`);
    lines.push("");
    const caption = photo.summary?.trim();
    if (
      caption &&
      caption !== "Photo" &&
      !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(caption)
    ) {
      lines.push(caption);
      lines.push("");
    }
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
