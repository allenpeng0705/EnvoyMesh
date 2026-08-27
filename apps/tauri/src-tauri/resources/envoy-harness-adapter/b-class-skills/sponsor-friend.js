/**
 * Phase 8 / Step 3 — `setup-sponsor-friend` B-class skill
 * (canonical in the bridge).
 *
 * **What this is:** the canonical `setup-sponsor-friend`
 * impl. The "first-friend auto-bond" — the installer's
 * primary onboarding step. The bridge owns the
 * algorithm (orchestration loop, retry, cooldown,
 * error classification, audit events). The host
 * (`apps/node/src/`) becomes a thin wrapper that
 * builds the deps from `NodeServiceImpl` state.
 *
 * **Why this is in the bridge:** per the Phase 8 design
 * doc §2.2, the bridge is the canonical implementation
 * of mesh-touching capabilities. envoy-harness can
 * run a bond flow even if OpenClaw subprocess is down.
 *
 * **The deps interface (4 sub-groups per the Step 3
 * plan):**
 * - `mesh`: searchPeers, sendHello, applyWanJoinInvite,
 *   waitForBondEstablished, address filters, mesh
 *   readiness probe
 * - `profile`: loadNodeProfile, loadHelloProfile,
 *   profile readiness probe, trust check
 * - `config`: loadNodeConfig, saveNodeConfig, profile
 *   dir, bundled config dir
 * - `audit`: appendAudit, now() for cooldown calculation
 *
 * **Minimal data types:** the bridge defines minimal
 * interfaces (e.g. `BClassPersistedNodeConfig`,
 * `BClassHelloProfile`) for the fields it reads/writes.
 * EnvoyMesh's `PersistedNodeConfig` and `HelloProfile`
 * (from `@envoymesh/api` + `@envoymesh/identity`)
 * satisfy these structurally. The host's wrapper is
 * the only place that maps between the full EnvoyMesh
 * types and the bridge's minimal interfaces.
 *
 * **Scope reduction (Phase 8 / Step 3 v0):** the bridge
 * owns the orchestration algorithm + the audit +
 * the retry/cooldown. The HOST owns the address
 * filter (`pickAddressFilterForPeer` in
 * `apps/node/src/outbound-dial-hints.ts`) — the bridge
 * calls `deps.mesh.getAddressFilter(...)` for it.
 * Same for `bondTrace` (the host provides a callback).
 * These are EnvoyMesh-specific concerns that the
 * bridge should not duplicate.
 *
 * **Stability:** the public surface is
 * `runSponsorFriendBridge` + `sponsorFriendTool` +
 * `BClassSponsorFriendDeps` + the 4 sub-interfaces +
 * the minimal data types. Additive; new fields are
 * optional.
 */
import { z } from "zod";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function classifySponsorError(message) {
    const m = (message ?? "").toLowerCase();
    if (!m)
        return "other";
    // Mirror the host's `classifySponsorError` (the
    // reference impl) — same regex patterns, same
    // classification. The host's regex was refined
    // over months of log analysis; the bridge inherits
    // it verbatim so the loop's persisted `lastErrorKind`
    // is identical to the host's pre-Step-3 behavior.
    if (/human profile not initialized|profile not (yet )?initialized|profile not ready|missing profile/.test(m)) {
        return "profile-not-ready";
    }
    if (/node not initialized|mesh not (yet )?ready|mesh not started|libp2p not (yet )?started|node.start.*not (yet )?called|envoy not started|envoymesh not started|node is starting/.test(m)) {
        return "mesh-not-ready";
    }
    if (/no reachable path|could not dial|dial backoff|dial tcp|connection refused|connection reset|econnrefused|etimedout|enotfound|ehostunreach|network is unreachable|relay.*unreachable|relay.*closed|relay.*timeout|relay.*disconnected|i\/o timeout|operation timed out|no outbound dial attempted|ensurepeerreachable failed|cannot open protocol stream on limited connection|peer closed stream without a reply|stream open failed|unexpected eof|connection error|sendexpectreply/.test(m)) {
        return "network-unreachable";
    }
    if (/sponsor did not acknowledge|sponsor-no-ack|did not acknowledge bond|bond:established.*timed out/.test(m)) {
        return "sponsor-no-ack";
    }
    if (/invalid intent .* on .* protocol|protocol.*rejected|unsupported intent|unknown intent|intent.*not (yet )?supported|unsupported protocol|version mismatch/.test(m)) {
        return "protocol-mismatch";
    }
    if (/proof.?of.?context|sponsor.?proof.?token|proofoftoken|token.?mismatch|invalid.?proof|missing.?proof/.test(m)) {
        return "proof-token-mismatch";
    }
    return "other";
}
function isCooldownActive(existing, now) {
    const until = existing?.setupSponsorFriendCooldownUntil;
    if (typeof until !== "string")
        return { active: false };
    const t = Date.parse(until);
    if (Number.isNaN(t))
        return { active: false };
    if (t > now)
        return { active: true, until };
    return { active: false };
}
function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function buildBasePersistedConfig(existing) {
    return existing ? { ...existing } : {};
}
// ---------------------------------------------------------------------------
// Canonical impl
// ---------------------------------------------------------------------------
/**
 * Run the sponsor-friend bond flow. Canonical impl.
 *
 * **Algorithm (mirrors `apps/node/src/node-service-setup-sponsor-friend.ts:runSetupSponsorFriendViaRuntime`):**
 * 1. Load persisted config; check if already completed.
 * 2. Resolve effective config (bundled default + persisted overrides).
 * 3. Check trust store (already bonded?).
 * 4. Cooldown / profile-readiness / mesh-readiness guards.
 * 5. Main loop (up to `maxAttempts`):
 *    a. searchPeers
 *    b. applyWanJoinInvite
 *    c. sendHello
 *    d. waitForBondEstablished
 *    e. Persist success.
 * 6. On failure: classify, persist, cooldown or retry.
 *
 * **Why the algorithm moves to the bridge:** the user
 * concern was "sometime maybe OpenClaw didn't work.
 * we can have a backup and we know EnvoyMesh related
 * things are in envoy-harness." The algorithm is the
 * EnvoyMesh-related thing; the deps are the env.
 *
 * **Single-flight:** the bridge uses a module-level
 * `Set<ownerId>` to prevent duplicate loops when
 * SetupView's auto-trigger and NodeStateContext's
 * auto-trigger both fire. Same shape as
 * `apps/node/src/node-service-setup-sponsor-friend.ts:25`.
 */
const activeSponsorLoops = new Set();
export function __resetActiveSponsorLoopsForTests() {
    activeSponsorLoops.clear();
}
export async function runSponsorFriendBridge(deps, input = {}) {
    const now = deps.audit.now ? deps.audit.now() : Date.now();
    const sleep = deps.audit.sleep ?? defaultSleep;
    const trace = deps.audit.trace ?? (() => { });
    const existing = await deps.config.loadNodeConfig();
    // 1. Already-completed guard.
    if (existing?.setupSponsorFriendCompletedAt && input.forceBypassGuards !== true) {
        return { ok: true, skipped: true, reason: "already-completed" };
    }
    // 2. Resolve effective config.
    const resolved = await deps.config.resolveEffectiveConfig({
        persisted: existing,
        nodeBundleDir: deps.config.nodeBundleDir,
    });
    if (!resolved.enabled || !resolved.ownerId) {
        return { ok: true, skipped: true, reason: "disabled-or-incomplete" };
    }
    const ownerId = resolved.ownerId;
    const forceBypass = input.forceBypassGuards === true;
    // 3. Trust store guard.
    if (deps.profile.isAlreadyBondedWith) {
        const alreadyBonded = await deps.profile.isAlreadyBondedWith(ownerId);
        if (alreadyBonded) {
            if (!existing?.setupSponsorFriendCompletedAt) {
                await deps.config.saveNodeConfig({
                    ...buildBasePersistedConfig(existing),
                    setupSponsorFriendCompletedAt: new Date(now).toISOString(),
                    setupSponsorFriendLastError: undefined,
                    setupSponsorFriendLastErrorKind: undefined,
                    setupSponsorFriendCooldownUntil: undefined,
                    setupSponsorFriendSkipReason: undefined,
                    updatedAt: new Date(now).toISOString(),
                });
            }
            return { ok: true, skipped: true, reason: "already-bonded", ownerId };
        }
    }
    // 4. Cooldown + readiness guards.
    if (!forceBypass) {
        const cooldown = isCooldownActive(existing, now);
        if (cooldown.active) {
            return {
                ok: true,
                skipped: true,
                reason: "cooldown",
                ownerId,
                cooldownUntil: cooldown.until,
                lastErrorKind: existing?.setupSponsorFriendLastErrorKind,
            };
        }
        if (deps.profile.probeHumanProfileReady) {
            const profileReady = await deps.profile.probeHumanProfileReady();
            if (!profileReady) {
                return {
                    ok: true,
                    skipped: true,
                    reason: "profile-not-ready",
                    ownerId,
                    lastErrorKind: "profile-not-ready",
                };
            }
        }
        if (deps.mesh.probeMeshReady) {
            const meshReady = await deps.mesh.probeMeshReady();
            if (!meshReady) {
                return {
                    ok: true,
                    skipped: true,
                    reason: "mesh-not-ready",
                    ownerId,
                    lastErrorKind: "mesh-not-ready",
                };
            }
        }
    }
    // Single-flight guard.
    if (activeSponsorLoops.has(ownerId)) {
        return { ok: true, skipped: true, reason: "single-flight", ownerId };
    }
    activeSponsorLoops.add(ownerId);
    try {
        // 5. Main loop.
        let lastError;
        let lastErrorKind;
        for (let attempt = 1; attempt <= resolved.maxAttempts; attempt += 1) {
            try {
                // `assertOnline()` lives INSIDE the per-attempt try so
                // its failure modes are persisted the same way as
                // network errors. Without this, an early call (right
                // after `startNode` or after a Tauri node process
                // restart for an OpenClaw provider env) hits a node
                // still in `"starting"` state; the throw from
                // `assertOnline()` ("Node is starting. Start the
                // node first.") would propagate out of the runtime,
                // the for-loop's catch block never runs, and no
                // `setupSponsorFriend*` fields land in
                // node-config.json — leaving the tile stuck on
                // "Not started yet" with no actionable hint.
                deps.mesh.assertOnline();
                trace(1, "PASS", "searching for sponsor peer", { ownerId: ownerId.slice(0, 20) });
                const peers = await deps.mesh.searchPeers({ peerId: ownerId });
                const peer = peers[0];
                if (!peer) {
                    // Lenient: empty peer list is not a hard failure. The
                    // old host's `runSetupSponsorFriendRetryLoop` (now
                    // deleted) used to log "no circuit dial targets" and
                    // fall through to bundled dial hints anyway. v0 keeps
                    // that behavior: the relay.lookup is a cache-warm, not
                    // a hard gate. We do trace the empty result for
                    // observability and continue.
                    trace(1, "WAIT", "sponsor peer not found in mesh — continuing with bundled dial hints", {
                        ownerId: ownerId.slice(0, 20),
                    });
                }
                trace(2, "PASS", "applying sponsor join token", { attempt });
                await deps.mesh.applyWanJoinInvite(resolved.joinToken ?? "");
                // Pick address filter (host's `pickAddressFilterForPeer`).
                let dialHints;
                if (deps.mesh.getPeerMultiaddrs) {
                    dialHints = await deps.mesh.getPeerMultiaddrs();
                }
                else {
                    dialHints = deps.mesh.peerMultiaddrs;
                }
                if (deps.mesh.pickAddressFilter) {
                    dialHints = deps.mesh.pickAddressFilter({
                        peerMultiaddrs: dialHints ?? [],
                        localDiscoveryProfile: deps.mesh.localDiscoveryProfile,
                    }).split(",").filter(Boolean);
                }
                const profile = await deps.profile.loadHelloProfile();
                const sendHelloOptions = {};
                if (dialHints && dialHints.length > 0) {
                    sendHelloOptions.dialHints = dialHints;
                }
                if (resolved.proofOfContext) {
                    sendHelloOptions.proofOfContext = resolved.proofOfContext;
                }
                if (peer?.peerId) {
                    sendHelloOptions.preferredOwnerId = peer.peerId;
                }
                else if (resolved.peerId) {
                    // Lenient: when searchPeers is empty, fall back
                    // to the bundled config's peerId. The old
                    // host's loop used `resolved.peerId` for the
                    // targetPeerId hint, so we match that. v0: this
                    // is a soft hint; the host's `sendHello` may
                    // still dial via bundled dial hints.
                    sendHelloOptions.preferredOwnerId = resolved.peerId;
                }
                trace(3, "PASS", "sending hello to sponsor", { attempt });
                await deps.mesh.sendHello(ownerId, profile, resolved.helloMessage ?? "", sendHelloOptions);
                trace(4, "PASS", "waiting for bond.established", { attempt });
                if (deps.mesh.waitForBondEstablished) {
                    await deps.mesh.waitForBondEstablished(ownerId, 30_000);
                }
                // Success: persist + return.
                const base = buildBasePersistedConfig(existing);
                await deps.config.saveNodeConfig({
                    ...base,
                    setupSponsorFriendCompletedAt: new Date(now).toISOString(),
                    setupSponsorFriendLastError: undefined,
                    setupSponsorFriendLastErrorKind: undefined,
                    setupSponsorFriendCooldownUntil: undefined,
                    setupSponsorFriendSkipReason: undefined,
                    // F-fix: persist under the canonical key
                    // (`setupSponsorFriendAttempts`), matching the
                    // failure path + the host's PersistedNodeConfig
                    // schema. The success path used to write a stray
                    // `attempts` key that nothing reads.
                    setupSponsorFriendAttempts: attempt,
                    updatedAt: new Date(now).toISOString(),
                });
                trace(5, "PASS", "auto-bond COMPLETE", { attempt });
                return { ok: true, ownerId, attempts: attempt };
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                lastErrorKind = classifySponsorError(lastError);
                const attemptAt = new Date(now).toISOString();
                await deps.config.saveNodeConfig({
                    ...buildBasePersistedConfig(existing),
                    setupSponsorFriendAttempts: attempt,
                    setupSponsorFriendLastAttemptAt: attemptAt,
                    setupSponsorFriendLastError: lastError,
                    setupSponsorFriendLastErrorKind: lastErrorKind,
                    updatedAt: attemptAt,
                });
                // Bail-and-cooldown for permanent failures.
                const cooldownMs = resolved.cooldownMs;
                if (lastErrorKind === "profile-not-ready" || lastErrorKind === "mesh-not-ready" || lastErrorKind === "protocol-mismatch") {
                    await deps.config.saveNodeConfig({
                        ...buildBasePersistedConfig(existing),
                        setupSponsorFriendLastError: lastError,
                        setupSponsorFriendLastErrorKind: lastErrorKind,
                        setupSponsorFriendSkipReason: lastErrorKind,
                        setupSponsorFriendCooldownUntil: new Date(now + cooldownMs).toISOString(),
                        updatedAt: attemptAt,
                    });
                    return {
                        ok: false,
                        reason: lastErrorKind,
                        ownerId,
                        lastErrorKind,
                        finalNote: `bailed out: ${lastErrorKind}; cooldown ${cooldownMs}ms`,
                    };
                }
                if (attempt < resolved.maxAttempts) {
                    await sleep(resolved.retryDelayMs);
                }
            }
        }
        // 6. Loop exhausted.
        // Use the host's `AUTO_EXHAUSTED_COOLDOWN_UNTIL` sentinel
        // (year 9999) for the permanent cooldown — the host's
        // pre-Step-3 behavior was to set the cooldown to "never
        // retry" so only `forceBypassGuards` (manual Retry) can
        // spawn another cycle. The v0 spec kept this; the 24h
        // cooldown (the bridge's default) was a regression.
        const cooldownUntil = "9999-12-31T00:00:00.000Z";
        await deps.config.saveNodeConfig({
            ...buildBasePersistedConfig(existing),
            setupSponsorFriendCooldownUntil: cooldownUntil,
            setupSponsorFriendSkipReason: "auto-exhausted",
            updatedAt: new Date(now).toISOString(),
        });
        return {
            ok: false,
            reason: "auto-exhausted",
            ownerId,
            lastErrorKind,
            attempts: resolved.maxAttempts,
            finalNote: `exhausted ${resolved.maxAttempts} attempts; last error: ${lastError ?? "(none)"}`,
        };
    }
    finally {
        activeSponsorLoops.delete(ownerId);
    }
}
// ---------------------------------------------------------------------------
// BUILTIN tool
// ---------------------------------------------------------------------------
/**
 * The `sponsor_friend` BUILTIN tool. Always-on when
 * included in `bClassTools?`. The model calls this
 * when the orchestrator's `requiredSkill` is
 * `setup-sponsor-friend`.
 */
export const sponsorFriendTool = (deps) => ({
    name: "sponsor_friend",
    description: "Set up the bond with the canonical sponsor (first-launch auto-bond). " +
        "Runs the bond flow end-to-end: search → join → hello → wait for " +
        "bond.established. Use `force=true` to bypass cooldown + profile + " +
        "mesh readiness guards (manual retry).",
    parameters: z.object({
        force: z
            .boolean()
            .optional()
            .describe("Force a fresh cycle, bypassing cooldown + profile-not-ready + " +
            "mesh-not-ready guards. Default: false."),
    }),
    async execute(args, _ctx) {
        const result = await runSponsorFriendBridge(deps, {
            forceBypassGuards: args.force ?? false,
        });
        return { content: JSON.stringify(result) };
    },
});
//# sourceMappingURL=sponsor-friend.js.map