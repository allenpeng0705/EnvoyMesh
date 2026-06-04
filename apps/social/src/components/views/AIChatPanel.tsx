import { useState, useMemo, useRef, useEffect } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { stripModelThinking } from "@envoymesh/api";
import type { AgentActivityRecord, AnswerFormat, OwnerAgentApprovalSummary, OwnerAgentDomain, OwnerAgentTurnResult, StructuredBlock } from "@envoymesh/api";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import { messageVisualVariant } from "../../lib/chat-thread-kind.js";
import { createAssistantDraftCrdt, ASSISTANT_DRAFT_SYNC_SCOPE } from "../../lib/assistant-draft-crdt.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatComposer } from "../ChatComposer.js";
import { AnswerRenderer } from "../AnswerRenderer.js";
import { ChatIcon, RemoveIcon } from "../../icons.js";
import type { TFunction } from "../../context/I18nContext.js";

interface AiMessageTurnMeta extends Pick<
  OwnerAgentTurnResult,
  "domain" | "jobId" | "correlationId" | "pendingApproval" | "routeId" | "intent" | "approvalItems"
> {
  approvalResolved?: Record<string, "approved" | "rejected">;
  jobStage?: string;
  jobStatusSummary?: string;
  format?: AnswerFormat;
  blocks?: StructuredBlock[];
}

interface AiMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: string;
  turn?: AiMessageTurnMeta;
}

export interface AIChatPanelProps {
  onOpenActivity?: () => void;
  onOpenInbox?: () => void;
}

function domainLabel(domain: OwnerAgentDomain, t: TFunction): string {
  switch (domain) {
    case "social":
      return t("aiChat.turnDomainSocial");
    case "document":
      return t("aiChat.turnDomainDocument");
    case "service":
      return t("aiChat.turnDomainService");
    default:
      return t("aiChat.turnDomainKnowledge");
  }
}

function AiTurnMetaChips({
  turn,
  t,
  onOpenActivity,
  onOpenInbox,
}: {
  turn: NonNullable<AiMessage["turn"]>;
  t: TFunction;
  onOpenActivity?: () => void;
  onOpenInbox?: () => void;
}) {
  const showMeta = turn.domain !== "knowledge" || turn.jobId || turn.pendingApproval;
  if (!showMeta) return null;

  return (
    <div className="ai-turn-meta" role="status">
      {turn.domain !== "knowledge" && (
        <span className="ai-turn-meta-chip ai-turn-meta-chip--domain">{domainLabel(turn.domain, t)}</span>
      )}
      {turn.jobId && (
        <span className="ai-turn-meta-chip ai-turn-meta-chip--job" title={turn.correlationId ?? undefined}>
          {t("aiChat.turnJobChip", { jobId: turn.jobId.slice(0, 8) })}
        </span>
      )}
      {turn.jobStatusSummary && (
        <span className="ai-turn-meta-chip ai-turn-meta-chip--stage" title={turn.jobStatusSummary}>
          {turn.jobStage
            ? t("aiChat.turnJobStage", { stage: turn.jobStage })
            : turn.jobStatusSummary.slice(0, 48)}
        </span>
      )}
      {turn.jobId && onOpenActivity && (
        <button type="button" className="ai-turn-meta-link" onClick={onOpenActivity}>
          {t("aiChat.turnViewActivity")}
        </button>
      )}
      {turn.pendingApproval && !turn.approvalItems?.length && onOpenInbox && (
        <button type="button" className="ai-turn-meta-link ai-turn-meta-link--approval" onClick={onOpenInbox}>
          {t("aiChat.turnOpenInbox")}
        </button>
      )}
      {turn.pendingApproval && !turn.approvalItems?.length && !onOpenInbox && (
        <span className="ai-turn-meta-chip ai-turn-meta-chip--approval">{t("aiChat.turnPendingApproval")}</span>
      )}
    </div>
  );
}

function AiInlineApprovalCard({
  item,
  resolved,
  busy,
  t,
  onApprove,
  onReject,
}: {
  item: OwnerAgentApprovalSummary;
  resolved?: "approved" | "rejected";
  busy: boolean;
  t: TFunction;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="ai-inline-approval" data-testid={`ai-inline-approval-${item.id}`}>
      <div className="ai-inline-approval__header">
        <strong>{item.title}</strong>
        <span className="ai-inline-approval__type">{item.actionType}</span>
      </div>
      {item.description ? <p className="ai-inline-approval__desc">{item.description}</p> : null}
      {item.draftContent ? (
        <p className="ai-inline-approval__draft">
          &ldquo;{item.draftContent.slice(0, 240)}
          {item.draftContent.length > 240 ? "…" : ""}&rdquo;
        </p>
      ) : null}
      {resolved ? (
        <p className="ai-inline-approval__resolved" role="status">
          {resolved === "approved" ? t("aiChat.turnApproved") : t("aiChat.turnRejected")}
        </p>
      ) : (
        <div className="ai-inline-approval__actions">
          <button type="button" className="accept" disabled={busy} onClick={onApprove}>
            {busy ? t("aiChat.turnApprovalBusy") : t("aiChat.turnApprove")}
          </button>
          <button type="button" className="decline" disabled={busy} onClick={onReject}>
            {t("aiChat.turnReject")}
          </button>
        </div>
      )}
    </div>
  );
}

function fmtDateLabel(dateStr: string, t: TFunction): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDate.getTime() === today.getTime()) return t("aiChat.dateToday");
  if (msgDate.getTime() === yesterday.getTime()) return t("aiChat.dateYesterday");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupByDate(msgs: AiMessage[]): [string, AiMessage[]][] {
  const groups = new Map<string, AiMessage[]>();
  for (const msg of msgs) {
    const key = new Date(msg.timestamp).toLocaleDateString();
    const arr = groups.get(key);
    if (arr) arr.push(msg);
    else groups.set(key, [msg]);
  }
  return [...groups.entries()];
}

export function AIChatPanel({ onOpenActivity, onOpenInbox }: AIChatPanelProps = {}) {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, humanProfile, nodeStatus } = useNodeState();
  const assistantReady = nodeStatus === "running";
  const assistantBlockedHint =
    nodeStatus === "starting"
      ? t("aiChat.nodeStarting")
      : nodeStatus === "stopping"
        ? t("aiChat.nodeStopping")
        : t("aiChat.nodeOffline");

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<ReturnType<typeof createAssistantDraftCrdt> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownerId = humanProfile?.ownerId ?? nodeConfig?.profileDir ?? "anonymous";

  const messageGroups = useMemo(() => groupByDate(aiMessages), [aiMessages]);

  const pushDraftSync = (updateBase64: string) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void nodeService
        .sendSyncStateUpdate({ scope: ASSISTANT_DRAFT_SYNC_SCOPE, updateBase64 })
        .catch(() => {});
    }, 400);
  };

  useEffect(() => {
    const draft = createAssistantDraftCrdt(ownerId, { onLocalUpdate: pushDraftSync });
    draftRef.current = draft;
    setAiInput(draft.getPlainText());
    const onDraftChange = () => setAiInput(draft.getPlainText());
    draft.text.observe(onDraftChange);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      draft.text.unobserve(onDraftChange);
      draft.destroy();
      draftRef.current = null;
    };
  }, [ownerId, nodeService]);

  useEffect(() => {
    const unsub = nodeService.on("crdt:sync", (data) => {
      if (data.scope !== ASSISTANT_DRAFT_SYNC_SCOPE) return;
      draftRef.current?.applyRemoteUpdate(data.updateBase64);
    });
    return unsub;
  }, [nodeService]);

  useEffect(() => {
    const unsub = nodeService.on("agent:activity", (record: AgentActivityRecord) => {
      if (!record.taskId) return;
      if (record.kind !== "document_acq_stage" && record.kind !== "capability_provider_stage") {
        return;
      }
      const stageMatch = record.summary.match(/^([a-z_]+)/i);
      setAiMessages((prev) =>
        prev.map((msg) => {
          const turn = msg.turn;
          if (!turn || turn.jobId !== record.taskId) return msg;
          return {
            ...msg,
            turn: {
              ...turn,
              jobStatusSummary: record.summary,
              jobStage: stageMatch?.[1] ?? record.kind,
            },
          };
        }),
      );
    });
    return unsub;
  }, [nodeService]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, isAiLoading]);

  const sendAiMessage = async (question: string) => {
    if (!question.trim() || isAiLoading) return;

    if (!assistantReady) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: question.trim(),
          timestamp: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: assistantBlockedHint,
          timestamp: new Date().toISOString(),
        },
      ]);
      draftRef.current?.setPlainText("");
      return;
    }

    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: question.trim(),
      timestamp: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    draftRef.current?.setPlainText("");
    setIsAiLoading(true);

    try {
      const turn = await nodeService.runOwnerAgentTurn(question);
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: stripModelThinking(turn.answer),
          timestamp: new Date().toISOString(),
          turn: {
            domain: turn.domain,
            jobId: turn.jobId,
            correlationId: turn.correlationId,
            pendingApproval: turn.pendingApproval,
            routeId: turn.routeId,
            intent: turn.intent,
            approvalItems: turn.approvalItems,
            format: turn.format,
            blocks: turn.blocks,
          },
        },
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("aiChat.responseFailed");
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: t("aiChat.errorPrefix", { message: msg }),
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDeleteAiMessage = (messageId: string) => {
    setAiMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  };

  const handleClearAiChat = () => {
    if (aiMessages.length === 0) return;
    if (!window.confirm(t("aiChat.clearConfirm"))) return;
    setAiMessages([]);
  };

  const resolveInlineApproval = async (
    messageId: string,
    itemId: string,
    action: "approved" | "rejected",
  ) => {
    setApprovalBusyId(itemId);
    try {
      if (action === "approved") {
        const result = await nodeService.approvePendingApproval(itemId);
        if (!result.ok) {
          console.error("Inline approve failed:", result.error);
          return;
        }
      } else {
        const result = await nodeService.rejectPendingApproval(itemId);
        if (!result.ok) {
          console.error("Inline reject failed:", result.error);
          return;
        }
      }
      setAiMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId || !msg.turn) return msg;
          const approvalResolved = { ...(msg.turn.approvalResolved ?? {}), [itemId]: action };
          const items = msg.turn.approvalItems ?? [];
          const pendingApproval = items.some((item) => !approvalResolved[item.id]);
          return {
            ...msg,
            turn: {
              ...msg.turn,
              approvalResolved,
              pendingApproval,
            },
          };
        }),
      );
    } finally {
      setApprovalBusyId(null);
    }
  };

  const modelStatusLabel =
    nodeConfig?.modelProviders?.mode === "disabled"
      ? t("aiChat.aiDisabled")
      : nodeConfig?.modelProviders?.mode === "mock"
        ? t("aiChat.mockMode")
        : t("aiChat.modelLabel", {
            name: nodeConfig?.modelProviders?.modelName ?? t("aiChat.modelNotSet"),
          });

  return (
    <>
      <header className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-avatar kind-ai" aria-hidden>AI</span>
          <div className="chat-header-titles">
            <span className="chat-name">{t("aiChat.title")}</span>
            <span className="chat-header-kind kind-ai">{t("aiChat.subtitle")}</span>
          </div>
        </div>
        <div className="chat-header-right">
          <button
            type="button"
            className="chat-header-clear-btn"
            title={t("aiChat.clearSessionTitle")}
            aria-label={t("aiChat.clearSessionAria")}
            disabled={aiMessages.length === 0}
            onClick={handleClearAiChat}
          >
            <RemoveIcon size={16} />
          </button>
          <span className="ai-status" title={nodeConfig?.modelProviders?.modelName ?? undefined}>
            {modelStatusLabel}
          </span>
        </div>
      </header>
      <div className="messages ai-messages-pane">
        {!assistantReady && (
          <p className="chat-reachability-hint ai-assistant-hint" role="status">
            {assistantBlockedHint}
          </p>
        )}
        {aiMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <div className="empty-state-title">{t("aiChat.emptyTitle")}</div>
            <div className="empty-state-desc">{t("aiChat.emptyDesc")}</div>
            <div className="ai-suggestions">
              <button type="button" onClick={() => draftRef.current?.setPlainText(t("aiChat.suggestHelp"))}>
                {t("aiChat.suggestHelp")}
              </button>
              <button type="button" onClick={() => draftRef.current?.setPlainText(t("aiChat.suggestSummarize"))}>
                {t("aiChat.suggestSummarize")}
              </button>
              <button type="button" onClick={() => draftRef.current?.setPlainText(t("aiChat.suggestDraft"))}>
                {t("aiChat.suggestDraft")}
              </button>
            </div>
          </div>
        ) : (
          messageGroups.map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="date-separator"><span>{fmtDateLabel(msgs[0].timestamp, t)}</span></div>
              {buildMessageStacks(msgs, (a, b) => a.role === b.role).map((stack) => {
                const outgoing = stack[0].role === "user";
                const variant = messageVisualVariant(outgoing, "ai");
                return (
                  <div
                    key={`${dateKey}-${stack[0].id}`}
                    className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
                  >
                    {!outgoing && (
                      <span className="message-stack-avatar agent" aria-hidden>AI</span>
                    )}
                    <div className="message-stack-bubbles">
                      {stack.map((msg, index) => (
                        <div key={msg.id} className="ai-message-stack-item">
                          <ChatMessageBubble
                            variant={variant}
                            position={stackPosition(index, stack.length)}
                            timeLabel={new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            copyText={stripModelThinking(msg.text)}
                            onDelete={() => handleDeleteAiMessage(msg.id)}
                          >
                            <AnswerRenderer
                              text={msg.text}
                              format={msg.role === "ai" ? msg.turn?.format : undefined}
                              blocks={msg.role === "ai" ? msg.turn?.blocks : undefined}
                              className="message-text"
                            />
                          </ChatMessageBubble>
                          {msg.role === "ai" && msg.turn && (
                            <AiTurnMetaChips
                              turn={msg.turn}
                              t={t}
                              onOpenActivity={onOpenActivity}
                              onOpenInbox={onOpenInbox}
                            />
                          )}
                          {msg.role === "ai" &&
                            msg.turn?.approvalItems?.map((item) => (
                              <AiInlineApprovalCard
                                key={item.id}
                                item={item}
                                resolved={msg.turn?.approvalResolved?.[item.id]}
                                busy={approvalBusyId === item.id}
                                t={t}
                                onApprove={() => void resolveInlineApproval(msg.id, item.id, "approved")}
                                onReject={() => void resolveInlineApproval(msg.id, item.id, "rejected")}
                              />
                            ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        {isAiLoading && (
          <div className="message-stack-row is-incoming">
            <span className="message-stack-avatar agent" aria-hidden>AI</span>
            <div className="message-stack-bubbles">
              <div className="message-bubble ai-incoming group-single">
                <span className="message-bubble-badge">{t("aiChat.badge")}</span>
                <p className="message-bubble-body ai-loading">{t("aiChat.thinking")}</p>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="messages-scroll-anchor" aria-hidden />
      </div>
      <footer className="chat-input">
        <ChatComposer
          value={aiInput}
          onChange={(next) => draftRef.current?.setPlainText(next)}
          onSend={() => {
            const text = (draftRef.current?.getPlainText() ?? aiInput).trim();
            if (text) void sendAiMessage(text);
          }}
          placeholder={t("aiChat.inputPlaceholder")}
          sendLabel={t("aiChat.send")}
          disabled={isAiLoading || !assistantReady}
          sendDisabled={isAiLoading || !assistantReady}
        />
      </footer>
    </>
  );
}
