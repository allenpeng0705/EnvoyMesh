/**
 * ENVOY_HARNESS_SKILLS — the catalog of skills this adapter
 * advertises on the mesh.
 *
 * **Design doc:** `docs/improving-agent-network.en.md` §5.2
 * (in the EnvoyMesh monorepo) + envoy-harness's own design
 * §11. The 5 skills map to envoy-harness's local tool
 * surface (read_file + bash).
 *
 * **Skill → tool mapping:** each skill is a thin wrapper
 * over a known tool composition. The adapter's
 * `EnvoyHarnessAdapter.execute()` reads `getToolsForSkill()`
 * to know which local tools to expose. The mapping is
 * **adapter-internal** — the wire format doesn't know
 * about local tools; only the adapter does.
 *
 * **Sensitivity:** `public` means "anyone on the mesh
 * can call this"; `friends` means "owners I'm bonded
 * with"; `private` means "only me". envoy-harness v0
 * defaults everything to `private` (the harness is the
 * home-team agent; we don't expose skills to the open
 * mesh). A future chunk can lift this when the user
 * explicitly opts in to a friend network.
 *
 * **Cost ceiling:** soft signal only. The orchestrator's
 * `chain-budget-ledger` is the authoritative gate.
 * envoy-harness's per-call cap (`--max-cost-usd`,
 * F7.5) is the second line of defense.
 *
 * **Stability:** the catalog is the public surface.
 * Adding new skills is additive; removing one is a
 * breaking change (it'd orphan in-flight tasks).
 */
/** The full catalog. The orchestrator reads this for the manifest. */
export const ENVOY_HARNESS_SKILLS = [
    {
        skillId: "code-edit",
        description: "Read, edit, and write code in a project. Uses read_file + bash.",
        costCeilingUsd: 5.0,
        maxSensitivity: "private",
        tags: ["code", "edit"],
    },
    {
        skillId: "code-review",
        description: "Review a diff for correctness and style. Read-only by default.",
        costCeilingUsd: 3.0,
        maxSensitivity: "private",
        tags: ["code", "review"],
    },
    {
        skillId: "doc-search",
        description: "Search docs and notes for a query. Read-only.",
        costCeilingUsd: 1.0,
        maxSensitivity: "private",
        tags: ["doc", "search"],
    },
    {
        skillId: "bash-run",
        description: "Run a constrained bash command on the worker. Bounded scope.",
        costCeilingUsd: 0.5,
        maxSensitivity: "private",
        tags: ["bash", "shell"],
    },
    {
        skillId: "plan",
        description: "Read-only planning and exploration. No writes, no network.",
        costCeilingUsd: 1.0,
        maxSensitivity: "private",
        tags: ["plan"],
    },
    // Phase 8 / Step 3 — B-class skills (canonical in the
    // bridge). Each is a thin wrapper over a BUILTIN
    // tool the bridge ships (`sponsor_friend` /
    // `list_peers` / `relay_status`). The bridge owns
    // the algorithm; the adapter just advertises the
    // skill for the manifest + per-skill tool mapping.
    //
    // **Why `private`:** these skills are mesh-touching
    // and operate on the local node's trust + relay
    // state. Exposing them on the open mesh would
    // let any node trigger a bond request or read the
    // local relay book. v0 keeps them `private` (the
    // orchestrator's manifest picker reads the local
    // merged manifest; remote nodes don't see them).
    // A future chunk can lift to `friends` when the
    // user explicitly opts in to a friend network.
    //
    // **Cost ceiling:** the bridge's own algorithm
    // (search → join → hello → wait) can run for
    // 6+ minutes. The `costCeilingUsd` is the soft
    // signal; the orchestrator's `chain-budget-ledger`
    // is the authoritative gate. v0 sets conservative
    // ceilings (sponsor-friend is the most expensive
    // at $1; the two observability skills are $0.1).
    {
        skillId: "setup-sponsor-friend",
        description: "Set up the bond with the canonical sponsor (first-launch auto-bond). " +
            "Runs the bond flow end-to-end: search → join → hello → wait for " +
            "bond.established. Backs the installer's primary onboarding step.",
        costCeilingUsd: 1.0,
        maxSensitivity: "private",
        tags: ["mesh", "bond", "sponsor"],
    },
    {
        skillId: "peer-list",
        description: "List observed peers (LAN + WAN) from the local audit log. Each " +
            "entry shows the peer's `lastSeenAt` timestamp and the number of " +
            "messages exchanged. Backs the connectivity diagnostics tile.",
        costCeilingUsd: 0.1,
        maxSensitivity: "private",
        tags: ["mesh", "observability"],
    },
    {
        skillId: "relay-status",
        description: "Show the local relay manager snapshot. Includes the relay node's " +
            "peerId / enabled / listen addresses, the peer roster, the relay " +
            "book, routing counters, and recent relay traces. Backs the relay " +
            "diagnostics tile.",
        costCeilingUsd: 0.1,
        maxSensitivity: "private",
        tags: ["mesh", "observability"],
    },
    {
        skillId: "peer-cluster",
        description: "List the configured envoy-harness peer cluster (id, model, " +
            "capabilities) so the model can route sub-agents to a specific " +
            "peer via task.preferred_peer_id. Backs model-side delegation " +
            "by model/machine.",
        costCeilingUsd: 0.1,
        maxSensitivity: "private",
        tags: ["mesh", "observability", "routing"],
    },
];
/**
 * Map a skill ID to the local tools the executor should
 * expose. v0's envoy-harness ships two tools: `read_file`
 * and `bash`. The mapping is the *adapter's* decision —
 * the wire format only knows about skill IDs, not tools.
 *
 * **Read-only skills** (`code-review`, `doc-search`, `plan`)
 * expose only `read_file`. **Read+write skills**
 * (`code-edit`) expose both. **Exec-only** (`bash-run`)
 * exposes only `bash`.
 *
 * **Adding a new tool:** extend the `EnvoyHarnessToolName`
 * union and update the map. The verifier + executor
 * catch mismatches at the boundary.
 */
export function getToolsForSkill(skillId) {
    switch (skillId) {
        case "code-edit":
            return ["read_file", "bash"];
        case "code-review":
            return ["read_file"];
        case "doc-search":
            return ["read_file"];
        case "bash-run":
            return ["bash"];
        case "plan":
            return ["read_file"];
        // Phase 8 / Step 3 — B-class skills. Each exposes
        // a single tool (the bridge's BUILTIN tool). The
        // standard read_file / bash are NOT exposed (B-class
        // skills are mesh-touching, not file-system).
        case "setup-sponsor-friend":
            return ["sponsor_friend"];
        case "peer-list":
            return ["list_peers"];
        case "relay-status":
            return ["relay_status"];
        case "peer-cluster":
            return ["peers"];
        default:
            // Unknown skill ID: refuse the surface. The orchestrator
            // would not send this (it reads the manifest), so the
            // empty array is defensive. The executor must surface
            // this as an error so the task is not silently executed
            // with no tools.
            return [];
    }
}
/** True if the skill is read-only (no bash, no writes). */
export function isReadOnlySkill(skillId) {
    const tools = getToolsForSkill(skillId);
    return tools.length === 0 || (tools.length === 1 && tools[0] === "read_file");
}
/** The version of the envoy-harness runtime. Surfaced in the manifest. */
export const ENVOY_HARNESS_VERSION = "0.0.0";
//# sourceMappingURL=skills.js.map