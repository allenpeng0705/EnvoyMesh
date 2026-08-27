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
import type { SkillDescriptor } from "@envoymesh/protocol";
/**
 * The set of skill IDs this adapter advertises. As a
 * literal union (not `string`) so `getToolsForSkill()`
 * and the verifier can exhaustively check.
 *
 * Phase 8 / Step 3 commit 2 — the union grew to 8
 * (5 envoy-harness + 3 B-class). The B-class skill
 * IDs are kebab-case to match the convention of the
 * other skills (`code-edit`, `code-review`, etc.);
 * the matching tool names (`sponsor_friend` /
 * `list_peers` / `relay_status`, snake_case) live in
 * `EnvoyHarnessToolName`.
 */
export type EnvoyHarnessSkillId = "code-edit" | "code-review" | "doc-search" | "bash-run" | "plan" | "setup-sponsor-friend" | "peer-list" | "relay-status" | "peer-cluster";
/** The full catalog. The orchestrator reads this for the manifest. */
export declare const ENVOY_HARNESS_SKILLS: ReadonlyArray<SkillDescriptor>;
/** The set of well-known envoy-harness tool names. v0 ships two
 *  standard tools + 3 B-class tools (Phase 8 / Step 3). */
export type EnvoyHarnessToolName = "read_file" | "bash" | "sponsor_friend" | "list_peers" | "relay_status" | "peers";
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
export declare function getToolsForSkill(skillId: string): ReadonlyArray<EnvoyHarnessToolName>;
/** True if the skill is read-only (no bash, no writes). */
export declare function isReadOnlySkill(skillId: string): boolean;
/** The version of the envoy-harness runtime. Surfaced in the manifest. */
export declare const ENVOY_HARNESS_VERSION: "0.0.0";
//# sourceMappingURL=skills.d.ts.map