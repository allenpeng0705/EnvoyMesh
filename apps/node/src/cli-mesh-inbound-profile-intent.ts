// @ts-nocheck - runtime is loosely typed by design.

/**
 * profile.sync / profile.response / profile.request arm of
 * `handleInboundMeshMessage` (extracted from `apps/node/src/index.ts`).
 *
 * The arm body was a ~30-line block that:
 *   1. If nodeService is NodeServiceImpl, calls
 *      handleInboundProfileIntent
 *   2. If handled=true, append verified audit + return
 *   3. Otherwise, fall through (matches original control flow)
 *
 * Now it is a 1-line call to this runtime.
 */

export interface ProfileIntentParams {
  envelope: unknown;
  remotePeerId: string;
  remoteAddr: string | undefined;
  receivedAt: number;
  correlationId: string | undefined;
  replyWithEnvelope?: (envelope: unknown) => Promise<void>;
}

export async function handleProfileIntentViaRuntime(
  ctx: any,
  params: ProfileIntentParams,
): Promise<boolean> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  const nodeService = ctx.getNodeService();
  if (!nodeService) {
    return false; // fall through
  }

  const handled = await nodeService.handleInboundProfileIntent(envelope, {
    transportPeerId: remotePeerId,
    remoteAddr: params.remoteAddr,
    replyWithEnvelope: params.replyWithEnvelope,
  });

  if (!handled) {
    return false; // fall through
  }

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
    summary: `Handled ${envelope.intent}.`,
    createdAt: envelope.createdAt,
  });
  return true; // consumed — arm returns
}