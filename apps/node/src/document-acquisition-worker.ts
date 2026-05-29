import { randomUUID } from "node:crypto";
import {
  createDocumentAcquisitionJob,
  documentAcquisitionStageToRoutePhase,
  resolveDocumentAcquisitionAgentRoute,
  buildAcquisitionPeerKnowledgeQuery,
  extractAcquisitionPathFromKnowledgeAnswer,
  isAcquisitionKnowledgeSummaryUseful,
  isRouteAcquireSummarySubstantive,
  rankLocalVaultSearchHits,
  scoreCatalogDocumentCandidate,
  scoreDocumentKnowledgeNegotiation,
  scoreDocumentTitleMatch,
  transitionDocumentAcquisitionJob,
  type DocumentAcquisitionCandidate,
  type DocumentAcquisitionJob,
} from "@envoymesh/api";
import type { DiscoverPublishedLibraryPeerResult, LibraryItem, ShareOffer } from "@envoymesh/api";
import { tryExecuteDocumentAcquisitionRouteStep } from "./document-acquisition-route.js";

export interface DocumentAcquisitionWorkerDeps {
  documentAcquisitionEnabled: boolean;
  autonomousKillSwitch: boolean;
  postureRef: string;
  policy: {
    searchBondedOnly: boolean;
    maxNegotiationRounds: number;
    maxActiveJobs: number;
    jobTtlHours: number;
  };
  listJobs: (activeOnly?: boolean) => Promise<DocumentAcquisitionJob[]>;
  saveJob: (job: DocumentAcquisitionJob) => Promise<void>;
  listLibraryItems: (query?: string) => Promise<LibraryItem[]>;
  searchLocalVault?: (
    query: string,
  ) => Promise<Array<{ relativePath: string; title: string; ragScore: number }>>;
  discoverPublishedLibrary: () => Promise<DiscoverPublishedLibraryPeerResult[]>;
  listPendingShareOffers?: () => Promise<ShareOffer[]>;
  acceptShare?: (shareId: string, savePath: string) => Promise<void>;
  isTransferVerified?: (shareId: string) => Promise<boolean>;
  queryPeerKnowledge?: (
    ownerId: string,
    query: string,
  ) => Promise<{ ok: boolean; answerText?: string; suggestedRelativePath?: string }>;
  requestShareFromLibrary?: (
    job: DocumentAcquisitionJob,
    candidate: DocumentAcquisitionCandidate,
  ) => Promise<boolean>;
  recordActivity: (input: {
    correlationId: string;
    summary: string;
    jobId: string;
  }) => Promise<void>;
  localManifestCapabilities?: string[];
  executeRouteStep?: (
    job: DocumentAcquisitionJob,
    toolName: string,
    params: Record<string, unknown>,
  ) => Promise<{ ok: boolean; summary: string }>;
}

function inboxPathForJob(job: DocumentAcquisitionJob): string {
  const slug = (job.fileTitleHint ?? job.query)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `inbox/acq-${slug || job.jobId.slice(0, 8)}.bin`;
}

export async function startDocumentAcquisitionJob(
  deps: Pick<DocumentAcquisitionWorkerDeps, "postureRef" | "policy" | "listJobs" | "saveJob" | "recordActivity" | "localManifestCapabilities">,
  input: { query: string; fileTitleHint?: string; pathHint?: string },
): Promise<{ jobId: string; correlationId: string }> {
  const active = await deps.listJobs(true);
  if (active.length >= deps.policy.maxActiveJobs) {
    throw new Error(`Max active acquisition jobs (${deps.policy.maxActiveJobs}) reached`);
  }
  const route = resolveDocumentAcquisitionAgentRoute({
    query: input.query,
    manifestCapabilities: deps.localManifestCapabilities,
  });
  const job = {
    ...createDocumentAcquisitionJob({
      postureRef: deps.postureRef,
      query: input.query,
      fileTitleHint: input.fileTitleHint,
      pathHint: input.pathHint,
      jobTtlHours: deps.policy.jobTtlHours,
    }),
    agentRouteId: route.routeId,
    agentRoutePhases: route.phases,
    agentRoutePhase: route.phases[0],
  };
  await deps.saveJob(job);
  await deps.recordActivity({
    correlationId: job.correlationId,
    summary: `Document acquisition queued: ${job.query.slice(0, 80)}`,
    jobId: job.jobId,
  });
  return { jobId: job.jobId, correlationId: job.correlationId };
}

export async function advanceDocumentAcquisitionJob(
  deps: DocumentAcquisitionWorkerDeps,
  jobId: string,
): Promise<DocumentAcquisitionJob | undefined> {
  if (deps.autonomousKillSwitch || !deps.documentAcquisitionEnabled) return undefined;

  const job = await deps.listJobs().then((jobs) => jobs.find((j) => j.jobId === jobId));
  if (!job || job.stage === "completed" || job.stage === "failed" || job.stage === "cancelled") {
    return job;
  }

  let current = job;
  const apply = async (
    event: Parameters<typeof transitionDocumentAcquisitionJob>[1],
    ctx: Parameters<typeof transitionDocumentAcquisitionJob>[2] = {},
  ) => {
    const result = transitionDocumentAcquisitionJob(current, event, ctx);
    if (result.changed) {
      current = result.job;
      const routePhase = documentAcquisitionStageToRoutePhase(current.stage);
      if (routePhase) {
        current = { ...current, agentRoutePhase: routePhase };
      }
      await deps.saveJob(current);
      await deps.recordActivity({
        correlationId: current.correlationId,
        summary: `Document acquisition: ${current.stage}`,
        jobId: current.jobId,
      });
    }
  };

  if (current.stage === "queued") {
    await apply("START");
  }

  if (current.stage === "local_search") {
    let matches: typeof current.localMatches = [];
    if (deps.searchLocalVault) {
      const ragHits = await deps.searchLocalVault(current.query);
      matches = rankLocalVaultSearchHits(current.query, ragHits);
    }
    const bestRagScore = matches[0]?.score ?? 0;
    if (bestRagScore < 0.25) {
      const items = await deps.listLibraryItems(current.fileTitleHint ?? current.query);
      const lexical = items
        .map((item) => ({
          path: item.relativePath,
          title: item.title ?? item.relativePath,
          score: scoreDocumentTitleMatch(current.query, item.title ?? item.relativePath),
        }))
        .filter((m) => m.score > 0.2)
        .sort((a, b) => b.score - a.score);
      if (lexical.length > 0 && lexical[0]!.score > bestRagScore) {
        matches = lexical;
      }
    }
    current = { ...current, localMatches: matches };
    if (matches.length > 0 && matches[0]!.score >= 0.25) {
      current = {
        ...current,
        resultVaultPath: matches[0]!.path,
        updatedAt: new Date().toISOString(),
      };
      await deps.saveJob(current);
      await apply("LOCAL_HIT", { hasLocalMatch: true });
    } else {
      await apply("LOCAL_MISS");
    }
  }

  if (current.stage === "bonded_catalog") {
    const peers = await deps.discoverPublishedLibrary();
    const pathHint = current.pathHint ?? current.fileTitleHint;
    const candidates: DocumentAcquisitionCandidate[] = [];
    for (const peer of peers) {
      const ranked = (peer.files ?? [])
        .map((match) => ({
          match,
          score: scoreCatalogDocumentCandidate(current.query, match, pathHint),
        }))
        .sort((a, b) => b.score - a.score);
      const strong = ranked.filter((row) => row.score > 0.1).slice(0, 3);
      const picks = strong.length > 0 ? strong : ranked.slice(0, 1);
      for (const { match, score } of picks) {
        const title = match.title ?? match.relativePath ?? "document";
        candidates.push({
          candidateId: randomUUID(),
          sourceOwnerId: peer.peerOwnerId,
          sourcePeerId: peer.libp2pPeerId,
          libraryItemId: match.documentId,
          sourceRelativePath: match.relativePath,
          title,
          sensitivity: "friends",
          hopDistance: 0,
          score,
          status: "open",
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    current = { ...current, candidates: candidates.slice(0, 10) };
    await deps.saveJob(current);
    if (candidates.length > 0) {
      await apply("CATALOG_MATCH", { hasCandidates: true });
      await apply("CANDIDATES_READY", { hasCandidates: true });
    } else {
      await apply("CATALOG_MISS", { searchBondedOnly: deps.policy.searchBondedOnly });
    }
  }

  if (current.stage === "negotiating" && current.candidates.length > 0) {
    const maxRounds = deps.policy.maxNegotiationRounds;
    while (current.stage === "negotiating" && current.negotiationRound < maxRounds) {
      const openCandidates = current.candidates
        .filter((c) => c.status === "open" || c.status === "negotiating")
        .sort((a, b) => b.score - a.score);
      if (openCandidates.length === 0) {
        break;
      }

      let top = openCandidates[0]!;
      let matchScore = top.score;

      if (deps.queryPeerKnowledge || deps.executeRouteStep) {
        const routeExecutor = deps.executeRouteStep;
        let knowledge:
          | { ok: boolean; summary?: string; suggestedRelativePath?: string }
          | undefined = routeExecutor
          ? await tryExecuteDocumentAcquisitionRouteStep(
              { executeRouteStep: routeExecutor },
              current,
              "negotiate",
              top.sourceOwnerId,
            )
          : undefined;
        if (
          (!knowledge?.ok ||
            !isAcquisitionKnowledgeSummaryUseful(knowledge.summary ?? "", current.query)) &&
          deps.queryPeerKnowledge
        ) {
          const legacy = await deps.queryPeerKnowledge(
            top.sourceOwnerId,
            buildAcquisitionPeerKnowledgeQuery(current, top),
          );
          if (legacy.ok && legacy.answerText) {
            knowledge = {
              ok: true,
              summary: legacy.answerText,
              suggestedRelativePath: legacy.suggestedRelativePath,
            };
          }
        }
        if (knowledge?.ok && knowledge.summary) {
          const knowledgeScore = scoreDocumentKnowledgeNegotiation(
            current.query,
            knowledge.summary,
            top,
          );
          matchScore = Math.max(matchScore, knowledgeScore);
          const parsedPath = extractAcquisitionPathFromKnowledgeAnswer(
            knowledge.summary,
            top,
            knowledge.suggestedRelativePath,
          );
          if (parsedPath) {
            top = { ...top, sourceRelativePath: parsedPath };
            current = {
              ...current,
              candidates: current.candidates.map((c) =>
                c.candidateId === top.candidateId
                  ? { ...c, sourceRelativePath: parsedPath, score: matchScore }
                  : c,
              ),
            };
            await deps.saveJob(current);
          }
        }

        current = { ...current, negotiationRound: current.negotiationRound + 1 };
        current = {
          ...current,
          candidates: current.candidates.map((c) =>
            c.candidateId === top.candidateId
              ? { ...c, score: matchScore, status: "negotiating" as const }
              : c,
          ),
        };
        await deps.saveJob(current);
      } else {
        current = { ...current, negotiationRound: current.negotiationRound + 1 };
        await deps.saveJob(current);
      }

      if (matchScore >= 0.35 && top.sourceRelativePath) {
        const pullCandidate =
          current.candidates.find((c) => c.candidateId === top.candidateId) ?? top;
        let pulled = false;
        const routeExecutor = deps.executeRouteStep;
        if (routeExecutor) {
          const acquired = await tryExecuteDocumentAcquisitionRouteStep(
            { executeRouteStep: routeExecutor },
            current,
            "acquire",
            top.sourceOwnerId,
          );
          pulled = acquired?.ok === true && isRouteAcquireSummarySubstantive(acquired.summary ?? "");
        }
        if (!pulled && deps.requestShareFromLibrary) {
          pulled = await deps.requestShareFromLibrary(current, pullCandidate);
        }
        if (pulled) {
          current = {
            ...current,
            selectedCandidateId: pullCandidate.candidateId,
            candidates: current.candidates.map((c) =>
              c.candidateId === pullCandidate.candidateId ? { ...c, status: "matched" } : c,
            ),
          };
          await deps.saveJob(current);
          await apply("NEGOTIATION_MATCH");
          await apply("SHARE_REQUESTED");
          break;
        }
        current = {
          ...current,
          candidates: current.candidates.map((c) =>
            c.candidateId === top.candidateId ? { ...c, status: "rejected" as const } : c,
          ),
        };
        await deps.saveJob(current);
        continue;
      }

      current = {
        ...current,
        candidates: current.candidates.map((c) =>
          c.candidateId === top.candidateId ? { ...c, status: "negotiating" as const } : c,
        ),
      };
      await deps.saveJob(current);
    }

    if (current.stage === "negotiating") {
      await apply("NEGOTIATION_FAIL", { maxNegotiationRounds: maxRounds });
    }
  }

  if (current.stage === "awaiting_share_accept" && deps.listPendingShareOffers && deps.acceptShare) {
    const selected = current.candidates.find((c) => c.candidateId === current.selectedCandidateId);
    const offers = await deps.listPendingShareOffers();
    const offer =
      offers.find((o) => selected && o.senderOwnerId === selected.sourceOwnerId) ?? offers[0];
    if (offer) {
      const savePath = inboxPathForJob(current);
      await deps.acceptShare(offer.shareId, savePath);
      current = {
        ...current,
        resultShareId: offer.shareId,
        resultVaultPath: savePath,
        updatedAt: new Date().toISOString(),
      };
      await deps.saveJob(current);
      await apply("SHARE_ACCEPTED");
    }
  }

  if (current.stage === "transferring" && deps.isTransferVerified && current.resultShareId) {
    const verified = await deps.isTransferVerified(current.resultShareId);
    if (verified) {
      await apply("TRANSFER_OK");
    }
  }

  return current;
}

export async function runDocumentAcquisitionWorkerTick(
  deps: DocumentAcquisitionWorkerDeps,
): Promise<number> {
  if (deps.autonomousKillSwitch || !deps.documentAcquisitionEnabled) return 0;
  const active = await deps.listJobs(true);
  let advanced = 0;
  for (const job of active) {
    if (
      job.stage === "queued" ||
      job.stage === "local_search" ||
      job.stage === "bonded_catalog" ||
      job.stage === "negotiating" ||
      job.stage === "awaiting_share_accept" ||
      job.stage === "transferring"
    ) {
      await advanceDocumentAcquisitionJob(deps, job.jobId);
      advanced += 1;
    }
  }
  return advanced;
}
