/**
 * Phase 68-C2 — Pi runtime events → Envoy Harness semantic timeline.
 *
 * Pure adapter: maps Pi JSONL-ish events (and a user-prompt seed) onto
 * `EhTimelineItem` / `EhTimelineUpdate` so Social Coding Chat can reuse the
 * same `eh:timeline` wire channel as Envoy Harness.
 *
 * Chat id convention: `__pi__:${sessionId}` via {@link piTimelineChatId}.
 */

import type { PiEvent, PiExtensionUiRequest } from "./pi-agent.js";
import type {
  EhAgentState,
  EhAgentStateName,
  EhMessageItem,
  EhTimelineItem,
  EhTimelineUpdate,
} from "./eh-timeline.js";

/** Wire chatId for a Pi coding terminal session. */
export function piTimelineChatId(sessionId: string): string {
  return `__pi__:${sessionId.trim()}`;
}

/** True when chatId is a Pi timeline thread (`__pi__:<sessionId>`). */
export function isPiTimelineChatId(chatId: string): boolean {
  return chatId.startsWith("__pi__:");
}

/** Extract sessionId from a Pi timeline chatId; null if not a Pi id. */
export function sessionIdFromPiTimelineChatId(chatId: string): string | null {
  if (!isPiTimelineChatId(chatId)) return null;
  const id = chatId.slice("__pi__:".length).trim();
  return id || null;
}

/** Per-turn accumulator owned by the bridge (mutated while streaming). */
export type PiTimelineTurnAcc = {
  chatId: string;
  turnId: string;
  streamingText: string;
};

export function createPiTimelineTurnAcc(
  chatId: string,
  turnId: string,
): PiTimelineTurnAcc {
  return { chatId, turnId, streamingText: "" };
}

/** Seed the user message for a prompt turn (emitted before Pi events). */
export function piUserPromptTimelineItem(
  acc: PiTimelineTurnAcc,
  text: string,
  createdAt: string,
): EhMessageItem {
  return {
    id: `turn:${acc.turnId}:user`,
    chatId: acc.chatId,
    turnId: acc.turnId,
    type: "message",
    role: "user",
    text,
    createdAt,
  };
}

export function piAgentStateUpdate(
  chatId: string,
  state: EhAgentStateName,
  label: string,
  opts?: { turnId?: string; activitySummary?: string; updatedAt?: string },
): EhTimelineUpdate {
  const agentState: EhAgentState = {
    state,
    chatId,
    label,
    updatedAt: opts?.updatedAt ?? new Date().toISOString(),
    execution: { location: "local" },
    ...(opts?.turnId ? { turnId: opts.turnId } : {}),
    ...(opts?.activitySummary ? { activitySummary: opts.activitySummary } : {}),
  };
  return { type: "state", state: agentState };
}

/**
 * Map one Pi runtime event into timeline updates (revision omitted — host
 * stamps via `_emitEhTimelineUpdate` / `nextEhTimelineRevision`).
 *
 * Quiet timeline: skips thinking deltas and tool stdout dumps; tool calls
 * use a single replaceable live activity slot per turn.
 */
export function piEventToTimelineUpdates(
  event: PiEvent | { type: string; [key: string]: unknown },
  acc: PiTimelineTurnAcc,
  receivedAt: string,
): EhTimelineUpdate[] {
  const { chatId, turnId } = acc;
  const liveActivityId = `turn:${turnId}:activity-live`;
  const assistantId = `turn:${turnId}:assistant`;

  switch (event.type) {
    case "agent_start":
    case "turn_start":
      return [
        piAgentStateUpdate(chatId, "thinking", "Thinking…", {
          turnId,
          updatedAt: receivedAt,
        }),
      ];

    case "message_start":
      return [];

    case "message_update": {
      const ame = (event as { assistantMessageEvent?: unknown }).assistantMessageEvent;
      if (!ame || typeof ame !== "object") return [];
      const sub = ame as {
        type?: string;
        delta?: string;
        content?: string;
        partial?: unknown;
        message?: unknown;
        error?: unknown;
        toolName?: string;
      };

      if (sub.type === "thinking_delta") return [];

      if (sub.type === "text_delta" || sub.type === "text_end" || sub.type === "done" || sub.type === "error") {
        const next = absorbAssistantText(acc, sub);
        if (!next.trim()) return [];
        return [
          {
            type: "upsert",
            item: {
              id: assistantId,
              chatId,
              turnId,
              type: "message",
              role: "assistant",
              text: next,
              streaming: sub.type !== "done" && sub.type !== "error" && sub.type !== "text_end",
              createdAt: receivedAt,
              updatedAt: receivedAt,
            } satisfies EhMessageItem,
          },
        ];
      }

      if (sub.type === "tool_use_start" || sub.type === "toolcall_start") {
        const toolName =
          typeof sub.toolName === "string" && sub.toolName.trim()
            ? sub.toolName.trim()
            : "tool";
        return [
          piAgentStateUpdate(chatId, "running_tool", `Running ${toolName}…`, {
            turnId,
            activitySummary: toolName,
            updatedAt: receivedAt,
          }),
          {
            type: "upsert",
            item: {
              id: liveActivityId,
              chatId,
              turnId,
              type: "activity",
              status: "running",
              summary: toolName,
              toolName,
              createdAt: receivedAt,
              updatedAt: receivedAt,
            },
          },
        ];
      }

      return [];
    }

    case "message_end": {
      const message = (event as { message?: unknown }).message;
      const full = extractAssistantTextFromPiMessage(message);
      if (full && full.length >= acc.streamingText.length) {
        acc.streamingText = full;
      }
      if (!acc.streamingText.trim()) return [];
      return [
        {
          type: "upsert",
          item: {
            id: assistantId,
            chatId,
            turnId,
            type: "message",
            role: "assistant",
            text: acc.streamingText,
            streaming: false,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          } satisfies EhMessageItem,
        },
      ];
    }

    case "tool_execution_start": {
      const toolName =
        typeof (event as { toolName?: unknown }).toolName === "string"
          ? String((event as { toolName: string }).toolName)
          : "tool";
      return [
        piAgentStateUpdate(chatId, "running_tool", `Running ${toolName}…`, {
          turnId,
          activitySummary: toolName,
          updatedAt: receivedAt,
        }),
        {
          type: "upsert",
          item: {
            id: liveActivityId,
            chatId,
            turnId,
            type: "activity",
            status: "running",
            summary: toolName,
            toolName,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          },
        },
      ];
    }

    case "tool_execution_update":
      // Quiet timeline: skip tool stdout progress dumps.
      return [];

    case "tool_execution_end": {
      const toolName =
        typeof (event as { toolName?: unknown }).toolName === "string"
          ? String((event as { toolName: string }).toolName)
          : "tool";
      const success = (event as { success?: unknown }).success !== false;
      // Keep one live slot; final status replaces running.
      return [
        {
          type: "upsert",
          item: {
            id: liveActivityId,
            chatId,
            turnId,
            type: "activity",
            status: success ? "succeeded" : "failed",
            summary: toolName,
            toolName,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          },
        },
        piAgentStateUpdate(chatId, "thinking", "Thinking…", {
          turnId,
          updatedAt: receivedAt,
        }),
      ];
    }

    case "extension_ui_request": {
      const req = event as PiExtensionUiRequest;
      const requestId = typeof req.id === "string" ? req.id : "";
      if (!requestId) return [];
      const title = typeof req.title === "string" ? req.title : "Tool approval";
      const message = typeof req.message === "string" ? req.message : "";
      const timeoutMs =
        typeof req.timeout === "number" && Number.isFinite(req.timeout)
          ? req.timeout
          : 60_000;
      return [
        piAgentStateUpdate(chatId, "waiting_for_approval", "Waiting for approval…", {
          turnId,
          activitySummary: title,
          updatedAt: receivedAt,
        }),
        {
          type: "upsert",
          item: {
            id: `approval:${requestId}`,
            chatId,
            turnId,
            type: "approval",
            requestId,
            status: "pending",
            toolName: title,
            description: message || title,
            args: null,
            timeoutMs,
            createdAt: receivedAt,
          },
        },
      ];
    }

    case "extension_error": {
      const message =
        typeof (event as { message?: unknown }).message === "string"
          ? String((event as { message: string }).message)
          : "Pi extension error";
      return [
        {
          type: "upsert",
          item: {
            id: `turn:${turnId}:error:${receivedAt}`,
            chatId,
            turnId,
            type: "error",
            category: "tool",
            message,
            recoverable: true,
            createdAt: receivedAt,
          },
        },
      ];
    }

    case "turn_end": {
      const message = (event as { message?: unknown }).message;
      const full = extractAssistantTextFromPiMessage(message);
      if (full && full.length >= acc.streamingText.length) {
        acc.streamingText = full;
      }
      const updates: EhTimelineUpdate[] = [];
      if (acc.streamingText.trim()) {
        updates.push({
          type: "upsert",
          item: {
            id: assistantId,
            chatId,
            turnId,
            type: "message",
            role: "assistant",
            text: acc.streamingText,
            streaming: false,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          } satisfies EhMessageItem,
        });
      }
      return updates;
    }

    case "agent_end":
    case "agent_settled": {
      const updates: EhTimelineUpdate[] = [];
      if (event.type === "agent_end") {
        const messages = (event as { messages?: unknown }).messages;
        if (Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const full = extractAssistantTextFromPiMessage(messages[i]);
            if (full) {
              if (full.length >= acc.streamingText.length) acc.streamingText = full;
              break;
            }
          }
        }
      }
      if (acc.streamingText.trim()) {
        updates.push({
          type: "upsert",
          item: {
            id: assistantId,
            chatId,
            turnId,
            type: "message",
            role: "assistant",
            text: acc.streamingText,
            streaming: false,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          } satisfies EhMessageItem,
        });
      }
      updates.push({ type: "remove", chatId, id: liveActivityId });
      updates.push({
        type: "upsert",
        item: {
          id: `turn:${turnId}:completion`,
          chatId,
          turnId,
          type: "completion",
          status: "completed",
          summary: "Completed",
          createdAt: receivedAt,
        },
      });
      updates.push(
        piAgentStateUpdate(chatId, "completed", "Completed", {
          turnId,
          updatedAt: receivedAt,
        }),
      );
      return updates;
    }

    case "auto_retry_start":
    case "auto_retry_end":
      return [];

    default:
      return [];
  }
}

/** Convenience: items-only view (tests / callers that ignore state/remove). */
export function piEventToTimelineItems(
  event: PiEvent | { type: string; [key: string]: unknown },
  acc: PiTimelineTurnAcc,
  receivedAt: string,
): EhTimelineItem[] {
  return piEventToTimelineUpdates(event, acc, receivedAt)
    .filter((u): u is Extract<EhTimelineUpdate, { type: "upsert" }> => u.type === "upsert")
    .map((u) => u.item);
}

// ---------------------------------------------------------------------------
// Text helpers (mirrored from pi-runtime; kept pure in api for the adapter)
// ---------------------------------------------------------------------------

function absorbAssistantText(
  acc: PiTimelineTurnAcc,
  sub: {
    type?: string;
    delta?: string;
    content?: string;
    partial?: unknown;
    message?: unknown;
    error?: unknown;
  },
): string {
  if (sub.partial) {
    const fromPartial = extractAssistantTextFromPiMessage(sub.partial);
    if (fromPartial && fromPartial.length >= acc.streamingText.length) {
      acc.streamingText = fromPartial;
      return acc.streamingText;
    }
  }
  if (sub.type === "done") {
    const full = extractAssistantTextFromPiMessage(sub.message);
    if (full && full.length >= acc.streamingText.length) acc.streamingText = full;
    return acc.streamingText;
  }
  if (sub.type === "error") {
    const full = extractAssistantTextFromPiMessage(sub.error);
    if (full && full.length >= acc.streamingText.length) {
      acc.streamingText = full;
    } else if (!acc.streamingText.trim() && typeof sub.message === "string" && sub.message.trim()) {
      acc.streamingText = `⚠️ ${sub.message.trim()}`;
    }
    return acc.streamingText;
  }
  if (sub.type === "text_end" && typeof sub.content === "string") {
    if (sub.content.length >= acc.streamingText.length) acc.streamingText = sub.content;
    return acc.streamingText;
  }
  if (sub.type === "text_delta" && typeof sub.delta === "string") {
    acc.streamingText += sub.delta;
    return acc.streamingText;
  }
  return acc.streamingText;
}

function extractAssistantTextFromPiMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const msg = message as {
    role?: string;
    content?: unknown;
    errorMessage?: string;
  };
  if (msg.role && msg.role !== "assistant") return "";
  const content = msg.content;
  let out = "";
  if (typeof content === "string") {
    out = content;
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: string; text?: string };
      if (typeof p.text === "string" && (p.type === "text" || p.type === undefined)) {
        out += p.text;
      }
    }
  }
  if (out.trim()) return out;
  if (typeof msg.errorMessage === "string" && msg.errorMessage.trim()) {
    return `⚠️ ${msg.errorMessage.trim()}`;
  }
  return "";
}
