/**
 * Banner that surfaces "Built-in OpenClaw is stopped" across the top of the
 * chat view. The user's first instinct on a fresh DMG install is to open
 * the app, tap "Open EnvoyAI" / "Ask AI", and start typing. If the runtime
 * is in a "Stopped" state, that message goes nowhere — but the user has
 * no signal that *their input* is fine, the *engine* is dead. The banner
 * gives them a restart button right where the pain is, with a status poll
 * so they can sit and watch the watchdog (or their own click) recover.
 *
 * When the alarm is shown — three states, in priority order:
 *
 *   1. **Regression** (most common) — the runtime was up in this session
 *      and is now down. Surfaced immediately on the next poll.
 *
 *   2. **Failed to start** — the runtime has never come up since this
 *      chat-view mount, AND `startedAt` is either missing or older than
 *      `STARTUP_GRACE_MS` (90s, matching the runtime's own startup-probe
 *      budget). Catches the case where the OpenClaw binary crashed on
 *      first launch and never recovered (e.g. port already in use, model
 *      config wrong, etc).
 *
 *   3. **Stuck in regression across navigation** — the runtime is
 *      currently down and `startedAt` is missing or older than the grace
 *      period. Catches the case where the runtime crashed while the user
 *      was elsewhere, and the user navigates here only to find a dead AI.
 *
 * When the alarm is **hidden** — the runtime reports `enabled: false`
 * (user intentionally turned it off — not a failure), OR it's still in
 * its legitimate startup window (`running: false` but `startedAt` is
 * within the last `STARTUP_GRACE_MS`). The startup-window detection is
 * driven by the runtime's own `startedAt` timestamp instead of a
 * chat-view-mounted clock — that way a slow machine (where OpenClaw
 * legitimately takes >45s to come up) doesn't get a false-positive alarm.
 *
 * The "ever been up" state is **session-scoped** (in-memory only, reset
 * on every app launch). Persisting it across launches in localStorage
 * would make every fresh install look like a regression the moment
 * OpenClaw isn't up on the first poll — defeating the whole point of
 * the cold-start grace period.
 *
 * Auto-polls every 5s while the alarm is visible.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { hasUsableModelProvider } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useNodeState } from "../../context/NodeStateContext.js";

/**
 * How long to wait after the runtime reports `startedAt` before giving up
 * and surfacing the alarm with the "failed to start" message. 90s matches
 * the runtime's own startup-probe budget (`startOpenClaw` waits up to 90s
 * for the webhook to come up before declaring a failure). Anything shorter
 * races the runtime on a slow machine and produces false alarms.
 */
const STARTUP_GRACE_MS = 90_000;

export function OpenClawOfflineBanner() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();
  const [running, setRunning] = useState<boolean | null>(null);
  // When the runtime is `running: false` but `startedAt` is recent, it's
  // still in its legitimate startup window — don't alarm. Track that
  // timestamp explicitly so we don't depend on a chat-view-mounted clock.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  // `enabled` comes from the runtime's own status (preferred over
  // nodeConfig: reflects the actual current state, not just the persisted
  // config). When the user explicitly turns the engine off in Settings →
  // AI, the runtime reports `enabled: false` and we suppress the alarm.
  const [runtimeEnabled, setRuntimeEnabled] = useState<boolean | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  // ----- Session-scoped state -----
  // None of these are persisted. The "ever been up" flag resets on
  // every app launch so the cold-start window is honored on each
  // fresh install AND on every app reopen.
  const hasBeenUpThisSessionRef = useRef(false);
  const [, forceTick] = useState(0);

  const markUp = useCallback(() => {
    if (!hasBeenUpThisSessionRef.current) {
      hasBeenUpThisSessionRef.current = true;
    }
    forceTick((n) => n + 1);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const oc = await nodeService.getOpenClawStatus();
      setRunning(oc.running);
      setStartedAt(oc.startedAt ?? null);
      setRuntimeEnabled(oc.enabled);
      if (oc.running) {
        markUp();
      }
    } catch {
      // transient — leave last-known state in place
    }
  }, [nodeService, markUp]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only when the alarm is currently visible (regression or grace
  // elapsed). During the legitimate startup window we leave the initial
  // probe on mount and don't poll — there's nothing the user can act on
  // until the runtime either comes up or the grace period expires.
  useEffect(() => {
    const graceElapsed =
      startedAt === null
        ? false
        : Date.now() - new Date(startedAt).getTime() > STARTUP_GRACE_MS;
    const alarmVisible =
      runtimeEnabled !== false &&
      running === false &&
      startedAt !== null &&
      (hasBeenUpThisSessionRef.current || graceElapsed);
    if (alarmVisible) {
      const id = window.setInterval(() => { void refresh(); }, 5_000);
      return () => window.clearInterval(id);
    }
    return undefined;
  }, [running, startedAt, runtimeEnabled, refresh]);

  // While the grace period is ticking down but hasn't elapsed yet, force
  // a re-render every second so the visibility check transitions from
  // "hidden (cold start)" to "visible (failed to start)" without the
  // user having to navigate.
  useEffect(() => {
    if (running !== false) return;
    if (hasBeenUpThisSessionRef.current) return;
    if (startedAt === null) {
      // Runtime never reported startedAt → no grace window to count down.
      return;
    }
    const elapsed = Date.now() - new Date(startedAt).getTime();
    if (elapsed > STARTUP_GRACE_MS) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    setRestartError(null);
    try {
      const oc = await nodeService.restartOpenClaw();
      setRunning(oc.running);
      setStartedAt(oc.startedAt ?? null);
      setRuntimeEnabled(oc.enabled);
      if (oc.running) {
        markUp();
      }
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestarting(false);
    }
  }, [nodeService, markUp]);

  // Show the alarm when ANY of the following are true:
  //   1. **Regression** — runtime is enabled, was up in this session,
  //      and is now down. Immediate.
  //   2. **Failed to start** — runtime is enabled, never came up, and
  //      the startup grace (90s, derived from `startedAt`) has elapsed.
  //      Catches stuck installs.
  //   3. **Stuck-across-navigation** — runtime is enabled, never came up
  //      this session, and the startup grace has elapsed. Catches the
  //      case where the runtime crashed while the user was elsewhere.
  //
  // Hide when:
  //   - The runtime reports `enabled: false` (user intentionally turned
  //     it off — not a failure).
  //   - `startedAt` is null (the user has not yet triggered a start —
  //     OpenClaw starts lazily on first use, so the absence of a start
  //     time before any user interaction is normal, not a failure).
  //   - The runtime is in its legitimate startup window (`running: false`
  //     but `startedAt` is within the last `STARTUP_GRACE_MS`).
  //   - We don't have a status yet (initial mount before the first poll).
  const graceElapsed =
    startedAt !== null &&
    Date.now() - new Date(startedAt).getTime() > STARTUP_GRACE_MS;
  const alarmVisible =
    runtimeEnabled !== false &&
    running === false &&
    startedAt !== null &&
    (hasBeenUpThisSessionRef.current || graceElapsed);
  // Prefer Configure AI guidance when the real gap is no usable model —
  // OpenClaw "stopped" is misleading when Settings → AI is still disabled/mock.
  if (!hasUsableModelProvider(nodeConfig?.modelProviders)) {
    return null;
  }
  if (!alarmVisible) {
    return null;
  }

  return (
    <div className="openclaw-offline-banner" role="status" aria-live="polite">
      <div className="openclaw-offline-banner-body">
        <div className="openclaw-offline-banner-text">
          <div className="openclaw-offline-banner-title">
            {t("chat.openclawOfflineTitle")}
          </div>
          <div className="openclaw-offline-banner-desc">
            {t("chat.openclawOfflineDesc")}
          </div>
          {restartError && (
            <div className="openclaw-offline-banner-error">{restartError}</div>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => void handleRestart()}
          disabled={restarting}
        >
          {restarting
            ? t("chat.openclawOfflineRestarting")
            : t("chat.openclawOfflineRestart")}
        </button>
      </div>
    </div>
  );
}
