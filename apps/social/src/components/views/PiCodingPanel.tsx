/**
 * Phase 68-C2 — Pi agent timeline panel for Coding → Chat.
 *
 * Reuses `eh:timeline` under `__pi__:${sessionId}` (see piTimelineChatId).
 * Pi tasks are Chat-only (no Shell / TUI embed); use the Terminal tab
 * for a plain shell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  piTimelineChatId,
  type PiRuntimeState,
  type PiStatus,
  type PiToolProposal,
  type TerminalSessionSummary,
} from "@envoymesh/api"
import { useT } from "../../context/I18nContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"
import { useEhTimeline } from "../../hooks/useEhTimeline.js"
import { useEhAttachments } from "../../hooks/useEhAttachments.js"
import { useTerminalSessions } from "../../hooks/useNodeService.js"
import { codingComposerCapabilities } from "../../lib/coding-composer-capabilities.js"
import { shapeCodingComposerPrompt } from "../../lib/coding-composer-prompt.js"
import {
  codingComposerSessionKey,
  loadCodingComposerPrefs,
  saveCodingComposerPrefs,
  type CodingComposerPrefs,
} from "../../lib/coding-composer-state.js"
import {
  mergeAgentPromptWithAttachments,
  toAgentAttachmentRefs,
} from "../../lib/agent-attachments.js"
import { AgentAttachmentComposerLeading } from "../AgentAttachmentComposerLeading.js"
import { CodingComposerToolbar } from "../CodingComposerToolbar.js"
import { CodingImportSessionModal } from "../CodingImportSessionModal.js"
import { EhChatComposer } from "../ehui/EhChatComposer.js"
import { EhTimelineFeed } from "../ehui/EhTimelineFeed.js"
import { EhChatMessageText } from "../ehui/EhChatMessageText.js"

export type PiCodingPanelProps = {
  sessionId: string
  /** Coding task header / sidebar live busy state. */
  onBusyChange?: (busy: boolean) => void
  /** Switch to another Pi session (Import session). */
  onSwitchSession?: (sessionId: string) => void
}

function stateLabelKey(state: PiRuntimeState): string {
  switch (state) {
    case "ready":
      return "pi.stateReady"
    case "starting":
      return "pi.stateStarting"
    case "disabled":
      return "pi.stateDisabled"
    case "not-installed":
      return "pi.stateNotInstalled"
    case "error":
      return "pi.stateError"
    case "stopped":
    default:
      return "pi.stateStopped"
  }
}

function stateBadgeClass(state: PiRuntimeState): string {
  switch (state) {
    case "ready":
      return "pi-state-badge pi-state-badge--ready"
    case "starting":
      return "pi-state-badge pi-state-badge--starting"
    case "error":
      return "pi-state-badge pi-state-badge--error"
    case "disabled":
    case "not-installed":
      return "pi-state-badge pi-state-badge--muted"
    case "stopped":
    default:
      return "pi-state-badge pi-state-badge--stopped"
  }
}

export function PiCodingPanel({
  sessionId,
  onBusyChange,
  onSwitchSession,
}: PiCodingPanelProps) {
  const t = useT()
  const nodeService = useNodeService()
  const { sessions: terminalSessions } = useTerminalSessions()
  const chatId = useMemo(() => piTimelineChatId(sessionId), [sessionId])
  const timeline = useEhTimeline(nodeService, chatId)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const prefsKey = codingComposerSessionKey({ kind: "pi", id: sessionId })
  const caps = useMemo(() => codingComposerCapabilities("pi"), [])

  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<PiStatus | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [pendingProposal, setPendingProposal] = useState<PiToolProposal | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [prefs, setPrefs] = useState<CodingComposerPrefs>(() =>
    loadCodingComposerPrefs(prefsKey),
  )

  const piSession = useMemo(
    () =>
      terminalSessions.find(
        (s: TerminalSessionSummary) => s.sessionId === sessionId,
      ),
    [terminalSessions, sessionId],
  )
  const projectCwd = piSession?.cwd
  const attachments = useEhAttachments(projectCwd, (message) =>
    setLocalError(message),
  )

  useEffect(() => {
    setPrefs(loadCodingComposerPrefs(prefsKey))
  }, [prefsKey])

  useEffect(() => {
    let cancelled = false
    void nodeService.getNodeConfig?.().then((cfg) => {
      if (cancelled || !cfg) return
      const policy = cfg.piSettings?.autoRunPolicy
      if (
        policy === "safe-only" ||
        policy === "always-confirm" ||
        policy === "off"
      ) {
        setPrefs(saveCodingComposerPrefs(prefsKey, { permissionPolicy: policy }))
      }
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [nodeService, prefsKey])

  useEffect(() => {
    if (status?.modelSpec && !prefs.model) {
      setPrefs(saveCodingComposerPrefs(prefsKey, { model: status.modelSpec }))
    }
  }, [status?.modelSpec, prefs.model, prefsKey])

  const patchPrefs = useCallback(
    (patch: Partial<CodingComposerPrefs>) => {
      setPrefs(saveCodingComposerPrefs(prefsKey, patch))
    },
    [prefsKey],
  )

  const importRows = useMemo(() => {
    return terminalSessions
      .filter(
        (s) =>
          s.role === "pi" &&
          s.state === "running" &&
          s.sessionId !== sessionId &&
          (!projectCwd || s.cwd === projectCwd),
      )
      .map((s) => ({
        id: s.sessionId,
        title: s.title,
        subtitle: s.cwd,
      }))
  }, [terminalSessions, sessionId, projectCwd, importOpen])

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  const refresh = useCallback(async () => {
    try {
      const s = await nodeService.getPiStatus()
      setStatus(s)
    } catch {
      // keep last-known
    }
  }, [nodeService])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (status && status.state !== "ready") {
      const id = window.setInterval(() => {
        void refresh()
      }, 5_000)
      return () => window.clearInterval(id)
    }
    return undefined
  }, [status, refresh])

  useEffect(() => {
    return nodeService.on("pi:proposal", (event) => {
      if (event?.proposal) setPendingProposal(event.proposal)
    })
  }, [nodeService])

  useEffect(() => {
    if (!pendingProposal) return
    const id = window.setTimeout(() => {
      setPendingProposal(null)
      setLocalError(t("pi.proposalTimedOut", "Tool request timed out (Pi skipped it)."))
    }, pendingProposal.timeoutMs + 500)
    return () => window.clearTimeout(id)
  }, [pendingProposal, t])

  const messages = useMemo(
    () => timeline.items.filter((item) => item.type === "message"),
    [timeline.items],
  )

  const feedItems = useMemo(
    () =>
      timeline.nonMessageItems.filter(
        (item) => item.type !== "activity" || item.status === "failed",
      ),
    [timeline.nonMessageItems],
  )

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, feedItems, busy, pendingProposal])

  const respondToProposal = useCallback(
    async (proposal: PiToolProposal, confirmed: boolean) => {
      setPendingProposal(null)
      try {
        await nodeService.piRespondToProposal({
          uiRequestId: proposal.uiRequestId,
          confirmed,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setLocalError(t("pi.proposalRespondFailed", `Failed to deliver response: ${msg}`))
      }
    },
    [nodeService, t],
  )

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if ((!trimmed && attachments.attachments.length === 0) || busy) return

      if (status && status.state !== "ready") {
        const hint =
          status.state === "disabled"
            ? t("pi.disabledHint", "Pi is disabled. Enable it in Settings → AI.")
            : status.state === "not-installed"
              ? t("pi.notInstalledHint", "Pi sidecar not bundled (slim build).")
              : status.error
                ? t("pi.errorHint", `Pi is not ready: ${status.error}`)
                : t("pi.startingHint", "Pi is starting — try again in a moment.")
        setLocalError(hint)
        return
      }

      let contextText = ""
      if (
        attachments.attachments.length > 0 &&
        nodeService.buildAgentAttachmentContext
      ) {
        try {
          const built = await nodeService.buildAgentAttachmentContext({
            attachments: toAgentAttachmentRefs(attachments.attachments),
          })
          contextText = built.contextText?.trim() ?? ""
        } catch (err: unknown) {
          setLocalError(err instanceof Error ? err.message : String(err))
          return
        }
      }

      const shaped = shapeCodingComposerPrompt(trimmed, prefs, caps)
      const prompt = mergeAgentPromptWithAttachments(shaped, contextText)
      if (!prompt.trim()) return

      setBusy(true)
      setLocalError(null)
      setDraft("")
      attachments.clear()
      try {
        await nodeService.sendToPi(prompt, { sessionId })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setLocalError(t("pi.sendFailed", `Failed to reach Pi: ${msg}`))
        void refresh()
      } finally {
        setBusy(false)
      }
    },
    [
      attachments,
      busy,
      caps,
      nodeService,
      prefs,
      refresh,
      sessionId,
      status,
      t,
    ],
  )

  const placeholder = busy
    ? t("pi.thinking", "Pi is thinking…")
    : t("pi.promptPlaceholder", "Ask Pi to code, refactor, or explain…")

  return (
    <section
      className="pi-chat-panel pi-coding-panel"
      data-testid="pi-coding-panel"
      aria-label={t("pi.title", "Pi")}
    >
      <div className="pi-chat-meta-row pi-coding-panel__status">
        {status ? (
          <span
            className={stateBadgeClass(status.state)}
            title={status.error ?? undefined}
            aria-live="polite"
          >
            {t(stateLabelKey(status.state), status.state)}
          </span>
        ) : null}
        {status?.modelSpec ? (
          <span className="pi-chat-model" title={status.modelSpec}>
            {status.modelSpec}
          </span>
        ) : null}
        {timeline.state.state?.label ? (
          <span className="pi-coding-panel__agent-state" data-testid="pi-coding-agent-state">
            {timeline.state.state.label}
          </span>
        ) : null}
      </div>

      <div className="pi-chat-thread" ref={threadRef} data-testid="pi-coding-thread">
        {messages.length === 0 && !busy ? (
          <div className="pi-chat-empty">
            <p className="pi-chat-empty-title">
              {t("pi.emptyTitle", "Pi — your local coding agent")}
            </p>
            <p className="pi-chat-empty-body">
              {t(
                "pi.emptyBody",
                "Ask Pi to write code, refactor a file, explain an error, or run a shell command. Pi runs locally on this machine — it does not access your mesh contacts or knowledge.",
              )}
            </p>
          </div>
        ) : null}

        {messages.map((item) =>
          item.type === "message" ? (
            <div
              key={item.id}
              className={`pi-chat-turn pi-chat-turn--${item.role}${
                item.streaming ? " pi-chat-turn--streaming" : ""
              }`}
              data-testid={`pi-coding-msg-${item.role}`}
            >
              <div className="pi-chat-turn-text">
                <EhChatMessageText text={item.text} />
              </div>
            </div>
          ) : null,
        )}

        <EhTimelineFeed items={feedItems} />

        {localError ? (
          <div className="pi-chat-turn pi-chat-turn--system pi-chat-turn--error" role="alert">
            <div className="pi-chat-turn-text">{localError}</div>
          </div>
        ) : null}

        {busy ? (
          <div className="pi-chat-turn pi-chat-turn--assistant pi-chat-turn--thinking">
            <div
              className="pi-chat-thinking-dots"
              aria-label={t("pi.thinking", "thinking")}
            >
              <span /> <span /> <span />
            </div>
          </div>
        ) : null}
      </div>

      {pendingProposal ? (
        <div
          className="pi-proposal-dock"
          role="alertdialog"
          aria-label={pendingProposal.title}
          aria-live="assertive"
          data-testid="pi-coding-proposal"
        >
          <div className="pi-proposal-dock-title">
            {t("pi.proposalTitle", "Pi wants to:")}{" "}
            <strong>{pendingProposal.title}</strong>
          </div>
          {pendingProposal.message ? (
            <pre className="pi-proposal-dock-message">{pendingProposal.message}</pre>
          ) : null}
          <div className="pi-proposal-dock-actions">
            <button
              type="button"
              className="pi-proposal-allow-btn"
              onClick={() => void respondToProposal(pendingProposal, true)}
            >
              {t("pi.allow", "Allow")}
            </button>
            <button
              type="button"
              className="pi-proposal-deny-btn"
              onClick={() => void respondToProposal(pendingProposal, false)}
            >
              {t("pi.deny", "Deny")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="pi-coding-panel__composer-stack">
        <CodingComposerToolbar
          harness="pi"
          prefs={prefs}
          onPrefsChange={patchPrefs}
          modelSuggestions={
            status?.modelSpec ? [status.modelSpec] : []
          }
          busy={busy}
          onImportSession={() => setImportOpen(true)}
          onPermissionPolicyChange={(policy) => {
            // Prefs already saved via onPrefsChange; only push node config.
            void (async () => {
              try {
                const cfg = await nodeService.getNodeConfig()
                await nodeService.updateNodeConfig({
                  piSettings: {
                    ...(cfg.piSettings ?? {}),
                    autoRunPolicy: policy,
                  },
                })
              } catch {
                /* ignore */
              }
            })()
          }}
        />
        <form
          className="pi-chat-composer eh-composer"
          onSubmit={(e) => {
            e.preventDefault()
            void submit(draft)
          }}
        >
          <EhChatComposer
            value={draft}
            onChange={setDraft}
            busy={busy}
            onSubmit={() => void submit(draft)}
            placeholder={placeholder}
            hasAttachments={attachments.attachments.length > 0}
            attachLeading={
              <AgentAttachmentComposerLeading
                attachments={attachments.attachments}
                busy={attachments.busy}
                disabled={!projectCwd}
                pickTitle={t("eh.attachProjectFile", "Attach project file")}
                attachAriaLabel={t("eh.attachProjectFile", "Attach project file")}
                fileInputRef={attachments.fileInputRef}
                onFileInputChange={attachments.handleFileInputChange}
                onOpenPicker={attachments.openPicker}
                onRemove={attachments.remove}
                onClearAll={attachments.clear}
              />
            }
          />
        </form>
      </div>

      <CodingImportSessionModal
        open={importOpen}
        rows={importRows}
        onClose={() => setImportOpen(false)}
        onPick={(id) => {
          setImportOpen(false)
          onSwitchSession?.(id)
        }}
      />
    </section>
  )
}
