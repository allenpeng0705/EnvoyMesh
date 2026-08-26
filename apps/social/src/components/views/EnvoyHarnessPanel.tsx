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
import { useEhTimeline } from "../../hooks/useEhTimeline.js"
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
  EhTurnReview,
  ExtAgentCommandDescriptor,
} from "@envoymesh/api"
import { stripModelThinking } from "@envoymesh/api"
import { CopyIcon, RemoveIcon, SearchIcon } from "../../icons.js"
import { ProjectFolderLink } from "../ProjectFolderLink.js"
import { EhChatMessageText } from "../ehui/EhChatMessageText.js"
import { EhStillWorkingIndicator } from "../ehui/EhStillWorkingIndicator.js"
import { EhTimelineFeed } from "../ehui/EhTimelineFeed.js"
import { EhTurnReviewModal } from "../ehui/EhTurnReviewModal.js"
import { EhChatComposer } from "../ehui/EhChatComposer.js"
import { EhComposerDockStack } from "../ehui/EhComposerDockStack.js"
import { EnvoyHarnessEhuiRail } from "../ehui/EnvoyHarnessEhuiRail.js"
import { AgentAttachmentComposerLeading } from "../AgentAttachmentComposerLeading.js"
import { EhuiPanelModal } from "@envoymesh/envoy-harness-ehui"
import {
  formatCluster,
  formatDiscoveryEvent,
  formatTeamJobs,
} from "@envoymesh/envoy-harness-ehui"
import { createRemoteEhuiDataSource } from "../../lib/envoy-harness-ehui-data-source.js"
import {
  envoyHarnessSlashName,
  formatEnvoyHarnessSlashHelp,
  isEnvoyHarnessLocalSlashCommand,
  parseEnvoyHarnessCdCommand,
  parseEnvoyHarnessModelCommand,
} from "../../lib/envoy-harness-slash-commands.js"
import { SearchHighlightedText } from "../../lib/eh-transcript-search-highlight.js"

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

function scrollTranscriptTurnIntoView(el: HTMLDivElement): void {
  el.scrollIntoView?.({ block: "center", behavior: "smooth" })
}

function historyTurnsToPanelTurns(history: EhChatTurn[]): EnvoyHarnessTurn[] {
  return history.map((turn, index) => ({
    id: turn.id || `eh-hist-${index}`,
    kind: turn.role,
    text: turn.text,
    createdAt: turn.createdAt ? Date.parse(turn.createdAt) : index,
  }))
}

/**
 * Keep optimistic local turns (esp. the in-flight user message) when a
 * late history RPC would otherwise wipe them. Match by role+text so
 * `eh-msg-N` ids from disk and local UUIDs still dedupe.
 */
function mergeHistoryWithLocalTurns(
  incoming: EnvoyHarnessTurn[],
  local: EnvoyHarnessTurn[],
): EnvoyHarnessTurn[] {
  if (local.length === 0) return incoming
  if (incoming.length === 0) return local
  const covered = new Set(
    incoming.map((turn) => `${turn.kind}\0${turn.text}`),
  )
  const extras: EnvoyHarnessTurn[] = []
  for (let i = local.length - 1; i >= 0; i -= 1) {
    const turn = local[i]!
    const key = `${turn.kind}\0${turn.text}`
    if (covered.has(key)) break
    extras.unshift(turn)
  }
  return extras.length === 0 ? incoming : [...incoming, ...extras]
}

export function EnvoyHarnessPanel({ chatId, onBackToChats }: EnvoyHarnessPanelProps) {
  const t = useT()
  const toast = useToast()
  const nodeService = useNodeService()
  const threadRef = useRef<HTMLDivElement | null>(null)
  const loadedHistoryKeyRef = useRef<string | undefined>(undefined)
  // Hosts (and test mocks) may hand the panel a nodeService whose
  // identity changes every render. Keep the latest in refs so the
  // history effect can depend only on the stable chat/cwd keys — an
  // unstable dep would re-run the effect every render and spin a
  // chatReady(false → true) render loop.
  const nodeServiceRef = useRef(nodeService)
  nodeServiceRef.current = nodeService

  const [draft, setDraft] = useState("")
  const [transcriptSearchOpen, setTranscriptSearchOpen] = useState(false)
  const [transcriptQuery, setTranscriptQuery] = useState("")
  const [transcriptMatch, setTranscriptMatch] = useState(0)
  const transcriptSearchRef = useRef<HTMLInputElement>(null)
  const transcriptTurnRefs = useRef(new Map<string, HTMLDivElement>())
  const searchTelemetryActiveRef = useRef(false)
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
  const [turnReview, setTurnReview] = useState<EhTurnReview | null>(null)
  const [dismissedChanges, setDismissedChanges] = useState(false)
  const [lastReviewTurnId, setLastReviewTurnId] = useState<string | null>(null)
  const [activitySummary, setActivitySummary] = useState<string | undefined>(
    undefined,
  )
  const [chatReady, setChatReady] = useState(false)
  const [slashCommands, setSlashCommands] = useState<ExtAgentCommandDescriptor[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const [contextHintDismissed, setContextHintDismissed] = useState(false)
  /** For the legacy bare thread key: the active chat that owns this cwd. */
  const [resolvedChatId, setResolvedChatId] = useState<string | null>(null)
  const effectiveChatId = chatId ?? resolvedChatId
  const timeline = useEhTimeline(nodeService, effectiveChatId)
  const visibleTurns = useMemo(() => {
    const query = transcriptQuery.trim().toLocaleLowerCase()
    return query ? turns.filter((turn) => turn.text.toLocaleLowerCase().includes(query)) : turns
  }, [transcriptQuery, turns])
  const focusTranscriptMatch = useCallback((next: number) => {
    if (visibleTurns.length === 0) return
    const index = (next + visibleTurns.length) % visibleTurns.length
    setTranscriptMatch(index)
    window.requestAnimationFrame(() => {
      const el = transcriptTurnRefs.current.get(visibleTurns[index]!.id)
      if (!el) return
      el.scrollIntoView({ block: "center", behavior: "smooth" })
      el.focus({ preventScroll: true })
    })
  }, [visibleTurns])
  const closeTranscriptSearch = useCallback(() => {
    setTranscriptSearchOpen(false)
    setTranscriptQuery("")
    setTranscriptMatch(0)
  }, [])
  const openTranscriptSearch = useCallback(() => {
    setTranscriptSearchOpen(true)
    window.requestAnimationFrame(() => transcriptSearchRef.current?.focus())
  }, [])
  const toggleTranscriptSearch = useCallback(() => {
    if (transcriptSearchOpen) closeTranscriptSearch()
    else openTranscriptSearch()
  }, [closeTranscriptSearch, openTranscriptSearch, transcriptSearchOpen])
  const copyTurnText = useCallback(async (text: string, successMessage: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable")
      await navigator.clipboard.writeText(text)
      toast.showToast(successMessage, "success")
    } catch {
      toast.showToast(t("eh.copyFailed", "Copy is unavailable on this device."), "error")
    }
  }, [t, toast])

  const deleteTurn = useCallback(
    async (turn: EnvoyHarnessTurn) => {
      if (turn.kind === "system") return
      if (
        !window.confirm(
          t("eh.deleteTurnConfirm", "Delete this message from the chat history?"),
        )
      ) {
        return
      }
      try {
        let turnId = turn.id
        if (!turnId.startsWith("eh-msg-")) {
          const history = chatId
            ? await nodeService.openEnvoyHarnessChat(chatId)
            : await nodeService.getEnvoyHarnessChatHistory()
          const matches = history.turns.filter(
            (item) => item.role === turn.kind && item.text === turn.text,
          )
          const match = matches[matches.length - 1]
          if (!match) {
            setTurns((prev) => prev.filter((item) => item.id !== turn.id))
            return
          }
          turnId = match.id
        }
        const result = await nodeService.deleteEnvoyHarnessChatTurn({
          turnId,
          ...(chatId ? { chatId } : {}),
        })
        setTurns(historyTurnsToPanelTurns(result.turns))
        toast.showToast(t("eh.turnDeleted", "Message deleted"), "success")
      } catch (err) {
        toast.showToast(
          err instanceof Error ? err.message : String(err),
          "error",
        )
      }
    },
    [chatId, nodeService, t, toast],
  )

  const recordUx = useCallback((event: Omit<import("@envoymesh/api").EhUxTelemetryEvent, "surface" | "occurredAt">) => {
    if (typeof nodeService.recordEnvoyHarnessUxEvent !== "function") return
    void nodeService.recordEnvoyHarnessUxEvent({
      ...event,
      surface: "social",
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined)
  }, [nodeService])

  useEffect(() => {
    const active = transcriptQuery.trim().length > 0
    if (active && !searchTelemetryActiveRef.current) {
      recordUx({ action: "search_used", resultCount: visibleTurns.length })
    }
    searchTelemetryActiveRef.current = active
  }, [recordUx, transcriptQuery, visibleTurns.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (turns.length === 0) return
        event.preventDefault()
        openTranscriptSearch()
      } else if (event.key === "Escape" && transcriptSearchOpen) {
        event.preventDefault()
        closeTranscriptSearch()
        transcriptSearchRef.current?.blur()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeTranscriptSearch, openTranscriptSearch, transcriptSearchOpen, turns.length])

  useEffect(() => {
    if (!transcriptSearchOpen || !transcriptQuery.trim()) return
    const turn = visibleTurns[transcriptMatch]
    if (!turn) return
    const el = transcriptTurnRefs.current.get(turn.id)
    if (!el) return
    scrollTranscriptTurnIntoView(el)
  }, [transcriptSearchOpen, transcriptQuery, transcriptMatch, visibleTurns])
  /** True while this panel is mounted (chat switch / unmount). */
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // The legacy `__envoy_harness__` panel has no chatId prop; resolve the
  // active chat for its project folder so per-chat events/turns are
  // attributed correctly (the node now runs parallel per-chat turns).
  useEffect(() => {
    if (chatId) {
      setResolvedChatId(chatId)
      return undefined
    }
    if (!status?.cwd) return undefined
    if (typeof nodeService.listEnvoyHarnessChats !== "function") {
      setResolvedChatId(null)
      return undefined
    }
    let cancelled = false
    const normalize = (p: string) => p.replace(/[/\\]+$/, "")
    void nodeService
      .listEnvoyHarnessChats()
      .then((chats) => {
        if (cancelled) return
        const match = chats.find(
          (c) => normalize(c.cwd) === normalize(status.cwd ?? ""),
        )
        setResolvedChatId(match?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) setResolvedChatId(null)
      })
    return () => {
      cancelled = true
    }
  }, [chatId, nodeService, status?.cwd])

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
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    if (typeof nodeService.getEnvoyHarnessCommandCatalog !== "function") return undefined
    void nodeService.getEnvoyHarnessCommandCatalog()
      .then((catalog) => { if (!cancelled) setSlashCommands(catalog.commands) })
      .catch(() => { if (!cancelled) setSlashCommands([]) })
    return () => { cancelled = true }
  }, [nodeService])

  // Keep replace in a ref so history load does not re-run when
  // effectiveChatId / timeline.replace identity changes mid-turn.
  const timelineReplaceRef = useRef(timeline.replace)
  timelineReplaceRef.current = timeline.replace

  useEffect(() => {
    // Prefer stable chatId. Do NOT key history on status.cwd — cwd can land
    // mid-turn (after refresh on error) and would wipe the optimistic
    // transcript (including the user's message) before disk catches up.
    const historyKey = chatId ?? "active"
    if (loadedHistoryKeyRef.current === historyKey) return undefined
    loadedHistoryKeyRef.current = historyKey
    setChatReady(false)
    // Do not blank turns here — a failed/superseded load must not erase
    // the in-flight user message the queue already appended.
    let cancelled = false
    const loadHistory = chatId
      ? nodeServiceRef.current.openEnvoyHarnessChat(chatId)
      : nodeServiceRef.current.getEnvoyHarnessChatHistory()
    void loadHistory
      .then((history) => {
        if (cancelled) return
        // Keep the same key we claimed — never rewrite to cwd (that made
        // the next effect pass think history was unloaded and reload,
        // clobbering the optimistic human bubble mid-turn).
        loadedHistoryKeyRef.current = historyKey
        const incoming = historyTurnsToPanelTurns(history.turns)
        // Merge, don't clobber: an in-flight user message can land in
        // `turns` before this RPC returns. Replacing wholesale made the
        // human bubble vanish when the turn later finished empty.
        setTurns((prev) => mergeHistoryWithLocalTurns(incoming, prev))
        timelineReplaceRef.current(history.timeline ?? [])
        refreshRef.current()
      })
      .catch(() => {
        // Keep the key claimed so we don't retry-spin; leave any local
        // turns (optimistic user message) intact.
      })
      .finally(() => {
        if (mountedRef.current) setChatReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [chatId])

  useEffect(() => {
    return nodeService.on("eh:user_question", (event) => {
      if (!ehEventMatchesChat(event, effectiveChatId)) return
      setPendingQuestion(event)
    })
  }, [effectiveChatId, nodeService])

  useEffect(() => {
    return nodeService.on("eh:permission", (event) => {
      if (!ehEventMatchesChat(event, effectiveChatId)) return
      setPendingPermission(event)
    })
  }, [effectiveChatId, nodeService])

  useEffect(() => {
    return nodeService.on("eh:turn_hints", (event) => {
      if (!ehEventMatchesChat(event, effectiveChatId)) return
      setTurnHints(event)
    })
  }, [effectiveChatId, nodeService])

  useEffect(() => {
    return nodeService.on("eh:activity", (event: EhActivityEvent) => {
      if (!ehEventMatchesChat(event, effectiveChatId)) return
      if (event.summary.trim().length > 0) {
        setActivitySummary(event.summary)
      }
    })
  }, [effectiveChatId, nodeService])

  useEffect(() => {
    return nodeService.on("eh:prompt_busy", (event) => {
      if (!ehEventMatchesChat(event, effectiveChatId)) return
      if (!event.busy) {
        setActivitySummary(undefined)
        setPendingQuestion(null)
        setPendingPermission(null)
      }
    })
  }, [effectiveChatId, nodeService])

  const ehAttachments = useEhAttachments(status?.cwd, (message) =>
    toast.showToast(message, "error"),
  )
  const turnContext = useEhTurnContext({
    projectCwd: status?.cwd,
    chatId: effectiveChatId,
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
    chatId: effectiveChatId,
    startTurn: (text, attachments) =>
      effectiveChatId
        ? nodeService.startEnvoyHarnessTurn(text, attachments, effectiveChatId)
        : nodeService.startEnvoyHarnessTurn(text, attachments),
    subscribeTurnComplete: (handler) => nodeService.on("eh:turn_complete", handler),
    subscribeTurnToken: (handler) => nodeService.on("eh:turn_token", handler),
    subscribePromptBusy: (handler) => nodeService.on("eh:prompt_busy", handler),
    getTurnStatus: () =>
      nodeService.getEnvoyHarnessTurnStatus(effectiveChatId ?? undefined),
    cancelTurn: () =>
      nodeService.cancelEnvoyHarnessTurn(effectiveChatId ?? undefined),
    onUserTurn: (text) => {
      // Reconnect can re-deliver the in-flight prompt after an optimistic
      // append (or after history already restored it) — don't double-paint.
      setTurns((prev) => {
        const last = prev[prev.length - 1]
        if (last?.kind === "user" && last.text === text) return prev
        if (prev.some((turn) => turn.kind === "user" && turn.text === text)) {
          return prev
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            kind: "user",
            text,
            createdAt: Date.now(),
          },
        ]
      })
    },
    onAssistantStreaming: (text, turnId) => upsertAssistantTurn(turnId, text),
    onAssistantTurn: (response, turnId, event) => {
      setLastReviewTurnId(event?.changedFiles?.length ? turnId : null)
      const visible = stripModelThinking(response)
      if (visible) {
        upsertAssistantTurn(turnId, visible)
      } else {
        // Drop an empty/thinking-only streaming bubble — never leave a
        // blank assistant row, and never touch the user turn above it.
        setTurns((prev) => prev.filter((turn) => turn.id !== turnId || turn.kind !== "assistant"))
        setSystem(
          t(
            "eh.emptyResponse",
            "envoy-harness finished without a visible reply. Your message is still here — try again or rephrase.",
          ),
          "info",
        )
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
      // Do not refresh status here — status.cwd settling used to remount
      // history and wipe the optimistic user message mid-failure.
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

  /** Start a fresh persisted session for this chat (same as /new). */
  const resetChat = useCallback(async () => {
    try {
      await nodeService.resetEnvoyHarnessChat(chatId ?? undefined)
      setTurns([])
      clearQueue()
      loadedHistoryKeyRef.current = chatId ?? "active"
      setSystem(
        t("eh.chatReset", "Started a new chat for this project."),
        "success",
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setSystem(msg, "error")
    }
  }, [chatId, clearQueue, nodeService, setSystem, status?.cwd])

  /** Persist a new permission policy (always-confirm | safe-only | off | never). */
  const applyPolicy = useCallback(
    async (policy: string) => {
      try {
        const s = await nodeService.setEnvoyHarnessAutoRunPolicy(policy)
        setStatus(s)
        const mode = s.autoRunPolicy ?? policy
        if (mode === "off" || mode === "never") {
          setSystem(
            t(
              "eh.permissionsNeverSet",
              "Permission policy → Always approve: every tool auto-runs with no prompts — including write/edit/bash. Only use this in workspaces you fully trust. {when}",
              { when: busy ? t("eh.permissionsNextTurn", "Applies from the next turn.") : "" },
            ),
            "info",
          )
        } else {
          setSystem(
            t(
              "eh.permissionsSet",
              "Permission policy → {mode}.{when}",
              {
                mode: mode === "safe-only" ? "Default (safe auto-run)" : "Always ask",
                when: busy
                  ? " " +
                    t("eh.permissionsNextTurn", "Applies from the next turn.")
                  : "",
              },
            ),
            "success",
          )
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setSystem(
          t("eh.permissionsFailed", "Failed to set permission policy: {error}", {
            error: msg,
          }),
          "error",
        )
      }
    },
    [busy, nodeService, setStatus, setSystem, t],
  )

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
        await resetChat()
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
      if (slash === "permissions") {
        const mode = trimmed.slice("/permissions".length).trim().toLowerCase()
        if (!mode) {
          const current = status?.autoRunPolicy ?? "safe-only"
          const label =
            current === "off" || current === "never"
              ? "Always approve"
              : current === "always-confirm"
                ? "Always ask"
                : "Default (safe auto-run)"
          setSystem(
            t(
              "eh.permissionsCurrent",
              "Permission policy: {mode}. Use /permissions always-confirm | safe-only | off | never.",
              { mode: label },
            ),
            "info",
          )
          setDraft("")
          return
        }
        try {
          const s = await nodeService.setEnvoyHarnessAutoRunPolicy(mode)
          setStatus(s)
          setSystem(
            t("eh.permissionsSet", "Permission policy → {mode}.", {
              mode: s.autoRunPolicy ?? mode,
            }),
            "success",
          )
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          setSystem(
            t("eh.permissionsFailed", "Failed to set permission policy: {error}", {
              error: msg,
            }),
            "error",
          )
        }
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
    [
      busy,
      cancelActiveTurn,
      chatId,
      clearQueue,
      nodeService,
      resetChat,
      refresh,
      setSystem,
      status,
      t,
      turns,
    ],
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

      if (!chatReady) {
        setSystem(
          t("eh.chatLoading", "Loading this project's chat…"),
          "info",
        )
        return
      }

      submitToQueue(trimmed, mode, ehAttachments.toRefs())
      setDraft("")
      ehAttachments.clear()
    },
    [draft, ehAttachments, chatReady, handleSlashCommand, setSystem, status, submitToQueue, t],
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
    <section
      className="pi-chat-panel chat-area eh-panel"
      aria-label={t("eh.title", "envoy-harness")}
      data-chat-ready={chatReady ? "true" : "false"}
    >
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
          <div className="eh-header-actions">
            <label className="eh-permission-control">
              <span className="eh-permission-label">
                {t("eh.permissionsShort", "Perms")}
              </span>
              <select
                className="eh-permission-select"
                value={status?.autoRunPolicy ?? "safe-only"}
                aria-label={t("eh.permissionsAria", "Permission policy")}
                title={t(
                  "eh.permissionsTitle",
                  "Permission policy: Default auto-runs read-only tools + safe bash, Always ask confirms every tool, Always approve never prompts. Changes apply from the next turn.",
                )}
                onChange={(e) => void applyPolicy(e.target.value)}
              >
                <option value="safe-only">
                  {t("eh.permsSafe", "Default · auto-run safe")}
                </option>
                <option value="always-confirm">
                  {t("eh.permsAsk", "Always ask")}
                </option>
                <option value="off">
                  {t("eh.permsNever", "Always approve")}
                </option>
              </select>
            </label>
            {turns.length > 0 ? (
              <button
                type="button"
                className={`eh-search-btn${transcriptSearchOpen ? " eh-search-btn--active" : ""}`}
                aria-label={
                  transcriptSearchOpen
                    ? t("eh.searchClose", "Close search")
                    : t("eh.searchTranscript", "Search transcript")
                }
                title={
                  transcriptSearchOpen
                    ? t("eh.searchClose", "Close search")
                    : t("eh.searchTranscript", "Search transcript")
                }
                aria-pressed={transcriptSearchOpen}
                onClick={toggleTranscriptSearch}
              >
                <SearchIcon size={16} />
              </button>
            ) : null}
            <button
              type="button"
              className={`eh-trash-btn${confirmReset ? " eh-trash-btn--confirm" : ""}`}
              aria-label={
                confirmReset
                  ? t("eh.confirmResetAria", "Confirm new chat")
                  : t("eh.newChatAria", "New chat")
              }
              title={
                confirmReset
                  ? t(
                      "eh.confirmResetTitle",
                      "Click again to start a new chat",
                    )
                  : t(
                      "eh.newChatTitle",
                      "Start a new chat (clears the context)",
                    )
              }
              onClick={() => {
                if (busy) {
                  setSystem(
                    t("eh.slashWhileBusy", "Finish or /cancel the current turn first."),
                    "info",
                  )
                  return
                }
                if (!confirmReset) {
                  setConfirmReset(true)
                  window.setTimeout(() => setConfirmReset(false), 4000)
                  return
                }
                setConfirmReset(false)
                void resetChat()
              }}
            >
              <RemoveIcon size={16} />
            </button>
          </div>
        </div>
        <EnvoyHarnessEhuiRail refreshKey={ehuiRefreshKey} />
      </header>

      <div className="pi-chat-thread" ref={threadRef}>
        {transcriptSearchOpen && turns.length > 0 ? (
          <div className="eh-transcript-search" role="search">
            <input
              ref={transcriptSearchRef}
              type="search"
              value={transcriptQuery}
              onChange={(event) => { setTranscriptQuery(event.target.value); setTranscriptMatch(0) }}
              placeholder={t("eh.searchTranscript", "Search transcript")}
              aria-label={t("eh.searchTranscript", "Search transcript")}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  focusTranscriptMatch(transcriptMatch + (event.shiftKey ? -1 : 1))
                }
              }}
            />
            <span>{transcriptQuery ? t("eh.searchMatches", "{count} match(es)", { count: visibleTurns.length }) : t("eh.turnCount", "{count} turn(s)", { count: turns.length })}</span>
            {transcriptQuery && visibleTurns.length > 0 ? <>
              <button type="button" aria-label={t("eh.previousMatch", "Previous match")} onClick={() => focusTranscriptMatch(transcriptMatch - 1)}>↑</button>
              <button type="button" aria-label={t("eh.nextMatch", "Next match")} onClick={() => focusTranscriptMatch(transcriptMatch + 1)}>↓</button>
            </> : null}
            <span className="sr-only" aria-live="polite">{transcriptQuery ? `${visibleTurns.length} matches. Match ${visibleTurns.length ? transcriptMatch + 1 : 0} selected.` : ""}</span>
          </div>
        ) : null}
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

        {visibleTurns.map((turn) => {
          const isActiveMatch =
            transcriptQuery.trim().length > 0 &&
            visibleTurns[transcriptMatch]?.id === turn.id
          const highlightQuery = transcriptQuery.trim()
          return (
          <div
            key={turn.id}
            ref={(element) => { if (element) transcriptTurnRefs.current.set(turn.id, element); else transcriptTurnRefs.current.delete(turn.id) }}
            tabIndex={-1}
            aria-label={`${turn.kind} turn`}
            aria-current={isActiveMatch ? "true" : undefined}
            className={`pi-chat-turn pi-chat-turn--${turn.kind}${
              turn.tone ? ` pi-chat-turn--${turn.tone}` : ""
            }${isActiveMatch ? " eh-transcript-turn--active" : ""}`}
          >
            {turn.kind === "assistant" ? (
              <EhChatMessageText
                text={turn.text}
                className="pi-chat-turn-text eh-chat-turn-markdown"
                highlightQuery={highlightQuery || undefined}
                highlightActive={isActiveMatch}
              />
            ) : (
              <div className="pi-chat-turn-text">
                {highlightQuery ? (
                  <SearchHighlightedText
                    text={turn.text}
                    query={highlightQuery}
                    active={isActiveMatch}
                  />
                ) : (
                  turn.text
                )}
              </div>
            )}
            <div className="eh-turn-actions">
              <button
                type="button"
                className="message-copy-btn"
                aria-label={t("eh.copyTurn", "Copy")}
                title={t("eh.copyTurn", "Copy")}
                onClick={() => void copyTurnText(turn.text, t("eh.copied", "Copied"))}
              >
                <CopyIcon size={14} />
              </button>
              {turn.kind !== "system" ? (
                <button
                  type="button"
                  className="message-delete-btn"
                  aria-label={t("eh.deleteTurn", "Delete")}
                  title={t("eh.deleteTurn", "Delete")}
                  onClick={() => void deleteTurn(turn)}
                >
                  <RemoveIcon size={14} />
                </button>
              ) : null}
            </div>
          </div>
          )
        })}
        {transcriptQuery && visibleTurns.length === 0 ? <p className="eh-transcript-empty">{t("eh.noTranscriptMatches", "No matching turns")}</p> : null}

        {timeline.state.state ? (
          <div className={`eh-agent-state eh-agent-state--${timeline.state.state.state}`}>
            <span>{timeline.state.state.label}</span>
            {timeline.state.state.activitySummary ? (
              <small>{timeline.state.state.activitySummary}</small>
            ) : null}
          </div>
        ) : null}

        <EhTimelineFeed
          items={timeline.nonMessageItems.filter((item) => item.type !== "activity")}
          onReviewTurn={(turnId) => {
            recordUx({ action: "review_opened" })
            setLastReviewTurnId(turnId)
            void nodeService.getEnvoyHarnessTurnReview(turnId).then((review) => {
              if (review) setTurnReview(review)
              else setShowGitDiffReview(true)
            }).catch(() => setShowGitDiffReview(true))
          }}
          onRevertTurn={(turnId) => {
            if (!window.confirm(t("eh.revertConfirm", "Restore the files to how they were before this turn? Later edits will never be overwritten."))) return
            recordUx({ action: "revert_attempted" })
            void nodeService.revertEnvoyHarnessTurn(turnId).then((result) => {
              if (result.reverted) {
                recordUx({ action: "revert_completed", outcome: "success" })
                setSystem(t("eh.revertComplete", "This turn's file changes were reverted."), "success")
                timeline.remove(`turn:${turnId}:changes`)
              } else {
                recordUx({ action: result.conflicts?.length ? "revert_conflicted" : "revert_completed", outcome: result.conflicts?.length ? "conflict" : "unavailable" })
                setSystem(result.conflicts?.length ? t("eh.revertConflict", "Revert stopped because these files changed afterward: {files}", { files: result.conflicts.join(", ") }) : t("eh.revertUnavailable", "This turn can no longer be reverted safely."), "error")
              }
            }).catch((error: unknown) => setSystem(String(error), "error"))
          }}
        />

        {busy ? (
          <EhStillWorkingIndicator
            active={busy}
            waitingForUser={pendingQuestion !== null}
            activitySummary={activitySummary}
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

      {turns.length >= 60 && !contextHintDismissed ? (
        <div className="eh-context-reminder" role="status">
          <span>
            {t(
              "eh.contextReminder",
              "Context is getting large — start a new chat (/new or the trash button) to clean it.",
            )}
          </span>
          <button
            type="button"
            className="eh-context-reminder-dismiss"
            aria-label={t("eh.dismiss", "Dismiss")}
            onClick={() => setContextHintDismissed(true)}
          >
            ×
          </button>
        </div>
      ) : null}

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
        contextFiles={[...new Set([...ehAttachments.pathList, ...turnContext.touchedFiles])]}
        attachedPaths={ehAttachments.pathList}
        onRemoveAttached={(path) => {
          const att = ehAttachments.attachments.find((a) => a.path === path)
          if (att) ehAttachments.remove(att.id)
        }}
        changedFiles={dismissedChanges ? [] : turnContext.touchedFiles}
        onReviewChanges={() => {
          if (!lastReviewTurnId) {
            setShowGitDiffReview(true)
            return
          }
          void nodeService.getEnvoyHarnessTurnReview(lastReviewTurnId).then((review) => {
            if (review) setTurnReview(review)
            else setShowGitDiffReview(true)
          }).catch(() => setShowGitDiffReview(true))
        }}
        onRevertChanges={lastReviewTurnId ? () => {
          if (!window.confirm(t("eh.revertConfirm", "Restore the files to how they were before this turn? Later edits will never be overwritten."))) return
          void nodeService.revertEnvoyHarnessTurn(lastReviewTurnId).then((result) => {
            if (result.reverted) {
              setDismissedChanges(true)
              setLastReviewTurnId(null)
              setSystem(t("eh.revertComplete", "This turn's file changes were reverted."), "success")
            } else if (result.conflicts?.length) {
              setSystem(t("eh.revertConflict", "Revert stopped because these files changed afterward: {files}", { files: result.conflicts.join(", ") }), "error")
            } else {
              setSystem(t("eh.revertUnavailable", "This turn can no longer be reverted safely."), "error")
            }
          }).catch((error: unknown) => setSystem(String(error), "error"))
        } : undefined}
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
              slashCommands={slashCommands}
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
      {turnReview ? (
        <EhTurnReviewModal
          review={turnReview}
          onClose={() => setTurnReview(null)}
          onOpenFile={(path) => void nodeService.openEnvoyHarnessFile({ path, ...(effectiveChatId ? { chatId: effectiveChatId } : {}) }).catch((error: unknown) => setSystem(String(error), "error"))}
          onRevert={() => {
            setTurnReview(null)
            if (!lastReviewTurnId || !window.confirm(t("eh.revertConfirm", "Restore the files to how they were before this turn? Later edits will never be overwritten."))) return
            void nodeService.revertEnvoyHarnessTurn(lastReviewTurnId).then((result) => {
              if (result.reverted) {
                setDismissedChanges(true)
                setLastReviewTurnId(null)
                setSystem(t("eh.revertComplete", "This turn's file changes were reverted."), "success")
              } else {
                setSystem(result.conflicts?.length ? t("eh.revertConflict", "Revert stopped because these files changed afterward: {files}", { files: result.conflicts.join(", ") }) : t("eh.revertUnavailable", "This turn can no longer be reverted safely."), "error")
              }
            }).catch((error: unknown) => setSystem(String(error), "error"))
          }}
        />
      ) : null}
    </section>
  )
}
