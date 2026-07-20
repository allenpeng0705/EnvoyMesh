// @ts-nocheck - runtime is loosely typed by design.

/**
 * agent.card.request / agent.card.response arm of
 * `handleInboundMeshMessage` (extracted from `apps/node/src/index.ts`).
 *
 * The arm body used to be a ~21-line block in `handleInboundMeshMessage`:
 *   1. Call handleDaemonAgentCardInbound (pure helper)
 *   2. If agentCard.handled, return
 *
 * Otherwise, fall through to the next arm. (The original code does NOT
 * have a `return;` at the end of the arm — control flows to the next
 * arm. This is intentional — agent card messages that aren't handled
 * by the daemon fallback are passed through to the standard handlers.)
 *
 * Now it is a 1-line call to this runtime.
 */

export interface AgentCardParams {
  envelope: {
    messageId: string;
    senderPeerId: string;
    intent: string;
    payload: unknown;
  };
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
}

export async function handleAgentCardViaRuntime(
  ctx: any,
  params: AgentCardParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt } = params;

  const agentCard = await ctx.handleDaemonAgentCardInbound({
    envelope,
    profile: ctx.getProfile(),
    remotePeerId,
    receivedAt,
    correlationId: params.correlationId,
    taskStore: ctx.getTaskStore(),
    trustStore: ctx.getTrustStore(),
    agentCardStore: ctx.getAgentCardStore(),
    humanProfileStore: ctx.getHumanProfileStore(),
    bridgeIdentity: ctx.getBridgeIdentity(),
    mesh: ctx.getMesh(),
    nodeService: ctx.getNodeService(),
    profileDir: typeof ctx.getProfileDir === "function" ? ctx.getProfileDir() : undefined,
  });
  if (agentCard.handled) return;
  // Otherwise fall through (matches the original control flow).
}