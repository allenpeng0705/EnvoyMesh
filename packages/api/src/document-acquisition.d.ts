import type { Sensitivity } from "@envoymesh/protocol";
export type DocumentAcquisitionStage = "queued" | "local_search" | "bonded_catalog" | "wider_discovery" | "awaiting_forward_approval" | "candidate_ranking" | "negotiating" | "share_requested" | "awaiting_share_accept" | "transferring" | "completed" | "failed" | "approval_needed" | "cancelled";
export type DocumentAcquisitionEvent = "START" | "LOCAL_HIT" | "LOCAL_MISS" | "CATALOG_MATCH" | "CATALOG_MISS" | "WIDER_START" | "FORWARD_APPROVAL_NEEDED" | "FORWARD_APPROVED" | "CANDIDATES_READY" | "NEGOTIATION_MATCH" | "NEGOTIATION_FAIL" | "SHARE_REQUESTED" | "SHARE_ACCEPTED" | "TRANSFER_OK" | "TRANSFER_FAIL" | "APPROVAL_NEEDED" | "APPROVAL_GRANTED" | "KILL_SWITCH";
export interface DocumentAcquisitionCandidate {
    candidateId: string;
    sourceOwnerId: string;
    sourcePeerId?: string;
    libraryItemId?: string;
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
export declare function isDocumentAcquisitionTerminal(stage: DocumentAcquisitionStage): boolean;
export declare function transitionDocumentAcquisitionJob(job: DocumentAcquisitionJob, event: DocumentAcquisitionEvent, ctx?: DocumentAcquisitionTransitionContext): {
    job: DocumentAcquisitionJob;
    changed: boolean;
};
export declare function createDocumentAcquisitionJob(input: {
    postureRef: string;
    query: string;
    fileTitleHint?: string;
    pathHint?: string;
    correlationId?: string;
    jobTtlHours?: number;
}): DocumentAcquisitionJob;
/** Token overlap score for candidate ranking (deterministic v1). */
export declare function scoreDocumentTitleMatch(query: string, title: string): number;
//# sourceMappingURL=document-acquisition.d.ts.map