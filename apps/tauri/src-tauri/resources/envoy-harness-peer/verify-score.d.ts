/**
 * D5 — the combined flow: cross-instance verify a result, then record the
 * `VerdictEntry` on the local scoreboard.
 */
import type { VerdictEntry } from "@envoymesh/protocol";
import type { CrossInstanceVerifier, CrossVerifyRequest } from "./verify.js";
import { type PeerScoreboard } from "./scoreboard.js";
export interface VerifyAndRecordRequest extends CrossVerifyRequest {
    /** The worker whose result is being judged. */
    workerPeerId: string;
    /** The worker's runtime (advertised in the result). */
    workerRuntime: "envoy-harness";
    /** The skill that was run. */
    skillId: string;
    /** A correlation/chain id for the record. */
    chainId: string;
    /** A correlation/subtask id for the record. */
    subtaskId: string;
}
export declare function createVerifiedScoreKeeper(options: {
    verifier: CrossInstanceVerifier;
    scoreboard: PeerScoreboard;
    /** The orchestrator's peerId (stamped as `issuedBy`). */
    orchestratorPeerId: string;
}): (request: VerifyAndRecordRequest) => Promise<VerdictEntry>;
//# sourceMappingURL=verify-score.d.ts.map