/**
 * Misc small delegation public methods (Step 43).
 *
 * Extracted from `node-service-impl.ts`. Owns a batch of small
 * public methods (1-2 lines each) that are pure delegations to a
 * private field or a free function.
 *
 * Methods extracted:
 *   - resolveDidImport, resolveDidExport
 *   - acceptHello, declineSocialIntroProposal
 *   - resyncBondedContactReachabilityTags, syncProfileToBonds
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MiscDelegationsContext {
  getPendingSocialIntroProposals(): Map<string, any>;
  resyncBondedContactReachabilityTags(): Promise<void>;
  loadHumanProfile(): Promise<any>;
  broadcastProfileSyncToBonds(profile: any): Promise<void>;
}

export async function resolveDidImportViaRuntime(
  _ctx: MiscDelegationsContext | null,
  input: string,
): Promise<any> {
  const { resolveDidImportInput } = await import("@envoymesh/api/did-import");
  return resolveDidImportInput(input);
}

export async function resolveDidExportViaRuntime(
  _ctx: MiscDelegationsContext | null,
  input: string,
): Promise<any> {
  const { resolveDidExportInput } = await import("@envoymesh/api/did-import");
  return resolveDidExportInput(input);
}

export async function acceptHelloViaRuntime(
  deps: any,
  messageId: string,
): Promise<void> {
  await deps.handleHelloAcceptance(messageId);
}

export function declineSocialIntroProposalViaRuntime(
  ctx: MiscDelegationsContext,
  messageId: string,
): void {
  ctx.getPendingSocialIntroProposals().delete(messageId);
}

export async function resyncBondedContactReachabilityTagsViaRuntime(
  ctx: MiscDelegationsContext,
): Promise<void> {
  await ctx.resyncBondedContactReachabilityTags();
}

export async function syncProfileToBondsViaRuntime(
  ctx: MiscDelegationsContext,
): Promise<void> {
  const hp = await ctx.loadHumanProfile();
  if (hp) await ctx.broadcastProfileSyncToBonds(hp);
}