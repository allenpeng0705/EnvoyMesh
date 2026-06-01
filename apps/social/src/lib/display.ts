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
