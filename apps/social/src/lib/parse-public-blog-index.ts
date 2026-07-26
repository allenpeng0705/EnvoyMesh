/**
 * Parse public blog listing markdown (`blog/index.md`) into post links.
 * Matches lines produced by `buildBlogIndexMarkdown` in `@envoymesh/api`.
 */
export interface PublicBlogPostLink {
  title: string;
  url: string;
}

const LINK_RE = /^-\s*\[([^\]]+)\]\((envoy:\/\/[^)\s]+)\)/gm;

export function parsePublicBlogIndexMarkdown(markdown: string): PublicBlogPostLink[] {
  const text = markdown.trim();
  if (!text || text.includes("_No posts yet._")) return [];
  const out: PublicBlogPostLink[] = [];
  for (const m of text.matchAll(LINK_RE)) {
    const title = m[1]?.trim();
    const url = m[2]?.trim();
    if (!title || !url) continue;
    out.push({ title, url });
  }
  return out;
}
