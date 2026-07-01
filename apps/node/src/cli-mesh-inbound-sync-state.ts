// @ts-nocheck - runtime is loosely typed by design.

/**
 * sync.state arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body used to be a ~40-line block in `handleInboundMeshMessage`:
 *   1. Call handleInboundSyncStateIntent (pure sync function)
 *   2. If rejected, append reject audit + return
 *   3. If nodeService is NodeServiceImpl, emit "crdt:sync" event
 *   4. Append verified audit + return
 *
 * Now it is a 1-line call to this runtime.
 */

export interface SyncStateParams {
  envelope: {
    messageId: string;
    createdAt: string;
    intent: string;
  };
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
}

export async function handleSyncStateViaRuntime(
  ctx: any,
  params: SyncStateParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  // 1. Call the pure sync handler.
  const syncResult = ctx.handleInboundSyncStateIntent({
    envelope: params.envelope,
    profile: ctx.getProfile(),
  });
  if (!syncResult.ok) {
    await ctx.appendAuditEvent({
      type: "message.rejected",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId: corrId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "rejected",
      latencyMs: Date.now() - receivedAt,
      outcome: "deny",
      summary: `Rejected sync.state: ${syncResult.reason}`,
      createdAt: envelope.createdAt,
    });
    return;
  }

  // 2. Emit the CRDT sync event if nodeService is wired.
  const nodeService = ctx.getNodeService();
  if (nodeService) {
    nodeService.emit("crdt:sync", {
      scope: syncResult.scope,
      updateBase64: syncResult.updateBase64,
      senderOwnerId: syncResult.senderOwnerId,
      remotePeerId,
    });
  }

  // 3. Append the verified audit event.
  await ctx.appendAuditEvent({
    type: "message.verified",
    intent: envelope.intent,
    messageId: envelope.messageId,
    correlationId: corrId,
    remotePeerId,
    direction: "inbound",
    verificationStatus: "verified",
    latencyMs: Date.now() - receivedAt,
    outcome: "allow",
    summary: `sync.state scope=${syncResult.scope}`,
    createdAt: envelope.createdAt,
  });
}