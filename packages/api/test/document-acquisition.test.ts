import { describe, expect, it } from "vitest";
import {
  buildAcquisitionPeerKnowledgeQuery,
  createDocumentAcquisitionJob,
  extractAcquisitionPathFromKnowledgeAnswer,
  isAcquisitionKnowledgeSummaryUseful,
  isAcquisitionRefusalAnswer,
  isRouteAcquireSummarySubstantive,
  looksLikeVaultRelativePath,
  rankLocalVaultSearchHits,
  scoreCatalogDocumentCandidate,
  scoreDocumentKnowledgeNegotiation,
  scoreDocumentTitleMatch,
  transitionDocumentAcquisitionJob,
} from "../src/document-acquisition.js";

describe("document acquisition job", () => {
  it("starts from queued to local_search", () => {
    const job = createDocumentAcquisitionJob({ postureRef: "m1", query: "ed25519 security" });
    const { job: next, changed } = transitionDocumentAcquisitionJob(job, "START");
    expect(changed).toBe(true);
    expect(next.stage).toBe("local_search");
  });

  it("completes on local hit", () => {
    let job = createDocumentAcquisitionJob({ postureRef: "m1", query: "notes" });
    job = transitionDocumentAcquisitionJob(job, "START").job;
    const done = transitionDocumentAcquisitionJob(job, "LOCAL_HIT", { hasLocalMatch: true });
    expect(done.job.stage).toBe("completed");
  });

  it("scores title overlap", () => {
    expect(scoreDocumentTitleMatch("ed25519 mesh security", "Ed25519 Security Draft")).toBeGreaterThan(0.3);
  });

  it("scores catalog candidate using path hint", () => {
    const score = scoreCatalogDocumentCandidate(
      "mesh networking paper",
      { title: "notes.txt", relativePath: "shared/mesh-networking.pdf" },
      "mesh-networking",
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it("builds structured peer knowledge query", () => {
    const q = buildAcquisitionPeerKnowledgeQuery(
      { query: "Ed25519 draft", fileTitleHint: "security" },
      { title: "unrelated", sourceRelativePath: "shared/draft.pdf" },
    );
    expect(q).toContain("metadata only");
    expect(q).toContain("relativePath");
    expect(q).toContain("Ed25519 draft");
  });

  it("scores RAG negotiation answer with path on first line", () => {
    const score = scoreDocumentKnowledgeNegotiation(
      "acq catalog",
      "shared/acq-catalog.txt\nThis file matches the acquisition catalog request.",
      { title: "unrelated", sourceRelativePath: "shared/acq-catalog.txt" },
    );
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("extracts relative path from knowledge answer", () => {
    expect(
      extractAcquisitionPathFromKnowledgeAnswer("shared/paper.pdf\nMatches your query."),
    ).toBe("shared/paper.pdf");
  });

  it("extracts paths with spaces and unicode segments", () => {
    expect(
      extractAcquisitionPathFromKnowledgeAnswer(
        'knowledge/private/Ed25519 Spec (draft).pdf\nMatches your query.',
      ),
    ).toBe("knowledge/private/Ed25519 Spec (draft).pdf");
    expect(looksLikeVaultRelativePath("knowledge/private/Ed25519 Spec (draft).pdf")).toBe(true);
  });

  it("prefers suggestedRelativePath from knowledge.response payload", () => {
    expect(
      extractAcquisitionPathFromKnowledgeAnswer(
        "This item matches your Ed25519 mesh security query.",
        undefined,
        "shared/ed25519-draft.pdf",
      ),
    ).toBe("shared/ed25519-draft.pdf");
  });

  it("does not treat incidental no match in long RAG text as refusal", () => {
    const longAnswer =
      "shared/report.pdf\n" +
      "This document discusses prior attempts that were no match for the legacy protocol. " +
      "The Ed25519 mesh security specification section begins on page 3 with signing conventions.";
    expect(isAcquisitionRefusalAnswer(longAnswer)).toBe(false);
    expect(
      scoreDocumentKnowledgeNegotiation("Ed25519 mesh security specification", longAnswer, {
        title: "report.pdf",
        sourceRelativePath: "shared/report.pdf",
      }),
    ).toBeGreaterThan(0);
  });

  it("treats explicit first-line refusal as no match", () => {
    expect(isAcquisitionRefusalAnswer("no match")).toBe(true);
    expect(scoreDocumentKnowledgeNegotiation("acq catalog", "no match")).toBe(0);
  });

  it("rejects vacuous route-executor summaries for legacy fallback", () => {
    expect(isAcquisitionKnowledgeSummaryUseful("ok", "Ed25519 draft")).toBe(false);
    expect(
      isAcquisitionKnowledgeSummaryUseful(
        "shared/draft.pdf\nEd25519 mesh security specification draft.",
        "Ed25519 draft",
      ),
    ).toBe(true);
    expect(isRouteAcquireSummarySubstantive("ok")).toBe(false);
    expect(isRouteAcquireSummarySubstantive("share request sent for shared/draft.pdf")).toBe(true);
  });

  it("ranks local vault RAG hits above pure lexical miss", () => {
    const ranked = rankLocalVaultSearchHits("ed25519 security", [
      { relativePath: "shared/ed25519-draft.pdf", title: "Ed25519 Security Draft", ragScore: 8.5 },
      { relativePath: "other.txt", title: "misc", ragScore: 0.5 },
    ]);
    expect(ranked[0]?.path).toBe("shared/ed25519-draft.pdf");
    expect(ranked[0]?.score).toBeGreaterThan(0.25);
  });

  it("normalizes vector-scale RAG scores (0–1) for local_search threshold", () => {
    const ranked = rankLocalVaultSearchHits("Ed25519 mesh security", [
      { relativePath: "knowledge/public/spec.md", title: "spec", ragScore: 0.82 },
    ]);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(0.25);
  });
});
