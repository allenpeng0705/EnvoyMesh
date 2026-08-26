import type { EhActivityEvent } from "./eh-activity.js";
import type { EhChatHistory } from "./eh-chat-history.js";
import type { EhFilesChangedEvent } from "./eh-files-changed.js";
import type { EhPermissionEvent } from "./eh-permission.js";
import type {
  EhTurnCompleteEvent,
  EhTurnStartedEvent,
  EhTurnTokenEvent,
} from "./eh-turn.js";
import type { EhUserQuestionEvent } from "./eh-user-question.js";

export type EhAgentStateName =
  | "ready"
  | "submitting"
  | "thinking"
  | "running_tool"
  | "waiting_for_approval"
  | "waiting_for_answer"
  | "verifying"
  | "reconnecting"
  | "completed"
  | "failed"
  | "cancelled";

export interface EhExecutionIdentity {
  location: "local" | "peer";
  deviceLabel?: string;
  peerId?: string;
  ownerLabel?: string;
  model?: string;
}

export interface EhAgentState {
  state: EhAgentStateName;
  chatId: string;
  turnId?: string;
  label: string;
  activitySummary?: string;
  startedAt?: string;
  updatedAt: string;
  execution?: EhExecutionIdentity;
}

export interface EhTimelineBase {
  id: string;
  chatId: string;
  turnId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EhMessageItem extends EhTimelineBase {
  type: "message";
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
}

export interface EhActivityGroupItem extends EhTimelineBase {
  type: "activity";
  status: "running" | "succeeded" | "failed" | "cancelled";
  summary: string;
  toolName?: string;
  output?: string;
  durationMs?: number;
  execution?: EhExecutionIdentity;
}

export interface EhApprovalItem extends EhTimelineBase {
  type: "approval";
  requestId: string;
  status: "pending" | "allowed" | "denied" | "expired";
  toolName: string;
  description: string;
  args: unknown;
  preview?: string;
  timeoutMs: number;
  workspace?: string;
  networkAccess?: boolean;
}

export interface EhQuestionItem extends EhTimelineBase {
  type: "question";
  requestId: string;
  status: "pending" | "answered" | "cancelled" | "expired";
  prompt: string;
  options?: string[];
  recommendedIndex?: number;
  multiline?: boolean;
  questionKind?: "ask" | "plan-review" | "mode-switch";
  answer?: string;
  timeoutMs: number;
}

export interface EhChangeSetItem extends EhTimelineBase {
  type: "changes";
  files: string[];
  additions?: number;
  deletions?: number;
  checkpointId?: string;
}

export interface EhCompletionItem extends EhTimelineBase {
  type: "completion";
  status: "completed" | "failed" | "cancelled";
  summary: string;
  stopReason?: string;
  changedFileCount?: number;
  testsPassed?: number;
  testsFailed?: number;
  durationMs?: number;
}

export interface EhErrorItem extends EhTimelineBase {
  type: "error";
  category: "model" | "tool" | "transport" | "host" | "unknown";
  message: string;
  recoverable: boolean;
}

export type EhTimelineItem =
  | EhMessageItem
  | EhActivityGroupItem
  | EhApprovalItem
  | EhQuestionItem
  | EhChangeSetItem
  | EhCompletionItem
  | EhErrorItem;

export interface EhTimelineSnapshot {
  chatId: string;
  items: EhTimelineItem[];
  state: EhAgentState;
  snapshotAt: string;
  revision: number;
}

export interface EhTimelineState {
  chatId: string;
  items: EhTimelineItem[];
  state?: EhAgentState;
  revision: number;
}

export type EhTimelineUpdate =
  | { type: "snapshot"; snapshot: EhTimelineSnapshot }
  | { type: "upsert"; item: EhTimelineItem; revision?: number }
  | { type: "remove"; chatId: string; id: string; revision?: number }
  | { type: "state"; state: EhAgentState; revision?: number };

export function emptyEhTimelineState(chatId: string): EhTimelineState {
  return { chatId, items: [], revision: 0 };
}

/** Pure replay reducer. Upserts are idempotent and stale revisions are ignored. */
export function reduceEhTimeline(
  current: EhTimelineState,
  update: EhTimelineUpdate,
): EhTimelineState {
  if (update.type === "snapshot") {
    if (update.snapshot.chatId !== current.chatId) return current;
    if (update.snapshot.revision < current.revision) return current;
    return {
      chatId: current.chatId,
      items: dedupeTimelineItems(update.snapshot.items),
      state: update.snapshot.state,
      revision: update.snapshot.revision,
    };
  }
  const chatId = update.type === "state"
    ? update.state.chatId
    : update.type === "remove"
      ? update.chatId
      : update.item.chatId;
  if (chatId !== current.chatId) return current;
  const revision = update.revision ?? current.revision + 1;
  if (revision < current.revision) return current;
  if (update.type === "state") {
    return { ...current, state: update.state, revision };
  }
  if (update.type === "remove") {
    return {
      ...current,
      items: current.items.filter((item) => item.id !== update.id),
      revision,
    };
  }
  const index = current.items.findIndex((item) => item.id === update.item.id);
  if (index < 0) {
    return { ...current, items: [...current.items, update.item], revision };
  }
  if (isTimelineItemStale(current.items[index]!, update.item)) return current;
  const items = [...current.items];
  items[index] = update.item;
  return { ...current, items, revision };
}

function dedupeTimelineItems(items: readonly EhTimelineItem[]): EhTimelineItem[] {
  const result: EhTimelineItem[] = [];
  const indexes = new Map<string, number>();
  for (const item of items) {
    const index = indexes.get(item.id);
    if (index === undefined) {
      indexes.set(item.id, result.length);
      result.push(item);
    } else if (!isTimelineItemStale(result[index]!, item)) {
      result[index] = item;
    }
  }
  return result;
}

function isTimelineItemStale(existing: EhTimelineItem, incoming: EhTimelineItem): boolean {
  const oldStamp = existing.updatedAt ?? existing.createdAt;
  const newStamp = incoming.updatedAt ?? incoming.createdAt;
  return newStamp < oldStamp;
}

export const LEGACY_EH_CHAT_ID = "__envoy_harness__";

export function ehHistoryToTimelineItems(history: EhChatHistory): EhTimelineItem[] {
  const chatId = history.chatId ?? LEGACY_EH_CHAT_ID;
  return history.turns.map((turn, index) => ({
    id: turn.id,
    chatId,
    type: "message" as const,
    role: turn.role,
    text: turn.text,
    createdAt: turn.createdAt ?? new Date(index).toISOString(),
  }));
}

export type EhLegacyTimelineEvent =
  | { name: "eh:turn_started"; payload: EhTurnStartedEvent }
  | { name: "eh:turn_token"; payload: EhTurnTokenEvent }
  | { name: "eh:activity"; payload: EhActivityEvent }
  | { name: "eh:permission"; payload: EhPermissionEvent }
  | { name: "eh:user_question"; payload: EhUserQuestionEvent }
  | { name: "eh:files_changed"; payload: EhFilesChangedEvent }
  | { name: "eh:turn_complete"; payload: EhTurnCompleteEvent };

/** Compatibility adapter used while legacy event consumers migrate. */
export function legacyEhEventToTimelineItems(
  event: EhLegacyTimelineEvent,
  receivedAt: string,
): EhTimelineItem[] {
  switch (event.name) {
    case "eh:turn_started": {
      const payload = event.payload as EhTurnStartedEvent;
      const chatId = payload.chatId ?? LEGACY_EH_CHAT_ID;
      return [{
        id: `turn:${payload.turnId}:user`, chatId, turnId: payload.turnId,
        type: "message", role: "user", text: payload.userPrompt,
        createdAt: payload.startedAt,
      }];
    }
    case "eh:turn_token": {
      const payload = event.payload as EhTurnTokenEvent;
      const chatId = payload.chatId ?? LEGACY_EH_CHAT_ID;
      return [{
        id: `turn:${payload.turnId}:assistant`, chatId, turnId: payload.turnId,
        type: "message", role: "assistant", text: payload.streamingText,
        streaming: true, createdAt: receivedAt, updatedAt: receivedAt,
      }];
    }
    case "eh:activity": {
      const payload = event.payload as EhActivityEvent;
      // Quiet timeline: skip model reasoning / tool stdout dumps / start noise.
      // Tool calls use a single replaceable live slot (not a growing list).
      if (
        payload.kind === "model_response" ||
        payload.kind === "agent_start" ||
        payload.kind === "agent_end" ||
        payload.kind === "tool_progress" ||
        (payload.kind === "tool_result" && payload.status !== "failed")
      ) {
        return [];
      }
      const chatId = payload.chatId ?? LEGACY_EH_CHAT_ID;
      const turnId = payload.turnId;
      const id = turnId
        ? `turn:${turnId}:activity-live`
        : `activity:${chatId}:live`;
      return [{
        id, chatId, ...(turnId ? { turnId } : {}), type: "activity",
        status: payload.status ?? "running", summary: payload.summary,
        ...(payload.toolName ? { toolName: payload.toolName } : {}),
        createdAt: payload.ts ?? receivedAt, updatedAt: receivedAt,
      }];
    }
    case "eh:permission": {
      const payload = event.payload as EhPermissionEvent;
      const chatId = payload.chatId ?? LEGACY_EH_CHAT_ID;
      return [{
        id: `approval:${payload.requestId}`, chatId,
        ...(payload.turnId ? { turnId: payload.turnId } : {}),
        type: "approval", requestId: payload.requestId, status: "pending",
        toolName: payload.toolName, description: payload.description,
        args: payload.args, timeoutMs: payload.timeoutMs,
        ...(payload.preview ? { preview: payload.preview } : {}),
        createdAt: receivedAt,
      }];
    }
    case "eh:user_question": {
      const payload = event.payload as EhUserQuestionEvent;
      const chatId = payload.chatId ?? LEGACY_EH_CHAT_ID;
      return [{
        id: `question:${payload.requestId}`, chatId,
        ...(payload.turnId ? { turnId: payload.turnId } : {}),
        type: "question", requestId: payload.requestId, status: "pending",
        prompt: payload.prompt, timeoutMs: payload.timeoutMs,
        ...(payload.options ? { options: [...payload.options] } : {}),
        ...(payload.recommendedIndex !== undefined
          ? { recommendedIndex: payload.recommendedIndex } : {}),
        ...(payload.multiline !== undefined ? { multiline: payload.multiline } : {}),
        ...(payload.kind ? { questionKind: payload.kind } : {}),
        createdAt: receivedAt,
      }];
    }
    case "eh:files_changed": {
      const payload = event.payload as EhFilesChangedEvent;
      const chatId = payload.chatId ?? LEGACY_EH_CHAT_ID;
      return [{
        id: `turn:${payload.turnId}:changes`, chatId, turnId: payload.turnId,
        type: "changes", files: [...payload.files], createdAt: receivedAt,
      }];
    }
    case "eh:turn_complete": {
      const payload = event.payload as EhTurnCompleteEvent;
      const chatId = payload.chatId ?? LEGACY_EH_CHAT_ID;
      const items: EhTimelineItem[] = [];
      if (payload.text?.trim()) {
        items.push({
          id: `turn:${payload.turnId}:assistant`, chatId, turnId: payload.turnId,
          type: "message", role: "assistant", text: payload.text.trim(),
          streaming: false, createdAt: receivedAt, updatedAt: receivedAt,
        });
      }
      if (payload.changedFiles && payload.changedFiles.length > 0) {
        items.push({
          id: `turn:${payload.turnId}:changes`, chatId, turnId: payload.turnId,
          type: "changes", files: [...payload.changedFiles], createdAt: receivedAt,
        });
      }
      const status = payload.cancelled ? "cancelled" : payload.ok ? "completed" : "failed";
      items.push({
        id: `turn:${payload.turnId}:completion`, chatId, turnId: payload.turnId,
        type: "completion", status,
        summary: payload.cancelled ? "Turn cancelled" : payload.ok ? "Completed" : payload.error ?? "Turn failed",
        ...(payload.stopReason ? { stopReason: payload.stopReason } : {}),
        ...(payload.changedFiles ? { changedFileCount: payload.changedFiles.length } : {}),
        createdAt: receivedAt,
      });
      return items;
    }
  }
}
