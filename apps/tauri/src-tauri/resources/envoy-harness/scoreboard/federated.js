/**
 * Federated scoreboard (§13.3 of the design).
 *
 * **The promise.** A peer running envoy-harness can opt in
 * to a federated scoreboard: pulling rules that have been
 * validated by other peers running envoy-harness, on similar
 * tasks. The pull is opt-in (never push), and the local
 * 5-step protocol is the final gate.
 *
 * **The 3-step pull protocol (v0):**
 *
 * 1. **Fetch.** Query bonded peers for their public scoreboard.
 *    v0: in-memory stub (`LocalPeerSource`). Phase 2: libp2p pubsub.
 * 2. **Filter.** Drop entries with `status !== 'kept'`. Verify
 *    each entry's signature (`verifyEntrySignature`).
 * 3. **Adopt or reject.** Run the local 5-step protocol
 *    against each validated candidate. Adopt iff the local
 *    pass rate is strictly greater than the local baseline.
 *    The result is recorded in `federated-adoptions.yaml`
 *    (the audit trail: "we tried X, the local protocol
 *    said yes/no").
 *
 * **Why pull is opt-in (and push is never a thing):**
 * the design's safety story rests on local evaluation as
 * the final gate. Auto-pushed rules would let a malicious
 * peer inject code paths; the operator must consciously
 * opt in to the federated layer.
 *
 * **Why a stub `PeerSource` in v0:** Phase 2 (mesh-native)
 * is the right place to wire libp2p pubsub. v0 needs the
 * class shape, the type contracts, and the local 5-step
 * gate so the federated layer is correct on its own; the
 * network transport is a separate concern.
 *
 * **Stability:** `PeerSource` is the extension surface. New
 * transports (libp2p, HTTPS webhook, IPFS) implement it.
 * `FederatedScoreboard` is closed to modification; the
 * algorithm is per design §13.3 and changes require a
 * design revision.
 */
import { appendAdoption, verifyEntrySignature } from "./storage.js";
// ---------------------------------------------------------------------------
// Default PeerSource implementations
// ---------------------------------------------------------------------------
/**
 * The default `PeerSource`: no network, returns an empty list.
 * v0 has no mesh; the federated pull is a no-op until Phase 2
 * wires a real source.
 *
 * **Why this exists:** callers can wire a `FederatedScoreboard`
 * without conditional checks. The federated layer is "always
 * there, but returns nothing until you give it a real source".
 */
export class LocalPeerSource {
    async fetchScoreboards() {
        return [];
    }
}
/**
 * The federated pull layer. v0 does the fetch + filter +
 * verify; F6.2 adds the local 5-step gate. The class is
 * constructed with a `PeerSource`; the local `SelfEvolve` is
 * injected in F6.2.
 */
export class FederatedScoreboard {
    peerSource;
    constructor(peerSource) {
        this.peerSource = peerSource;
    }
    /**
     * Pull peer scoreboards. F6.1: returns the validated
     * candidates (filter + verify only). F6.2 adds the local
     * 5-step gate: each candidate runs through the local
     * protocol; adopt iff the local pass rate improves.
     *
     * **Opt-in is the default.** Pass `optIn: true` to
     * actually fetch from peers. The CLI flag is
     * `envoy self-evolve --pull` (per implementation plan F6.4).
     */
    async pull(options = {}) {
        const optIn = options.optIn ?? false;
        if (!optIn) {
            return {
                validatedCandidates: [],
                rejected: [],
                skipped: true,
            };
        }
        const max = options.maxCandidates ?? 50;
        // 1. Fetch.
        let peerScoreboards;
        try {
            peerScoreboards = await this.peerSource.fetchScoreboards();
        }
        catch {
            // Transport error. The pull is a no-op; the operator
            // can retry. We do NOT throw — a failed pull should
            // not abort the local cycle.
            return {
                validatedCandidates: [],
                rejected: [],
                skipped: false,
            };
        }
        // 2. Filter + verify.
        const validated = [];
        const rejected = [];
        for (const peer of peerScoreboards) {
            for (const entry of peer.entries) {
                if (validated.length >= max)
                    break;
                // Status filter: only kept entries are candidates.
                if (entry.status !== "kept") {
                    rejected.push({ entry, reason: `status=${entry.status}` });
                    continue;
                }
                // Signature verify.
                const ok = await verifyEntrySignature(entry);
                if (!ok) {
                    rejected.push({ entry, reason: "signature-invalid" });
                    continue;
                }
                validated.push(entry);
            }
            if (validated.length >= max)
                break;
        }
        return {
            validatedCandidates: validated,
            rejected,
            skipped: false,
        };
    }
    /**
     * F6.2: run the local 5-step gate against each validated
     * candidate. For each, calls `SelfEvolve.runOneCycleAgainst`
     * with the candidate's hypothesis (the entry's `hypothesis`
     * text + an empty ruleChanges list — federated candidates
     * don't ship full rule bodies in v0; only the hypothesis
     * text and the operator's local re-implementation count).
     *
     * F6.3: when `adoptionsFile` is provided, every evaluated
     * candidate (kept or rejected) is appended to the file
     * — it's the audit trail of "we tried X, the local gate
     * said Y". Without `adoptionsFile`, the function still
     * returns the AdoptResult but doesn't persist.
     *
     * **Adoption criteria:** the candidate's local 5-step
     * evaluation must say `kept: true` (strict greater pass
     * rate). The audit trail of each evaluation is in the
     * main scoreboard (the cycle counter advances); the
     * "adopted" set (the candidates that passed) is returned
     * to the caller for further action.
     *
     * **Throws:** if `selfEvolve` is not set (the gate is
     * required). The caller is expected to pass it.
     */
    async adopt(pullResult, selfEvolve, options = {}) {
        if (pullResult.skipped) {
            return {
                adopted: [],
                rejected: [],
                skipped: true,
            };
        }
        const adopted = [];
        const rejected = [];
        const peerId = options.peerId ?? "unknown";
        for (const entry of pullResult.validatedCandidates) {
            // Federated entries don't ship rule bodies in v0, and the
            // local 5-step gate cannot evaluate a ruleset it doesn't
            // have. Running the benchmark with zero rules produced a
            // pass rate of 0 (never kept) while polluting the local
            // cycle counter — so we reject such candidates explicitly
            // instead of pretending to evaluate them.
            const hypothesis = {
                text: entry.hypothesis,
                ruleChanges: [],
            };
            if (hypothesis.ruleChanges.length === 0) {
                const reason = "federated candidate carries no rule bodies (v0) — the local gate needs a concrete ruleset to evaluate";
                rejected.push({ entry, reason });
                if (options.adoptionsFile) {
                    await appendAdoption(options.adoptionsFile, buildRecord(peerId, entry, undefined, false, reason));
                }
                continue;
            }
            let cycle;
            try {
                cycle = await selfEvolve.runOneCycleAgainst(hypothesis);
            }
            catch (err) {
                const reason = `local-cycle-error: ${err.message}`;
                rejected.push({ entry, reason });
                if (options.adoptionsFile) {
                    await appendAdoption(options.adoptionsFile, buildRecord(peerId, entry, undefined, false, reason));
                }
                continue;
            }
            if (cycle.kept) {
                adopted.push({ entry, cycle });
                if (options.adoptionsFile) {
                    await appendAdoption(options.adoptionsFile, buildRecord(peerId, entry, cycle.entry, true));
                }
            }
            else {
                const reason = `local-pass-rate-did-not-improve: ${cycle.entry.passRateBefore.toFixed(2)} → ${cycle.entry.passRateAfter.toFixed(2)}`;
                rejected.push({ entry, reason });
                if (options.adoptionsFile) {
                    await appendAdoption(options.adoptionsFile, buildRecord(peerId, entry, cycle.entry, false, reason));
                }
            }
        }
        return { adopted, rejected, skipped: false };
    }
}
/**
 * Build a `FederatedAdoptionRecord` from a peer's entry and
 * the local cycle that evaluated it.
 */
function buildRecord(peerId, sourceEntry, localEntry, kept, reason) {
    return {
        peerId,
        sourceEntry: {
            version: sourceEntry.version,
            hypothesis: sourceEntry.hypothesis,
            rulesetHash: sourceEntry.rulesetHash,
            passRateAfter: sourceEntry.passRateAfter,
            ownerSignature: sourceEntry.ownerSignature,
        },
        ...(localEntry
            ? {
                localEntry: {
                    version: localEntry.version,
                    passRateBefore: localEntry.passRateBefore,
                    passRateAfter: localEntry.passRateAfter,
                },
            }
            : {}),
        kept,
        adoptedAt: new Date().toISOString(),
        ...(reason !== undefined ? { reason } : {}),
    };
}
//# sourceMappingURL=federated.js.map