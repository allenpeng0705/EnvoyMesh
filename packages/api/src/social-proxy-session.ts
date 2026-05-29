import { randomUUID } from "node:crypto";

export type SocialProxySessionStatus =
  | "discovered"
  | "syncing"
  | "intro_proposed"
  | "awaiting_peer"
  | "commitment_ready"
  | "hello_pending"
  | "hello_sent"
  | "chatting"
  | "owner_review"
  | "bonded"
  | "declined"
  | "expired"
  | "cancelled";

export type SocialProxySessionEvent =
  | "RUN_PASS"
  | "SYNC_OK"
  | "SYNC_DEFER"
  | "OWNER_APPROVE_INTRO"
  | "PEER_OWNER_READY"
  | "OWNER_DECLINE"
  | "SEND_HELLO"
  | "QUEUE_HELLO"
  | "APPROVE_HELLO"
  | "CHAT_ALLOWED"
  | "INBOUND_CHAT"
  | "ESCALATE"
  | "KILL_SWITCH"
  | "BOND_DETECTED"
  | "EXPIRE";

export interface SocialProxySession {
  sessionId: string;
  correlationId: string;
  postureRef: string;
  candidateOwnerId?: string;
  candidatePeerId?: string;
  candidateAgentPeerId?: string;
  introProposalMessageId?: string;
  ownerCommitmentRef?: string;
  status: SocialProxySessionStatus;
  trustPathSummary?: string;
  lastAgentChatAt?: string;
  introCountToday?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface SocialProxyTransitionContext {
  autoHello?: boolean;
  helloRequiresApproval?: boolean;
  hasOwnerCommitmentRef?: boolean;
}

export interface SocialProxyTransitionResult {
  session: SocialProxySession;
  changed: boolean;
}

const TERMINAL: ReadonlySet<SocialProxySessionStatus> = new Set([
  "bonded",
  "declined",
  "expired",
  "cancelled",
]);

export function isSocialProxyTerminal(status: SocialProxySessionStatus): boolean {
  return TERMINAL.has(status);
}

export function transitionSocialProxySession(
  session: SocialProxySession,
  event: SocialProxySessionEvent,
  ctx: SocialProxyTransitionContext = {},
): SocialProxyTransitionResult {
  if (isSocialProxyTerminal(session.status) && event !== "BOND_DETECTED") {
    return { session, changed: false };
  }

  const now = new Date().toISOString();
  let nextStatus = session.status;
  let changed = false;

  switch (event) {
    case "KILL_SWITCH":
      nextStatus = "cancelled";
      break;
    case "EXPIRE":
      nextStatus = "expired";
      break;
    case "BOND_DETECTED":
      nextStatus = "bonded";
      break;
    case "OWNER_DECLINE":
      nextStatus = "declined";
      break;
    case "RUN_PASS":
      if (session.status === "discovered") nextStatus = "syncing";
      break;
    case "SYNC_OK":
      if (session.status === "syncing" || session.status === "awaiting_peer") {
        nextStatus = "intro_proposed";
      }
      break;
    case "SYNC_DEFER":
      if (session.status === "syncing") nextStatus = "awaiting_peer";
      break;
    case "OWNER_APPROVE_INTRO":
      if (session.status === "intro_proposed" && ctx.hasOwnerCommitmentRef) {
        nextStatus = "commitment_ready";
      }
      break;
    case "PEER_OWNER_READY":
      if (session.status === "awaiting_peer") {
        nextStatus = "intro_proposed";
      }
      break;
    case "QUEUE_HELLO":
      if (session.status === "commitment_ready" && ctx.helloRequiresApproval) {
        nextStatus = "hello_pending";
      }
      break;
    case "SEND_HELLO":
      if (
        session.status === "commitment_ready" &&
        ctx.hasOwnerCommitmentRef &&
        ctx.autoHello &&
        !ctx.helloRequiresApproval
      ) {
        nextStatus = "hello_sent";
      }
      break;
    case "APPROVE_HELLO":
      if (session.status === "hello_pending" && ctx.hasOwnerCommitmentRef) {
        nextStatus = "hello_sent";
      }
      break;
    case "CHAT_ALLOWED":
    case "INBOUND_CHAT":
      if (session.status === "hello_sent" || session.status === "chatting") {
        nextStatus = "chatting";
      }
      break;
    case "ESCALATE":
      if (session.status === "chatting") nextStatus = "owner_review";
      break;
    default:
      break;
  }

  changed = nextStatus !== session.status;
  if (!changed) {
    return { session, changed: false };
  }

  return {
    session: { ...session, status: nextStatus, updatedAt: now },
    changed: true,
  };
}

export function createSocialProxySession(input: {
  postureRef: string;
  correlationId?: string;
  candidateOwnerId?: string;
  candidatePeerId?: string;
  candidateAgentPeerId?: string;
  trustPathSummary?: string;
  expiresAt?: string;
}): SocialProxySession {
  const now = new Date().toISOString();
  return {
    sessionId: randomUUID(),
    correlationId: input.correlationId ?? randomUUID(),
    postureRef: input.postureRef,
    candidateOwnerId: input.candidateOwnerId,
    candidatePeerId: input.candidatePeerId,
    candidateAgentPeerId: input.candidateAgentPeerId,
    trustPathSummary: input.trustPathSummary,
    status: "discovered",
    introCountToday: 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  };
}
