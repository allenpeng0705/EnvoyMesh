/**
 * D5 — `PeerScoreboard`: local reputation over `VerdictEntry` records
 * (the shared mesh schema, so the records federate into EnvoyMesh's
 * arbitration store later).
 */
import type { Verdict, VerdictEntry } from "@envoymesh/protocol";
export interface PeerReputation {
    score: number;
    passCount: number;
    failCount: number;
    partialCount: number;
    entries: readonly VerdictEntry[];
}
export declare class PeerScoreboard {
    #private;
    /** Append a verdict record (immutable history). */
    record(entry: VerdictEntry): void;
    list(): readonly VerdictEntry[];
    /** Aggregate reputation for one `(peerId, skillId)` pair. */
    reputationFor(workerPeerId: string, skillId: string): PeerReputation;
    clear(): void;
}
/** OR-of-pass, AND-of-fail, else disputed (the mesh's combination rule). */
export declare function combinePeerVerdicts(verdicts: readonly Verdict[]): Verdict;
//# sourceMappingURL=scoreboard.d.ts.map