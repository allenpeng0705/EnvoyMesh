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

import {
  createProviderAdapter,
  defaultBuildSubagentFactory,
  LocalMeshSubmitter,
  type ModelAdapter,
  type MeshSubmitter,
  type Tool,
} from "@envoymesh/envoy-harness";
import {
  buildEnvoyHarnessAdapterWithCrossVerify,
  defaultBuildAgentFactory,
  defaultSignResult,
  EnvoyHarnessAdapter,
  LocalCrossRuntimeSubmitter,
} from "@envoymesh/envoy-harness-adapter";
import type { AgentAdapter } from "@envoymesh/agent-adapter";

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
            break;
          case "openai":
            env.OPENAI_API_KEY = opts.config.apiKey;
            break;
          case "anthropic":
          case "claude":
            env.ANTHROPIC_API_KEY = opts.config.apiKey;
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
      const innerSubmitter = new LocalMeshSubmitter({
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
            buildAgent: defaultBuildAgentFactory({
              model,
              cwd: opts.cwd,
              meshSubmitter: submitter,
              ...(opts.bClassTools ? { bClassTools: opts.bClassTools } : {}),
            }),
            signResult: defaultSignResult(opts.agentPrivateKeyPem),
            workerPeerId: opts.workerPeerId,
            openClawAdapter: opts.openClawAdapter,
            // Passthrough: the chain worker already built
            // the prompt. Re-wrapping would duplicate the
            // skill hint + tool list + cost ceiling.
            buildPrompt: (input) => input.objective,
          })
        : new EnvoyHarnessAdapter({
            buildAgent: defaultBuildAgentFactory({
              model,
              cwd: opts.cwd,
              meshSubmitter: submitter,
              ...(opts.bClassTools ? { bClassTools: opts.bClassTools } : {}),
            }),
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
    });
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
    };
  };

  return buildProxy();
}
