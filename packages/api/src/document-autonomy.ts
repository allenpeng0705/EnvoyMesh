import type { BondLevel } from "./bond-trust-rank.js";

export type DocumentAutonomyShareTier = 0 | 1 | 2;

export interface DocumentAutonomyPolicy {
  /** Max tier for autonomous outbound shareFile (0 = proposals only). */
  maxAutonomousShareTier: DocumentAutonomyShareTier;
  /** Bond levels eligible for autonomous share (default: direct only). */
  autonomousShareBondLevels: BondLevel[];
  /** Max sensitivity for autonomous share (default: friends). */
  autonomousShareMaxSensitivity: "public" | "friends";
  /** Allow agent to call setLibraryItemPublished without owner Inbox step. */
  allowAutonomousPublish: boolean;
  /** Published metadata sensitivity ceiling when autonomous publish is enabled. */
  autonomousPublishMaxSensitivity: "public";
}

export const DEFAULT_DOCUMENT_AUTONOMY_POLICY: DocumentAutonomyPolicy = {
  maxAutonomousShareTier: 0,
  autonomousShareBondLevels: ["direct"],
  autonomousShareMaxSensitivity: "friends",
  allowAutonomousPublish: false,
  autonomousPublishMaxSensitivity: "public",
};

export function normalizeDocumentAutonomyPolicy(
  partial?: Partial<DocumentAutonomyPolicy>,
): DocumentAutonomyPolicy {
  const tier = partial?.maxAutonomousShareTier;
  return {
    maxAutonomousShareTier: tier === 1 || tier === 2 ? tier : 0,
    autonomousShareBondLevels:
      partial?.autonomousShareBondLevels?.length ? [...partial.autonomousShareBondLevels] : ["direct"],
    autonomousShareMaxSensitivity:
      partial?.autonomousShareMaxSensitivity === "public" ? "public" : "friends",
    allowAutonomousPublish: partial?.allowAutonomousPublish === true,
    autonomousPublishMaxSensitivity: "public",
  };
}

const SENSITIVITY_RANK: Record<"public" | "friends" | "private", number> = {
  public: 0,
  friends: 1,
  private: 2,
};

export function canAutonomousShareFile(input: {
  policy: DocumentAutonomyPolicy;
  bondLevel: BondLevel;
  sensitivity: "public" | "friends" | "private";
}): boolean {
  const { policy, bondLevel, sensitivity } = input;
  if (policy.maxAutonomousShareTier < 2) return false;
  if (bondLevel === "blocked") return false;
  if (!policy.autonomousShareBondLevels.includes(bondLevel)) return false;
  return (
    SENSITIVITY_RANK[sensitivity] <= SENSITIVITY_RANK[policy.autonomousShareMaxSensitivity]
  );
}

export function canAutonomousPublishMetadata(policy: DocumentAutonomyPolicy): boolean {
  return policy.allowAutonomousPublish && policy.maxAutonomousShareTier >= 1;
}
