/**
 * Friend Autopilot + Social Proxy runtime.
 *
 * Extracted from `node-service-impl.ts`. Owns the small scheduled
 * methods that wrap the friend-autopilot and social-proxy
 * orchestrators:
 *   - runScheduledFriendAutopilot — check config, run pass, record
 *   - listSocialProxySessions — list active sessions
 *   - advanceSocialProxySession — advance a session
 *   - notifySocialProxyOwnerCommitment — record owner commitment
 *
 * Each function takes a typed context with only the fields it
 * reads or mutates. Class methods collapse to one-line delegations.
 */
import { randomUUID } from "node:crypto";
import {
  shouldRunScheduledFriendAutopilot,
  transitionSocialProxySession,
} from "@envoymesh/api";
import { runFriendAutopilotPass } from "./friend-autopilot-runner.js";
import { advanceSocialProxySession as advanceSocialProxySessionCore } from "./social-proxy-orchestrator.js";
import type {
  NodeConfig,
  SocialProxySession,
} from "@envoymesh/api";

export interface FriendAutopilotContext {
  getNodeConfig(): Promise<NodeConfig>;
  /** Record a friend-autopilot pass outcome to the local store. */
  recordFriendAutopilotPass(record: {
    ok: boolean;
    error?: string;
    trigger: "scheduled" | "manual";
    correlationId: string;
  }): Promise<void>;
  /** Update the persisted node config. */
  updateNodeConfig(patch: Partial<NodeConfig>): Promise<void>;
  /** Resolve the tool-execution context (for runFriendAutopilotPass). */
  getToolExecutionContext(): Promise<unknown>;
}

export async function runScheduledFriendAutopilotViaRuntime(
  ctx: FriendAutopilotContext,
): Promise<{ ok: boolean; error?: string }> {
  const config = await ctx.getNodeConfig();
  const intervalHours = config.friendAutopilotIntervalHours ?? 0;
  if (
    !shouldRunScheduledFriendAutopilot({
      friendAutopilotEnabled: config.friendAutopilotEnabled ?? false,
      trustModeEnabled: config.trustModeEnabled ?? false,
      intervalHours,
      lastRunAt: config.friendAutopilotLastRunAt,
    })
  ) {
    return { ok: false, error: "not due" };
  }
  const correlationId = randomUUID();
  const pass = await runFriendAutopilotPass({
    getContext: () => ctx.getToolExecutionContext() as never,
  });
  await ctx.recordFriendAutopilotPass({
    ok: pass.ok,
    error: pass.error,
    trigger: "scheduled",
    correlationId,
  });
  await ctx.updateNodeConfig({
    friendAutopilotLastRunAt: new Date().toISOString(),
  });
  return { ok: pass.ok, error: pass.error };
}

/* ---------- social proxy small methods ---------- */

export interface SocialProxyContext {
  getSocialProxyStore(): {
    list(): Promise<SocialProxySession[]>;
    get(id: string): Promise<SocialProxySession | undefined>;
    save(session: SocialProxySession): Promise<void>;
  } | undefined;
  getNodeConfig(): Promise<NodeConfig>;
  getSocialProxyOrchestratorDeps(config: NodeConfig): unknown;
  /** Pending social-intro proposals (mutable map on the class). */
  getPendingSocialIntroProposals(): Map<string, { ownerCommitmentRef?: string }>;
}

export async function listSocialProxySessionsViaRuntime(
  ctx: SocialProxyContext,
): Promise<SocialProxySession[]> {
  const store = ctx.getSocialProxyStore();
  if (!store) return [];
  return store.list();
}

export async function advanceSocialProxySessionViaRuntime(
  ctx: SocialProxyContext,
  sessionId: string,
): Promise<SocialProxySession | undefined> {
  const store = ctx.getSocialProxyStore();
  if (!store) return undefined;
  const config = await ctx.getNodeConfig();
  return advanceSocialProxySessionCore(
    ctx.getSocialProxyOrchestratorDeps(config) as never,
    sessionId.trim(),
  );
}

export async function notifySocialProxyOwnerCommitmentViaRuntime(
  ctx: SocialProxyContext,
  sessionId: string,
  ownerCommitmentRef: string,
): Promise<SocialProxySession | undefined> {
  const store = ctx.getSocialProxyStore();
  if (!store) return undefined;
  const session = await store.get(sessionId.trim());
  if (!session) {
    throw new Error(`Social proxy session not found: ${sessionId}`);
  }
  if (session.introProposalMessageId) {
    const row = ctx.getPendingSocialIntroProposals().get(session.introProposalMessageId);
    if (row) {
      row.ownerCommitmentRef = ownerCommitmentRef;
    }
  }
  const withRef = {
    ...session,
    ownerCommitmentRef,
    updatedAt: new Date().toISOString(),
  };
  const { session: next } = transitionSocialProxySession(withRef, "OWNER_APPROVE_INTRO", {
    hasOwnerCommitmentRef: true,
  });
  await store.save(next);
  return next;
}