/**
 * AgentAdapter — the canonical interface that every per-runtime adapter
 * implements. The orchestrator talks to adapters only through this
 * interface; the concrete adapter class is never imported by the
 * orchestrator.
 *
 * **Design doc:** `docs/improving-agent-network.md` §5.1.
 *
 * **Three contracts:**
 *
 * 1. **Capability advertisement** (`buildManifest`).
 *    The adapter declares which skills it can run. The manifest is
 *    signed by the owner's key (not the adapter's) and broadcast to
 *    the mesh. The orchestrator uses it for task assignment.
 *
 * 2. **Skill execution** (`execute`).
 *    The orchestrator hands the adapter a mandate (objective + input
 *    artifacts + cost/time budgets). The adapter translates that into
 *    whatever shape its runtime expects, runs the skill, and returns
 *    a `SignedAgentResult` (signed by the owner's key, not the adapter's).
 *    The adapter is the **only** place that knows the runtime's specifics.
 *
 * 3. **Runtime-specific verification** (`verify`).
 *    The adapter brings its own verifier rules. The orchestrator
 *    combines verdicts across adapters (OR-of-pass, AND-of-fail,
 *    default disputed). The orchestrator does not know how to verify
 *    a Pi result vs a Hermes result; the adapter does.
 *
 * **Seam where reputation moves:** the worker signs its `AgentResult`,
 * the orchestrator issues a `Verdict` against it. The adapter implements
 * the worker side. The orchestrator side is in `chain-arbitration.ts`.
 *
 * **Stability:** the interface is the wire contract between
 * `apps/node` (orchestrator) and any new adapter package (envoy-harness,
 * Pi, Hermes, etc.). Changes here ripple everywhere. Add new optional
 * fields, never change existing ones; bump `SCHEMA_VERSION` in the
 * protocol package when you do.
 */

import type {
  AgentRuntime,
  CapabilityManifest,
  NamedArtifact,
  SignedAgentResult,
  SkillDescriptor,
  Verdict,
} from "@envoymesh/protocol";

/**
 * Input to `buildManifest`. The reputation scores are computed by the
 * orchestrator from the local `ArbitrationStore` and passed in; the
 * adapter does not need to know how to compute them.
 */
export interface BuildManifestInput {
  /** The owning node's peerId. */
  peerId: string;
  /** The owner's ownerId. Cross-checked against the mandate at task time. */
  ownerId: string;
  /**
   * Per-skill reputation in `[0, 1]`. Computed by the orchestrator from
   * past verdicts. The adapter writes these into the manifest as-is.
   */
  reputationBySkill: Record<string, number>;
}

/**
 * Input to `execute`. The orchestrator hands the adapter a normalized
 * mandate; the adapter translates to its runtime's native shape.
 */
export interface ExecuteInput {
  /** Which skill to run. Must match a `skillId` in the manifest. */
  skillId: string;
  /** What to do. Free-form, runtime-specific. */
  objective: string;
  /** Artifacts the adapter may consume. Read-only. */
  inputArtifacts: ReadonlyArray<NamedArtifact>;
  /** Cost ceiling in USD. The adapter must abort if it expects to exceed this. */
  costCeilingUsd: number;
  /** Wall-clock deadline in milliseconds from now. */
  deadlineMs: number;
  /**
   * Correlation id. The adapter echoes this into the result so the
   * orchestrator can match the result to the mandate.
   */
  correlationId: string;
  /**
   * Abort signal. The orchestrator fires this on cancellation
   * (timeout, owner cancel, budget breach). The adapter should
   * propagate to its runtime if possible.
   */
  signal: AbortSignal;
}

/**
 * Input to `verify`. The orchestrator hands the adapter a result that
 * was produced by *some* adapter (possibly the same one) and asks for
 * a runtime-specific verdict.
 */
export interface VerifyInput {
  /** The result to verify. Signed by the worker's owner. */
  result: SignedAgentResult;
  /** The original objective. The verifier may use it for context. */
  objective: string;
}

/**
 * The canonical adapter interface. Every runtime that wants to participate
 * in the mesh implements this. The orchestrator dispatches via
 * `runtime-registry.getAdapter(runtime)`.
 *
 * **Implementing this interface is the contract for joining the mesh.**
 * See `docs/improving-agent-network.md` §5.2 for a worked example
 * (OpenClawAdapter), and `envoy-harness/docs/design.md` §11 for the
 * envoy-harness adapter (Package 3, `envoy-harness-adapter`).
 */
export interface AgentAdapter {
  /**
   * The runtime this adapter wraps. Used by the orchestrator for
   * task-to-adapter dispatch. **Must be unique** within a single
   * `AdapterRegistry`.
   */
  readonly runtime: AgentRuntime;

  /**
   * The list of skills this adapter can run. **Adapter's own choice.**
   * The orchestrator sees only the manifest; the manifest is built
   * from this list.
   *
   * Called once per `buildManifest` invocation. The orchestrator may
   * call it more often (e.g. for diagnostics).
   */
  describeSkills(): SkillDescriptor[];

  /**
   * Build an unsigned `CapabilityManifest` for broadcast. The orchestrator
   * (not the adapter) signs it with the owner's key, producing the
   * `SignedCapabilityManifest` that actually goes on the wire.
   *
   * The adapter is **not** responsible for signing. The owner signs
   * because the manifest advertises the owner's capabilities.
   */
  buildManifest(input: BuildManifestInput): Promise<CapabilityManifest>;

  /**
   * Run a skill. The adapter is the **only** place that knows about
   * the runtime's specifics. The orchestrator does not import any
   * runtime-specific package.
   *
   * **Cancellation:** the `signal` MUST be respected. The adapter
   * should propagate it to its runtime's cancellation mechanism if
   * one exists; if not, the adapter should at least stop spinning
   * on the abort.
   *
   * **Cost ceiling:** the adapter SHOULD refuse to start a run that
   * it knows will exceed `costCeilingUsd`. The orchestrator's
   * `chain-budget-ledger` is the authoritative gate, but the adapter
   * is the first line of defense.
   *
   * **Return value:** the result is signed by the owner's key (the
   * adapter holds the owner's signing key for this node). The
   * signature is over the canonical JSON of the unsigned result.
   */
  execute(input: ExecuteInput): Promise<SignedAgentResult>;

  /**
   * Runtime-specific verifier. **Each adapter brings its own.**
   * The orchestrator does not know how to verify a Pi result vs a
   * Hermes result; the adapter does.
   *
   * Returns one or more verdicts. Multiple verdicts on the same
   * result are OR-combined by the orchestrator (any 'pass'
   * short-circuits to pass; any 'fail' short-circuits to fail;
   * only all-uncertain becomes 'disputed'). Per design §6.2.
   */
  verify(input: VerifyInput): Promise<Verdict[]>;
}
