/**
 * Phase 49 — Pi chat panel strings (English).
 *
 * Pi is the built-in local coding agent. These strings cover the chat
 * panel surface: header, status badges, empty state, prompts, errors.
 *
 * Wired into en.ts via `...piMessages`. Other locales provide their
 * own `<locale>-pi.ts` and follow the same shape.
 */
export const piMessages = {
  pi: {
    /** Sidebar + panel title. */
    title: "Pi",
    /** Sidebar + header subtitle. */
    subtitle: "Local coding agent",

    // Runtime status badges (rendered in the header chip).
    stateReady: "Ready",
    stateStarting: "Starting…",
    stateStopped: "Stopped",
    stateDisabled: "Disabled",
    stateNotInstalled: "Not installed",
    stateError: "Error",

    // Empty state (no turns yet).
    emptyTitle: "Pi — your local coding agent",
    emptyBody:
      "Ask Pi to write code, refactor a file, explain an error, or run a shell command. Pi runs locally on this machine — it does not access your mesh contacts or knowledge.",
    disabledHint: "Pi is disabled. Enable it in Settings → AI.",
    notInstalledHint: "Pi sidecar not bundled (slim build).",

    // Composer.
    promptPlaceholder: "Ask Pi to code, refactor, or explain…",
    promptAriaLabel: "Prompt Pi",
    send: "Send",
    thinking: "Pi is thinking…",

    // Submit outcomes.
    emptyResponse: "Pi returned an empty response.",
    sendFailed: "Failed to reach Pi.",

    // Restart flow.
    restart: "Restart",
    restarting: "Restarting…",
    restartReady: "Pi is ready.",
    restartFailed: "Restart failed.",

    // Phase 49D — tool-action confirm dialog.
    proposalTitle: "Pi wants to:",
    allow: "Allow",
    deny: "Deny",
    proposalAllowed: "Allowed",
    proposalDenied: "Denied",
    proposalRespondFailed: "Failed to deliver response",

    // Submit-blocked hints (when the runtime isn't ready).
    startingHint: "Pi is starting — try again in a moment.",
    errorHint: "Pi is not ready.",
  },
} as const
