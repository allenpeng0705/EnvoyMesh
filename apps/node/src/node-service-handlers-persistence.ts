/**
 * Persistence + continuity small delegations (Step 44).
 *
 * Extracted from `node-service-impl.ts`. Owns 6 small delegation
 * methods that read/write local state stores.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PersistenceContext {
  recordIntent(intent: string, query: string): void;
  persistIntentHistory(): Promise<void>;
  loadIntentHistoryFromDisk(): Promise<void>;
  persistPublishedLibrary(): Promise<void>;
  loadPublishedLibraryFromDisk(): Promise<void>;
  getContactTopicsFromLibrary(ownerId: string): string[];
}

export async function recordIntentViaRuntime(
  ctx: PersistenceContext,
  intent: string,
  query: string,
): Promise<void> {
  ctx.recordIntent(intent, query);
  await ctx.persistIntentHistory();
}

export async function loadIntentHistoryFromDiskViaRuntime(
  ctx: PersistenceContext,
): Promise<void> {
  await ctx.loadIntentHistoryFromDisk();
}

export async function persistPublishedLibraryViaRuntime(
  ctx: PersistenceContext,
): Promise<void> {
  await ctx.persistPublishedLibrary();
}

export async function loadPublishedLibraryFromDiskViaRuntime(
  ctx: PersistenceContext,
): Promise<void> {
  await ctx.loadPublishedLibraryFromDisk();
}

export function getContactTopicsFromLibraryViaRuntime(
  ctx: PersistenceContext,
  ownerId: string,
): string[] {
  return ctx.getContactTopicsFromLibrary(ownerId);
}

export async function completeContinuitySessionViaRuntime(
  ctx: any,
  sessionId: string,
): Promise<void> {
  await ctx.completeContinuitySession(sessionId);
}