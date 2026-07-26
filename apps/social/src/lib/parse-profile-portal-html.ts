/**
 * Parse published Profile portal HTML into a structured model for in-app render.
 */
export interface ParsedProfilePortal {
  displayName: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  interests: string[];
  knowledge: string[];
  capabilities: string[];
  photos: Array<{ title: string; url: string }>;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function chipsAfterHeading(html: string, heading: string): string[] {
  const re = new RegExp(
    `<h2[^>]*>\\s*${heading}\\s*<\\/h2>\\s*<div class="em-chips">([\\s\\S]*?)<\\/div>`,
    "i",
  );
  const block = re.exec(html)?.[1];
  if (!block) return [];
  return [...block.matchAll(/class="em-chip"[^>]*>([^<]+)/gi)].map((m) =>
    decodeHtml(m[1]!.trim()),
  );
}

export function parseProfilePortalHtml(html: string): ParsedProfilePortal | null {
  if (!html.includes("em-profile-portal")) return null;

  const nameMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  const displayName = decodeHtml(nameMatch?.[1]?.trim() || "Profile");
  const userMatch = /class="em-username"[^>]*>@?([^<]+)/i.exec(html);
  const bioMatch = /class="em-bio"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const avatarMatch =
    /class="em-avatar"[^>]*src="(envoy:\/\/[^"]+)"|src="(envoy:\/\/[^"]+)"[^>]*class="em-avatar"/i.exec(
      html,
    );
  const avatarUrl = avatarMatch?.[1] ?? avatarMatch?.[2];

  const photos: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(
    /class="em-mosaic__tile"[^>]*href="(envoy:\/\/[^"]+)"[\s\S]*?<img[^>]*alt="([^"]*)"/gi,
  )) {
    const url = match[1]!;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = decodeHtml(match[2]?.trim() || "Photo");
    photos.push({ title, url });
  }
  if (photos.length === 0) {
    for (const match of html.matchAll(/<img[^>]*src="(envoy:\/\/[^"]+)"[^>]*alt="([^"]*)"/gi)) {
      const url = match[1]!;
      if (url === avatarUrl || seen.has(url)) continue;
      seen.add(url);
      photos.push({ title: decodeHtml(match[2]?.trim() || "Photo"), url });
    }
  }

  return {
    displayName,
    username: userMatch ? decodeHtml(userMatch[1]!.trim()) : undefined,
    bio: bioMatch ? decodeHtml(bioMatch[1]!.trim()) : undefined,
    avatarUrl,
    interests: chipsAfterHeading(html, "Interests"),
    knowledge: chipsAfterHeading(html, "Knowledge"),
    capabilities: chipsAfterHeading(html, "Capabilities"),
    photos,
  };
}
