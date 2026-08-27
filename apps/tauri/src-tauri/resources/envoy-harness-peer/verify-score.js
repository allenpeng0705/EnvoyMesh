/**
 * D5 — the combined flow: cross-instance verify a result, then record the
 * `VerdictEntry` on the local scoreboard.
 */
import { combinePeerVerdicts } from "./scoreboard.js";
export function createVerifiedScoreKeeper(options) {
    return async (request) => {
        const outcome = await options.verifier(request);
        const entry = {
            chainId: request.chainId,
            subtaskId: request.subtaskId,
            workerPeerId: request.workerPeerId,
            workerRuntime: request.workerRuntime,
            skillId: request.skillId,
            verdict: combinePeerVerdicts(outcome.verdicts),
            source: "llm",
            ...(outcome.verifierModel !== undefined
                ? { verifierModel: outcome.verifierModel }
                : {}),
            issuedBy: options.orchestratorPeerId,
            issuedAt: new Date().toISOString(),
            signature: "",
        };
        options.scoreboard.record(entry);
        return entry;
    };
}
//# sourceMappingURL=verify-score.js.map