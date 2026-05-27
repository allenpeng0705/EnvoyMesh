/** Owner-configured ceiling for peer `knowledge.query` vault syndication (Phase 14B). */
export type KnowledgeSyndicationSensitivity = "public" | "friends" | "private";
/** Clamp bond-allowed sensitivity to the owner syndication ceiling. */
export declare function clampKnowledgeSyndicationSensitivity(allowed: KnowledgeSyndicationSensitivity, ceiling?: KnowledgeSyndicationSensitivity): KnowledgeSyndicationSensitivity;
/** Map syndication sensitivity to vault knowledge-access tier for inbound peer queries. */
export declare function syndicationSensitivityToKnowledgeAccess(sensitivity: KnowledgeSyndicationSensitivity): "public" | "professional" | "personal";
/** Apply global then per-contact syndication ceilings to bond-allowed sensitivity. */
export declare function resolveKnowledgeSyndicationSensitivity(bondAllowed: KnowledgeSyndicationSensitivity, globalCeiling?: KnowledgeSyndicationSensitivity, contactCeiling?: KnowledgeSyndicationSensitivity): KnowledgeSyndicationSensitivity;
//# sourceMappingURL=knowledge-syndication.d.ts.map