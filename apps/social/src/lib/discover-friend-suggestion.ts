import type { BondRecord, MorningReportEntry } from "@envoymesh/api";
import type { TFunction } from "../context/I18nContext.js";

export function isBondedOwner(entry: MorningReportEntry, bonds: readonly BondRecord[]): boolean {
  return bonds.some(
    (bond) =>
      bond.peerOwnerId === entry.ownerId
      || (entry.peerId && bond.libp2pPeerId === entry.peerId)
      || bond.libp2pPeerId === entry.ownerId,
  );
}

export function filterFriendSuggestions(
  entries: MorningReportEntry[],
  bonds: readonly BondRecord[],
): MorningReportEntry[] {
  return entries.filter(
    (entry) => !entry.geoCitySummary && !isBondedOwner(entry, bonds) && isActionableFriendSuggestion(entry),
  );
}

export function extractGeoCitySummary(
  entries: MorningReportEntry[],
): MorningReportEntry["geoCitySummary"] | undefined {
  return entries.find((entry) => entry.geoCitySummary)?.geoCitySummary;
}

export function isActionableFriendSuggestion(entry: MorningReportEntry): boolean {
  if (entry.trustLevel === "blocked" || entry.trustLevel !== "unknown") return false;
  return entry.discoveryMatchCount > 0;
}

export function friendSuggestionDisplayName(
  entry: MorningReportEntry,
  t: TFunction,
): string {
  const name = entry.displayName?.trim();
  if (name) return name;
  return t("discoverCards.suggestionUnknownName");
}

export function formatFriendSuggestionReason(entry: MorningReportEntry, t: TFunction): string {
  const parts: string[] = [];

  if (entry.trustLevel === "referred") {
    parts.push(t("discoverCards.suggestionReferred"));
  } else if (entry.discoveryMatchCount <= 0) {
    parts.push(t("discoverCards.suggestionOnNetwork"));
  }

  if (entry.discoveryMatchCount > 0) {
    parts.push(
      entry.discoveryMatchCount === 1
        ? t("discoverCards.suggestionMatchedOnce")
        : t("discoverCards.suggestionMatchedMany", { count: entry.discoveryMatchCount }),
    );
  }

  if (entry.hopDistance === 2) {
    parts.push(t("discoverCards.suggestionFriendOfFriend"));
  }

  const recency = formatRecencyHint(entry.lastSeenAt, t);
  if (recency) parts.push(recency);

  return parts.join(" · ");
}

function formatRecencyHint(lastSeenAt: string | undefined, t: TFunction): string | null {
  if (!lastSeenAt) return null;
  const minutes = Math.max(0, (Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (minutes <= 15) return t("discoverCards.suggestionActiveRecently");
  if (minutes <= 60) return t("discoverCards.suggestionActiveHour");
  if (minutes <= 24 * 60) return t("discoverCards.suggestionActiveToday");
  return t("discoverCards.suggestionSeenBefore");
}
