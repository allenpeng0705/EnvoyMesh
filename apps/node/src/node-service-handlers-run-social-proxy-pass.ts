/**
 * runSocialProxyPass runtime (Step 29).
 *
 * Extracted from `node-service-impl.ts`. Wraps the social-proxy
 * orchestrator with config-store + last-pass timestamp updates.
 */
import { runSocialProxyPass as runSocialProxyPassCore } from "./social-proxy-orchestrator.js";
import type { NodeConfig } from "@envoymesh/api";

export type SocialProxyPassRuntimeResult = {
  ok: boolean;
  error?: string;
  correlationId?: string;
  // Other fields (candidates, sessionState, etc.) are passed through
  // from the underlying orchestrator; the class signature is loose.
  [key: string]: unknown;
};

export interface RunSocialProxyPassContext {
  getNodeConfig(): Promise<NodeConfig>;
  /** Build the orchestrator deps from a config (private helper on the class). */
  getSocialProxyOrchestratorDeps(config: NodeConfig): unknown;
  /** Whether the social proxy store is initialised. */
  hasSocialProxyStore(): boolean;
  /** Update the persisted node config. */
  updateNodeConfig(patch: Partial<NodeConfig>): Promise<void>;
}

export interface RunSocialProxyPassInput {
  targetOwnerId?: string;
  targetPeerId?: string;
  targetAgentPeerId?: string;
  focusSessionId?: string;
}

export async function runSocialProxyPassViaRuntime(
  ctx: RunSocialProxyPassContext,
  input?: RunSocialProxyPassInput,
): Promise<SocialProxyPassRuntimeResult> {
  if (!ctx.hasSocialProxyStore()) {
    return { ok: false, error: "social proxy store unavailable" };
  }
  const config = await ctx.getNodeConfig();
  const deps = ctx.getSocialProxyOrchestratorDeps(config);
  const result = await runSocialProxyPassCore({
    ...(deps as Parameters<typeof runSocialProxyPassCore>[0]),
    focusSessionId: input?.focusSessionId,
    targetCandidate:
      input?.targetOwnerId && input?.targetPeerId
        ? {
            ownerId: input.targetOwnerId,
            peerId: input.targetPeerId,
            agentPeerId: input.targetAgentPeerId,
          }
        : undefined,
  });
  if (result.ok) {
    await ctx.updateNodeConfig({
      socialProxyLastPassAt: new Date().toISOString(),
    });
  }
  return result as unknown as SocialProxyPassRuntimeResult;
}