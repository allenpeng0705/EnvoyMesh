/**
 * Operator helpers for docs/wan-connectivity-signoff.md ledger rows (Phase 15B).
 */
import type { ConnectivityDiagnostics } from "./node-service.js";
export interface WanSignOffEvidenceInput {
    /** ISO date (YYYY-MM-DD); defaults to today UTC. */
    date?: string;
    commitSha?: string;
    operator?: string;
    topology?: string;
    peerId?: string;
    relayAddr?: string;
    /** When true, formats the physical two-NAT ledger row (§4 manual). */
    physicalTwoNat?: boolean;
    /** §4 relay column: ok / partial / pending */
    relaySignOff?: "ok" | "partial" | "pending";
    dcutrSignOff?: "ok" | "partial" | "pending" | "n/a";
    quicSignOff?: "ok" | "partial" | "pending" | "n/a";
    notes?: string;
    diagnostics?: Pick<ConnectivityDiagnostics, "axes" | "stageD" | "nodeOnline">;
}
export declare function formatWanSignOffLedgerRow(input: WanSignOffEvidenceInput): string;
export declare function formatWanSignOffEvidenceReport(input: WanSignOffEvidenceInput): string;
//# sourceMappingURL=wan-signoff-evidence.d.ts.map