import { randomUUID } from "node:crypto";
import type { Sensitivity } from "@envoymesh/protocol";

export type DocumentAcquisitionStage =
  | "queued"
  | "local_search"
  | "bonded_catalog"
  | "wider_discovery"
  | "awaiting_forward_approval"
  | "candidate_ranking"
  | "negotiating"
  | "share_requested"
  | "awaiting_share_accept"
  | "transferring"
  | "completed"
  | "failed"
  | "approval_needed"
  | "cancelled";

export type DocumentAcquisitionEvent =
  | "START"
  | "LOCAL_HIT"
  | "LOCAL_MISS"
  | "CATALOG_MATCH"
  | "CATALOG_MISS"
  | "WIDER_START"
  | "FORWARD_APPROVAL_NEEDED"
  | "FORWARD_APPROVED"
  | "CANDIDATES_READY"
  | "NEGOTIATION_MATCH"
  | "NEGOTIATION_FAIL"
  | "SHARE_REQUESTED"
  | "SHARE_ACCEPTED"
  | "TRANSFER_OK"
  | "TRANSFER_FAIL"
  | "APPROVAL_NEEDED"
  | "APPROVAL_GRANTED"
  | "KILL_SWITCH";

export interface DocumentAcquisitionCandidate {
  candidateId: string;
  sourceOwnerId: string;
  sourcePeerId?: string;
  libraryItemId?: string;
  sourceRelativePath?: string;
  title: string;
  sensitivity: Sensitivity;
  hopDistance: number;
  trustPathLabel?: string;
  score: number;
  status: "open" | "negotiating" | "rejected" | "matched" | "retrieved";
}

export interface LibraryMatchSummary {
  path: string;
  title: string;
  score: number;
}

export interface DocumentAcquisitionJob {
  jobId: string;
  correlationId: string;
  postureRef: string;
  query: string;
  fileTitleHint?: string;
  pathHint?: string;
  stage: DocumentAcquisitionStage;
  candidates: DocumentAcquisitionCandidate[];
  selectedCandidateId?: string;
  negotiationRound: number;
  localMatches: LibraryMatchSummary[];
  resultVaultPath?: string;
  resultShareId?: string;
  error?: string;
  approvalItemId?: string;
  /** AI intent route resolved at job start (orchestration — not human UI). */
  agentRouteId?: string;
  agentRoutePhase?: string;
  agentRoutePhases?: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface DocumentAcquisitionTransitionContext {
  searchBondedOnly?: boolean;
  maxNegotiationRounds?: number;
  hasCandidates?: boolean;
  hasLocalMatch?: boolean;
  needsForwardApproval?: boolean;
}

const TERMINAL_STAGES: ReadonlySet<DocumentAcquisitionStage> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function isDocumentAcquisitionTerminal(stage: DocumentAcquisitionStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

export function transitionDocumentAcquisitionJob(
  job: DocumentAcquisitionJob,
  event: DocumentAcquisitionEvent,
  ctx: DocumentAcquisitionTransitionContext = {},
): { job: DocumentAcquisitionJob; changed: boolean } {
  if (isDocumentAcquisitionTerminal(job.stage) && event !== "KILL_SWITCH") {
    return { job, changed: false };
  }

  const now = new Date().toISOString();
  let nextStage = job.stage;
  let changed = false;

  switch (event) {
    case "KILL_SWITCH":
      nextStage = "cancelled";
      break;
    case "START":
      if (job.stage === "queued") nextStage = "local_search";
      break;
    case "LOCAL_HIT":
      if (job.stage === "local_search" && ctx.hasLocalMatch) nextStage = "completed";
      break;
    case "LOCAL_MISS":
      if (job.stage === "local_search") nextStage = "bonded_catalog";
      break;
    case "CATALOG_MATCH":
      if (job.stage === "bonded_catalog" && ctx.hasCandidates) nextStage = "candidate_ranking";
      break;
    case "CATALOG_MISS":
      if (job.stage === "bonded_catalog") {
        nextStage = ctx.searchBondedOnly ? "failed" : "wider_discovery";
      }
      break;
    case "FORWARD_APPROVAL_NEEDED":
      if (job.stage === "wider_discovery" && ctx.needsForwardApproval) {
        nextStage = "awaiting_forward_approval";
      }
      break;
    case "FORWARD_APPROVED":
      if (job.stage === "awaiting_forward_approval") nextStage = "wider_discovery";
      break;
    case "CANDIDATES_READY":
      if (job.stage === "wider_discovery" || job.stage === "candidate_ranking") {
        nextStage = ctx.hasCandidates ? "negotiating" : "failed";
      }
      break;
    case "NEGOTIATION_MATCH":
      if (job.stage === "negotiating") nextStage = "share_requested";
      break;
    case "NEGOTIATION_FAIL":
      if (job.stage === "negotiating") {
        const maxRounds = ctx.maxNegotiationRounds ?? 5;
        if (job.negotiationRound >= maxRounds) nextStage = "failed";
      }
      break;
    case "APPROVAL_NEEDED":
      nextStage = "approval_needed";
      break;
    case "APPROVAL_GRANTED":
      if (job.stage === "approval_needed") nextStage = "negotiating";
      break;
    case "SHARE_REQUESTED":
      if (job.stage === "negotiating" || job.stage === "share_requested") {
        nextStage = "awaiting_share_accept";
      }
      break;
    case "SHARE_ACCEPTED":
      if (job.stage === "awaiting_share_accept" || job.stage === "share_requested") {
        nextStage = "transferring";
      }
      break;
    case "TRANSFER_OK":
      if (job.stage === "transferring") nextStage = "completed";
      break;
    case "TRANSFER_FAIL":
      if (job.stage === "transferring") nextStage = "failed";
      break;
    default:
      break;
  }

  changed = nextStage !== job.stage;
  if (!changed) return { job, changed: false };

  return {
    job: { ...job, stage: nextStage, updatedAt: now },
    changed: true,
  };
}

export function createDocumentAcquisitionJob(input: {
  postureRef: string;
  query: string;
  fileTitleHint?: string;
  pathHint?: string;
  correlationId?: string;
  jobTtlHours?: number;
}): DocumentAcquisitionJob {
  const now = new Date().toISOString();
  const ttlHours = input.jobTtlHours ?? 72;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const correlationId = input.correlationId ?? randomUUID();
  return {
    jobId: randomUUID(),
    correlationId,
    postureRef: input.postureRef,
    query: input.query.trim(),
    fileTitleHint: input.fileTitleHint,
    pathHint: input.pathHint,
    stage: "queued",
    candidates: [],
    negotiationRound: 0,
    localMatches: [],
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
}

/** Token overlap score for candidate ranking (deterministic v1). */
export function scoreDocumentTitleMatch(query: string, title: string): number {
  const qTokens = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
  if (qTokens.size === 0) return 0;
  const titleTokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  let hits = 0;
  for (const t of titleTokens) {
    if (qTokens.has(t)) hits += 1;
  }
  return hits / qTokens.size;
}

/** Score published catalog row using title + path (and optional path hint). */
export function scoreCatalogDocumentCandidate(
  query: string,
  match: { title?: string; relativePath?: string },
  pathHint?: string,
): number {
  const corpus = `${match.title ?? ""} ${match.relativePath ?? ""}`.trim();
  let score = scoreDocumentTitleMatch(query, corpus);
  const hint = pathHint?.trim().toLowerCase();
  if (hint && match.relativePath?.toLowerCase().includes(hint)) {
    score = Math.max(score, 0.65);
  }
  return score;
}

/** Structured peer knowledge.query for document acquisition (metadata only). */
export function buildAcquisitionPeerKnowledgeQuery(
  job: Pick<DocumentAcquisitionJob, "query" | "fileTitleHint" | "pathHint">,
  candidate?: Pick<DocumentAcquisitionCandidate, "title" | "sourceRelativePath">,
): string {
  const candidateLabel = candidate?.title ?? candidate?.sourceRelativePath ?? "";
  const parts = [
    `Document acquisition (metadata only — do not send file bytes): find which published library item matches: "${job.query}"`,
  ];
  if (job.fileTitleHint?.trim()) parts.push(`Title hint: ${job.fileTitleHint.trim()}`);
  if (job.pathHint?.trim()) parts.push(`Path hint: ${job.pathHint.trim()}`);
  if (candidateLabel) parts.push(`Candidate under review: "${candidateLabel}"`);
  parts.push(
    'If a published item matches, reply with its vault relativePath on the first line (e.g. shared/paper.pdf), then one sentence why it matches. If none match, reply "no match".',
  );
  return parts.join(" ");
}

/** True when a parsed vault-relative path looks safe and file-like (allows spaces and unicode). */
export function looksLikeVaultRelativePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed.length > 512) return false;
  if (trimmed.startsWith("/") || trimmed.includes("..") || trimmed.includes("\0")) return false;
  if (trimmed.includes("\\")) return false;
  const segments = trimmed.split("/");
  if (segments.some((segment) => segment === "" || segment === ".")) return false;
  return trimmed.includes(".") || segments.length > 1;
}

/** True when a knowledge.response is an explicit acquisition refusal (not incidental mention in long RAG text). */
export function isAcquisitionRefusalAnswer(answerText: string): boolean {
  const firstLine = answerText.trim().split(/\n/)[0]?.trim().toLowerCase() ?? "";
  if (/^no match\.?$/.test(firstLine)) return true;
  if (/^(not found|no relevant match|does not contain)\b/.test(firstLine)) return true;
  const trimmed = answerText.trim();
  if (trimmed.length > 160) return false;
  const lower = trimmed.toLowerCase();
  if (/\bno match\b/.test(lower) && !looksLikeVaultRelativePath(trimmed.split("\n")[0] ?? "")) {
    return true;
  }
  return /^(not found|no relevant|does not contain)\b/.test(lower);
}

/** True when a route-executor negotiate summary is substantive enough to skip legacy knowledge.query. */
export function isAcquisitionKnowledgeSummaryUseful(summary: string, query: string): boolean {
  const trimmed = summary.trim();
  if (!trimmed) return false;
  if (/^(ok|done|success|executed|skipped)\.?$/i.test(trimmed)) return false;
  if (isAcquisitionRefusalAnswer(trimmed)) return true;
  if (extractAcquisitionPathFromKnowledgeAnswer(trimmed)) return true;
  if (scoreDocumentTitleMatch(query, trimmed) >= 0.2) return true;
  return trimmed.length >= 48;
}

/** True when a route-executor acquire step summary indicates real work (not a vacuous ok). */
export function isRouteAcquireSummarySubstantive(summary: string): boolean {
  const trimmed = summary.trim();
  if (!trimmed) return false;
  if (/^(ok|done|success|executed|skipped)\.?$/i.test(trimmed)) return false;
  return trimmed.length >= 16;
}

/** Score knowledge.response text for negotiation (RAG answer + path cues). */
export function scoreDocumentKnowledgeNegotiation(
  query: string,
  answerText: string,
  candidate?: Pick<DocumentAcquisitionCandidate, "title" | "sourceRelativePath">,
): number {
  if (isAcquisitionRefusalAnswer(answerText)) {
    return 0;
  }
  const lower = answerText.toLowerCase();
  let score = scoreDocumentTitleMatch(query, answerText);
  if (candidate?.sourceRelativePath && lower.includes(candidate.sourceRelativePath.toLowerCase())) {
    score = Math.max(score, 0.85);
  }
  if (candidate?.title && lower.includes(candidate.title.toLowerCase())) {
    score = Math.max(score, 0.7);
  }
  const firstLine = answerText.trim().split(/\n/)[0]?.trim() ?? "";
  if (firstLine.includes("/") && scoreDocumentTitleMatch(query, firstLine) > 0.15) {
    score = Math.max(score, 0.75);
  }
  return Math.min(score, 1);
}

/** Parse relativePath from structured knowledge.response (field, first line, or echo). */
export function extractAcquisitionPathFromKnowledgeAnswer(
  answerText: string,
  candidate?: Pick<DocumentAcquisitionCandidate, "sourceRelativePath" | "title">,
  suggestedRelativePath?: string,
): string | undefined {
  if (suggestedRelativePath && looksLikeVaultRelativePath(suggestedRelativePath)) {
    return suggestedRelativePath;
  }
  const firstLine = answerText.trim().split(/\n/)[0]?.trim() ?? "";
  const unquoted = firstLine.replace(/^["'`]|["'`]$/g, "").trim();
  if (looksLikeVaultRelativePath(unquoted)) {
    return unquoted;
  }
  if (candidate?.sourceRelativePath && answerText.includes(candidate.sourceRelativePath)) {
    return candidate.sourceRelativePath;
  }
  return undefined;
}

/** Merge vault RAG hit scores with lexical title overlap for local_search. */
export function rankLocalVaultSearchHits(
  query: string,
  hits: Array<{ relativePath: string; title: string; ragScore: number }>,
): LibraryMatchSummary[] {
  return hits
    .map((h) => {
      const lexical = scoreDocumentTitleMatch(query, `${h.title} ${h.relativePath}`);
      const normalizedRag =
        h.ragScore <= 1 ? h.ragScore : Math.min(h.ragScore / 10, 1);
      return {
        path: h.relativePath,
        title: h.title,
        score: Math.max(normalizedRag, lexical),
      };
    })
    .filter((m) => m.score > 0.15)
    .sort((a, b) => b.score - a.score);
}
