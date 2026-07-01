// @ts-nocheck - runtime is loosely typed by design.

/**
 * system.ping arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The CLI inbound router used to handle every intent in a 1,851-line
 * monolithic function. This file extracts ONE arm (system.ping) as a
 * standalone runtime so the pattern can be tested in isolation before
 * we move the remaining ~29 arms.
 *
 * Context type: deliberately small. Only 3 fields. Other runtime
 * files in this same shape will follow.
 */

export interface SystemPingContext {
  /** Local task store (for audit event append). */
  taskStore: {
    appendAuditEvent(event: unknown): Promise<void>;
  } | undefined;
  /** Top-level helper to parse the system.ping payload. */
  parseSystemPingPayload(payload: unknown): { message?: string; nonce?: string };
  /** Top-level helper to build an audit event. */
  createAuditEvent(input: unknown): unknown;
}

export interface SystemPingParams {
  envelope: {
    messageId: string;
    senderPeerId: string;
    createdAt: string;
    intent: string;
    payload: unknown;
  };
  remotePeerId: string;
  /** May be undefined; the audit event stores undefined as missing. */
  correlationId?: string;
  receivedAt: number;
}

export async function handleSystemPingViaRuntime(
  ctx: SystemPingContext,
  params: SystemPingParams,
): Promise<void> {
  const { envelope, remotePeerId, correlationId, receivedAt } = params;
  const payload = ctx.parseSystemPingPayload(envelope.payload);
  console.log(
    `[verified ping] from ${envelope.senderPeerId} via libp2p peer ${remotePeerId}: ${payload.message ?? payload.nonce}`,
  );
  void ctx.taskStore?.appendAuditEvent(
    ctx.createAuditEvent({
      type: "message.verified",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: "Verified ping message.",
      createdAt: envelope.createdAt,
    }),
  );
}