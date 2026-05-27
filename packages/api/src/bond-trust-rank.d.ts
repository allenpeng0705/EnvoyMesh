export type BondLevel = "direct" | "referred" | "public" | "blocked";
/** Lower is stronger trust — useful for sorting contacts / discovery results. */
export declare function bondTrustRank(level: BondLevel): number;
//# sourceMappingURL=bond-trust-rank.d.ts.map