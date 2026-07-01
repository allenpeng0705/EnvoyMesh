// @ts-nocheck - runtime is loosely typed by design.

/**
 * task.feedback arm PRE-FIX.
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