/**
 * U4 — dedicated envoy-harness chat panel.
 *
 * The first-class "Envoy Harness" surface in the desktop app (the way
 * PiChatPanel is Pi's). Mirrors PiChatPanel's lightweight turn model but
 * talks to the envoy-harness runtime via its own RPCs and adds a
 * peer-cluster strip (the configured execution pool — Pattern A).
 *
 * Reuses the pi-chat-* styles deliberately: the panel lives in the same
 * terminal view and the layout is identical; a future theming pass can
 * give it its own classes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useT } from "../../context/I18nContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"
import { useEhTurnQueue, type EhSubmitMode } from "../../hooks/useEhTurnQueue.js"
import { useEhTurnContext } from "../../hooks/useEhTurnContext.js"
import { useEhAttachments } from "../../hooks/useEhAttachments.js"
import { useToast } from "../../hooks/useToast.js"
import type {
  EnvoyHarnessStatus,
  EhUserQuestionEvent,
  EhTurnHintsEvent,
  EhActivityEvent,
  EhPermissionEvent,
  EhChatTurn,
} from "@envoymesh/api"
import { stripModelThinking } from "@envoymesh/api"
import { ProjectFolderLink } from "../ProjectFolderLink.js"
import { EhChatMessageText } from "../ehui/EhChatMessageText.js"
import { EhStillWorkingIndicator } from "../ehui/EhStillWorkingIndicator.js"
import { EhChatComposer } from "../ehui/EhChatComposer.js"
import { EhComposerDockStack } from "../ehui/EhComposerDockStack.js"
import { AgentAttachmentComposerLeading } from "../AgentAttachmentComposerLeading.js"
import { EhuiPanelModal } from "@envoymesh/envoy-harness-ehui"
import {
  formatCluster,
  formatDiscoveryEvent,
  formatTeamJobs,
} from "@envoymesh/envoy-harness-ehui"
import { createRemoteEhuiDataSource } from "../../lib/envoy-harness-ehui-data-source.js"
import {
  ENVOY_HARNESS_SLASH_COMMANDS,
  envoyHarnessSlashName,
  formatEnvoyHarnessSlashHelp,
  isEnvoyHarnessLocalSlashCommand,
  parseEnvoyHarnessCdCommand,
  parseEnvoyHarnessModelCommand,
} from "../../lib/envoy-harness-slash-commands.js"
import { EnvoyHarnessEhuiRail } from "../ehui/EnvoyHarnessEhuiRail.js"

interface EnvoyHarnessTurn {
  id: string
  kind: "user" | "assistant" | "system"
  text: string
  tone?: "info" | "success" | "error"
  createdAt: number
}

export interface EnvoyHarnessPanelProps {
  /** Sidebar chat thread id (`__envoy_harness__:<id>`); null = active/legacy chat. */
  chatId?: string | null
  /** Navigate back to the chat thread list (mobile / swipe-back). */
  onBackToChats?: () => void
}

function stateLabelKey(state: EnvoyHarnessStatus["state"]): string {
  switch (state) {
    case "ready":
      return "eh.stateReady"
    case "starting":
      return "eh.stateStarting"
    case "disabled":
      return "eh.stateDisabled"
    case "error":
    default:
      return "eh.stateError"
  }
}

function stateLabelFallback(state: EnvoyHarnessStatus["state"]): string {
  switch (state) {
    case "ready":
      return "Ready"
    case "starting":
      return "Starting…"
    case "disabled":
      return "Disabled"
    case "error":
    default:
      return "Error"
  }
}

function stateBadgeClass(state: EnvoyHarnessStatus["state"]): string {
  switch (state) {
    case "ready":
      return "pi-state-badge pi-state-badge--ready"
    case "starting":
      return "pi-state-badge pi-state-badge--starting"
    case "error":
      return "pi-state-badge pi-state-badge--error"
    case "disabled":
    default:
      return "pi-state-badge pi-state-badge--muted"
  }
}

/** Runtime stores `"<provider>:<model>"`; UI shows the bare model name like EnvoyAI. */
function displayModelName(model: string | undefined): string | undefined {
  if (!model?.trim()) return undefined
  const trimmed = model.trim()
  const colon = trimmed.indexOf(":")
  return colon >= 0 ? trimmed.slice(colon + 1) : trimmed
}

function historyTurnsToPanelTurns(history: EhChatTurn[]): EnvoyHarnessTurn[] {
  return history.map((turn, index) => ({
    id: turn.id || `eh-hist-${index}`,
    kind: turn.role,
    text: turn.text,
    createdAt: turn.createdAt ? Date.parse(turn.createdAt) : index,
  }))
}

export function EnvoyHarnessPanel({ chatId, onBackToChats }: EnvoyHarnessPanelProps) {
  const t = useT()
  const toast = useToast()
  const nodeService = useNodeService()
  const threadRef = useRef<HTMLDivElement | null>(null)
  const loadedHistoryKeyRef = useRef<string | undefined>(undefined)

  const [draft, setDraft] = useState("")
  const [turns, setTurns] = useState<EnvoyHarnessTurn[]>([])
  const [status, setStatus] = useState<EnvoyHarnessStatus | null>(null)
  const [savingProject, setSavingProject] = useState(false)
  const [peers, setPeers] = useState<
    ReadonlyArray<{ id: string; model?: string; capabilities?: readonly string[] }>
  >([])
  const [ehuiRefreshKey, setEhuiRefreshKey] = useState(0)
  const [pendingQuestion, setPendingQuestion] = useState<EhUserQuestionEvent | null>(
    null,
  )
  const [pendingPermission, setPendingPermission] = useState<EhPermissionEvent | null>(
    null,
  )
  const [turnHints, setTurnHints] = useState<EhTurnHintsEvent | null>(null)
  const [showGitDiffReview, setShowGitDiffReview] = useState(false)
  const [dismissedChanges, setDismissedChanges] = useState(false)
  const [activitySummary, setActivitySummary] = useState<string | undefined>(
    undefined,
  )

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        nodeService.getEnvoyHarnessStatus(),
        nodeService.listEnvoyHarnessPeers(),
      ])
      setStatus(s)
      setPeers(p)
    } catch {
      // Transient — keep last-known state.
    }
  }, [nodeService])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (status?.state !== "ready") return undefined
    const historyKey = chatId ?? status.cwd ?? ""
    if (!historyKey) return undefined
    if (loadedHistoryKeyRef.current === historyKey) return undefined
    setTurns([])
    let cancelled = false
    const loadHistory = chatId
      ? nodeService.openEnvoyHarnessChat(chatId)
      : nodeService.getEnvoyHarnessChatHistory()
    void loadHistory.then((history) => {
      if (cancelled) return
      loadedHistoryKeyRef.current = historyKey
      setTurns(historyTurnsToPanelTurns(history.turns))
    }).catch(() => {
      if (!cancelled) loadedHistoryKeyRef.current = historyKey
    })
    return () => {
      cancelled = true
    }
  }, [chatId, nodeService, status?.cwd, status?.state])

  useEffect(() => {
    return nodeService.on("eh:user_question", (event) => {
      setPendingQuestion(event)
    })
  }, [nodeService])

  useEffect(() => {
    return nodeService.on("eh:permission", (event) => {
      setPendingPermission(event)
    })
  }, [nodeService])

  useEffect(() => {
    return nodeService.on("eh:turn_hints", (event) => {
      setTurnHints(event)
    })
  }, [nodeService])

  useEffect(() => {
    return nodeService.on("eh:activity", (event: EhActivityEvent) => {
      if (event.summary.trim().length > 0) {
        setActivitySummary(event.summary)
      }
    })
  }, [nodeService])

  useEffect(() => {
    return nodeService.on("eh:prompt_busy", (event) => {
      if (!event.busy) {
        setActivitySummary(undefined)
        setPendingQuestion(null)
        setPendingPermission(null)
      }
    })
  }, [nodeService])

  const ehAttachments = useEhAttachments(status?.cwd, (message) =>
    toast.showToast(message, "error"),
  )
  const turnContext = useEhTurnContext({
    projectCwd: status?.cwd,
    subscribeActivity: (handler) => nodeService.on("eh:activity", handler),
    subscribeFilesChanged: (handler) => nodeService.on("eh:files_changed", handler),
  })

  const ehuiDataSource = useMemo(
    () => createRemoteEhuiDataSource(nodeService),
    [nodeService],
  )

  // Poll while the runtime is down (matches Pi/OpenClaw patterns).
  useEffect(() => {
    if (status && status.state !== "ready") {
      const id = window.setInterval(() => {
        void refresh()
      }, 5_000)
      return () => window.clearInterval(id)
    }
    return undefined
  }, [status, refresh])

  const appendTurn = useCallback((turn: Omit<EnvoyHarnessTurn, "id" | "createdAt">) => {
    setTurns((prev) => [
      ...prev,
      { ...turn, id: crypto.randomUUID(), createdAt: Date.now() },
    ])
  }, [])

  const setSystem = useCallback(
    (text: string, tone: "info" | "success" | "error") => {
      appendTurn({ kind: "system", text, tone })
    },
    [appendTurn],
  )

  const upsertAssistantTurn = useCallback((turnId: string, text: string) => {
    const visible = stripModelThinking(text)
    setTurns((prev) => {
      const idx = prev.findIndex((turn) => turn.id === turnId)
      if (idx >= 0) {
        if (!visible) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], text: visible }
        return next
      }
      if (!visible) return prev
      return [
        ...prev,
        { id: turnId, kind: "assistant", text: visible, createdAt: Date.now() },
      ]
    })
  }, [])

  const {
    busy,
    busyRef,
    queue,
    submit: submitToQueue,
    removeFromQueue,
    updateQueued,
    clearQueue,
    cancelActiveTurn,
  } = useEhTurnQueue({
    startTurn: (text, attachments) =>
      nodeService.startEnvoyHarnessTurn(text, attachments),
    subscribeTurnComplete: (handler) => nodeService.on("eh:turn_complete", handler),
    subscribeTurnToken: (handler) => nodeService.on("eh:turn_token", handler),
    subscribePromptBusy: (handler) => nodeService.on("eh:prompt_busy", handler),
    getTurnStatus: () => nodeService.getEnvoyHarnessTurnStatus(),
    cancelTurn: () => nodeService.cancelEnvoyHarnessTurn(),
    onUserTurn: (text) => appendTurn({ kind: "user", text }),
    onAssistantStreaming: (text, turnId) => upsertAssistantTurn(turnId, text),
    onAssistantTurn: (response, turnId, event) => {
      const visible = stripModelThinking(response)
      if (visible) {
        upsertAssistantTurn(turnId, visible)
      } else {
        setSystem(t("eh.emptyResponse", "envoy-harness returned an empty response."), "info")
      }
      // Claude/Codex-style completion footer: tool stats + changed files.
      const files = event?.changedFiles ?? []
      const stats = turnContext.lastTurnSummaryRef.current
        ?.replace(/^done\s*[—:-]\s*/i, "")
        .trim()
      const parts: string[] = []
      if (stats) parts.push(stats)
      if (files.length > 0) {
        parts.push(
          t("eh.filesChangedShort", "{count} file(s) changed", {
            count: files.length,
          }),
        )
      }
      if (parts.length > 0) {
        setSystem(`✓ ${parts.join(" · ")}`, "success")
      }
    },
    onSystem: (text, tone) => {
      setSystem(
        t("eh.sendFailed", "Failed to reach envoy-harness: {error}", { error: text }),
        tone,
      )
      void refresh()
    },
    onTurnStart: () => {
      setTurnHints(null)
      setActivitySummary(undefined)
      setDismissedChanges(false)
      turnContext.resetTurnContext()
    },
    onTurnEnd: () => {
      setEhuiRefreshKey((k) => k + 1)
      ehAttachments.clear()
    },
  })

  const handleSlashCommand = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const slash = envoyHarnessSlashName(trimmed)
      if (slash === "clear" || slash === "new" || slash === "reset") {
        setDraft("")
        if (busy) {
          setSystem(t("eh.slashWhileBusy", "Finish or /cancel the current turn first."), "info")
          return
        }
        try {
          await nodeService.resetEnvoyHarnessChat(chatId ?? undefined)
          setTurns([])
          clearQueue()
          loadedHistoryKeyRef.current = chatId ?? status?.cwd
          setSystem(
            t("eh.chatReset", "Started a new chat for this project."),
            "success",
          )
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          setSystem(msg, "error")
        }
        return
      }
      if (slash === "cancel") {
        setDraft("")
        if (busy) {
          await cancelActiveTurn()
          setSystem(t("eh.turnCancelled", "Turn cancelled."), "info")
        }
        return
      }
      if (busy) {
        setSystem(t("eh.slashWhileBusy", "Finish or /cancel the current turn first."), "info")
        setDraft("")
        return
      }
      if (slash === "status") {
        await refresh()
        setSystem(t("eh.statusRefreshed", "Status refreshed."), "info")
        setDraft("")
        return
      }
      if (slash === "peers" || slash === "list-agents") {
        const list = await nodeService.listEnvoyHarnessPeers()
        if (list.length === 0) {
          setSystem(t("eh.noPeers", "No peer cluster configured."), "info")
        } else {
          setSystem(
            list.map((p) => `${p.id}${p.model ? ` (${p.model})` : ""}`).join("\n"),
            "info",
          )
        }
        setDraft("")
        return
      }
      if (slash === "cluster") {
        try {
          const cluster = (await nodeService.invokeEnvoyHarnessEhui({
            op: "clusterStatus",
          })) as Parameters<typeof formatCluster>[0]
          setSystem(formatCluster(cluster), "info")
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          setSystem(
            t("eh.clusterFailed", "Failed to read cluster status: {error}", {
              error: msg,
            }),
            "error",
          )
        }
        setDraft("")
        return
      }
      if (slash === "team") {
        try {
          const jobs = (await nodeService.invokeEnvoyHarnessEhui({
            op: "teamJobs",
          })) as Parameters<typeof formatTeamJobs>[0]
          setSystem(formatTeamJobs(jobs), "info")
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          setSystem(
            t("eh.teamFailed", "Failed to read team jobs: {error}", {
              error: msg,
            }),
            "error",
          )
        }
        setDraft("")
        return
      }
      if (slash === "trace") {
        try {
          const events = (await nodeService.invokeEnvoyHarnessEhui({
            op: "discoverySnapshot",
          })) as Parameters<typeof formatDiscoveryEvent>[0][]
          if (events.length === 0) {
            setSystem(t("eh.traceEmpty", "No peer discovery events yet."), "info")
          } else {
            const lines = events.slice(-10).map((e) => formatDiscoveryEvent(e))
            setSystem(
              t("eh.traceHeading", "Recent peer events ({count}):\n{events}", {
                count: events.length,
                events: lines.join("\n"),
              }),
              "info",
            )
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          setSystem(
            t("eh.traceFailed", "Failed to read peer trace: {error}", {
              error: msg,
            }),
            "error",
          )
        }
        setDraft("")
        return
      }
      if (slash === "search") {
        const term = trimmed.slice(slash.length + 1).trim()
        if (!term) {
          setSystem(
            t("eh.searchUsage", "Usage: /search <term> — search this conversation."),
            "info",
          )
        } else {
          const needle = term.toLowerCase()
          const matches = turns
            .map((turn, index) => ({ turn, index }))
            .filter(({ turn }) => turn.text.toLowerCase().includes(needle))
          if (matches.length === 0) {
            setSystem(
              t("eh.searchNoMatches", "No matches for “{term}”.", { term }),
              "info",
            )
          } else {
            setSystem(
              matches
                .map(
                  ({ turn, index }) =>
                    `[${index + 1}] (${turn.kind}) ${turn.text
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 180)}`,
                )
                .join("\n\n"),
              "info",
            )
          }
        }
        setDraft("")
        return
      }
      if (slash === "help") {
        setSystem(
          formatEnvoyHarnessSlashHelp({
            model: status?.model,
            cwd: status?.cwd,
          }),
          "info",
        )
        setDraft("")
        return
      }
      const modelAction = parseEnvoyHarnessModelCommand(trimmed)
      if (modelAction?.type === "show") {
        setSystem(
          status?.model
            ? t("eh.modelShow", "Active model: {model}", { model: status.model })
            : t("eh.modelUnknown", "No model configured — set one in Settings → AI."),
          "info",
        )
        setDraft("")
        return
      }
      const cdAction = parseEnvoyHarnessCdCommand(trimmed)
      if (cdAction) {
        if (cdAction.type === "show") {
          setSystem(
            status?.cwd
              ? t("eh.projectCurrent", "Project folder: {path}", { path: status.cwd })
              : t(
                  "eh.projectUnset",
                  "No project folder set — use /cd <path> or click the folder link above.",
                ),
            "info",
          )
          setDraft("")
          return
        }
        setSavingProject(true)
        try {
          const s = await nodeService.setEnvoyHarnessProjectPath(cdAction.path)
          setStatus(s)
          setSystem(
            s.cwd
              ? t("eh.projectSet", "Project folder → {path}", { path: s.cwd })
              : t("eh.projectSetUnknown", "Project folder updated."),
            "success",
          )
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          setSystem(
            t("eh.projectSetFailed", "Failed to set project folder: {error}", { error: msg }),
            "error",
          )
        } finally {
          setSavingProject(false)
          setDraft("")
        }
      }
    },
    [busy, cancelActiveTurn, clearQueue, nodeService, refresh, setSystem, status, t, turns],
  )

  const submitDraft = useCallback(
    (mode: EhSubmitMode) => {
      const trimmed = draft.trim()
      const refs = ehAttachments.toRefs()
      if (!trimmed && refs.length === 0) return

      if (isEnvoyHarnessLocalSlashCommand(trimmed)) {
        void handleSlashCommand(trimmed)
        return
      }

      if (status && status.state !== "ready") {
        const hint =
          status.state === "disabled"
            ? t(
                "eh.disabledHint",
                "envoy-harness is disabled. Configure a model in Settings → AI.",
              )
            : status.error
              ? t("eh.errorHint", "envoy-harness is not ready: {error}", {
                  error: status.error,
                })
              : t("eh.startingHint", "envoy-harness is starting — try again in a moment.")
        setSystem(hint, "error")
        return
      }

      submitToQueue(trimmed, mode, ehAttachments.toRefs())
      setDraft("")
      ehAttachments.clear()
    },
    [draft, ehAttachments, handleSlashCommand, setSystem, status, submitToQueue, t],
  )

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, busy])

  const placeholder = busy
    ? pendingQuestion
      ? t("eh.waitingForYouShort", "Waiting for your answer…")
      : queue.length > 0
        ? t("eh.promptQueueMore", "Add to queue or ⌘↵ to send now…")
        : t("eh.promptWhileBusy", "Queue a follow-up (Enter) or send now (⌘↵)…")
    : t("eh.promptPlaceholder", "Ask envoy-harness to code, refactor, or explain…")
  const modelLabel = displayModelName(status?.model)
  const showCluster =
    peers.length > 0 || (status != null && status.peers.failed > 0)

  return (
    <section className="pi-chat-panel chat-area eh-panel" aria-label={t("eh.title", "envoy-harness")}>
      <header className="pi-chat-header eh-chat-header">
        <div className="pi-chat-title-row">
          {onBackToChats ? (
            <button
              type="button"
              className="pi-chat-back"
              onClick={onBackToChats}
              aria-label={t("chat.back", "Back")}
            >
              ‹
            </button>
          ) : null}
          <span className="pi-chat-avatar" aria-hidden="true">
            EH
          </span>
          <div className="pi-chat-titles">
            <h2 className="pi-chat-title">
              {t("eh.title", "Envoy")}
              {modelLabel ? (
                <span className="chat-header-model-inline" title={status?.model}>
                  {" "}
                  ({modelLabel})
                </span>
              ) : null}
            </h2>
            <p className="pi-chat-subtitle">
              {t("eh.subtitle", "Coding Agent (ACP)")}
              {showCluster ? (
                <span className="eh-header-cluster" title={t("eh.peersTitle", "Configured peer cluster")}>
                  {" · "}
                  {t("eh.peers", "cluster {connected}/{total}", {
                    connected: status?.peers.connected ?? peers.length,
                    total: peers.length + (status?.peers.failed ?? 0),
                  })}
                </span>
              ) : null}
            </p>
          </div>
          {status ? (
            <span
              className={stateBadgeClass(status.state)}
              title={status.error ?? undefined}
              aria-live="polite"
            >
              {t(stateLabelKey(status.state), stateLabelFallback(status.state))}
            </span>
          ) : null}
        </div>
        <div className="eh-header-link-row">
          <ProjectFolderLink
            path={status?.cwd}
            onSave={async (path) => {
              const s = await nodeService.setEnvoyHarnessProjectPath(path)
              setStatus(s)
              setSystem(
                s.cwd
                  ? t("eh.projectSet", "Project folder → {path}", { path: s.cwd })
                  : t("eh.projectSetUnknown", "Project folder updated."),
                "success",
              )
            }}
            emptyLabel={t(
              "settings.ai.aiEngine.projectFolderPlaceholder",
              "No folder selected",
            )}
            chooseTitle={t("eh.chooseProjectTitle", "Choose Envoy project folder")}
            changeTitle={t("eh.changeProjectTitle", "Change Envoy project folder")}
            description={t(
              "eh.chooseProjectDescBrowse",
              "Envoy runs in this folder (reads AGENTS.md, edits files, runs shell). Use Browse to pick a folder.",
            )}
            ariaLabel={t("eh.projectAriaLabel", "Envoy harness project folder")}
            confirmLabel={t("eh.projectSetBtn", "Set project folder")}
          />
        </div>
        <EnvoyHarnessEhuiRail refreshKey={ehuiRefreshKey} />
      </header>

      <div className="pi-chat-thread" ref={threadRef}>
        {turns.length === 0 ? (
          <div className="pi-chat-empty">
            <p className="pi-chat-empty-title">
              {t("eh.emptyTitle", "envoy-harness — your coding agent")}
            </p>
            <p className="pi-chat-empty-body">
              {t(
                "eh.emptyBody",
                "Ask envoy-harness to write code, refactor, explain, or run tools. Sub-agent work can fan out to the configured peer cluster (different machines / models).",
              )}
            </p>
            {peers.length > 0 ? (
              <div className="pi-chat-empty-hint">
                <div>{t("eh.peersHeading", "Peer cluster:")}</div>
                {peers.map((p) => (
                  <div key={p.id} className="eh-peer-chip">
                    {p.id}
                    {p.model ? ` (${p.model})` : ""}
                    {p.capabilities && p.capabilities.length > 0
                      ? ` — ${p.capabilities.join(", ")}`
                      : ""}
                  </div>
                ))}
              </div>
            ) : null}
            {status?.state === "disabled" ? (
              <p className="pi-chat-empty-hint">
                {t(
                  "eh.disabledHint",
                  "envoy-harness is disabled. Configure a model in Settings → AI.",
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`pi-chat-turn pi-chat-turn--${turn.kind}${
              turn.tone ? ` pi-chat-turn--${turn.tone}` : ""
            }`}
          >
            {turn.kind === "assistant" ? (
              <EhChatMessageText
                text={turn.text}
                className="pi-chat-turn-text eh-chat-turn-markdown"
              />
            ) : (
              <div className="pi-chat-turn-text">{turn.text}</div>
            )}
          </div>
        ))}

        {busy ? (
          <EhStillWorkingIndicator
            active={busy}
            waitingForUser={pendingQuestion !== null}
            activitySummary={activitySummary}
            activityLog={turnContext.activityLog}
            onCancel={() => {
              void cancelActiveTurn().then(() => {
                setActivitySummary(undefined)
                setPendingQuestion(null)
                setSystem(t("eh.turnCancelled", "Turn cancelled."), "info")
              })
            }}
          />
        ) : null}
      </div>


      <EhComposerDockStack
        permission={pendingPermission}
        onPermissionDismiss={() => setPendingPermission(null)}
        onPermissionResponded={(allowed) =>
          setSystem(
            allowed
              ? t("eh.permissionAllowed", "Tool allowed.")
              : t("eh.permissionDenied", "Tool denied."),
            "info",
          )
        }
        question={pendingQuestion}
        onQuestionDismiss={() => setPendingQuestion(null)}
        onQuestionResponded={(label) =>
          setSystem(t("eh.youSelected", "You chose: {label}", { label }), "info")
        }
        turnHints={turnHints}
        onTurnHintsDismiss={() => setTurnHints(null)}
        onSelectFollowUp={(text) => {
          setDraft(text)
          threadRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
        }}
        queue={queue}
        onQueueUpdate={updateQueued}
        onQueueRemove={removeFromQueue}
        onQueueClear={clearQueue}
        projectCwd={status?.cwd}
        contextFiles={[...new Set([...ehAttachments.pathList, ...turnContext.touchedFiles])]}
        attachedPaths={ehAttachments.pathList}
        onRemoveAttached={(path) => {
          const att = ehAttachments.attachments.find((a) => a.path === path)
          if (att) ehAttachments.remove(att.id)
        }}
        changedFiles={dismissedChanges ? [] : turnContext.touchedFiles}
        onReviewChanges={() => setShowGitDiffReview(true)}
        onDismissChanges={() => setDismissedChanges(true)}
        composer={
          <form
            className="pi-chat-composer eh-composer"
            onSubmit={(e) => {
              e.preventDefault()
              submitDraft(busyRef.current ? "queue" : "send")
            }}
          >
            <EhChatComposer
              value={draft}
              onChange={setDraft}
              busy={busy}
              onSubmit={(mode) => {
                submitDraft(mode)
              }}
              placeholder={placeholder}
              autoFocus
              slashCommands={ENVOY_HARNESS_SLASH_COMMANDS}
              hasAttachments={ehAttachments.attachments.length > 0}
              attachLeading={
                <AgentAttachmentComposerLeading
                  attachments={ehAttachments.attachments}
                  busy={ehAttachments.busy}
                  disabled={!status?.cwd}
                  pickTitle={t("eh.attachProjectFile", "Attach project file")}
                  attachAriaLabel={t("eh.attachProjectFile", "Attach project file")}
                  fileInputRef={ehAttachments.fileInputRef}
                  onFileInputChange={ehAttachments.handleFileInputChange}
                  onOpenPicker={ehAttachments.openPicker}
                  onRemove={ehAttachments.remove}
                  onClearAll={ehAttachments.clear}
                />
              }
            />
          </form>
        }
      />

      {showGitDiffReview ? (
        <EhuiPanelModal
          panel="git-diff"
          dataSource={ehuiDataSource}
          refreshKey={ehuiRefreshKey}
          onClose={() => setShowGitDiffReview(false)}
          overlayClassName="modal-overlay"
          panelClassName="modal-panel eh-ehui-modal-panel"
          closeButtonClassName="modal-close"
          actionButtonClassName="pi-chat-restart-btn"
          primaryActionButtonClassName="pi-chat-send"
          inputClassName="pi-chat-input eh-ehui-field"
        />
      ) : null}
    </section>
  )
}
