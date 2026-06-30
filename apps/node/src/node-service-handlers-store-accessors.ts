/**
 * Trivial store-accessor public methods (Step 32).
 *
 * Extracted from `node-service-impl.ts`. Owns 9 single-line methods
 * that just call a local store with light validation:
 *   - listAgentActivity, listCommerceReceipts,
 *     listAuditEvents, listTaskJournalEntries,
 *     listAgentCards, getAgentCard
 *   - listAgentCircles, listBonds, getAgentIdentity
 *
 * The runtime takes a loose `any`-typed context. The class methods
 * collapse to one-line delegations.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function listAgentActivityViaRuntime(deps: any, params: any): any[] {
  const store = deps.getAgentActivityStore();
  if (!store) return [];
  return store.list(params);
}

export function listCommerceReceiptsViaRuntime(deps: any, params: any): any[] {
  const store = deps.getCommerceReceiptStore();
  if (!store) return [];
  return store.list(params);
}

export async function listAuditEventsViaRuntime(
  deps: any,
  params: any,
): Promise<any[]> {
  const store = deps.getTaskStore();
  if (!store) return [];
  const limit = Math.max(1, Math.min(params?.limit ?? 100, 500));
  const rows = await store.queryAuditEvents({
    correlationId: params?.correlationId,
    taskId: params?.taskId,
    since: params?.since,
    until: params?.until,
    limit,
  });
  return rows.map((row: any) => ({
    eventId: row.eventId,
    type: row.type,
    createdAt: row.createdAt,
    intent: row.intent,
    outcome: row.outcome,
    summary: row.summary,
    correlationId: row.correlationId ?? null,
    remotePeerId: row.remotePeerId ?? null,
    latencyMs: row.latencyMs ?? null,
  }));
}

export async function listTaskJournalEntriesViaRuntime(
  deps: any,
  params: any,
): Promise<any[]> {
  const store = deps.getTaskStore();
  if (!store) return [];
  const limit = Math.max(1, Math.min(params?.limit ?? 100, 500));
  let rows = await store.readTaskJournalEntries();
  if (params?.taskId) {
    rows = rows.filter((row: any) => row.taskId === params.taskId);
  }
  return rows
    .slice(-limit)
    .reverse()
    .map((row: any) => ({
      eventId: row.eventId,
      taskId: row.taskId,
      eventType: row.eventType,
      summary: row.summary,
      createdAt: row.createdAt,
    }));
}

export async function listAgentCardsViaRuntime(deps: any): Promise<any[]> {
  const store = deps.getAgentCardStore();
  if (!store) return [];
  const rows = await store.list();
  return rows.map((row: any) => deps.summarizeAgentCard(row));
}

export async function getAgentCardViaRuntime(
  deps: any,
  ownerId: string,
): Promise<any> {
  const store = deps.getAgentCardStore();
  if (!store) return undefined;
  const row = await store.get(ownerId.trim());
  return row ? deps.summarizeAgentCard(row) : undefined;
}

export function listAgentCirclesViaRuntime(deps: any): any[] {
  const store = deps.getCircleStore();
  if (!store) return [];
  return store.listCircles();
}

export function listBondsViaRuntime(deps: any): any[] {
  return deps.getBonds();
}

export function getAgentIdentityViaRuntime(deps: any): any {
  return deps.getAgentIdentity();
}