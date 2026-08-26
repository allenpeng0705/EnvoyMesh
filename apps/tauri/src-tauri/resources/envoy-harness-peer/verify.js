/**
 * D5 — cross-instance verification: an orchestrator asks a peer (with a
 * DIFFERENT model, when routed that way) to verify a result via
 * `peer/verify`. The standalone analog of the mesh's chainVerify.
 */
export function createCrossInstanceVerifier(registry) {
    return async (request) => {
        const entry = request.verifierPeerId !== undefined
            ? registry.get(request.verifierPeerId)
            : request.verifierModel !== undefined
                ? registry.pickByModel(request.verifierModel)
                : undefined;
        if (entry === undefined) {
            const hint = request.verifierModel !== undefined
                ? ` (model ${request.verifierModel})`
                : "";
            throw new Error(`no peer available for cross-instance verify${hint}`);
        }
        const verdicts = await entry.client.verify({ result: request.result, objective: request.objective }, request.signal);
        return {
            verdicts,
            verifierPeerId: entry.id,
            ...(entry.model !== undefined ? { verifierModel: entry.model } : {}),
        };
    };
}
//# sourceMappingURL=verify.js.map