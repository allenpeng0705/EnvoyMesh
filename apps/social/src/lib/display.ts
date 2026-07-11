import type { BondRecord } from "@envoymesh/api";

/** Display label for a bond contact. */
export function contactLabel(contact: Partial<BondRecord> & { peerOwnerId: string }): string {
  const d = contact.displayName?.trim();
  if (d) return d;
  if (contact.libp2pPeerId?.trim()) return contact.libp2pPeerId.trim();
  return contact.peerOwnerId;
}

/** Display label for a message sender. */
export function peerDisplayLabel(sender: { displayName?: string; nodeId?: string }): string {
  return sender.displayName?.trim() || sender.nodeId?.trim() || "Peer";
}

/** Truncate long owner/peer ids for compact UI labels. */
export function shortOwnerId(id: string, max = 14): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max)}…`;
}

/** Suggested interest topics shown in search and profile views. */
export const SUGGESTED_TOPICS = [
  "music", "tech", "art", "science", "gaming",
  "movies", "books", "travel", "food", "fitness",
  "news", "sports", "fashion", "photography", "coding",
];

/**
 * Grouped version of {@link SUGGESTED_TOPICS} used by the first-run setup
 * interests step. A flat 15-item row reads as a wall of chips; splitting
 * into 4 categories with labels gives the user a sense of where to look
 * for what. Order matters: each topic in a category appears in the order
 * listed. Custom (user-typed) interests land in a synthetic "Your picks"
 * category rendered separately so they never get hidden by the suggested
 * list scrolling.
 *
 * Icon choice: kept to single-glyph emoji that render in the system font
 * (no emoji font dependency on Linux/Tauri WebView). The list reads
 * consistently cross-platform; if a glyph is missing on some
 * environment it degrades to a tofu box, not an empty space.
 */
export interface InterestCategory {
  /** Stable id for React keys + tests. */
  id: string;
  /** Human label. Localized at the call site. */
  label: string;
  /** Single-glyph icon — emoji works in Tauri WebView and browser. */
  icon: string;
  /** Topic slugs in display order. */
  topics: string[];
}

export const INTEREST_CATEGORIES: readonly InterestCategory[] = [
  { id: "creative",  label: "Creative",     icon: "🎨", topics: ["art", "photography", "music", "fashion"] },
  { id: "tech",      label: "Tech",         icon: "💻", topics: ["tech", "coding", "science", "gaming"] },
  { id: "entertainment", label: "Entertainment", icon: "🎬", topics: ["movies", "books", "news"] },
  { id: "lifestyle", label: "Lifestyle",    icon: "🏃", topics: ["travel", "food", "fitness", "sports"] },
] as const;

/** Plain-language bond level for contact lists. */
export function bondLevelLabel(level: string | undefined): string {
  switch (level) {
    case "direct":
      return "Friend";
    case "referred":
      return "Introduced";
    case "public":
      return "New contact";
    case "blocked":
      return "Blocked";
    default:
      return level ?? "Contact";
  }
}

/** mDNS discovery often lacks real names — show a friendly label instead of "Peer 12D3…". */
export function nearbyPeerLabel(displayName: string | undefined, nodeId: string): string {
  const name = displayName?.trim();
  if (!name || /^Peer [A-Za-z0-9]{6,}/.test(name)) {
    return "Someone nearby";
  }
  return name;
}
