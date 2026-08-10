/**
 * Shared Ext Agent install-required card (Phase 55D.1).
 *
 * Renders the per-agent install / verify / docs payload that
 * `getExtAgentInstallGuide()` returns. Used in three places:
 *
 * 1. **Settings → AI → Ext Agent panel** — `AgentSettings.tsx` shows
 *    the card for the currently-selected agent so the user sees
 *    the install instructions before they start the agent.
 * 2. **Chat switcher install dialog** — `ExtAgentSwitcherInstallDialog`
 *    wraps this card in a `ModalPortal` when the user picks an agent
 *    whose binary is missing.
 * 3. **Offline banner** — `ExtAgentOfflineBanner` shows the card
 *    inline (no modal) when the active agent is `not-installed`.
 *
 * The card is intentionally self-contained: it does its own copy-to-
 * clipboard for the install command, and its own retry/dismiss wiring
 * via the `onRetry` / `onDismiss` props. Callers that don't care
 * about those actions can simply omit the props (the buttons hide).
 */

import { useCallback, useState } from "react"
import type { ExtAgentInstallGuide, InstallState } from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"

export interface ExtAgentInstallGuideCardProps {
  /** The agent id (e.g. `"codex"`, `"claudecode"`). Used for tests
   *  and `data-agent-id`; the card itself reads from `installGuide`. */
  agentId: string
  /** The install guide payload from `getExtAgentInstallGuide()`. */
  installGuide: ExtAgentInstallGuide
  /** The probe's `installState`. Drives the body copy
   *  (`notInstalledBody` vs `unknownBody`). */
  installState: InstallState
  /**
   * Optional retry hook. When provided, the card renders a "Retry"
   * button that calls this. Use this to re-probe after the user
   * has run the install command. If omitted, the Retry button hides.
   */
  onRetry?: () => void
  /**
   * Optional dismiss hook. When provided, the card renders a
   * "Dismiss" secondary button. If omitted, the button hides.
   * Modals use this to close themselves; the offline banner does
   * not (it stays until the agent is reachable).
   */
  onDismiss?: () => void
  /**
   * `data-testid` for the root. Default: `ext-agent-install-card`.
   * Override when embedding multiple cards on one page.
   */
  testId?: string
}

export function ExtAgentInstallGuideCard({
  agentId,
  installGuide,
  installState,
  onRetry,
  onDismiss,
  testId = "ext-agent-install-card",
}: ExtAgentInstallGuideCardProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(installGuide.installCommand)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable — silently no-op (button text
       * stays "Copy"; user can still select the text manually). */
    }
  }, [installGuide.installCommand])

  // Built-in agents (Pi) should never get an install card. The caller
  // is expected to filter those out before rendering, but guard here
  // so a misconfigured probe can't surface a confusing install line
  // for a built-in agent.
  if (installGuide.installed) return null

  const bodyKey =
    installState === "unknown"
      ? "aiEngine.installCard.unknownBody"
      : "aiEngine.installCard.notInstalledBody"
  const bodyFallback =
    installState === "unknown"
      ? "Couldn't detect whether {command} is installed. Run the install command to be sure, then click Retry."
      : "{command} isn't on this machine yet. Run the install command below, then click Retry."
  const body = t(bodyKey, bodyFallback).replace("{command}", installGuide.command)

  return (
    <div
      className="ext-agent-install-card"
      data-testid={testId}
      data-agent-id={agentId}
      data-install-state={installState}
      role="region"
      aria-label={t("aiEngine.installCard.title", "Install required")}
    >
      <div className="ext-agent-install-card-title">
        {t("aiEngine.installCard.title", "Install required")}
      </div>
      {body ? <p className="ext-agent-install-card-body">{body}</p> : null}

      <div className="ext-agent-install-card-row">
        <span className="ext-agent-install-card-label">
          {t("aiEngine.installCard.commandLabel", "Install")}
        </span>
        <code
          className="ext-agent-install-card-cmd"
          data-testid={`${testId}-install-cmd`}
        >
          {installGuide.installCommand}
        </code>
        <button
          type="button"
          className="btn btn-secondary ext-agent-install-card-copy"
          data-testid={`${testId}-copy`}
          onClick={() => void handleCopy()}
        >
          {copied
            ? t("aiEngine.installCard.copied", "Copied")
            : t("aiEngine.installCard.copyCommand", "Copy")}
        </button>
      </div>

      <div className="ext-agent-install-card-row">
        <span className="ext-agent-install-card-label">
          {t("aiEngine.installCard.verifyLabel", "Verify")}
        </span>
        <code
          className="ext-agent-install-card-cmd"
          data-testid={`${testId}-verify-cmd`}
        >
          {installGuide.verifyCommand}
        </code>
      </div>

      {installGuide.homepageUrl ? (
        <a
          className="ext-agent-install-card-docs"
          data-testid={`${testId}-docs`}
          href={installGuide.homepageUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("aiEngine.installCard.docsLabel", "Open install docs")}
          {installGuide.homepageLabel
            ? ` — ${installGuide.homepageLabel}`
            : ""}
        </a>
      ) : null}

      {installGuide.commonIssues.length > 0 ? (
        <ul
          className="ext-agent-install-card-issues"
          data-testid={`${testId}-issues`}
        >
          {installGuide.commonIssues.map((line, idx) => (
            <li key={idx} className="ext-agent-install-card-issue">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {(onRetry || onDismiss) ? (
        <div className="ext-agent-install-card-actions">
          {onRetry ? (
            <button
              type="button"
              className="btn btn-primary"
              data-testid={`${testId}-retry`}
              onClick={onRetry}
            >
              {t("aiEngine.installCard.retry", "Retry")}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              className="btn btn-secondary"
              data-testid={`${testId}-dismiss`}
              onClick={onDismiss}
            >
              {t("aiEngine.installCard.dismiss", "Dismiss")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
