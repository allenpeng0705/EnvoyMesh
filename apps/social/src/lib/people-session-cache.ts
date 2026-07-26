/**
 * In-session cache for Explore → People so remounting (Open ↔ People,
 * or leaving Content and returning) does not wipe results / re-flash empty.
 */
import type { PeerSearchResult } from "@envoymesh/api";
import type { PublicBlogPostLink } from "./parse-public-blog-index.js";

export type PeopleSearchMode = "topic" | "interest" | "place";
export type PeopleResultSource = "search" | "sample";

export interface PeopleSessionSnapshot {
  searchMode: PeopleSearchMode;
  query: string;
  results: PeerSearchResult[];
  resultSource: PeopleResultSource;
  error: string | null;
  blogPreviews: Record<string, PublicBlogPostLink[]>;
  updatedAt: number;
}

let snapshot: PeopleSessionSnapshot | null = null;

export function loadPeopleSessionCache(): PeopleSessionSnapshot | null {
  return snapshot;
}

export function savePeopleSessionCache(
  next: Omit<PeopleSessionSnapshot, "updatedAt">,
): void {
  snapshot = {
    ...next,
    results: [...next.results],
    blogPreviews: { ...next.blogPreviews },
    updatedAt: Date.now(),
  };
}

export function clearPeopleSessionCache(): void {
  snapshot = null;
}
