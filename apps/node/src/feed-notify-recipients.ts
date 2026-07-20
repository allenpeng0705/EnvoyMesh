/**
 * Phase 45E — recipient selection for `feed.notify` fan-out.
 *
 * Visibility rules (v1, no stranger push):
 * - private → none
 * - contacts → intersection of contactIds and eligible bonds
 * - bonded / public → all eligible bonds
 *
 * Eligible bonds = direct | referred (not blocked, not public strangers).
 *
 * Interest overlap (Slice B): when publisher tags are non-empty, keep a
 * recipient if their hobbies/knowledge overlap (slug-normalized) OR they
 * have no interests set (avoid silent drop for empty profiles). Empty
 * publisher tags → notify all eligible (broadcast-within-bonds).
 */

import type { BondLevel } from "@envoymesh/bonds";
import { slugifyTopic } from "./capability-discovery.js";

export type FeedNotifyVisibility = "public" | "bonded" | "contacts" | "private";

export interface FeedNotifyBond {
  peerOwnerId: string;
  /** BondRecord.level / trust record level. */
  level: BondLevel;
}

export function isEligibleFeedNotifyBond(level: BondLevel): boolean {
  return level === "direct" || level === "referred";
}

/** Normalize interest/tag strings to comparable slugs (empty → drop). */
export function normalizeInterestSlugs(values: readonly string[] | undefined | null): string[] {
  if (!values?.length) return [];
  const out = new Set<string>();
  for (const raw of values) {
    const slug = slugifyTopic(raw);
    if (slug) out.add(slug);
  }
  return [...out];
}

/**
 * Interest-overlap gate for notify.
 * - publisherTags empty → true (broadcast within already-selected bonds)
 * - recipient interests empty → true (avoid silent drop)
 * - otherwise → slug intersection non-empty
 */
export function recipientInterestsOverlap(input: {
  publisherTags?: readonly string[] | null;
  recipientInterests?: readonly string[] | null;
}): boolean {
  const pub = normalizeInterestSlugs(input.publisherTags);
  if (pub.length === 0) return true;
  const recv = normalizeInterestSlugs(input.recipientInterests);
  if (recv.length === 0) return true;
  const recvSet = new Set(recv);
  return pub.some((slug) => recvSet.has(slug));
}

export function selectFeedNotifyRecipients(input: {
  visibility: FeedNotifyVisibility;
  contactIds?: readonly string[] | null;
  bonds: readonly FeedNotifyBond[];
  /** Optional per-owner interest lists for Slice B overlap filter. */
  recipientInterestsByOwnerId?: ReadonlyMap<string, readonly string[]>;
  publisherTags?: readonly string[] | null;
  /** When false, skip interest overlap (Slice A / tests). Default true. */
  applyInterestFilter?: boolean;
}): string[] {
  if (input.visibility === "private") return [];

  const eligible = input.bonds.filter((b) => isEligibleFeedNotifyBond(b.level));
  let ownerIds: string[];

  if (input.visibility === "contacts") {
    const allowed = new Set(
      (input.contactIds ?? []).map((id) => id.trim()).filter(Boolean),
    );
    if (allowed.size === 0) return [];
    ownerIds = eligible
      .map((b) => b.peerOwnerId)
      .filter((id) => allowed.has(id));
  } else {
    // bonded | public — push only to eligible bonds (strangers use DHT / library.read)
    ownerIds = eligible.map((b) => b.peerOwnerId);
  }

  const applyFilter = input.applyInterestFilter !== false;
  if (!applyFilter) return [...new Set(ownerIds)];

  const interestsMap = input.recipientInterestsByOwnerId;
  if (!interestsMap || interestsMap.size === 0) {
    // No profile cache — still apply "empty interests → keep" semantics
    // when publisher has tags: treat missing map entry as empty interests → keep.
    if (normalizeInterestSlugs(input.publisherTags).length === 0) {
      return [...new Set(ownerIds)];
    }
    return [...new Set(ownerIds)].filter((ownerId) =>
      recipientInterestsOverlap({
        publisherTags: input.publisherTags,
        recipientInterests: interestsMap?.get(ownerId) ?? [],
      }),
    );
  }

  return [...new Set(ownerIds)].filter((ownerId) =>
    recipientInterestsOverlap({
      publisherTags: input.publisherTags,
      recipientInterests: interestsMap.get(ownerId) ?? [],
    }),
  );
}
