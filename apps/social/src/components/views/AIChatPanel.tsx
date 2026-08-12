import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { useT, useI18n } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useIsInProcessMobileNode } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";
import { useChatStickToBottom } from "../../hooks/useChatStickToBottom.js";
import { ChainReportInlineCard } from "../ChainReportInlineCard.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { openLocalFile } from "../../lib/library-file-actions.js";
import { hasUsableModelProvider, stripModelThinking } from "@envoymesh/api";
import type { AgentActivityRecord, AnswerFormat, ChainReportReceivedEvent, ChatMessage, OwnerAgentApprovalSummary, OwnerAgentDomain, OwnerAgentTurnResult, StructuredBlock } from "@envoymesh/api";
import type { ChainReport } from "@envoymesh/protocol";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import {
  chatMessageToAiMessage,
  ENVOY_AI_THREAD_KEY,
  mergeAiChatMessages,
  type AiChatMessageView,
} from "../../lib/envoy-ai-chat.js";
import {
  getEnvoyAiInflight,
  setEnvoyAiInflight,
  subscribeEnvoyAiInflight,
} from "../../lib/envoy-ai-inflight.js";
import { messageVisualVariant } from "../../lib/chat-thread-kind.js";
import {
  loadAssistantLinkedTerminalSessionId,
  saveAssistantLinkedTerminalSessionId,
} from "../../lib/storage.js";
import { createAssistantDraftCrdt, ASSISTANT_DRAFT_SYNC_SCOPE } from "../../lib/assistant-draft-crdt.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatComposer } from "../ChatComposer.js";
import { AnswerRenderer } from "../AnswerRenderer.js";
import { ChatIcon, RemoveIcon, PluginIcon, PendingIcon } from "../../icons.js";
import type { TFunction } from "../../context/I18nContext.js";
import { ConfigureAiBanner } from "./ConfigureAiBanner.js";
import { SkillManagerModal } from "../SkillManagerModal.js";
import type { PendingApprovalSummary } from "@envoymesh/api";
import type { ExtAgentCommandCatalog } from "@envoymesh/api";
import {
  formatEnvoyAiSlashHelp,
  parseEnvoyAiSlashCommand,
} from "../../lib/envoy-ai-slash-commands.js";
import {
  formatMmxMediaResult,
  parseMmxMediaCommand,
} from "../../lib/ext-agent-slash-commands.js";
import { MmxMediaResultBlock } from "../MmxMediaResultBlock.js";
import type { RunMmxMediaCommandResult } from "@envoymesh/api";

interface AiMessageTurnMeta extends Pick<
  OwnerAgentTurnResult,
  "domain" | "jobId" | "correlationId" | "pendingApproval" | "routeId" | "intent" | "approvalItems" | "modelUsed"
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
  chainReport?: { chainId: string; report: ChainReport };
  mmxResult?: RunMmxMediaCommandResult;
}

export interface AIChatPanelProps {
  onOpenActivity?: () => void;
  onOpenInbox?: () => void;
  /** Navigate to the Chains tab (used by the inline chain-report card). */
  onOpenChains?: () => void;
  /** Open Settings → AI (Configure AI banner / no-model CTA). */
  onOpenSettingsAi?: () => void;
  /**
   * When false the panel may stay mounted but hidden (in-flight keep-alive).
   * Becoming true re-pins the transcript to the latest message.
   */
  active?: boolean;
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

function normalizeTurnDomain(domain: string | undefined): OwnerAgentDomain {
  const normalized = domain?.trim().toLowerCase();
  if (
    normalized === "social" ||
    normalized === "document" ||
    normalized === "service" ||
    normalized === "knowledge"
  ) {
    return normalized;
  }
  return "knowledge";
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
  const domain = normalizeTurnDomain(turn.domain);
  const showMeta = domain !== "knowledge" || turn.jobId || turn.pendingApproval || turn.modelUsed;
  if (!showMeta) return null;

  return (
    <div className="ai-turn-meta" role="status">
      {turn.modelUsed && (
        <span className="ai-turn-meta-chip ai-turn-meta-chip--model" title={`Model: ${turn.modelUsed}`}>
          {turn.modelUsed === "openclaw"
            ? "🧠 OpenClaw"
            : turn.modelUsed === "scripted-tutor"
              ? "📋 Guide"
              : "⚡ Native"}
        </span>
      )}
      {domain !== "knowledge" && (
        <span className="ai-turn-meta-chip ai-turn-meta-chip--domain">{domainLabel(domain, t)}</span>
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

export function AIChatPanel({
  onOpenActivity,
  onOpenInbox,
  onOpenChains,
  onOpenSettingsAi,
  active = true,
}: AIChatPanelProps = {}) {
  const t = useT();
  const { locale } = useI18n();
  const nodeService = useNodeService();
  const toast = useToast();
  const isMobileNode = useIsInProcessMobileNode();
  const { nodeConfig, humanProfile, nodeStatus, connectionStatus } = useNodeState();
  const homeRemote = connectionStatus?.homeRemote;
  const assistantHomeOffline =
    isMobileNode && homeRemote?.paired === true && homeRemote?.homeOnline === false;
  const assistantReady = nodeStatus === "running" && !assistantHomeOffline;
  const [localInUse, setLocalInUse] = useState(false);
  const [localModelName, setLocalModelName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void nodeService
        .getEnvoyLocalStatus()
        .then((st) => {
          if (cancelled) return;
          const active = Boolean(st.enabled && st.running);
          setLocalInUse(active);
          setLocalModelName(active ? (st.activeModelId?.trim() || null) : null);
        })
        .catch(() => {
          if (cancelled) return;
          setLocalInUse(false);
          setLocalModelName(null);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [nodeService, nodeConfig?.envoyLocal?.enabled]);
  const cloudConfigured = hasUsableModelProvider(nodeConfig?.modelProviders);
  const modelConfigured = cloudConfigured || localInUse;
  const configureAiCtaShownRef = useRef(false);
  const assistantBlockedHint = assistantHomeOffline
    ? t("aiChat.homeOffline")
    : nodeStatus === "starting"
      ? t("aiChat.nodeStarting")
      : nodeStatus === "stopping"
        ? t("aiChat.nodeStopping")
        : t("aiChat.nodeOffline");

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(getEnvoyAiInflight);
  useEffect(() => subscribeEnvoyAiInflight(() => setIsAiLoading(getEnvoyAiInflight())), []);
  const [linkedTerminalSessionId, setLinkedTerminalSessionId] = useState<string | null>(() =>
    loadAssistantLinkedTerminalSessionId(),
  );
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message?: string; variant?: "default" | "destructive"; onConfirm: () => void } | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalSummary[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [envoyAiSlashCatalog, setEnvoyAiSlashCatalog] =
    useState<ExtAgentCommandCatalog | null>(null);
  const draftRef = useRef<ReturnType<typeof createAssistantDraftCrdt> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadSeqRef = useRef(0);
  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const ownerId = selfOwnerId || nodeConfig?.profileDir || "anonymous";

  useEffect(() => {
    void nodeService
      .listPendingApprovals()
      .then(setPendingApprovals)
      .catch(() => setPendingApprovals([]));
    // EnvoyAI always keeps built-in web search on (no UI toggle).
    void Promise.resolve(
      (nodeService as { saveWebSearchEnabled?: (enabled: boolean) => Promise<unknown> })
        .saveWebSearchEnabled?.(true),
    ).catch(() => {});
  }, [nodeService]);

  useEffect(() => {
    let cancelled = false;
    void nodeService
      .getEnvoyAiCommandCatalog()
      .then((catalog) => {
        if (!cancelled) setEnvoyAiSlashCatalog(catalog);
      })
      .catch(() => {
        if (!cancelled) setEnvoyAiSlashCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const reloadEnvoyAiHistory = useCallback(async (turn?: OwnerAgentTurnResult) => {
    if (!selfOwnerId) return;
    const seq = ++reloadSeqRef.current;
    try {
      const rows = await nodeService.listChatHistory(ENVOY_AI_THREAD_KEY);
      if (seq !== reloadSeqRef.current) return;
      let converted = rows
        .map((row) => chatMessageToAiMessage(row, selfOwnerId))
        .filter((row): row is NonNullable<ReturnType<typeof chatMessageToAiMessage>> => row !== null)
        .map((row) => ({
          ...row,
          turn: row.turn as AiMessage["turn"],
        }));
      if (turn) {
        const latestAiIndex = converted.map((m) => m.role).lastIndexOf("ai");
        if (latestAiIndex >= 0) {
          converted = converted.map((msg, index) =>
            index === latestAiIndex
              ? {
                  ...msg,
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
                    modelUsed: turn.modelUsed,
                  },
                }
              : msg,
          );
        }
      }
      setAiMessages((prev) => {
        const serverIds = new Set(converted.map((m) => m.id));
        const serverUserTexts = new Set(
          converted.filter((m) => m.role === "user").map((m) => m.text.trim()),
        );
        const pendingLocal = prev.filter(
          (m) =>
            (m.role === "user" &&
              !serverIds.has(m.id) &&
              !serverUserTexts.has(m.text.trim())) ||
            Boolean(m.mmxResult) ||
            m.id.startsWith("local-mmx-"),
        );
        const merged = [...converted, ...pendingLocal].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        return merged;
      });
    } catch {
      /* node may still be starting */
    }
  }, [nodeService, selfOwnerId]);

  useEffect(() => {
    void reloadEnvoyAiHistory();
  }, [reloadEnvoyAiHistory]);

  useEffect(() => {
    if (!linkedTerminalSessionId || !nodeService.isConnected) return;
    let cancelled = false;
    void nodeService.listTerminalSessions().then((sessions) => {
      if (cancelled) return;
      const running = sessions.some(
        (s) => s.sessionId === linkedTerminalSessionId && s.state === "running",
      );
      if (!running) {
        saveAssistantLinkedTerminalSessionId(null);
        setLinkedTerminalSessionId(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [linkedTerminalSessionId, nodeService, nodeService.isConnected]);

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
    if (!selfOwnerId) return;
    const unsub = nodeService.on("chat:message", (msg: ChatMessage) => {
      const view = chatMessageToAiMessage(msg, selfOwnerId);
      if (!view) return;
      reloadSeqRef.current += 1;
      setAiMessages((prev) => {
        const withoutDuplicateUser =
          view.role === "user"
            ? prev.filter(
                (m) =>
                  !(
                    m.role === "user" &&
                    m.id !== view.id &&
                    m.text.trim() === view.text.trim()
                  ),
              )
            : prev;
        return mergeAiChatMessages(withoutDuplicateUser as AiChatMessageView[], [view]).map(
          (row) => ({
            ...row,
            turn: row.turn as AiMessage["turn"],
          }),
        );
      });
      // Only clear the "Thinking..." indicator when an AI response arrives —
      // NOT when the human message echo comes back (which would hide the
      // loading state before the AI has responded).
      if (view.role === "ai") {
        setEnvoyAiInflight(false);
      }
    });
    return unsub;
  }, [nodeService, selfOwnerId]);

  useEffect(() => {
    const unsub = nodeService.on("chain:report", (event: ChainReportReceivedEvent) => {
      void (async () => {
        try {
          const result = await nodeService.chainGetReport({ chainId: event.chainId });
          if (!result.report) return;
          const report = result.report as ChainReport;
          setAiMessages((prev) => [
            ...prev,
            {
              id: `chain-report-${event.chainId}-${event.createdAt ?? Date.now()}`,
              role: "ai" as const,
              text: event.executiveSummary ?? report.executiveSummary ?? "",
              timestamp: event.createdAt ?? new Date().toISOString(),
              chainReport: { chainId: event.chainId, report },
            },
          ]);
        } catch (err) {
          console.warn("[AIChatPanel] chain:report handler failed:", err);
        }
      })();
    });
    return unsub;
  }, [nodeService]);

  const scrollRevision = useMemo(() => {
    const last = aiMessages[aiMessages.length - 1];
    return `${aiMessages.length}:${last?.id ?? ""}:${last?.text?.length ?? 0}:${isAiLoading ? 1 : 0}`;
  }, [aiMessages, isAiLoading]);
  const { containerRef: messagesRef, onScroll: onMessagesScroll, pinToBottom } =
    useChatStickToBottom(ENVOY_AI_THREAD_KEY, scrollRevision);

  // Re-pin when the panel becomes visible again (e.g. return from another chat
  // while an answer was still in flight and the tree stayed mounted).
  useLayoutEffect(() => {
    if (!active) return;
    pinToBottom();
  }, [active, pinToBottom]);

  const sendAiMessage = async (question: string) => {
    if (!question.trim() || isAiLoading) return;

    pinToBottom();

    const mmxParsed = parseMmxMediaCommand(question);
    if (mmxParsed) {
      if (!mmxParsed.ok) {
        toast.showToast(mmxParsed.error, "error");
        return;
      }
      draftRef.current?.setPlainText("");
      toast.showToast(`Running MiniMax /${mmxParsed.params.kind}…`, "info");
      const userMsg: AiMessage = {
        id: `local-mmx-user-${crypto.randomUUID()}`,
        role: "user",
        text: question.trim(),
        timestamp: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, userMsg]);
      setEnvoyAiInflight(true);
      try {
        const result = await nodeService.runMmxMediaCommand(mmxParsed.params);
        setAiMessages((prev) => [
          ...prev,
          {
            id: `local-mmx-${crypto.randomUUID()}`,
            role: "ai",
            text: formatMmxMediaResult(result),
            timestamp: new Date().toISOString(),
            mmxResult: result,
          },
        ]);
        if (!result.ok) {
          toast.showToast(
            result.error ??
              `MiniMax /${result.kind} failed. Install mmx-cli and run mmx auth login.`,
            "error",
          );
        } else {
          toast.showToast(
            result.path ? `Saved: ${result.path}` : "MiniMax done",
            "success",
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.showToast(
          `MiniMax media failed: ${msg}. Install: npm install -g mmx-cli`,
          "error",
        );
        setAiMessages((prev) => [
          ...prev,
          {
            id: `local-mmx-${crypto.randomUUID()}`,
            role: "ai",
            text: `MiniMax failed: ${msg}`,
            timestamp: new Date().toISOString(),
            mmxResult: {
              ok: false,
              kind: mmxParsed.params.kind,
              error: msg,
            },
          },
        ]);
      } finally {
        setEnvoyAiInflight(false);
      }
      return;
    }

    const slash = parseEnvoyAiSlashCommand(question);
    if (slash) {
      if (slash.type === "help") {
        const help =
          envoyAiSlashCatalog != null
            ? formatEnvoyAiSlashHelp(envoyAiSlashCatalog)
            : "Slash commands unavailable — reconnect to your home node and try /help again.";
        toast.showToast(help, "info");
        draftRef.current?.setPlainText("");
        return;
      }
      if (slash.type === "clear") {
        draftRef.current?.setPlainText("");
        handleClearAiChat();
        return;
      }
      if (slash.type === "skills") {
        draftRef.current?.setPlainText("");
        setSkillsOpen(true);
        return;
      }
      if (slash.type === "approvals") {
        draftRef.current?.setPlainText("");
        setShowApprovals(true);
        return;
      }
      if (slash.type === "model") {
        draftRef.current?.setPlainText("");
        toast.showToast(
          "Change the EnvoyAI model in Settings → AI (model provider). Session /model override is not wired for OpenClaw yet.",
          "info",
        );
        return;
      }
      if (slash.type === "status") {
        draftRef.current?.setPlainText("");
        void (async () => {
          try {
            const status = await nodeService.getOpenClawStatus();
            const state = status.running
              ? "running"
              : status.enabled
                ? "enabled but not running"
                : "disabled";
            toast.showToast(
              `EnvoyAI / OpenClaw: ${state}${status.url ? ` (${status.url})` : ""}`,
              "info",
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.showToast(`Could not read OpenClaw status: ${msg}`, "error");
          }
        })();
        return;
      }
      if (slash.type === "report") {
        draftRef.current?.setPlainText("");
        void (async () => {
          setEnvoyAiInflight(true);
          try {
            const report = await nodeService.generateMeshIntelligenceReport();
            setAiMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "user",
                text: "/report",
                timestamp: new Date().toISOString(),
              },
              {
                id: crypto.randomUUID(),
                role: "ai",
                text: typeof report === "string" ? report : String(report),
                timestamp: new Date().toISOString(),
              },
            ]);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.showToast(`Mesh report failed: ${msg}`, "error");
          } finally {
            setEnvoyAiInflight(false);
          }
        })();
        return;
      }
      if (slash.type === "expand") {
        // Fall through with expanded NL prompt for OpenClaw mesh tools.
        question = slash.prompt;
      } else if (slash.type === "unknown_slash") {
        // Unknown /verb — still send as chat so OpenClaw can interpret if it wants.
      }
    }

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

    if (!modelConfigured) {
      const reply = configureAiCtaShownRef.current
        ? t("aiChat.configureAiAgain")
        : t("aiChat.configureAiTurnCta");
      configureAiCtaShownRef.current = true;
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
          text: reply,
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
    setEnvoyAiInflight(true);
    reloadSeqRef.current += 1;

    try {
      const outbound = linkedTerminalSessionId
        ? `[correlationId=${linkedTerminalSessionId}]\n${question.trim()}`
        : question.trim();
      const turn = await nodeService.runOwnerAgentTurn(outbound, {
        humanMessageId: userMsg.id,
        locale,
      });
      await reloadEnvoyAiHistory(turn);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("aiChat.responseFailed");
      const displayMsg =
        msg === "assistant.homeOffline" || msg === "homeRemote.offline"
          ? t("aiChat.homeOffline")
          : msg;
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: t("aiChat.errorPrefix", { message: displayMsg }),
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setEnvoyAiInflight(false);
    }
  };

  const handleDeleteAiMessage = (messageId: string) => {
    void nodeService.deleteChatMessage(ENVOY_AI_THREAD_KEY, messageId).then((result) => {
      if (result.ok) {
        setAiMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      }
    });
  };

  const handleClearAiChat = () => {
    if (aiMessages.length === 0) return;
    setConfirm({
      title: t("aiChat.clearConfirm"),
      message: t("aiChat.clearConfirmMessage"),
      variant: "destructive",
      onConfirm: () => {
        setConfirm(null);
        void nodeService.clearChatHistory(ENVOY_AI_THREAD_KEY).then(() => {
          setAiMessages([]);
        });
      },
    });
  };

  const handleOpenAiFile = useCallback(
    async (params: import("@envoymesh/api").OpenLocalFileParams) => {
      try {
        await openLocalFile(nodeService, params);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        toast.showToast(message, "error");
      }
    },
    [nodeService, toast],
  );

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

  const effectiveModelName = localInUse
    ? (localModelName ?? t("aiChat.envoyLocalFallbackName"))
    : nodeConfig?.modelProviders?.mode === "disabled"
      ? t("aiChat.aiDisabled")
      : nodeConfig?.modelProviders?.mode === "mock"
        ? t("aiChat.mockMode")
        : (nodeConfig?.modelProviders?.modelName?.trim() || t("aiChat.modelNotSet"));

  return (
    <>
      <header className="chat-header chat-header--assistant">
        <div className="chat-header-left">
          <span className="chat-header-avatar kind-ai" aria-hidden>AI</span>
          <div className="chat-header-titles">
            <span className="chat-name">
              {t("aiChat.title")}
              {effectiveModelName ? (
                <span className="chat-header-model-inline" title={effectiveModelName}>
                  {" "}
                  ({effectiveModelName})
                </span>
              ) : null}
            </span>
            <div className="chat-header-subtitle-row">
              <span className="chat-header-kind kind-ai">{t("aiChat.subtitle")}</span>
              <div className="chat-header-links">
                <button
                  type="button"
                  className="chat-header-link"
                  onClick={() => setSkillsOpen(true)}
                >
                  <PluginIcon size={14} />
                  <span>{t("h2a.skillsTitle")}</span>
                </button>

                {pendingApprovals.length > 0 && (
                  <button
                    type="button"
                    className="chat-header-link chat-header-link--badge"
                    onClick={() => setShowApprovals(true)}
                  >
                    <PendingIcon size={14} />
                    <span>{t("h2a.pendingApprovals", { count: pendingApprovals.length })}</span>
                  </button>
                )}

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
              </div>
            </div>
          </div>
        </div>
      </header>
      <ConfigureAiBanner onOpenSettingsAi={onOpenSettingsAi} />
      <div className="messages ai-messages-pane" ref={messagesRef} onScroll={onMessagesScroll}>
        {!assistantReady && (
          <p className="chat-reachability-hint ai-assistant-hint" role="status">
            {assistantBlockedHint}
          </p>
        )}
        {aiMessages.length === 0 ? (
          <div className="ai-welcome-container">
            {/* Welcome bubble from EnvoyAI — Layer 4: a conversational intro
                that feels like a message from a helpful contact. */}
            <div className="message-stack-row is-incoming ai-welcome-bubble">
              <div className="message-stack">
                <div className="message-bubble message-bubble--ai">
                  <div className="ai-welcome-greeting">{t("aiChat.welcomeGreeting")}</div>
                  <p>{modelConfigured ? t("aiChat.welcomeBody") : t("aiChat.welcomeBodyNoModel")}</p>
                  {!modelConfigured && onOpenSettingsAi && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ marginTop: "0.75rem" }}
                      onClick={onOpenSettingsAi}
                    >
                      {t("aiChat.configureAiButton")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="empty-state">
              <div className="empty-state-icon">
                <ChatIcon size={40} />
              </div>
              <div className="empty-state-title">{t("aiChat.emptyTitle")}</div>
              <div className="empty-state-desc">{t("aiChat.emptyDesc")}</div>
              <div className="ai-suggestions">
                {/* Onboarding-focused suggestions — Layer 2 */}
                <button type="button" onClick={() => draftRef.current?.setPlainText(t("aiChat.suggestGetStarted"))}>
                  {t("aiChat.suggestGetStarted")}
                </button>
                <button type="button" onClick={() => draftRef.current?.setPlainText(t("aiChat.suggestFindContacts"))}>
                  {t("aiChat.suggestFindContacts")}
                </button>
                <button type="button" onClick={() => draftRef.current?.setPlainText(t("aiChat.suggestWhatCanDo"))}>
                  {t("aiChat.suggestWhatCanDo")}
                </button>
                {/* General suggestions — shown when user has more context */}
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
                            {msg.chainReport ? (
                              <ChainReportInlineCard
                                chainId={msg.chainReport.chainId}
                                report={msg.chainReport.report}
                                onOpenChains={onOpenChains}
                              />
                            ) : msg.mmxResult ? (
                              <MmxMediaResultBlock result={msg.mmxResult} />
                            ) : (
                              <AnswerRenderer
                                text={msg.text}
                                format={msg.role === "ai" ? msg.turn?.format : undefined}
                                blocks={msg.role === "ai" ? msg.turn?.blocks : undefined}
                                className="message-text"
                                onOpenFile={handleOpenAiFile}
                                openFileLabel={t("library.open")}
                                openingFileLabel={t("library.opening")}
                              />
                            )}
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
      </div>
      {linkedTerminalSessionId ? (
        <div className="ai-linked-terminal-banner" role="status">
          <span>
            {t("aiChat.linkedTerminal", { sessionId: linkedTerminalSessionId.slice(0, 8) })}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              saveAssistantLinkedTerminalSessionId(null);
              setLinkedTerminalSessionId(null);
            }}
          >
            {t("aiChat.unlinkTerminal")}
          </button>
        </div>
      ) : null}
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
          autoFocus={active}
          slashCommands={envoyAiSlashCatalog?.commands ?? []}
        />
      </footer>
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          variant={confirm.variant}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {skillsOpen && <SkillManagerModal onClose={() => setSkillsOpen(false)} />}

      {showApprovals && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowApprovals(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("h2a.pendingApprovals", { count: pendingApprovals.length })}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{t("h2a.pendingApprovals", { count: pendingApprovals.length })}</h2>
            <ul className="h2a-rail-list">
              {pendingApprovals.map((item) => (
                <li key={item.id}>
                  <strong>{item.title.slice(0, 64)}</strong>
                  <span className="assistant-top-bar__approval-type">{item.actionType}</span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              {onOpenInbox && (
                <button type="button" className="secondary" onClick={() => { setShowApprovals(false); onOpenInbox(); }}>
                  {t("h2a.openInbox")}
                </button>
              )}
              <button type="button" className="primary" onClick={() => setShowApprovals(false)}>
                {t("common.close", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
