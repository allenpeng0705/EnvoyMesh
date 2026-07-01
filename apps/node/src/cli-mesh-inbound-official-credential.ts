// @ts-nocheck - runtime is loosely typed by design.

/**
 * official.credential arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm was a ~12-line block that:
 *   1. Load node config + extract trustAnchorPublicKeys
 *   2. Call handleInboundOfficialCredential
 *   3. If rejected, warn + return
 *
 * Now it is a 1-line call to this runtime.
 */

export interface OfficialCredentialParams {
  envelope: unknown;
}

export async function handleOfficialCredentialViaRuntime(
  ctx: any,
  params: OfficialCredentialParams,
): Promise<void> {
  const nodeConfig = await ctx.loadNodeConfig();
  const trustAnchorPublicKeys = nodeConfig?.trustAnchorPublicKeys ?? {};
  const result = await ctx.handleInboundOfficialCredential({
    envelope: params.envelope,
    taskStore: ctx.getTaskStore(),
    trustAnchorPublicKeys,
  });
  if (!result.ok) {
    ctx.logWarn(`[rejected official.credential] ${result.reason}`);
  }
}