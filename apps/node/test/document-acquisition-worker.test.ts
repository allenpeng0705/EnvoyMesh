import { describe, expect, it, vi } from "vitest";
import {
  createDocumentAcquisitionJob,
  type DocumentAcquisitionCandidate,
  type DocumentAcquisitionJob,
} from "@envoymesh/api";
import {
  advanceDocumentAcquisitionJob,
  inboxPathForJob,
} from "../src/document-acquisition-worker.js";

function candidate(overrides: Partial<DocumentAcquisitionCandidate> = {}): DocumentAcquisitionCandidate {
  return {
    candidateId: "c1",
    sourceOwnerId: "envoy:owner:bob",
    sourcePeerId: "peer-bob",
    sourceRelativePath: "shared/doc.txt",
    title: "unrelated title",
    sensitivity: "friends",
    hopDistance: 0,
    score: 0.1,
    status: "open",
    ...overrides,
  };
}

function baseDeps(overrides: Partial<Parameters<typeof advanceDocumentAcquisitionJob>[0]> = {}) {
  let job = createDocumentAcquisitionJob({ postureRef: "m1", query: "acq catalog" });
  job = {
    ...job,
    stage: "negotiating",
    candidates: [candidate()],
    negotiationRound: 0,
  };
  const saved: DocumentAcquisitionJob[] = [];
  return {
    documentAcquisitionEnabled: true,
    autonomousKillSwitch: false,
    postureRef: "m1",
    policy: {
      searchBondedOnly: true,
      maxNegotiationRounds: 3,
      maxActiveJobs: 2,
      jobTtlHours: 72,
    },
    listJobs: async () => [job],
    saveJob: async (j: DocumentAcquisitionJob) => {
      job = j;
      saved.push(j);
    },
    listLibraryItems: async () => [],
    discoverPublishedLibrary: async () => [],
    recordActivity: async () => {},
    ...overrides,
    get job() {
      return job;
    },
    get saved() {
      return saved;
    },
  };
}

describe("document acquisition worker negotiation", () => {
  it("runs multiple knowledge.query rounds before pull-share match", async () => {
    const queryPeerKnowledge = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, answerText: "still weak" })
      .mockResolvedValueOnce({ ok: true, answerText: "acq catalog document" });
    const requestShareFromLibrary = vi.fn().mockResolvedValue(true);

    const deps = baseDeps({ queryPeerKnowledge, requestShareFromLibrary });
    const result = await advanceDocumentAcquisitionJob(deps, deps.job.jobId);

    expect(queryPeerKnowledge).toHaveBeenCalledTimes(2);
    expect(queryPeerKnowledge.mock.calls[0]?.[1]).toContain("metadata only");
    expect(requestShareFromLibrary).toHaveBeenCalledTimes(1);
    expect(result?.stage).toBe("awaiting_share_accept");
    expect(result?.negotiationRound).toBe(2);
  });

  it("fails after max negotiation rounds with no match", async () => {
    const queryPeerKnowledge = vi.fn().mockResolvedValue({ ok: true, answerText: "no overlap" });
    const deps = baseDeps({
      queryPeerKnowledge,
      policy: {
        searchBondedOnly: true,
        maxNegotiationRounds: 2,
        maxActiveJobs: 2,
        jobTtlHours: 72,
      },
    });
    const result = await advanceDocumentAcquisitionJob(deps, deps.job.jobId);

    expect(queryPeerKnowledge).toHaveBeenCalledTimes(2);
    expect(result?.stage).toBe("failed");
    expect(result?.negotiationRound).toBe(2);
  });

  it("pulls share using path parsed from knowledge answer", async () => {
    const queryPeerKnowledge = vi.fn().mockResolvedValue({
      ok: true,
      answerText: "shared/ed25519-draft.pdf\nEd25519 mesh security specification matches.",
    });
    const requestShareFromLibrary = vi.fn().mockResolvedValue(true);

    const deps = baseDeps({
      queryPeerKnowledge,
      requestShareFromLibrary,
    });
    let job = createDocumentAcquisitionJob({
      postureRef: "m1",
      query: "Ed25519 mesh security specification",
    });
    job = {
      ...job,
      stage: "negotiating",
      negotiationRound: 0,
      candidates: [
        candidate({
          title: "obscure-x7f9.dat",
          sourceRelativePath: "shared/obscure-x7f9.dat",
          score: 0.05,
        }),
      ],
    };
    const saved: DocumentAcquisitionJob[] = [];
    const fullDeps = {
      ...deps,
      listJobs: async () => [job],
      saveJob: async (j: DocumentAcquisitionJob) => {
        job = j;
        saved.push(j);
      },
      get job() {
        return job;
      },
    };

    const result = await advanceDocumentAcquisitionJob(fullDeps, job.jobId);

    expect(requestShareFromLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Ed25519 mesh security specification" }),
      expect.objectContaining({ sourceRelativePath: "shared/ed25519-draft.pdf" }),
    );
    expect(result?.stage).toBe("awaiting_share_accept");
  });

  it("falls back to legacy knowledge when route executor returns vacuous ok", async () => {
    const executeRouteStep = vi.fn().mockResolvedValue({ ok: true, summary: "ok" });
    const queryPeerKnowledge = vi.fn().mockResolvedValue({
      ok: true,
      answerText: "shared/acq-catalog.txt\nThis file matches the acquisition catalog request.",
    });
    const requestShareFromLibrary = vi.fn().mockResolvedValue(true);

    let job = createDocumentAcquisitionJob({ postureRef: "m1", query: "acq catalog" });
    job = {
      ...job,
      agentRouteId: "document.published-library",
      stage: "negotiating",
      negotiationRound: 0,
      candidates: [candidate({ score: 0.05 })],
    };
    const deps: Parameters<typeof advanceDocumentAcquisitionJob>[0] = {
      documentAcquisitionEnabled: true,
      autonomousKillSwitch: false,
      postureRef: "m1",
      policy: {
        searchBondedOnly: true,
        maxNegotiationRounds: 3,
        maxActiveJobs: 2,
        jobTtlHours: 72,
      },
      listJobs: async () => [job],
      saveJob: async (j: DocumentAcquisitionJob) => {
        job = j;
      },
      listLibraryItems: async () => [],
      discoverPublishedLibrary: async () => [],
      recordActivity: async () => {},
      executeRouteStep,
      queryPeerKnowledge,
      requestShareFromLibrary,
    };

    const result = await advanceDocumentAcquisitionJob(deps, job.jobId);

    expect(executeRouteStep).toHaveBeenCalled();
    expect(queryPeerKnowledge).toHaveBeenCalledTimes(1);
    expect(requestShareFromLibrary).toHaveBeenCalledTimes(1);
    expect(result?.stage).toBe("awaiting_share_accept");
  });

  it("does not advance to awaiting_share_accept without a pull-share request", async () => {
    let job = createDocumentAcquisitionJob({ postureRef: "m1", query: "acq catalog" });
    job = {
      ...job,
      stage: "negotiating",
      negotiationRound: 0,
      candidates: [candidate({ score: 0.5, sourceRelativePath: undefined })],
    };
    const deps: Parameters<typeof advanceDocumentAcquisitionJob>[0] = {
      documentAcquisitionEnabled: true,
      autonomousKillSwitch: false,
      postureRef: "m1",
      policy: {
        searchBondedOnly: true,
        maxNegotiationRounds: 2,
        maxActiveJobs: 2,
        jobTtlHours: 72,
      },
      listJobs: async () => [job],
      saveJob: async (j: DocumentAcquisitionJob) => {
        job = j;
      },
      listLibraryItems: async () => [],
      discoverPublishedLibrary: async () => [],
      recordActivity: async () => {},
    };
    const result = await advanceDocumentAcquisitionJob(deps, job.jobId);
    expect(result?.stage).toBe("failed");
    expect(result?.stage).not.toBe("awaiting_share_accept");
  });
});

describe("document acquisition worker local_search", () => {
  it("falls back to lexical title search when RAG scores stay below threshold", async () => {
    let job = createDocumentAcquisitionJob({ postureRef: "m1", query: "acq catalog" });
    job = { ...job, stage: "local_search" };

    const searchLocalVault = vi.fn().mockResolvedValue([
      { relativePath: "noise.txt", title: "noise", ragScore: 2 },
    ]);
    const listLibraryItems = vi.fn().mockResolvedValue([
      { relativePath: "shared/acq-catalog.txt", title: "acq-catalog" },
    ]);

    const deps: Parameters<typeof advanceDocumentAcquisitionJob>[0] = {
      documentAcquisitionEnabled: true,
      autonomousKillSwitch: false,
      postureRef: "m1",
      policy: {
        searchBondedOnly: true,
        maxNegotiationRounds: 3,
        maxActiveJobs: 2,
        jobTtlHours: 72,
      },
      listJobs: async () => [job],
      saveJob: async (j: DocumentAcquisitionJob) => {
        job = j;
      },
      listLibraryItems,
      searchLocalVault,
      discoverPublishedLibrary: async () => [],
      recordActivity: async () => {},
    };

    const result = await advanceDocumentAcquisitionJob(deps, job.jobId);

    expect(searchLocalVault).toHaveBeenCalled();
    expect(listLibraryItems).toHaveBeenCalled();
    expect(result?.stage).toBe("completed");
    expect(result?.resultVaultPath).toBe("shared/acq-catalog.txt");
  });
});

describe("document acquisition worker bonded_catalog", () => {
  it("keeps at least one candidate per peer when catalog scores are low", async () => {
    let job = createDocumentAcquisitionJob({
      postureRef: "m1",
      query: "Ed25519 mesh security specification",
    });
    job = { ...job, stage: "bonded_catalog" };

    const discoverPublishedLibrary = vi.fn().mockResolvedValue([
      {
        peerOwnerId: "envoy:owner:bob",
        libp2pPeerId: "peer-bob",
        files: [{ documentId: "d1", relativePath: "shared/obscure-x7f9.dat", title: "obscure-x7f9.dat" }],
      },
    ]);

    const deps: Parameters<typeof advanceDocumentAcquisitionJob>[0] = {
      documentAcquisitionEnabled: true,
      autonomousKillSwitch: false,
      postureRef: "m1",
      policy: {
        searchBondedOnly: true,
        maxNegotiationRounds: 3,
        maxActiveJobs: 2,
        jobTtlHours: 72,
      },
      listJobs: async () => [job],
      saveJob: async (j: DocumentAcquisitionJob) => {
        job = j;
      },
      listLibraryItems: async () => [],
      discoverPublishedLibrary,
      recordActivity: async () => {},
    };

    const result = await advanceDocumentAcquisitionJob(deps, job.jobId);

    expect(result?.candidates).toHaveLength(1);
    expect(result?.candidates[0]?.sourceRelativePath).toBe("shared/obscure-x7f9.dat");
    expect(result?.candidates[0]?.score).toBeLessThanOrEqual(0.1);
    expect(result?.stage).not.toBe("bonded_catalog");
  });
});

describe("inboxPathForJob (Phase 57E)", () => {
  it("preserves extractable extension from pathHint", () => {
    expect(
      inboxPathForJob({
        jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        query: "quarterly report",
        pathHint: "shared/reports/q1.docx",
      }),
    ).toMatch(/^inbox\/acq-quarterly-report\.docx$/);
  });

  it("preserves extension from fileTitleHint", () => {
    expect(
      inboxPathForJob({
        jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        query: "briefing",
        fileTitleHint: "Board Brief.pdf",
      }),
    ).toMatch(/^inbox\/acq-board-brief\.pdf$/);
  });

  it("falls back to .bin when no extension is hinted", () => {
    expect(
      inboxPathForJob({
        jobId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        query: "mystery blob",
        fileTitleHint: "mystery blob",
      }),
    ).toMatch(/^inbox\/acq-mystery-blob\.bin$/);
  });
});
