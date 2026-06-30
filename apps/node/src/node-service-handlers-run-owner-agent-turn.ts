/**
 * runOwnerAgentTurn runtime (Step 26).
 *
 * Extracted from `node-service-impl.ts`. Handles a single "owner
 * agent turn" — the user typed something in the assistant and we
 * produce a structured reply.
 *
 * The runtime takes a context with all the class methods needed
 * (openclaw plumbing, knowledge/RAG services, tool dispatcher,
 * approval queue, persistence, terminal-assist reply hook).
 * Methods are injected as context functions.
 */
import { randomUUID } from "node:crypto";
import {
  parseTerminalAssistantCorrelationId,
  stripTerminalAssistantCorrelationPrefix,
} from "./terminal-assistant-command.js";
import { stripModelThinking } from "@envoymesh/api";
import type { OwnerAgentTurnResult } from "@envoymesh/api";

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
  /** Persist the exchange to the chat log. */
  persistEnvoyAiChatExchange(rawMessage: string, result: OwnerAgentTurnResult, humanMsgId: string): Promise<void>;
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
}

export async function runOwnerAgentTurnViaRuntime(
  ctx: RunOwnerAgentTurnContext,
  message: string,
): Promise<OwnerAgentTurnResult> {
  ctx.recordOwnerActivity();
  const terminalSessionId = parseTerminalAssistantCorrelationId(message);
  const agentMessage = terminalSessionId
    ? stripTerminalAssistantCorrelationPrefix(message)
    : message;

  // Built-in OpenClaw (EnvoyAI): session memory, tools, multi-round reasoning.
  if (await ctx.ensureOpenClawReady()) {
    ctx.beginOpenClawToolTracking();
    try {
      const context = await ctx.buildOpenClawTurnContext();
      const answer = stripModelThinking(await ctx.askOpenClaw(agentMessage, context));
      const result: OwnerAgentTurnResult = {
        answer,
        domain: "knowledge",
        intent: "knowledge",
        toolsUsed: ctx.endOpenClawToolTracking(),
        approvalItems: [],
        modelUsed: "openclaw",
      };
      const humanMsgId = randomUUID();
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

  // Native LLM planner fallback (the original class wraps the entire
  // body in a try/catch and a long chain of awaits). We delegate
  // to the existing core method.
  const ragService = ctx.getRagService();
  const taskStore = ctx.getTaskStore();
  if (!ragService || !taskStore) {
    throw new Error("Local RAG service or task store not initialised");
  }
  return ctx.runDocumentAgentTurnCore(message);
}