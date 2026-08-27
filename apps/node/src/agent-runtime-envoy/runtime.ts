/**
 * Phase 8 Step 2 / b3 — `createRealEnvoyHarnessRuntime`.
 *
 * **What this is:** the real `askEnvoyHarness: (prompt) =>
 * Promise<string>` closure, backed by the full envoy-harness
 * stack. Replaces the Step 1 stub in `NodeServiceImpl` that
 * threw `envoy_harness_stub_phase_8_step_1`.
 *
 * **The stack it constructs (lazy, on first `ask` call):**
 * 1. `ModelAdapter` from `createProviderAdapter({ provider,
 *    model })` — the LLM. Throws on construction when the
 *    provider's API key env var is missing; the caller should
 *    check `loadEnvoyHarnessRuntimeConfig().ready` first.
 * 2. `LocalMeshSubmitter` — same-runtime sub-agent pipeline
 *    (a sub-agent spawned by the parent's `task` tool when
 *    `preferredRuntime` is "envoy-harness" or undefined).
 * 3. `LocalRuntimeRegistry` — host-side `LocalRuntimeBridge`
 *    for cross-runtime sub-agents (openclaw direction; the
 *    reverse direction is wired through `submitToEnvoyHarness`).
 * 4. `LocalCrossRuntimeSubmitter` — routes by
 *    `input.preferredRuntime` (envoy-harness → inner, openclaw
 *    → bridge, unknown → throw).
 * 5. `EnvoyHarnessAdapter` — the `AgentAdapter` the chain
 *    worker calls via `adapter.execute()`. The adapter's
 *    `buildAgent` is `defaultBuildAgentFactory({ model,
 *    meshSubmitter })` so the top-level agent's `task` tool
 *    routes through the `LocalCrossRuntimeSubmitter` (so a
 *    sub-agent can spawn sub-sub-agents on either local
 *    runtime). The adapter's `buildPrompt` is a passthrough
 *    so the chain worker's `buildOpenClawSubtaskPrompt` is
 *    the only prompt builder (no double-wrapping).
 * 6. `signResult` from `defaultSignResult(agentPrivateKeyPem)`
 *    so the adapter's results are signed with the node's
 *    owner key (the verifier on the other end checks it).
 *
 * **Why lazy construction:** the chain worker may be created
 * before `loadEnvoyHarnessRuntimeConfig()` is called (e.g.
 * during node bootstrap). Constructing the model adapter
 * eagerly would throw on missing API keys; lazy defers the
 * throw to the first `ask` call (and `isReady()` short-
 * circuits before that). The `LocalMeshSubmitter` /
 * `LocalRuntimeRegistry` / `LocalCrossRuntimeSubmitter` /
 * `EnvoyHarnessAdapter` are all cheap to construct, so we
 * build them eagerly once on first `ask`.
 *
 * **Why `meshSubmitter` is the `LocalCrossRuntimeSubmitter`:
 * the parent's `task` tool should be able to spawn sub-agents
 * on either local runtime (envoy-harness or openclaw). The
 * `LocalCrossRuntimeSubmitter` is the only `MeshSubmitter`
 * that knows about both. The sub-agent's
 * `LocalMeshSubmitter` (the `inner`) is the same-runtime
 * case; the sub-sub-agent's `LocalCrossRuntimeSubmitter`
 * is the `meshSubmitter` of the sub-sub-agent (recursive).
 * In v0 the depth is bounded by the harness's
 * `maxIterations` + the cost ceiling; future cross-runtime
 * depth limits land in Step 4+.
 *
 * **Why `buildPrompt` is a passthrough:** the chain worker
 * already builds a Team-job-shaped prompt via
 * `buildOpenClawSubtaskPrompt(subtask, inputArtifacts)`. The
 * adapter's default `buildPrompt` would re-wrap with the
 * skill hint + tool list + cost ceiling — that's a second
 * layer of formatting on top of the chain worker's first
 * layer. v0 keeps the chain worker's prompt and skips the
 * adapter's wrapper. Future: the adapter's wrapper may
 * become useful for non-chain-worker callers (e.g. the
 * MAP orchestrator's direct `adapter.execute()`).
 *
 * **Why `defaultSkillId` is "code-review":** the chain
 * worker doesn't pass a `skillId` (the executor builds the
 * prompt, not the skill). The adapter requires one; we use
 * `code-review` (read-only) as a safe default. The skill
 * affects only the tool set (read_file only) — same as if
 * the orchestrator chose the skill explicitly.
 *
 * **Stability:** the public surface is
 * `createRealEnvoyHarnessRuntime` +
 * `CreateRealEnvoyHarnessRuntimeOptions` +
 * `RealEnvoyHarnessRuntime` (the returned object). Additive;
 * new options are optional; the `ask` signature is closed
 * (matches the host's `askEnvoyHarness(prompt)` contract).
 */

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  createProviderAdapter,
  defaultBuildSubagentFactory,
  LocalMeshSubmitter,
  Agent,
  BUILTIN_TOOLS,
  HookRegistry,
  InMemorySession,
  ToolRegistry,
  installToolPermissionAskHook,
  type AskHandler,
  type AskForApproval,
  type ModelAdapter,
  type MeshSubmitter,
  type MemoryStore,
  type PermissionMode,
  type SandboxPolicy,
  type Session,
  type ShellEnvironmentPolicy,
  type SkillRegistry,
  type Tool,
  type UserQuestionService,
} from "@envoymesh/envoy-harness";
import {
  buildEnvoyHarnessAdapterWithCrossVerify,
  type BuildAgentFn,
  defaultBuildAgentFactory,
  defaultSignResult,
  EnvoyHarnessAdapter,
  LocalCrossRuntimeSubmitter,
  getToolsForSkill,
} from "@envoymesh/envoy-harness-adapter";
import type { AgentAdapter } from "@envoymesh/agent-adapter";
import type { SignedAgentResult } from "@envoymesh/protocol";

import { LocalRuntimeRegistry } from "./local-runtime-registry.js";
import type { EnvoyHarnessRuntimeConfig } from "./config.js";

/** Options for `createRealEnvoyHarnessRuntime`. */
export interface CreateRealEnvoyHarnessRuntimeOptions {
  /** The node's agent peerId. Stamped into every result. */
  workerPeerId: string;
  /** The node's agent private key (PEM). Used by
   *  `defaultSignResult` to sign every result. */
  agentPrivateKeyPem: string;
  /** Runtime config from `loadEnvoyHarnessRuntimeConfig()`. */
  config: EnvoyHarnessRuntimeConfig;
  /** Working directory for the agent's tool calls. */
  cwd: string;
  /** Host's OpenClaw ask path. Injected into the
   *  `LocalRuntimeRegistry` so a sub-agent can spawn
   *  OpenClaw sub-agents via the cross-runtime bridge. */
  askOpenClaw: (prompt: string) => Promise<string>;
  /** Optional: OpenClaw readiness probe (for the
   *  `LocalRuntimeRegistry`'s early-bail optimization). */
  isOpenClawReady?: () => boolean;

  /**
   * DI seam for tests. Default: a wrapper that calls
   * `createProviderAdapter` from `@envoymesh/envoy-harness`.
   * Tests inject a `scriptedModel` / `FakeModel` to avoid
   * network calls + env-var dependencies.
   *
   * **Why the simple `(provider, modelName)` shape:**
   * the runtime parses the model string from
   * `ENVOY_HARNESS_MODEL` and delegates to the factory.
   * Tests can inject any `(provider, modelName) => ModelAdapter`
   * closure (the `scriptedModel` helper from the bridge
   * tests is the canonical example). The factory's default
   * implementation calls `createProviderAdapter` with the
   * right `ProviderConfig` shape.
   */
  modelFactory?: (
    provider: string,
    modelName: string | undefined,
  ) => ModelAdapter;

  /**
   * Optional: skill id used by `ask()` when the caller
   * doesn't pass one. Default: `"code-review"` (read-only;
   * safe for Team-job workers that don't need to write
   * files). The chain worker's `buildOpenClawSubtaskPrompt`
   * already formats the prompt; the skill id affects only
   * the tool set (read_file for `code-review`).
   */
  defaultSkillId?: string;

  /**
   * Optional: defaults applied to `ask()` when the caller
   * doesn't pass them. Useful for tests + future per-node
   * defaults from `settings.json`.
   */
  defaultCostCeilingUsd?: number;
  defaultDeadlineMs?: number;

  /**
   * Optional: pre-built B-class tools (sponsor_friend /
   * list_peers / relay_status). The host's `NodeServiceImpl`
   * builds these via `createBClassSponsorFriendDeps` /
   * `createBClassPeerListDeps` / `createBClassRelayStatusDeps`
   * (in `b-class-deps.ts`) and passes them in. The runtime
   * forwards them to `defaultBuildAgentFactory` as
   * `bClassTools` so the per-skill tool registry picks up
   * the right B-class tool based on `getToolsForSkill`.
   *
   * v0: production always passes this (per the Step 3
   * "always opt-in" policy). v0 also keeps the existing
   * 5 `envoy-harness` skills (code-edit / code-review /
   * doc-search / bash-run / plan) — the 3 B-class skills
   * are additive.
   */
  bClassTools?: ReadonlyArray<Tool>;

  /**
   * Phase 8 / Step 6 — optional OpenClaw adapter
   * (or any other `AgentAdapter`) for cross-verify
   * on the direct `ask` path. When provided, the
   * runtime uses
   * `buildEnvoyHarnessAdapterWithCrossVerify` so
   * `adapter.verify(input)` re-runs the same skill
   * on the cross adapter and returns the local
   * verifier's verdicts for the new result. This
   * is the parallel of the factory path's
   * `openClawAdapter?` option.
   *
   * **v0 production wiring:** the host's
   * `NodeServiceImpl` does NOT pass this (the
   * orchestrator's `chain-verify-loop` already
   * handles cross-verify for Team jobs via the
   * factory path). The option exists for callers
   * that want the direct `ask` path to also
   * cross-verify (e.g. test seams, future
   * features that route the user prompt through
   * the `ask` path with cross-validation).
   *
   * **Why the option is optional:** without it,
   * the runtime uses the plain `new
   * EnvoyHarnessAdapter(...)` (backward
   * compatible with Step 1-5 callers). With it,
   * the runtime wires `defaultCrossVerify` for
   * the same Q4 (a) / (b) semantics as the
   * factory path.
   */
  openClawAdapter?: AgentAdapter;

  /**
   * v1.16 — optional per-call model override hint for the
   * adapter-level cross-verify (cross-model-on-same-runtime).
   * Forwarded to `buildEnvoyHarnessAdapterWithCrossVerify` →
   * `defaultCrossVerify` → the cross adapter's
   * `ExecuteInput.verifierModel`. Format: `<provider>:<model>`
   * (e.g. `"anthropic:claude-instant"`). Optional and additive —
   * absent = the v1.8 cross-runtime behavior.
   */
  verifierProviderHint?: string;

  /**
   * R2 — the sub-agent execution pool. Default: a `LocalMeshSubmitter`
   * (same-machine). A host can inject a peer-backed `MeshSubmitter`
   * (e.g. `RemoteMeshSubmitter` over `createPeerRemoteSubmitterTransport`)
   * so the worker's `task` tool fans out to a standalone envoy-harness
   * peer cluster — Pattern A of `distributed-collaboration.md`.
   */
  innerSubmitter?: MeshSubmitter;

  /** Optional: cross-runtime logger. */
  log?: (event: string, fields?: Record<string, unknown>) => void;
}

/** Options accepted by the returned `ask` closure. All optional. */
export interface RealEnvoyHarnessAskOptions {
  /** Abort signal — forwarded to the adapter + agent. */
  signal?: AbortSignal;
  /** Cost ceiling in USD. Default: `opts.defaultCostCeilingUsd` or
   *  `1` (matches the chain worker's base strategy). */
  costCeilingUsd?: number;
  /** Wall-clock deadline in ms from now. Default:
   *  `opts.defaultDeadlineMs` or `60_000` (matches the chain
   *  worker's `capabilityLocalEtaMs`). */
  deadlineMs?: number;
  /** Skill id. Default: `opts.defaultSkillId` or `"code-review"`. */
  skillId?: string;
  /** Correlation id. Default: a fresh UUID. */
  correlationId?: string;
  /**
   * Phase 8 / v1.5 — provider hint from
   * `/provider:NAME` in the prompt. The
   * runtime logs the hint (so the audit
   * trail shows what the user requested)
   * but does NOT yet switch the model
   * provider — the EH adapter doesn't
   * support per-call provider overrides
   * yet. A future chunk in `envoy-harness`
   * wires the adapter to honor the hint.
   * **Dormant by design** (Q9 + Q10 of
   * the v1.5 sub-plan).
   */
  providerHint?: string;
  /**
   * Phase G / 12b — optional per-tool approval bridge
   * (ACP → `pi:proposal`). When set, PreToolUse asks
   * and the handler decides allow/deny.
   */
  askHandler?: AskHandler;
  /**
   * When `askHandler` is set, only tools where this
   * returns true trigger a host prompt. Default: all tools.
   */
  shouldAskTool?: (toolName: string, args?: unknown) => boolean;
}

/** Options accepted by `askSkill`. `skillId` is required
 *  (the whole point is per-skill dispatch). */
export interface RealEnvoyHarnessAskSkillOptions {
  /** Skill id (required). Matches a `skillId` in the
   *  envoy-harness skills catalog. */
  skillId: string;
  /** Abort signal — forwarded to the adapter + agent. */
  signal?: AbortSignal;
  /** Cost ceiling in USD. Default: `1.0` (Q5 of the
   *  v1.2 sub-plan; the host's `askEnvoyHarnessSkill`
   *  overrides this with the skill's descriptor cap). */
  costCeilingUsd?: number;
  /** Wall-clock deadline in ms from now. Default:
   *  `60_000` (Q4 of the v1.2 sub-plan). */
  deadlineMs?: number;
  /** Correlation id. Default: a fresh UUID. */
  correlationId?: string;
  /**
   * Phase 8 / v1.5 — provider hint from
   * `/provider:NAME` in the prompt. See
   * `RealEnvoyHarnessAskOptions.providerHint`
   * for the dormant-feature note. The
   * runtime logs the hint; the adapter
   * doesn't switch providers yet.
   */
  providerHint?: string;
}

/** The runtime object returned by `createRealEnvoyHarnessRuntime`. */
export interface RealEnvoyHarnessRuntime {
  /**
   * Send a prompt to the LLM and return the text response.
   * The text is extracted from the first `text` content
   * block in the result. An empty / non-text result
   * surfaces as `envoy_harness_empty_text` (a clean failed
   * result, not a throw — matches the openclaw / ext
   * engine's behavior).
   */
  ask: (prompt: string, opts?: RealEnvoyHarnessAskOptions) => Promise<string>;

  /**
   * Phase 8 / v1.2 — per-skill dispatch. Returns the
   * raw `SignedAgentResult` so the host can format
   * the content blocks as needed (the chat path uses
   * `formatSkillResult`; the chain path may use a
   * different formatter).
   *
   * **Why a separate method (not just `ask` with
   * `skillId`):** the chain path's `ask` throws
   * `envoy_harness_empty` on non-text first blocks.
   * v1.2's chat path needs to distinguish "empty
   * content" (true failure) from "structured first
   * block" (B-class orchestration; the host
   * catches + falls through to the v1.1 free-form
   * LLM ask). A new method lets the chat path see
   * the raw result without conflating the two cases.
   *
   * **Returns the raw `SignedAgentResult`:** the
   * caller decides how to format. The chat path uses
   * `formatSkillResult` (handles `text` / `file` /
   * `image`; throws `StructuredResultError` for
   * `structured`). Future surfaces can use different
   * formatters.
   */
  askSkill: (
    prompt: string,
    opts: RealEnvoyHarnessAskSkillOptions,
  ) => Promise<SignedAgentResult>;

  /**
   * For tests / introspection. The internals are exposed
   * so the tests can verify wiring (e.g. the agent's
   * `meshSubmitter` is the `submitter`).
   */
  readonly adapter: EnvoyHarnessAdapter;
  readonly model: ModelAdapter;
  readonly registry: LocalRuntimeRegistry;
  readonly submitter: MeshSubmitter;

  /** Re-read the config. The runtime is constructed once;
   *  changing `ENVOY_HARNESS_API_KEY` after construction
   *  doesn't take effect (the model adapter has already
   *  been built). v0: the host should restart the node
   *  to pick up config changes. Future: hot-reload via
   *  the Tauri settings UI (Step 5+). */
  isReady: () => boolean;

  /** Warm model + mesh internals (for persistent ACP host). */
  ensureInternals: () => Promise<void>;

  /**
   * Build an Agent for `createAgentSessionBackend` (sync after `ensureInternals`).
   */
  buildAgentForAcpSession: (params: {
    sessionId: string;
    cwd: string | undefined;
    askHandler: AskHandler;
    session?: Session;
    shouldAskTool?: (toolName: string, args?: unknown) => boolean;
    /** Prebuilt system prompt (AGENTS.md + environment_context). */
    systemPrompt?: string;
    permissionMode?: PermissionMode;
    approval?: AskForApproval;
    sandboxPolicy?: SandboxPolicy;
    memoryStore?: MemoryStore;
    skills?: SkillRegistry;
    shellEnvironmentPolicy?: ShellEnvironmentPolicy;
    userQuestions?: UserQuestionService;
  }) => Agent;
}

/**
 * Build a real envoy-harness runtime. Returns an
 * `askEnvoyHarness` closure (text in / text out) backed by
 * the full envoy-harness stack.
 *
 * **Lazy construction:** the `ModelAdapter` is built on
 * first `ask` call (so the constructor doesn't throw on
 * missing API keys). The `isReady()` method checks
 * `opts.config.ready` without constructing the model —
 * callers should gate `ask()` on `isReady()`.
 *
 * **Construction order on first `ask`:**
 * 1. `model` via `modelFactory(provider, modelName)` (default
 *    `createProviderAdapter`).
 * 2. `innerSubmitter` (the `LocalMeshSubmitter` for
 *    same-runtime sub-agents).
 * 3. `registry` (the `LocalRuntimeRegistry` for cross-runtime
 *    sub-agents).
 * 4. `submitter` (the `LocalCrossRuntimeSubmitter` wrapping
 *    both).
 * 5. `adapter` (the `EnvoyHarnessAdapter` with
 *    `meshSubmitter: submitter`).
 *
 * All subsequent `ask` calls reuse the same internals
 * (one `ModelAdapter` per process, one `LocalMeshSubmitter`
 * per process — matches the chain worker's per-process
 * lifetime).
 */
export function createRealEnvoyHarnessRuntime(
  opts: CreateRealEnvoyHarnessRuntimeOptions,
): RealEnvoyHarnessRuntime {
  // Lazy-initialized internals. `undefined` until first
  // `ask` call (after the readiness check passes). The
  // `initPromise` deduplicates concurrent first calls —
  // the second caller awaits the same construction.
  let internals:
    | {
        model: ModelAdapter;
        submitter: MeshSubmitter;
        registry: LocalRuntimeRegistry;
        adapter: EnvoyHarnessAdapter;
      }
    | undefined;
  let initPromise: Promise<NonNullable<typeof internals>> | undefined;

  // Phase G / 12b — per-ask AskHandler via ALS so overlapping
  // ask() / askSkill() calls cannot clobber each other's bridge.
  type AskBridgeStore = {
    handler: AskHandler | undefined;
    shouldAskTool: ((toolName: string, args?: unknown) => boolean) | undefined;
  };
  const askBridgeAls = new AsyncLocalStorage<AskBridgeStore>();

  // The DI seam: tests inject `opts.modelFactory`. The
  // default wraps `createProviderAdapter` (which takes
  // a `ProviderConfig` object) so the seam shape is the
  // simpler `(provider, modelName) => ModelAdapter`.
  //
  // **API key plumbing (b3.live):** the default
  // `createProviderAdapter` reads the key from the
  // `env` field (defaults to `process.env`). We pass a
  // custom `env` so the host's `ModelProviderConfig.apiKey`
  // (resolved by `loadEnvoyHarnessRuntimeConfig`) flows
  // through without needing to mirror it to
  // `process.env`. The provider-specific env var name
  // (`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` /
  // `ANTHROPIC_API_KEY`) is matched in
  // `config.ts:apiKeyEnvVarForProvider` — we re-derive
  // it here from the `opts.config.provider` so the
  // mapping stays in one place (could be a shared
  // helper, but the duplication is 4 lines and the
  // alternative is a cross-module import for a
  // constant).
  const modelFactory: (provider: string, modelName: string | undefined) => ModelAdapter =
    opts.modelFactory ??
    ((provider, modelName) => {
      const env: NodeJS.ProcessEnv = {};
      if (opts.config.apiKey) {
        switch (provider) {
          case "deepseek":
            env.DEEPSEEK_API_KEY = opts.config.apiKey;
            if (opts.config.endpoint) {
              env.DEEPSEEK_BASE_URL = opts.config.endpoint;
            }
            break;
          case "openai":
            env.OPENAI_API_KEY = opts.config.apiKey;
            if (opts.config.endpoint) {
              env.OPENAI_BASE_URL = opts.config.endpoint;
            }
            break;
          case "anthropic":
          case "claude":
            env.ANTHROPIC_API_KEY = opts.config.apiKey;
            if (opts.config.endpoint) {
              env.ANTHROPIC_BASE_URL = opts.config.endpoint;
            }
            break;
          // `ollama` is keyless — `createProviderAdapter`
          // passes a placeholder key internally. No
          // env var needed.
          // `litellm` reuses the `openai` provider
          // (per the b1.5 follow-up plan §4.1). The
          // host's endpoint is a Step 4+ concern (would
          // be passed via `OpenAIAdapter.baseUrl`).
          default:
            // Unknown provider: pass the key under
            // the universal `ENVOY_HARNESS_API_KEY`
            // name as a courtesy (future providers
            // can read from it). Doesn't help the
            // harness's current adapters but is
            // a no-op safe fallback.
            env.ENVOY_HARNESS_API_KEY = opts.config.apiKey;
        }
      }
      return createProviderAdapter({
        provider,
        ...(modelName !== undefined ? { model: modelName } : {}),
        env,
      });
    });

  /**
   * Lazy construction. Throws when the model factory
   * throws (typically: missing API key env var). The
   * host should gate `ask()` on `isReady()` (which
   * checks `config.ready` without constructing the
   * model — the model factory is the real check).
   */
  const ensureInitialized = async (): Promise<NonNullable<typeof internals>> => {
    if (internals) return internals;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const [providerStr, modelName] = opts.config.model.split(":", 2);
      const provider = providerStr ?? "deepseek";
      const model = modelFactory(provider, modelName);
      // Same-runtime sub-agent pipeline (envoy-harness
      // sub-agents). Uses `defaultBuildSubagentFactory` so
      // the sub-agent gets all BUILTIN tools (the
      // sub-agent's tool set is more open than the
      // top-level skill's tool set).
      // R2 — the execution pool is injectable: default to the local
      // sub-agent pipeline; a host can swap in a peer-backed submitter.
      const innerSubmitter =
        opts.innerSubmitter ??
        new LocalMeshSubmitter({
          buildSubagent: defaultBuildSubagentFactory({
            model,
            cwd: opts.cwd,
          }),
          workerPeerId: opts.workerPeerId,
        });
      // Host-side cross-runtime bridge (openclaw
      // direction). The same `buildSubagent` factory —
      // both runtimes use the same model.
      const registry = new LocalRuntimeRegistry({
        askOpenClaw: opts.askOpenClaw,
        ...(opts.isOpenClawReady ? { isOpenClawReady: opts.isOpenClawReady } : {}),
        buildSubagent: defaultBuildSubagentFactory({
          model,
          cwd: opts.cwd,
        }),
        workerPeerId: opts.workerPeerId,
      });
      // Routes by `preferredRuntime`: envoy-harness →
      // innerSubmitter, openclaw → registry.
      const submitter = new LocalCrossRuntimeSubmitter({
        bridge: registry,
        inner: innerSubmitter,
        workerPeerId: opts.workerPeerId,
      });
      // v1.16 — per-call model override (cross-model-on-same-runtime).
      // `defaultBuildAgentFactory` closes over ONE model; the host
      // wrapper here re-builds the factory with a per-call model when
      // the wire `ExecuteInput.verifierModel` hint is present. The hint
      // format is `<provider>:<model>` (e.g. "anthropic:claude-instant");
      // a bare model name uses the runtime's configured provider.
      const baseBuildAgent = defaultBuildAgentFactory({
        model,
        cwd: opts.cwd,
        meshSubmitter: submitter,
        ...(opts.bClassTools ? { bClassTools: opts.bClassTools } : {}),
        getAskHandler: () => askBridgeAls.getStore()?.handler,
        shouldAskTool: (toolName, args) =>
          askBridgeAls.getStore()?.shouldAskTool?.(toolName, args) ?? true,
      });
      const buildAgent: BuildAgentFn = (args) => {
        if (args.providerHint === undefined) return baseBuildAgent(args);
        const { provider, modelName } = parseProviderHint(
          args.providerHint,
          opts.config.model,
        );
        const overrideModel = modelFactory(provider, modelName);
        return defaultBuildAgentFactory({
          model: overrideModel,
          cwd: opts.cwd,
          meshSubmitter: submitter,
          ...(opts.bClassTools ? { bClassTools: opts.bClassTools } : {}),
          getAskHandler: () => askBridgeAls.getStore()?.handler,
          shouldAskTool: (toolName, args) =>
            askBridgeAls.getStore()?.shouldAskTool?.(toolName, args) ?? true,
        })(args);
      };
      // The top-level agent (built by `defaultBuildAgentFactory`)
      // has its `task` tool wired to the cross-runtime
      // submitter. So when the model emits a `task` call,
      // it goes through the same seam as a direct
      // cross-runtime sub-agent.
      //
      // **Phase 8 / Step 3 — bClassTools:** when the host
      // provides pre-built B-class tools (sponsor_friend
      // / list_peers / relay_status), the factory registers
      // them in the agent's ToolRegistry. The per-skill
      // tool set is filtered by `getToolsForSkill` (e.g.
      // `setup-sponsor-friend` skill gets only
      // `sponsor_friend`; `code-review` gets `read_file`).
      // v0: the host's `NodeServiceImpl` always passes
      // `bClassTools` (Step 3 "always opt-in" policy).
      //
      // **Phase 8 / Step 6 — cross-verify:** when the
      // host passes `openClawAdapter`, use the bridge's
      // `buildEnvoyHarnessAdapterWithCrossVerify` so
      // `adapter.verify(input)` re-runs the same
      // skill on OpenClaw and returns the local
      // verifier's verdicts for the new result. Without
      // `openClawAdapter`, fall back to the plain `new
      // EnvoyHarnessAdapter(...)` (backward compatible
      // with Step 1-5 callers that don't pass a cross
      // adapter).
      const adapter = opts.openClawAdapter
        ? buildEnvoyHarnessAdapterWithCrossVerify({
            buildAgent,
            signResult: defaultSignResult(opts.agentPrivateKeyPem),
            workerPeerId: opts.workerPeerId,
            openClawAdapter: opts.openClawAdapter,
            ...(opts.verifierProviderHint !== undefined
              ? { verifierProviderHint: opts.verifierProviderHint }
              : {}),
            // Passthrough: the chain worker already built
            // the prompt. Re-wrapping would duplicate the
            // skill hint + tool list + cost ceiling.
            buildPrompt: (input) => input.objective,
          })
        : new EnvoyHarnessAdapter({
            buildAgent,
            signResult: defaultSignResult(opts.agentPrivateKeyPem),
            workerPeerId: opts.workerPeerId,
            // Passthrough: the chain worker already built the
            // prompt. Re-wrapping would duplicate the skill
            // hint + tool list + cost ceiling.
            buildPrompt: (input) => input.objective,
          });
      internals = { model, submitter, registry, adapter };
      return internals;
    })();
    return initPromise;
  };

  const ask = async (
    prompt: string,
    askOpts?: RealEnvoyHarnessAskOptions,
  ): Promise<string> => {
    const startedAt = Date.now();
    opts.log?.("envoy_harness.ask.start", {
      skillId: askOpts?.skillId ?? opts.defaultSkillId ?? "code-review",
      promptChars: prompt.length,
      // v1.5 — log the provider hint for the
      // audit trail. The adapter doesn't
      // switch providers yet (dormant by
      // design).
      providerHint: askOpts?.providerHint,
    });
    return askBridgeAls.run(
      {
        handler: askOpts?.askHandler,
        shouldAskTool: askOpts?.shouldAskTool,
      },
      async () => {
        const local = await ensureInitialized();
        const result = await local.adapter.execute({
          skillId: askOpts?.skillId ?? opts.defaultSkillId ?? "code-review",
          objective: prompt,
          inputArtifacts: [],
          costCeilingUsd:
            askOpts?.costCeilingUsd ?? opts.defaultCostCeilingUsd ?? 1,
          deadlineMs: askOpts?.deadlineMs ?? opts.defaultDeadlineMs ?? 60_000,
          correlationId: askOpts?.correlationId ?? randomUUID(),
          signal: askOpts?.signal ?? new AbortController().signal,
        });
        // Extract the first text block. `result.content` is
        // the wire `ContentBlock[]` (kind: "text" | "structured"
        // | "image" | "file" — see `@envoymesh/protocol`). The
        // adapter's `localToWireResult` translates the local
        // `ContentBlock` (type: "text") to the wire shape
        // (kind: "text"). The chain worker only needs the
        // first text block (it renders it as the
        // `result.namedArtifacts[0].artifact.content`).
        const firstText = result.content.find(
          (b): b is { kind: "text"; text: string; mimeType?: string } =>
            b.kind === "text",
        );
        if (!firstText || firstText.text.length === 0) {
          opts.log?.("envoy_harness.ask.empty", {
            durationMs: Date.now() - startedAt,
          });
          // Match the openclaw / ext engine's behavior: a
          // clean failure with a clear reason, not a throw.
          // The chain executor maps this to
          // `envoy_harness_empty` and emits an
          // `AN_ENGINE_FAIL` partial.
          throw new Error("envoy_harness_empty: no text in result");
        }
        opts.log?.("envoy_harness.ask.done", {
          chars: firstText.text.length,
          durationMs: Date.now() - startedAt,
        });
        return firstText.text;
      },
    );
  };

  // Phase 8 / v1.2 — per-skill dispatch. Mirrors
  // `ask` but returns the raw `SignedAgentResult`
  // so the host can decide how to format the
  // content blocks. The chain path's `ask` throws
  // `envoy_harness_empty` on non-text first blocks;
  // the v1.2 chat path needs to distinguish
  // "empty content" from "structured first block"
  // (B-class), so we expose the raw result.
  const askSkill = async (
    prompt: string,
    askOpts: RealEnvoyHarnessAskSkillOptions,
  ): Promise<SignedAgentResult> => {
    const startedAt = Date.now();
    opts.log?.("envoy_harness.askSkill.start", {
      skillId: askOpts.skillId,
      promptChars: prompt.length,
      // v1.5 — log the provider hint for the
      // audit trail. The adapter doesn't
      // switch providers yet (dormant by
      // design).
      providerHint: askOpts.providerHint,
    });
    // Isolate from any parent ask() ALS store so skill
    // runs do not inherit an unrelated askHandler.
    return askBridgeAls.run(
      { handler: undefined, shouldAskTool: undefined },
      async () => {
        const local = await ensureInitialized();
        const deadlineMs = askOpts.deadlineMs ?? 60_000;
        const result = await local.adapter.execute({
          skillId: askOpts.skillId,
          objective: prompt,
          inputArtifacts: [],
          costCeilingUsd: askOpts.costCeilingUsd ?? 1.0,
          deadlineMs,
          correlationId: askOpts.correlationId ?? randomUUID(),
          signal:
            askOpts.signal ??
            // The runtime's `ask` uses an inert
            // `AbortController().signal` (no timeout
            // signal — the deadline is enforced
            // internally). v1.2 uses `AbortSignal.timeout`
            // to match the chat path's behavior (the
            // caller can also pass its own signal).
            AbortSignal.timeout(deadlineMs),
        });
        opts.log?.("envoy_harness.askSkill.done", {
          skillId: askOpts.skillId,
          durationMs: Date.now() - startedAt,
        });
        return result;
      },
    );
  };

  // Build the proxy object on first `ask` call. The
  // exposed `adapter` / `model` / `registry` / `submitter`
  // accessors throw until the runtime is initialized.
  // Tests can `await runtime.ask("warm up")` to force
  // initialization, then read the internals.
  const buildProxy = (): RealEnvoyHarnessRuntime => {
    const accessor = <K extends "adapter" | "model" | "registry" | "submitter">(
      key: K,
    ): RealEnvoyHarnessRuntime[K] => {
      if (!internals) {
        throw new Error(
          `RealEnvoyHarnessRuntime: internals.${key} is not initialized yet — ` +
            `call ask() first to trigger construction`,
        );
      }
      return internals[key] as RealEnvoyHarnessRuntime[K];
    };
    return {
      ask,
      askSkill,
      get adapter() {
        return accessor("adapter");
      },
      get model() {
        return accessor("model");
      },
      get registry() {
        return accessor("registry");
      },
      get submitter() {
        return accessor("submitter");
      },
      isReady: () => opts.config.ready,
      ensureInternals: async () => {
        await ensureInitialized();
      },
      buildAgentForAcpSession: (params) => {
        if (!internals) {
          throw new Error(
            "RealEnvoyHarnessRuntime: call ensureInternals() before buildAgentForAcpSession",
          );
        }
        const sessionCwd = params.cwd ?? opts.cwd;
        const skillId = "code-edit";
        const toolNames = new Set(getToolsForSkill(skillId));
        const tools = new ToolRegistry();
        for (const t of BUILTIN_TOOLS) {
          if (toolNames.has(t.name as "read_file" | "bash")) {
            tools.register(t);
          }
        }
        if (opts.bClassTools) {
          for (const t of opts.bClassTools) {
            if (
              toolNames.has(
                t.name as
                  | "read_file"
                  | "bash"
                  | "sponsor_friend"
                  | "list_peers"
                  | "relay_status"
                  | "peers",
              )
            ) {
              tools.register(t);
            }
          }
        }
        const hooks = new HookRegistry();
        installToolPermissionAskHook(hooks, {
          ...(params.shouldAskTool !== undefined
            ? { shouldAsk: params.shouldAskTool }
            : {}),
        });
        return new Agent({
          model: internals.model,
          tools,
          hooks,
          session:
            params.session ??
            new InMemorySession(params.sessionId, {
              cwd: sessionCwd,
              permissionMode: params.permissionMode ?? "workspace-write",
              startedAt: new Date().toISOString(),
            }),
          cwd: sessionCwd,
          askHandler: params.askHandler,
          meshSubmitter: internals.submitter,
          ...(params.systemPrompt !== undefined
            ? { systemPrompt: params.systemPrompt }
            : {}),
          ...(params.approval !== undefined
            ? { approval: params.approval }
            : {}),
          ...(params.sandboxPolicy !== undefined
            ? { sandboxPolicy: params.sandboxPolicy }
            : {}),
          ...(params.memoryStore !== undefined
            ? { memoryStore: params.memoryStore }
            : {}),
          ...(params.skills !== undefined ? { skills: params.skills } : {}),
          ...(params.shellEnvironmentPolicy !== undefined
            ? { shellEnvironmentPolicy: params.shellEnvironmentPolicy }
            : {}),
          ...(params.userQuestions !== undefined
            ? { userQuestions: params.userQuestions }
            : {}),
        });
      },
    };
  };
  return buildProxy();
}

/**
 * v1.16 — parse a per-call model override hint.
 *
 * Format: `<provider>:<model>` (e.g. `"anthropic:claude-instant"`).
 * A bare hint (`"claude-instant"`) uses the runtime's configured
 * default provider (from `configModel`, the `ENVOY_HARNESS_MODEL`
 * string). Split on the FIRST colon so model names containing
 * colons survive (`"provider:model:with:colon"`).
 *
 * @param hint the wire `ExecuteInput.verifierModel` value.
 * @param configModel the runtime's configured `"<provider>:<model>"`
 *   string (used for the default provider when the hint is bare).
 */
export function parseProviderHint(
  hint: string,
  configModel: string,
): { provider: string; modelName: string | undefined } {
  const trimmed = hint.trim();
  if (trimmed === "") {
    return { provider: "deepseek", modelName: undefined };
  }
  const colon = trimmed.indexOf(":");
  if (colon === -1) {
    const [defaultProvider = "deepseek"] = configModel.split(":", 1);
    return {
      provider: defaultProvider.trim() || "deepseek",
      modelName: trimmed,
    };
  }
  const provider = trimmed.slice(0, colon).trim();
  const modelName = trimmed.slice(colon + 1).trim();
  return {
    provider: provider || "deepseek",
    modelName: modelName === "" ? undefined : modelName,
  };
}
