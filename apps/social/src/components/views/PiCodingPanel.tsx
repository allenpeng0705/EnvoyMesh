/**
 * Phase 68-C2 — Pi agent timeline panel for Coding → Chat.
 *
 * Reuses `eh:timeline` under `__pi__:${sessionId}` (see piTimelineChatId).
 * Pi workspaces are Chat-only (no Shell / TUI embed); use the Terminal tab
 * for a plain shell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  piTimelineChatId,
  type PiRuntimeState,
  type PiStatus,
  type PiToolProposal,
} from "@envoymesh/api"
import { useT } from "../../context/I18nContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"
import { useEhTimeline } from "../../hooks/useEhTimeline.js"
import { EhTimelineFeed } from "../ehui/EhTimelineFeed.js"
import { EhChatMessageText } from "../ehui/EhChatMessageText.js"

export type PiCodingPanelProps = {
  sessionId: string
  /** Coding workspace header / sidebar live busy state. */
  onBusyChange?: (busy: boolean) => void
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

export function PiCodingPanel({ sessionId, onBusyChange }: PiCodingPanelProps) {
  const t = useT()
  const nodeService = useNodeService()
  const chatId = useMemo(() => piTimelineChatId(sessionId), [sessionId])
  const timeline = useEhTimeline(nodeService, chatId)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<PiStatus | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [pendingProposal, setPendingProposal] = useState<PiToolProposal | null>(null)

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
      if (!trimmed || busy) return

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

      setBusy(true)
      setLocalError(null)
      setDraft("")
      try {
        await nodeService.sendToPi(trimmed, { sessionId })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setLocalError(t("pi.sendFailed", `Failed to reach Pi: ${msg}`))
        void refresh()
      } finally {
        setBusy(false)
        window.requestAnimationFrame(() => inputRef.current?.focus())
      }
    },
    [busy, nodeService, refresh, sessionId, status, t],
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

      <form
        className="pi-chat-composer"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(draft)
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className="pi-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          placeholder={placeholder}
          aria-label={t("pi.promptAriaLabel", "Prompt Pi")}
          data-testid="pi-coding-input"
        />
        <button
          type="submit"
          className="pi-chat-send"
          disabled={busy || !draft.trim()}
          aria-label={t("pi.send", "Send")}
          data-testid="pi-coding-send"
        >
          ↑
        </button>
      </form>
    </section>
  )
}
