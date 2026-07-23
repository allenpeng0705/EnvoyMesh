/**
 * Phase 45 — normalize free text to DHT `publish:<slug>` topics.
 * Keeps Unicode letters/numbers (CJK etc.) so Discover / Bazaar match advertised tags.
 */
export function slugifyPublishTopic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalize free text or an already-prefixed topic into `publish:<slug>`. */
export function publishSearchTopic(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const rest = /^publish:/i.test(trimmed) ? trimmed.replace(/^publish:/i, "") : trimmed;
  const slug = slugifyPublishTopic(rest);
  return slug ? `publish:${slug}` : "";
}
