/**
 * Operator checklist for physical two-NAT WAN §4 sign-off (Phase 15B).
 */
export interface WanTwoNatChecklistStep {
    id: string;
    title: string;
    detail: string;
}
export declare const WAN_TWO_NAT_CHECKLIST_STEPS: WanTwoNatChecklistStep[];
export interface WanTwoNatSignOffInput {
    relayAddr?: string;
    natAPeerId?: string;
    natBPeerId?: string;
    operator?: string;
    chatVerified?: boolean;
    automatedBaselineOk?: boolean;
}
export declare function formatWanTwoNatOperatorChecklist(input?: WanTwoNatSignOffInput): string;
//# sourceMappingURL=wan-two-nat-checklist.d.ts.map