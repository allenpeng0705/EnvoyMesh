/**
 * Parse PhotoWall-style markdown into a gallery model.
 *
 * PhotoWall indexes emit `[![title](envoy://…)](envoy://…)` plus an optional
 * caption paragraph (from the publish `summary` / Caption field).
 */

export interface PhotoWallItem {
  title: string;
  url: string;
  /** Optional story/caption under the photo (from author Caption field). */
  caption?: string;
}

export interface ParsedPhotoWall {
  title: string;
  photos: PhotoWallItem[];
}

/** Linked thumbnail `[![alt](url)](url)` or bare `![alt](url)`. */
const IMAGE_RE =
  /(?:\[)?!\[([^\]]*)\]\((envoy:\/\/[^)\s]+)\)(?:\]\((?:envoy:\/\/[^)\s]+)\))?/g;
const BOLD_LINK_RE = /^\*\*\[[^\]]*\]\(envoy:\/\/[^)]+\)\*\*\s*$/;
const TRAILING_LINK_RE = /^\]\(envoy:\/\/[^)]+\)\s*$/;

function captionFromBlock(block: string, title: string): string | undefined {
  const lines = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !BOLD_LINK_RE.test(l) &&
        !TRAILING_LINK_RE.test(l) &&
        !l.startsWith("#"),
    );
  const text = lines.join("\n").trim();
  if (!text || text === title) return undefined;
  return text;
}

export function parsePhotoWallMarkdown(body: string): ParsedPhotoWall | null {
  const photos: PhotoWallItem[] = [];
  const seen = new Set<string>();
  const matches = [...body.matchAll(IMAGE_RE)];
  if (matches.length === 0) return null;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const title = (match[1] ?? "").trim() || "Photo";
    const url = match[2]!;
    if (seen.has(url)) continue;
    seen.add(url);

    const start = (match.index ?? 0) + match[0]!.length;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? body.length) : body.length;
    const caption = captionFromBlock(body.slice(start, end), title);
    photos.push(caption ? { title, url, caption } : { title, url });
  }
  if (photos.length === 0) return null;

  const heading = /^#\s+(.+)$/m.exec(body);
  return {
    title: heading?.[1]?.trim() || "Photos",
    photos,
  };
}
