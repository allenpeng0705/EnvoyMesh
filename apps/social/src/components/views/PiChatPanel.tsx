/**
 * Phase 49 — Pi chat panel (lightweight).
 *
 * A minimal prompt/response surface for the built-in Pi coding agent.
 * Deliberately lighter than AIChatPanel (no approval cards, no chain
 * decomposition, no CRDT draft sync, no structured blocks). Mirrors
 * TerminalAgentBar's `turns[] + busy + single-RPC-per-submit` shape.
 *
 * Pi is local-only (no mesh.* tools). Tool calls (file/bash) surface as
 * confirmable TerminalCommandProposals in Slice 49D; this panel handles
 * the plain-text conversational path only.
 *
 * Design: docs/pi-integration-design.md §6(a).
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { useT } from "../../context/I18nContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"
import type { PiStatus, PiRuntimeState } from "@envoymesh/api"

// ---------------------------------------------------------------------------
// Local turn model (mirrors TerminalAgentBar's AgentTurn)
// ---------------------------------------------------------------------------

interface PiTurn {
  id: string
  kind: "user" | "assistant" | "system"
  text: string
  /** Present on system turns — controls tone styling. */
  tone?: "info" | "success" | "error"
  createdAt: number
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PiChatPanelProps {
  /** Navigate back to the chat thread list (mobile / swipe-back). */
  onBackToChats?: () => void
}

// ---------------------------------------------------------------------------
// Status → display label
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PiChatPanel({ onBackToChats }: PiChatPanelProps) {
  const t = useT()
  const nodeService = useNodeService()
  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [turns, setTurns] = useState<PiTurn[]>([])
  const [status, setStatus] = useState<PiStatus | null>(null)
  const [restarting, setRestarting] = useState(false)

  // ---- Status refresh (initial probe + poll while not ready) ----
  const refresh = useCallback(async () => {
    try {
      const s = await nodeService.getPiStatus()
      setStatus(s)
    } catch {
      // Transient — leave last-known status in place.
    }
  }, [nodeService])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll every 5s only while the runtime is down (matches OpenClaw's pattern).
  useEffect(() => {
    if (status && status.state !== "ready") {
      const id = window.setInterval(() => {
        void refresh()
      }, 5_000)
      return () => window.clearInterval(id)
    }
    return undefined
  }, [status, refresh])

  // ---- Turn helpers ----
  const appendTurn = useCallback((turn: Omit<PiTurn, "id" | "createdAt">) => {
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

  // ---- Submit handler ----
  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return

      // Refuse to send if Pi isn't ready — surface a clear hint instead.
      if (status && status.state !== "ready") {
        const hint =
          status.state === "disabled"
            ? t("pi.disabledHint", "Pi is disabled. Enable it in Settings → AI.")
            : status.state === "not-installed"
              ? t("pi.notInstalledHint", "Pi sidecar not bundled (slim build).")
              : status.error
                ? t("pi.errorHint", `Pi is not ready: ${status.error}`)
                : t("pi.startingHint", "Pi is starting — try again in a moment.")
        setSystem(hint, "error")
        return
      }

      setBusy(true)
      appendTurn({ kind: "user", text: trimmed })
      setDraft("")
      try {
        const response = await nodeService.sendToPi(trimmed)
        if (response) {
          appendTurn({ kind: "assistant", text: response })
        } else {
          setSystem(t("pi.emptyResponse", "Pi returned an empty response."), "info")
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setSystem(t("pi.sendFailed", `Failed to reach Pi: ${msg}`), "error")
        // Refresh status — the runtime may have died mid-turn.
        void refresh()
      } finally {
        setBusy(false)
        // Refocus input for rapid follow-up prompts.
        window.requestAnimationFrame(() => inputRef.current?.focus())
      }
    },
    [appendTurn, busy, nodeService, refresh, setSystem, status, t],
  )

  // ---- Restart handler ----
  const restart = useCallback(async () => {
    if (restarting) return
    setRestarting(true)
    setSystem(t("pi.restarting", "Restarting Pi…"), "info")
    try {
      const s = await nodeService.restartPi()
      setStatus(s)
      if (s.state === "ready") {
        setSystem(t("pi.restartReady", "Pi is ready."), "success")
      } else if (s.error) {
        setSystem(t("pi.restartFailed", `Restart failed: ${s.error}`), "error")
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setSystem(t("pi.restartFailed", `Restart failed: ${msg}`), "error")
    } finally {
      setRestarting(false)
    }
  }, [nodeService, setSystem, t, restarting])

  // ---- Auto-scroll the thread to bottom on new turns ----
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, busy])

  // ---- Derived: should the input be disabled? ----
  const inputDisabled = useMemo(() => {
    if (busy) return true
    if (!status) return true
    // Allow typing when ready OR when we want to surface the not-ready hint
    // on submit (clearer UX than disabling the field with no explanation).
    return false
  }, [busy, status])

  const placeholder = busy
    ? t("pi.thinking", "Pi is thinking…")
    : t("pi.promptPlaceholder", "Ask Pi to code, refactor, or explain…")

  return (
    <section className="pi-chat-panel chat-area" aria-label={t("pi.title", "Pi")}>
      <header className="pi-chat-header">
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
          <span className="pi-chat-avatar" aria-hidden="true">π</span>
          <div className="pi-chat-titles">
            <h2 className="pi-chat-title">{t("pi.title", "Pi")}</h2>
            <p className="pi-chat-subtitle">
              {t("pi.subtitle", "Local coding agent")}
            </p>
          </div>
          {status ? (
            <span className={stateBadgeClass(status.state)} title={status.error ?? undefined}>
              {t(stateLabelKey(status.state), status.state)}
            </span>
          ) : null}
        </div>
        <div className="pi-chat-meta-row">
          {status?.modelSpec ? (
            <span className="pi-chat-model" title={status.modelSpec}>
              {status.modelSpec}
            </span>
          ) : null}
          {status && status.state !== "ready" && status.state !== "disabled" ? (
            <button
              type="button"
              className="pi-chat-restart-btn"
              onClick={() => void restart()}
              disabled={restarting}
            >
              {restarting ? t("pi.restarting", "Restarting…") : t("pi.restart", "Restart")}
            </button>
          ) : null}
        </div>
      </header>

      <div className="pi-chat-thread" ref={threadRef}>
        {turns.length === 0 ? (
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
            {status?.state === "disabled" ? (
              <p className="pi-chat-empty-hint">
                {t("pi.disabledHint", "Pi is disabled. Enable it in Settings → AI.")}
              </p>
            ) : null}
            {status?.state === "not-installed" ? (
              <p className="pi-chat-empty-hint">
                {t("pi.notInstalledHint", "Pi sidecar not bundled (slim build).")}
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
            <div className="pi-chat-turn-text">{turn.text}</div>
          </div>
        ))}

        {busy ? (
          <div className="pi-chat-turn pi-chat-turn--assistant pi-chat-turn--thinking">
            <div className="pi-chat-thinking-dots" aria-label={t("pi.thinking", "thinking")}>
              <span /> <span /> <span />
            </div>
          </div>
        ) : null}
      </div>

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
          disabled={inputDisabled}
          placeholder={placeholder}
          autoFocus
          aria-label={t("pi.promptAriaLabel", "Prompt Pi")}
        />
        <button
          type="submit"
          className="pi-chat-send"
          disabled={inputDisabled || !draft.trim()}
          aria-label={t("pi.send", "Send")}
        >
          ↑
        </button>
      </form>
    </section>
  )
}
