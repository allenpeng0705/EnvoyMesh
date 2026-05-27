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
export declare const DEFAULT_DOCUMENT_AUTONOMY_POLICY: DocumentAutonomyPolicy;
export declare function normalizeDocumentAutonomyPolicy(partial?: Partial<DocumentAutonomyPolicy>): DocumentAutonomyPolicy;
export declare function canAutonomousShareFile(input: {
    policy: DocumentAutonomyPolicy;
    bondLevel: BondLevel;
    sensitivity: "public" | "friends" | "private";
}): boolean;
export declare function canAutonomousPublishMetadata(policy: DocumentAutonomyPolicy): boolean;
//# sourceMappingURL=document-autonomy.d.ts.map