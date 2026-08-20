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
  askEnvoyHarness(message: string): Promise<string>;
  /**
   * Phase 8 / Step 5 — per-node opt-in flag for the
   * signal router. When `"disabled"`, the router never
   * picks envoy-harness regardless of signals. The host
   * reads this from `process.env.ENVOY_HARNESS_SIGNAL_OPT_IN`
   * via `readSignalOptInEnv()` (or a persisted config
   * field, future).
   */
  signalOptIn: "enabled" | "disabled";
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
  const decision = routeUserPrompt({
    prompt: agentMessage,
    isEnvoyHarnessReady: ctx.isEnvoyHarnessReady(),
    envoyHarnessUnreadyReason: undefined, // host-side logging seam (future)
    signalOptIn: ctx.signalOptIn,
  });

  // Strip the hint prefix (e.g. `!eh translate this` →
  // `translate this`) for BOTH the EH and OpenClaw
  // dispatch paths. The LLM never sees the hint.
  const effectiveMessage = stripHintPrefix(agentMessage, decision);

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
  });

  // --- envoy-harness dispatch (signal-bearing prompt + EH ready) ---
  if (decision.runtime === "envoy-harness") {
    try {
      const answer = stripModelThinking(await ctx.askEnvoyHarness(effectiveMessage));
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
