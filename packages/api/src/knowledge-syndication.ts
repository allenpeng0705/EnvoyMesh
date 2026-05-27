/** Owner-configured ceiling for peer `knowledge.query` vault syndication (Phase 14B). */
export type KnowledgeSyndicationSensitivity = "public" | "friends" | "private";

const SYNDICATION_RANK: Record<KnowledgeSyndicationSensitivity, number> = {
  public: 0,
  friends: 1,
  private: 2,
};

/** Clamp bond-allowed sensitivity to the owner syndication ceiling. */
export function clampKnowledgeSyndicationSensitivity(
  allowed: KnowledgeSyndicationSensitivity,
  ceiling?: KnowledgeSyndicationSensitivity,
): KnowledgeSyndicationSensitivity {
  if (!ceiling) return allowed;
  return SYNDICATION_RANK[allowed] <= SYNDICATION_RANK[ceiling] ? allowed : ceiling;
}

/** Map syndication sensitivity to vault knowledge-access tier for inbound peer queries. */
export function syndicationSensitivityToKnowledgeAccess(
  sensitivity: KnowledgeSyndicationSensitivity,
): "public" | "professional" | "personal" {
  if (sensitivity === "private") return "personal";
  if (sensitivity === "friends") return "professional";
  return "public";
}

/** Apply global then per-contact syndication ceilings to bond-allowed sensitivity. */
export function resolveKnowledgeSyndicationSensitivity(
  bondAllowed: KnowledgeSyndicationSensitivity,
  globalCeiling?: KnowledgeSyndicationSensitivity,
  contactCeiling?: KnowledgeSyndicationSensitivity,
): KnowledgeSyndicationSensitivity {
  const afterGlobal = clampKnowledgeSyndicationSensitivity(bondAllowed, globalCeiling);
  return clampKnowledgeSyndicationSensitivity(afterGlobal, contactCeiling);
}
