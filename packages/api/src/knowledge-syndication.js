const SYNDICATION_RANK = {
    public: 0,
    friends: 1,
    private: 2,
};
/** Clamp bond-allowed sensitivity to the owner syndication ceiling. */
export function clampKnowledgeSyndicationSensitivity(allowed, ceiling) {
    if (!ceiling)
        return allowed;
    return SYNDICATION_RANK[allowed] <= SYNDICATION_RANK[ceiling] ? allowed : ceiling;
}
/** Map syndication sensitivity to vault knowledge-access tier for inbound peer queries. */
export function syndicationSensitivityToKnowledgeAccess(sensitivity) {
    if (sensitivity === "private")
        return "personal";
    if (sensitivity === "friends")
        return "professional";
    return "public";
}
/** Apply global then per-contact syndication ceilings to bond-allowed sensitivity. */
export function resolveKnowledgeSyndicationSensitivity(bondAllowed, globalCeiling, contactCeiling) {
    const afterGlobal = clampKnowledgeSyndicationSensitivity(bondAllowed, globalCeiling);
    return clampKnowledgeSyndicationSensitivity(afterGlobal, contactCeiling);
}
//# sourceMappingURL=knowledge-syndication.js.map