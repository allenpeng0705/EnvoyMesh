// @ts-nocheck - runtime is loosely typed by design.

/**
 * task.feedback arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body was a ~13-line block that:
 *   1. Loads the node config
 *   2. Calls handleInboundTaskFeedback
 *   3. If rejected: warn + return
 *
 * Now it is a 1-line call to this runtime.
 */

export interface TaskFeedbackParams {
  envelope: unknown;
  remotePeerId: string;
}

export async function handleTaskFeedbackViaRuntime(
  ctx: any,
  params: TaskFeedbackParams,
): Promise<void> {
  await ctx.loadNodeConfig();
  const result = await ctx.handleInboundTaskFeedback({
    envelope: params.envelope,
  });
  if (!result.ok) {
    ctx.logWarn(`[rejected task.feedback] ${result.reason}`);
  }
}