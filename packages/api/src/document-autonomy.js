export const DEFAULT_DOCUMENT_AUTONOMY_POLICY = {
    maxAutonomousShareTier: 0,
    autonomousShareBondLevels: ["direct"],
    autonomousShareMaxSensitivity: "friends",
    allowAutonomousPublish: false,
    autonomousPublishMaxSensitivity: "public",
};
export function normalizeDocumentAutonomyPolicy(partial) {
    const tier = partial?.maxAutonomousShareTier;
    return {
        maxAutonomousShareTier: tier === 1 || tier === 2 ? tier : 0,
        autonomousShareBondLevels: partial?.autonomousShareBondLevels?.length ? [...partial.autonomousShareBondLevels] : ["direct"],
        autonomousShareMaxSensitivity: partial?.autonomousShareMaxSensitivity === "public" ? "public" : "friends",
        allowAutonomousPublish: partial?.allowAutonomousPublish === true,
        autonomousPublishMaxSensitivity: "public",
    };
}
const SENSITIVITY_RANK = {
    public: 0,
    friends: 1,
    private: 2,
};
export function canAutonomousShareFile(input) {
    const { policy, bondLevel, sensitivity } = input;
    if (policy.maxAutonomousShareTier < 2)
        return false;
    if (bondLevel === "blocked")
        return false;
    if (!policy.autonomousShareBondLevels.includes(bondLevel))
        return false;
    return (SENSITIVITY_RANK[sensitivity] <= SENSITIVITY_RANK[policy.autonomousShareMaxSensitivity]);
}
export function canAutonomousPublishMetadata(policy) {
    return policy.allowAutonomousPublish && policy.maxAutonomousShareTier >= 1;
}
//# sourceMappingURL=document-autonomy.js.map