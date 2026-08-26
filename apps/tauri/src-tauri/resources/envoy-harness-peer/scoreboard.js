/**
 * D5 — `PeerScoreboard`: local reputation over `VerdictEntry` records
 * (the shared mesh schema, so the records federate into EnvoyMesh's
 * arbitration store later).
 */
export class PeerScoreboard {
    #entries = [];
    /** Append a verdict record (immutable history). */
    record(entry) {
        this.#entries.push(entry);
    }
    list() {
        return [...this.#entries];
    }
    /** Aggregate reputation for one `(peerId, skillId)` pair. */
    reputationFor(workerPeerId, skillId) {
        const entries = this.#entries.filter((e) => e.workerPeerId === workerPeerId && e.skillId === skillId);
        let weighted = 0;
        let passCount = 0;
        let failCount = 0;
        let partialCount = 0;
        for (const e of entries) {
            if (e.verdict.kind === "pass") {
                passCount++;
                weighted += e.verdict.score;
            }
            else if (e.verdict.kind === "fail") {
                failCount++;
            }
            else {
                partialCount++;
            }
        }
        const score = entries.length === 0
            ? 0
            : Math.min(1, Math.max(0, weighted / entries.length));
        return { score, passCount, failCount, partialCount, entries };
    }
    clear() {
        this.#entries.length = 0;
    }
}
/** OR-of-pass, AND-of-fail, else disputed (the mesh's combination rule). */
export function combinePeerVerdicts(verdicts) {
    for (const v of verdicts)
        if (v.kind === "pass")
            return v;
    for (const v of verdicts)
        if (v.kind === "fail")
            return v;
    return { kind: "disputed", needsHuman: true, signals: ["no decisive verdict"] };
}
//# sourceMappingURL=scoreboard.js.map