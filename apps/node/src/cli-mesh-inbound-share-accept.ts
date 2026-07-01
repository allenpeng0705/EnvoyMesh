// @ts-nocheck - runtime is loosely typed by design.

/**
 * share.accept arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body used to be a ~51-line block in `handleInboundMeshMessage`:
 *   1. If nodeService is NodeServiceImpl, parse the share.accept
 *      payload and clear pending share state on a reject
 *   2. Call handleInboundShareAccept
 *   3. If rejected, log and return
 *   4. If nodeService is NodeServiceImpl, call
 *      maybeSendShareFileForInboundAccept to deliver the file
 *   5. Log a "proceeding with content share" line
 *
 * Now it is a 1-line call to this runtime.
 */

export interface ShareAcceptParams {
  envelope: {
    messageId: string;
    intent: string;
    payload: unknown;
  };
  remotePeerId: string;
  remoteAddr?: string | undefined;
  receivedAt: number;
  correlationId: string | undefined;
}

export async function handleShareAcceptViaRuntime(
  ctx: any,
  params: ShareAcceptParams,
): Promise<void> {
  const { envelope, remotePeerId, remoteAddr, receivedAt } = params;

  const nodeService = ctx.getNodeService();

  // 1. If accepting, clear any pending share state from the preview.
  if (nodeService) {
    try {
      const acc = ctx.parseShareAcceptPayload(envelope.payload);
      if (!acc.accept) {
        nodeService.clearPendingShareStateForPreview(acc.inReplyTo);
      }
    } catch {
      // ignore parse errors; handleInboundShareAccept will reject
    }
  }

  // 2. Delegate to the core handler.
  const share = await ctx.handleInboundShareAccept({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: params.correlationId,
    taskStore: ctx.getTaskStore(),
    trustStore: ctx.getTrustStore(),
    peerDirectoryStore: ctx.getPeerDirectoryStore(),
    profile: ctx.getProfile(),
    vaultIndex: ctx.getVaultIndex(),
  });
  if (!share.ok) {
    ctx.logWarn(`[share.accept denied] ${share.reason}`);
    return;
  }

  // 3. Deliver the file (if nodeService is wired).
  if (nodeService) {
    try {
      await nodeService.maybeSendShareFileForInboundAccept({
        envelope,
        remotePeerId,
        taskStore: ctx.getTaskStore(),
        vaultDir: ctx.getVaultDir(),
        inboundConnectionAddrs: remoteAddr?.trim()
          ? [remoteAddr.trim()]
          : undefined,
      });
    } catch (err) {
      ctx.logError(
        `[share.accept] outbound file transfer failed peer=${remotePeerId.slice(0, 12)}…: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  ctx.log(`[share.accept] peer=${remotePeerId} proceeding with content share`);
}