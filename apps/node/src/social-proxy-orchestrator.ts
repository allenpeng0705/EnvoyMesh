import { randomUUID } from "node:crypto";
import {
  createSocialProxySession,
  isSocialProxyTerminal,
  transitionSocialProxySession,
  type SocialProxySession,
} from "@envoymesh/api";
import { executeTool, type MeshToolContext } from "./tool-registry.js";
import { runFriendAutopilotPass } from "./friend-autopilot-runner.js";

export interface SocialProxyPassResult {
  ok: boolean;
  error?: string;
  sessionsTouched: number;
  correlationId: string;
}

export interface SocialProxyOrchestratorDeps {
  getContext: () => Promise<MeshToolContext | null>;
  socialProxyEnabled: boolean;
  trustModeEnabled: boolean;
  autonomousKillSwitch: boolean;
  postureRef: string;
  listSessions: () => Promise<SocialProxySession[]>;
  saveSession: (session: SocialProxySession) => Promise<void>;
  recordActivity: (input: {
    correlationId: string;
    summary: string;
    remoteOwnerId?: string;
    sessionId: string;
  }) => Promise<void>;
  policy?: {
    autoHello?: boolean;
    helloRequiresApproval?: boolean;
    maxNewIntrosPerDay?: number;
    autoChatWithPeerHumans?: boolean;
  };
  /** When set, skips broadcast discovery and binds this candidate for the pass. */
  targetCandidate?: { ownerId: string; peerId: string; agentPeerId?: string };
  /** Focus a single session instead of the first discovered/syncing row. */
  focusSessionId?: string;
  proposeIntro?: (
    session: SocialProxySession,
    candidate: { ownerId: string; peerId: string },
  ) => Promise<{ messageId: string; introCorrelationId: string } | null>;
  syncIntroWithCandidate?: (
    session: SocialProxySession,
    candidate: { ownerId: string; peerId: string; agentPeerId?: string },
  ) => Promise<boolean>;
  sendHello?: (session: SocialProxySession) => Promise<boolean>;
  sendAgentChat?: (session: SocialProxySession, text: string) => Promise<boolean>;
}

async function runTransition(
  session: SocialProxySession,
  event: Parameters<typeof transitionSocialProxySession>[1],
  ctx: Parameters<typeof transitionSocialProxySession>[2],
  deps: Pick<SocialProxyOrchestratorDeps, "saveSession" | "recordActivity">,
): Promise<{ session: SocialProxySession; changed: boolean }> {
  const result = transitionSocialProxySession(session, event, ctx);
  if (result.changed) {
    await deps.saveSession(result.session);
    await deps.recordActivity({
      correlationId: result.session.correlationId,
      summary: `Social proxy: ${result.session.status}`,
      sessionId: result.session.sessionId,
      remoteOwnerId: result.session.candidateOwnerId,
    });
  }
  return result;
}

export async function advanceSocialProxySession(
  deps: SocialProxyOrchestratorDeps,
  sessionId: string,
): Promise<SocialProxySession | undefined> {
  if (deps.autonomousKillSwitch || !deps.socialProxyEnabled || !deps.trustModeEnabled) {
    return undefined;
  }

  const sessions = await deps.listSessions();
  let session = sessions.find((s) => s.sessionId === sessionId);
  if (!session || isSocialProxyTerminal(session.status)) return session;

  const policy = deps.policy ?? {};
  const ctx = await deps.getContext();

  if (
    (session.status === "discovered" || session.status === "syncing" || session.status === "awaiting_peer") &&
    session.candidateOwnerId &&
    session.candidatePeerId &&
    ctx?.trustIntro?.trustModeEnabled
  ) {
    const candidateOwnerId = session.candidateOwnerId;
    const agentPeerId =
      session.candidateAgentPeerId ??
      deps.targetCandidate?.agentPeerId ??
      (await ctx.peerDirectoryStore.listPeerRecords()).find((r) => r.ownerId === candidateOwnerId)?.peerId;

    if (agentPeerId) {
      let syncOk = false;
      if (deps.syncIntroWithCandidate && session.candidateOwnerId && session.candidatePeerId) {
        syncOk = await deps.syncIntroWithCandidate(session, {
          ownerId: session.candidateOwnerId,
          peerId: session.candidatePeerId,
          agentPeerId,
        });
      } else {
        const sync = await executeTool(
          "mesh.intro.sync",
          {
            recipientAgentPeerId: agentPeerId,
            counterpartyOwnerId: session.candidateOwnerId,
            introCorrelationId: session.correlationId,
            interest: "explore",
          },
          { ...ctx, approvalGranted: true },
        );
        syncOk = sync.ok;
      }
      if (syncOk) {
        const syncResult = await runTransition(session, "SYNC_OK", {}, deps);
        session = syncResult.session;
      } else {
        const deferResult = await runTransition(session, "SYNC_DEFER", {}, deps);
        session = deferResult.session;
      }
    }

    if (session.status === "intro_proposed") {
      if (!session.introProposalMessageId && deps.proposeIntro && session.candidateOwnerId && session.candidatePeerId) {
        const proposed = await deps.proposeIntro(session, {
          ownerId: session.candidateOwnerId,
          peerId: session.candidatePeerId,
        });
        if (proposed) {
          session = {
            ...session,
            introProposalMessageId: proposed.messageId,
            status: "intro_proposed",
            updatedAt: new Date().toISOString(),
          };
          await deps.saveSession(session);
        }
      }
    }
  }

  if (session.status === "intro_proposed" && session.ownerCommitmentRef) {
    const approved = await runTransition(
      session,
      "OWNER_APPROVE_INTRO",
      { hasOwnerCommitmentRef: true },
      deps,
    );
    session = approved.session;
  }

  if (session.status === "commitment_ready" && session.ownerCommitmentRef) {
    if (policy.helloRequiresApproval) {
      const queued = await runTransition(session, "QUEUE_HELLO", { helloRequiresApproval: true }, deps);
      session = queued.session;
    } else if (policy.autoHello && deps.sendHello) {
      const sent = await deps.sendHello(session);
      if (sent) {
        const helloResult = await runTransition(
          session,
          "SEND_HELLO",
          {
            autoHello: true,
            helloRequiresApproval: false,
            hasOwnerCommitmentRef: true,
          },
          deps,
        );
        session = helloResult.session;
      }
    }
  }

  if (session.status === "hello_pending" && session.ownerCommitmentRef && deps.sendHello) {
    const sent = await deps.sendHello(session);
    if (sent) {
      const approvedHello = await runTransition(
        session,
        "APPROVE_HELLO",
        { hasOwnerCommitmentRef: true },
        deps,
      );
      session = approvedHello.session;
    }
  }

  if (
    (session.status === "hello_sent" || session.status === "chatting") &&
    policy.autoChatWithPeerHumans !== false &&
    deps.sendAgentChat &&
    session.candidateOwnerId
  ) {
    if (session.status === "hello_sent") {
      const sent = await deps.sendAgentChat(
        session,
        "Hello — I'm reaching out on behalf of my owner before we bond.",
      );
      if (sent) {
        const chatResult = await runTransition(session, "CHAT_ALLOWED", {}, deps);
        session = {
          ...chatResult.session,
          lastAgentChatAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await deps.saveSession(session);
      }
    }
  }

  return session;
}

export async function runSocialProxyPass(deps: SocialProxyOrchestratorDeps): Promise<SocialProxyPassResult> {
  const correlationId = randomUUID();

  if (deps.autonomousKillSwitch) {
    return { ok: false, error: "kill switch active", sessionsTouched: 0, correlationId };
  }
  if (!deps.socialProxyEnabled) {
    return { ok: false, error: "social proxy disabled", sessionsTouched: 0, correlationId };
  }
  if (!deps.trustModeEnabled) {
    return { ok: false, error: "trust mode disabled", sessionsTouched: 0, correlationId };
  }

  let touched = 0;
  const sessions = await deps.listSessions();
  const today = new Date().toISOString().slice(0, 10);
  const introsToday = sessions.filter(
    (s) => s.createdAt.startsWith(today) && s.status !== "declined" && s.status !== "cancelled",
  ).length;
  const maxIntros = deps.policy?.maxNewIntrosPerDay ?? 5;

  let session =
    (deps.focusSessionId ? sessions.find((s) => s.sessionId === deps.focusSessionId) : undefined) ??
    sessions.find((s) => !isSocialProxyTerminal(s.status) && s.candidateOwnerId) ??
    sessions.find((s) => s.status === "discovered" || s.status === "syncing");

  if (!session && deps.targetCandidate) {
    if (introsToday >= maxIntros) {
      return { ok: false, error: "daily intro cap reached", sessionsTouched: 0, correlationId };
    }
    session = createSocialProxySession({
      postureRef: deps.postureRef,
      correlationId,
      candidateOwnerId: deps.targetCandidate.ownerId,
      candidatePeerId: deps.targetCandidate.peerId,
      candidateAgentPeerId: deps.targetCandidate.agentPeerId,
      trustPathSummary: "targeted social proxy pass",
    });
    await deps.saveSession(session);
    await deps.recordActivity({
      correlationId: session.correlationId,
      summary: "Social proxy: session discovered",
      sessionId: session.sessionId,
      remoteOwnerId: session.candidateOwnerId,
    });
    touched += 1;
  } else if (!session) {
    const pass = await runFriendAutopilotPass({ getContext: deps.getContext });
    if (!pass.ok) {
      return { ok: false, error: pass.error ?? "discovery pass failed", sessionsTouched: 0, correlationId };
    }
    if (introsToday >= maxIntros) {
      return { ok: false, error: "daily intro cap reached", sessionsTouched: 0, correlationId };
    }
    session = createSocialProxySession({
      postureRef: deps.postureRef,
      correlationId,
      trustPathSummary: "broadcast discovery pass",
    });
    await deps.saveSession(session);
    await deps.recordActivity({
      correlationId: session.correlationId,
      summary: "Social proxy: session discovered",
      sessionId: session.sessionId,
    });
    touched += 1;
  }

  if (!session) {
    return { ok: false, error: "no session", sessionsTouched: touched, correlationId };
  }

  const runPassTransition = async (
    event: Parameters<typeof transitionSocialProxySession>[1],
    ctx: Parameters<typeof transitionSocialProxySession>[2] = {},
  ) => {
    const result = await runTransition(session!, event, ctx, deps);
    if (result.changed) {
      session = result.session;
      touched += 1;
    }
  };

  if (session.status === "discovered") {
    await runPassTransition("RUN_PASS");
  }

  const context = await deps.getContext();
  if (
    session.status === "syncing" &&
    context?.trustIntro?.trustModeEnabled &&
    !session.candidateOwnerId
  ) {
    const sync = await executeTool("mesh.intro.matching_context", {}, {
      ...context,
      approvalGranted: true,
    });
    if (sync.ok) {
      await runPassTransition("SYNC_OK");
    } else {
      await runPassTransition("SYNC_DEFER");
    }
  }

  const advanced = await advanceSocialProxySession(deps, session.sessionId);
  if (advanced && advanced.updatedAt !== session.updatedAt) {
    touched += 1;
  }

  return { ok: true, sessionsTouched: touched, correlationId };
}
