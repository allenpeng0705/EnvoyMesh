/**
 * runOwnerAgentTurn runtime (Step 26, Phase 8 / Step 5).
 *
 * Extracted from `node-service-impl.ts`. Handles a single "owner
 * agent turn" — the user typed something in the assistant and we
 * produce a structured reply.
 *
 * The runtime takes a context with all the class methods needed
 * (openclaw plumbing, knowledge/RAG services, tool dispatcher,
 * approval queue, persistence, terminal-assist reply hook).
 * Methods are injected as context functions.
 *
 * **Phase 8 / Step 5 — signal-based auto opt-in.**
 * Before dispatching, the prompt goes through
 * [`routeUserPrompt`](./user-prompt-router.ts). The router decides
 * between Built-in OpenClaw (default) and envoy-harness (when the
 * prompt contains a mesh keyword, an envoy-harness tool name, or
 * an explicit hint prefix `!eh` / `/eh`). The chosen runtime
 * handles the prompt; the result carries `routingReason` +
 * `routingSignals` so the Social UI can surface the routing
 * decision.
 */
import { randomUUID } from "node:crypto";
import {
  parseTerminalAssistantCorrelationId,
  stripTerminalAssistantCorrelationPrefix,
} from "./terminal-assistant-command.js";
import { stripModelThinking } from "@envoymesh/api";
import type { OwnerAgentTurnResult } from "@envoymesh/api";
import { getScriptedTutorReply, type ScriptedTutorState } from "./scripted-tutor.js";
import {
  readSignalOptInEnv,
  routeUserPrompt,
  type RouteUserPromptDecision,
} from "./user-prompt-router.js";
import {
  extractEnvoyHarnessTags,
  extractEnvoyHarnessSkills,
  extractOpenClawTags,
} from "./manifest-envoy-harness-tags.js";
import type { NodeManifest } from "./agent-adapter-manifest-aggregate.js";

export interface RunOwnerAgentTurnContext {
  /** Record owner activity. */
  recordOwnerActivity(): void;
  /** Make sure OpenClaw gateway is ready (returns true if so). */
  ensureOpenClawReady(): Promise<boolean>;
  /** Begin tracking tools used during the OpenClaw turn. */
  beginOpenClawToolTracking(): void;
  /** End tracking and return the list of tools used. */
  endOpenClawToolTracking(): string[];
  /** Build the OpenClaw turn context (RAG services, profile, etc.). */
  buildOpenClawTurnContext(): Promise<unknown>;
  /** Ask the OpenClaw gateway for a reply. */
  askOpenClaw(message: string, context: unknown): Promise<string>;
  /**
   * Phase 8 / Step 5 — sync probe. When `true`, the
   * `askEnvoyHarness` call is expected to succeed (the
   * runtime is configured + has a model adapter). When
   * `false`, signal-bearing prompts fall back to OpenClaw
   * with `routingReason: "envoy-harness-unready"`.
   *
   * The host reads this from
   * `NodeServiceImpl.isEnvoyHarnessReady()` (which reads
   * the resolved config without constructing the model
   * adapter — see `agent-runtime-envoy/config.ts`).
   */
  isEnvoyHarnessReady(): boolean;
  /**
   * Phase 8 / Step 5 — ask the envoy-harness runtime
   * for a reply. The host wires this to
   * `NodeServiceImpl.askEnvoyHarness`, which lazily
   * constructs the model adapter on first call. The
   * runtime may throw on a transient API error; the
   * dispatch catches + falls back to OpenClaw.
   */
  askEnvoyHarness(
    message: string,
    opts?: { providerHint?: string; costCapUsd?: number },
  ): Promise<string>;
  /**
   * Phase 8 / v1.2 — ask the envoy-harness runtime
   * to run a specific skill. The host wires this to
   * `NodeServiceImpl.askEnvoyHarnessSkill`, which
   * lazy-constructs the adapter, calls
   * `adapter.execute({ skillId, objective, ... })`,
   * and formats the result as text.
   *
   * **v1.5 — `opts?`** carries the v1.5 prompt
   * hints: `providerHint` (always parsed; the
   * adapter is dormant) + `costCapUsd` (gated
   * by `ENVOY_HARNESS_COST_CAP_ENABLED=1`).
   *
   * **Throws:**
   * - `StructuredResultError` (re-thrown from the
   *   formatter) when the skill returns a `structured`
   *   first block (B-class). The dispatch catches +
   *   falls through to `askEnvoyHarness` (Q2 + Q7).
   * - Network / timeout / model errors — the dispatch
   *   catches + falls through to `askEnvoyHarness`.
   * - `unknown envoy-harness skill` — the dispatch
   *   catches + falls through to `askEnvoyHarness`.
   */
  askEnvoyHarnessSkill(
    message: string,
    skillId: string,
    opts?: { providerHint?: string; costCapUsd?: number },
  ): Promise<string>;
  /**
   * Phase 8 / Step 5 — per-node opt-in flag for the
   * signal router. When `"disabled"`, the router never
   * picks envoy-harness regardless of signals. The host
   * reads this from `process.env.ENVOY_HARNESS_SIGNAL_OPT_IN`
   * via `readSignalOptInEnv()` (or a persisted config
   * field, future).
   */
  signalOptIn: "enabled" | "disabled";
  /**
   * Phase 8 / v1.1 — read the merged node manifest.
   * Sync (the host caches it after init). The
   * runtime extracts envoy-harness skill tags from
   * this and passes them to the signal router as
   * the primary vocabulary (Q5 of the v1.1 sub-plan).
   *
   * **Returns `undefined` when:**
   * - The host hasn't finished init (rare;
   *   `getNodeManifest` reads from `_mesh?.peerId`
   *   and falls back to `"local-node"`).
   * - The host doesn't support the manifest
   *   (older `NodeServiceImpl` versions; future
   *   upgrade path).
   *
   * **Failure handling:** the runtime wraps this
   * call in a `try/catch` and logs a warning on
   * failure (Q6 of the v1.1 sub-plan — fall back
   * to v0 vocabulary, don't fail loud).
   */
  getNodeManifest(): NodeManifest | undefined;
  /** Persist the exchange to the chat log. */
  persistEnvoyAiChatExchange(
    rawMessage: string,
    result: OwnerAgentTurnResult,
    humanMsgId: string,
  ): Promise<void>;
  /** Store the human message before awaiting OpenClaw/native reply. */
  recordEnvoyAiHumanOutgoing(message: string, humanMsgId: string): Promise<void>;
  /** Maybe ingest a reply into the terminal-assistant pipeline. */
  maybeIngestTerminalAssistantReply(terminalSessionId: string | undefined, answer: string): void;
  /** Get the RAG service. */
  getRagService(): unknown;
  /** Local task store (or undefined). */
  getTaskStore(): unknown;
  /** Run the owner-agent turn (full method, includes context building). */
  runDocumentAgentTurnCore(message: string): Promise<OwnerAgentTurnResult>;
  /** Approval queue. */
  getApprovalQueue(): unknown;
  /** Get scripted-tutor state (bond count, interest count, model mode). */
  getScriptedTutorState?(): Promise<ScriptedTutorState>;
}

/**
 * Strip the explicit-hint prefix from the prompt
 * before dispatch. The LLM never sees `!eh` or
 * `/eh` — it sees the actual user content.
 *
 * **Why `trimStart` first:** the router's
 * `hintPrefixLength` is the length of the hint
 * itself (e.g. `3` for `!eh`). The hint always
 * sits at position 0 of the **trimmed** prompt;
 * any leading whitespace before the hint is
 * preserved when the caller passes the original
 * message in.
 */
function stripHintPrefix(message: string, decision: RouteUserPromptDecision): string {
  if (decision.hintPrefixLength === undefined) {
    return message;
  }
  return message.trimStart().slice(decision.hintPrefixLength).trimStart();
}

export async function runOwnerAgentTurnViaRuntime(
  ctx: RunOwnerAgentTurnContext,
  message: string,
  options?: { humanMessageId?: string; locale?: string },
): Promise<OwnerAgentTurnResult> {
  ctx.recordOwnerActivity();
  const terminalSessionId = parseTerminalAssistantCorrelationId(message);
  const agentMessage = terminalSessionId
    ? stripTerminalAssistantCorrelationPrefix(message)
    : message;

  const humanMsgId = options?.humanMessageId?.trim() || randomUUID();
  await ctx.recordEnvoyAiHumanOutgoing(agentMessage, humanMsgId);

  // Phase 8 / Step 5 — signal-based auto opt-in.
  // Decide which runtime handles the prompt BEFORE
  // we try either. The router's decision shapes
  // the dispatch below; OpenClaw is the default,
  // envoy-harness is the signal-driven opt-in.
  //
  // Phase 8 / v1.1 — read the merged manifest's
  // envoy-harness skill tags (Q1 / Q5 of the v1.1
  // sub-plan). The router's primary vocabulary is
  // the dynamic tag list; the v0 `MESH_KEYWORDS`
  // constant is the fallback when the manifest is
  // unavailable (Q6 — fall back, don't fail loud).
  //
  // Phase 8 / v1.2 — also read the structured
  // skill list. The router picks a specific
  // `skillId` when the prompt's tags uniquely
  // match one skill (Q1 — uniquely-held
  // threshold; tie → fall through to v1.1 free-
  // form LLM ask). The host's dispatch uses the
  // `targetSkill` field to call
  // `askEnvoyHarnessSkill(message, skillId)`
  // instead of `askEnvoyHarness(message)`.
  const manifestView = readManifestView(ctx);
  const decision = routeUserPrompt({
    prompt: agentMessage,
    isEnvoyHarnessReady: ctx.isEnvoyHarnessReady(),
    envoyHarnessUnreadyReason: undefined, // host-side logging seam (future)
    signalOptIn: ctx.signalOptIn,
    envoyHarnessTags: manifestView.tags,
    envoyHarnessSkills: manifestView.skills,
    // Phase 8 / v1.7 — thread the OpenClaw
    // tag list to the router. When the
    // prompt matches an OpenClaw tag, the
    // router routes to OpenClaw (the
    // negative rule; Q1 + Q2 of the v1.7
    // sub-plan).
    openClawTags: manifestView.openClawTags,
  });

  // Strip the hint prefix (e.g. `!eh translate this` →
  // `translate this`) for BOTH the EH and OpenClaw
  // dispatch paths. The LLM never sees the hint.
  //
  // v1.5 — the v1.5 inline hints (`/cost:N`,
  // `/provider:NAME`) are ALSO stripped by the
  // router. The `cleanPrompt` field on the
  // decision is the post-strip prompt (the
  // LLM doesn't see the hints). We use it
  // directly here so the LLM never sees the
  // hints, even when the strip leaves an empty
  // string (e.g. a prompt that was just
  // `/cost:0.5 /provider:openai` with no
  // actual content). The empty-prompt case is
  // rare + the router already routed to
  // "default" (OpenClaw) when no signals
  // matched, so the OpenClaw runtime gets the
  // empty input + can respond accordingly.
  const effectiveMessage = stripHintPrefix(decision.cleanPrompt, decision);

  // Build a result skeleton with the routing
  // fields populated. All branches below use this
  // so `routingReason` + `routingSignals` are
  // always present (the Social UI can render a
  // "routed by <token>" badge for any result, even
  // a deep fallback to scripted-tutor / native).
  const buildRoutedResult = (
    overrides: Partial<OwnerAgentTurnResult>,
  ): OwnerAgentTurnResult => ({
    answer: "",
    domain: "knowledge",
    intent: "knowledge",
    toolsUsed: [],
    approvalItems: [],
    ...overrides,
    routingReason: decision.reason,
    routingSignals: decision.signals.map((s) => s.token),
    // Phase 8 / v1.2 — the v1.2 EH per-skill
    // dispatch explicitly sets `targetSkill` and
    // `routingReason: "signal-skill"`. The v1.1
    // paths leave `targetSkill` undefined (the
    // v1.1 callers don't set it).
    targetSkill: decision.targetSkill,
  });

  // --- envoy-harness dispatch (signal-bearing prompt + EH ready) ---
  if (decision.runtime === "envoy-harness") {
    // Phase 8 / v1.2 — per-skill dispatch when a
    // unique skill matched. Falls through to the
    // v1.1 free-form LLM ask on failure (Q7) or
    // when the skill returns a `structured` first
    // block (Q2 — B-class). The result keeps
    // `routingReason: "signal-skill"` if the skill
    // path succeeded; the LLM-fall-through case
    // uses the original `routingReason` from the
    // decision (typically `"signal"`).
    if (decision.targetSkill !== undefined) {
      try {
        const skillAnswer = await ctx.askEnvoyHarnessSkill(
          effectiveMessage,
          decision.targetSkill,
          // v1.5 — thread the prompt hints to
          // the host's ask method. The host
          // applies the env-var flag for the
          // cost cap and logs the provider
          // hint (dormant; Q9 + Q10 of the
          // v1.5 sub-plan).
          {
            providerHint: decision.providerHint,
            costCapUsd: decision.costCapUsd,
          },
        );
        const answer = stripModelThinking(skillAnswer);
        const result = buildRoutedResult({
          answer,
          modelUsed: "envoy-harness",
          targetSkill: decision.targetSkill,
          routingReason: "signal-skill",
        });
        await ctx.persistEnvoyAiChatExchange(message, result, humanMsgId);
        ctx.maybeIngestTerminalAssistantReply(terminalSessionId, answer);
        return result;
      } catch (err) {
        // Q7 — fall through to free-form LLM
        // ask. The skill might not handle this
        // prompt (B-class returning structured;
        // network error; unknown skill). Log the
        // failure so the owner can debug.
        const skillId = decision.targetSkill;
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(
          `[envoy-harness] skill ${skillId} failed, ` +
            `falling back to free-form LLM ask:`,
          reason,
        );
        // Fall through to the v1.1 path below.
        // The result keeps `routingReason: "signal"`
        // (not "signal-skill") because the actual
        // dispatch is the free-form LLM ask.
      }
    }
    try {
      const answer = stripModelThinking(
        await ctx.askEnvoyHarness(effectiveMessage, {
          // v1.5 — same hint threading as the
          // skill path above.
          providerHint: decision.providerHint,
          costCapUsd: decision.costCapUsd,
        }),
      );
      const result = buildRoutedResult({
        answer,
        modelUsed: "envoy-harness",
      });
      await ctx.persistEnvoyAiChatExchange(message, result, humanMsgId);
      ctx.maybeIngestTerminalAssistantReply(terminalSessionId, answer);
      return result;
    } catch (err) {
      // EH was ready per the static probe but the
      // actual call failed (transient API error,
      // model crashed, etc.). Fall through to
      // OpenClaw — the user still expects an
      // answer. The result keeps `routingReason:
      // "signal"` (the original router decision)
      // but `modelUsed: "openclaw"` (the actual
      // runtime that produced the answer).
      console.warn(
        "[envoy-harness] request failed, falling back to OpenClaw:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // --- OpenClaw dispatch (default + EH-failed fallback) ---
  if (await ctx.ensureOpenClawReady()) {
    ctx.beginOpenClawToolTracking();
    try {
      const openclawContext = await ctx.buildOpenClawTurnContext();
      const answer = stripModelThinking(await ctx.askOpenClaw(effectiveMessage, openclawContext));
      const result = buildRoutedResult({
        answer,
        toolsUsed: ctx.endOpenClawToolTracking(),
        modelUsed: "openclaw",
      });
      await ctx.persistEnvoyAiChatExchange(message, result, humanMsgId);
      ctx.maybeIngestTerminalAssistantReply(terminalSessionId, answer);
      return result;
    } catch (err) {
      ctx.endOpenClawToolTracking();
      console.warn(
        "[openclaw] request failed, falling back to native planner:",
        err instanceof Error ? err.message : String(err),
      );
    }
  } else {
    console.warn(
      "[openclaw] Gateway unavailable — using native LLM planner for this turn",
    );
  }

  // Scripted onboarding tutor fallback — when no model is configured (or the
  // RAG/task stores aren't ready), return a helpful scripted response instead
  // of throwing. This ensures every new user can interact with the assistant
  // for onboarding help, even without a cloud API key.
  if (ctx.getScriptedTutorState) {
    try {
      const tutorState = await ctx.getScriptedTutorState();
      // Merge the client-provided locale so the tutor responds in the right language.
      tutorState.locale = options?.locale;
      const scriptedReply = getScriptedTutorReply(agentMessage, tutorState);
      if (scriptedReply) {
        const result = buildRoutedResult({
          answer: scriptedReply,
          modelUsed: "scripted-tutor",
        });
        await ctx.persistEnvoyAiChatExchange(message, result, humanMsgId);
        ctx.maybeIngestTerminalAssistantReply(terminalSessionId, scriptedReply);
        return result;
      }
    } catch {
      // If tutor state lookup fails, continue to the normal fallback below.
    }
  }

  // Native LLM planner fallback (the original class wraps the entire
  // body in a try/catch and a long chain of awaits). We delegate
  // to the existing core method.
  const ragService = ctx.getRagService();
  const taskStore = ctx.getTaskStore();
  if (!ragService || !taskStore) {
    throw new Error("Local RAG service or task store not initialised");
  }
  const result = await ctx.runDocumentAgentTurnCore(message);
  const enriched = buildRoutedResult({
    ...result,
    domain: result.domain ?? "knowledge",
    modelUsed: result.modelUsed ?? "native",
  });
  await ctx.persistEnvoyAiChatExchange(message, enriched, humanMsgId);
  ctx.maybeIngestTerminalAssistantReply(terminalSessionId, enriched.answer);
  return enriched;
}

/**
 * Default helper: read the per-node opt-in flag
 * from the env var. The host passes the result in
 * as `ctx.signalOptIn`. Tests can also call this
 * directly when constructing a fake context.
 */
export function defaultSignalOptIn(): "enabled" | "disabled" {
  return readSignalOptInEnv();
}

/**
 * Phase 8 / v1.2 — read the manifest once and
 * project it to the v1.1 + v1.2 router inputs.
 *
 * **Why a helper:** the read can throw (the host's
 * `getNodeManifest` may not exist on older versions;
 * future async migrations). Wrapping the call here
 * centralizes the Q6 fallback policy (log a warning,
 * fall back to `undefined` so the router uses the v0
 * vocabulary) without polluting the main dispatch
 * loop.
 *
 * **Why `undefined` (not `[]`) on failure:** `[]`
 * means "manifest has no envoy-harness skills"
 * (Q8 — distinct intent: "I read the manifest, it
 * was empty"). `undefined` means "I couldn't read
 * the manifest" (Q6 — fall back to v0). The two
 * cases are semantically different; the router
 * honors both.
 *
 * **Why tags + skills in one struct:** the host
 * reads the manifest once per turn (the v1.1
 * `getNodeManifest()` is sync but not free). We
 * project both views in a single helper.
 *
 * @param ctx The runtime context.
 * @returns The manifest view (tags + skills); both
 *   fields are `undefined` on read failure so the
 *   router falls back to the v0 vocabulary.
 */
function readManifestView(
  ctx: RunOwnerAgentTurnContext,
): {
  tags: ReadonlyArray<string> | undefined;
  skills: ReadonlyArray<import("./user-prompt-router.js").EnvoyHarnessSkillEntry> | undefined;
  /**
   * Phase 8 / v1.7 — OpenClaw tag list (the
   * negative-signal vocabulary). The router uses
   * it to veto EH routing when a prompt matches
   * an OpenClaw skill tag.
   */
  openClawTags: ReadonlyArray<string> | undefined;
} {
  let manifest: NodeManifest | undefined;
  try {
    manifest = ctx.getNodeManifest();
  } catch (err) {
    // Q6 — fall back to v0 vocabulary (the
    // router's `envoyHarnessTags === undefined`
    // path). Log a warning so the owner can
    // debug (e.g. the host's manifest store
    // crashed mid-read).
    console.warn(
      "[envoy-harness] getNodeManifest() failed, falling back to v0 vocabulary:",
      err instanceof Error ? err.message : String(err),
    );
    return { tags: undefined, skills: undefined, openClawTags: undefined };
  }
  if (manifest === undefined) {
    // Older host without manifest support, or
    // early init. Router falls back to v0.
    return { tags: undefined, skills: undefined, openClawTags: undefined };
  }
  return {
    tags: extractEnvoyHarnessTags(manifest),
    skills: extractEnvoyHarnessSkills(manifest),
    openClawTags: extractOpenClawTags(manifest),
  };
}
