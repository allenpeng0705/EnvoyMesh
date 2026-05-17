import type { BondRecord } from "@envoymesh/api";
/** Display label for a bond contact. */
export declare function contactLabel(contact: Partial<BondRecord> & {
    peerOwnerId: string;
}): string;
/** Display label for a message sender. */
export declare function peerDisplayLabel(sender: {
    displayName?: string;
    nodeId?: string;
}): string;
/** Suggested interest topics shown in search and profile views. */
export declare const SUGGESTED_TOPICS: string[];
//# sourceMappingURL=display.d.ts.map