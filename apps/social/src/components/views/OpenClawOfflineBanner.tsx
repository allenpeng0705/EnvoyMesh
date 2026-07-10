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
 *   1. **Regression** (most common) — the runtime was up at least once
 *      and then went down. Surfaced immediately on the next poll.
 *
 *   2. **Failed to start** — the runtime has never come up since the
 *      component mounted, AND it's been > `STARTUP_GRACE_MS` (45s)
 *      since we first observed `running: false`. This catches the case
 *      where the OpenClaw binary crashed on first launch and never
 *      recovered (e.g. port already in use, model config wrong, etc).
 *
 * When the alarm is **hidden** — the runtime is in its cold-start window
 * (still booting). The user has nothing actionable to do, so showing a
 * red "stopped" banner during this window would be alarmist noise.
 *
 * Auto-polls every 5s while the alarm is visible.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useNodeState } from "../../context/NodeStateContext.js";

/**
 * How long to wait after the first observation of `running: false` before
 * giving up and surfacing the alarm with the "failed to start" message.
 * 45s covers a comfortable OpenClaw cold-start budget (the runtime's
 * 90s startup-probe attempts × backoff, on a slow machine) while still
 * being short enough that a stuck install surfaces the problem well
 * within the user's first interaction.
 */
const STARTUP_GRACE_MS = 45_000;

export function OpenClawOfflineBanner() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();
  const [running, setRunning] = useState<boolean | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  /**
   * Has the runtime ever reported `running: true` since this component
   * mounted? Once true, any subsequent `running: false` is a regression
   * (the alarm is the right thing to show). Until then, the runtime is
   * still booting and the alarm would be wrong.
   */
  const hasEverBeenRunningRef = useRef(false);
  /**
   * When did we first observe `running: false` in this mount? Null when
   * the runtime has never been observed in a stopped state (or it's
   * currently running). Used to compute "has the startup grace period
   * elapsed without ever coming up?".
   */
  const stoppedSinceRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);

  const setHasEverBeenRunning = useCallback((v: boolean) => {
    if (hasEverBeenRunningRef.current !== v) {
      hasEverBeenRunningRef.current = v;
      // Persist across remounts (e.g. user navigates away from the chat
      // view and back, or refreshes the page) so a regression is still
      // distinguishable from a cold-start. localStorage is per-browser,
      // which is fine — the next browser sees the cold-start window
      // again and the alarm stays correctly hidden until the runtime
      // comes up.
      try {
        if (v) localStorage.setItem("envoymesh:openclaw-ever-running", "1");
      } catch {
        /* localStorage may be unavailable (private mode, etc) — fall through */
      }
      // Re-render so the visibility check below sees the new value.
      forceTick((n) => n + 1);
    }
  }, []);

  // On mount, read the persisted "ever been running" flag so a regression
  // is still surfaced when the user navigates back to the chat view.
  useEffect(() => {
    try {
      if (localStorage.getItem("envoymesh:openclaw-ever-running") === "1") {
        hasEverBeenRunningRef.current = true;
        forceTick((n) => n + 1);
      }
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  // The banner is only meaningful when the user *wants* the in-process
  // engine — i.e. it isn't disabled in node-config. If the user has
  // explicitly turned the built-in engine off, the absence of an AI on
  // the welcome screen is intentional, not a failure.
  const enabled = nodeConfig?.openclawEnabled ?? true;

  const refresh = useCallback(async () => {
    try {
      const oc = await nodeService.getOpenClawStatus();
      setRunning(oc.running);
      if (oc.running) {
        setHasEverBeenRunning(true);
        // Reset the "stopped since" timer — we're healthy now.
        if (stoppedSinceRef.current !== null) {
          stoppedSinceRef.current = null;
          forceTick((n) => n + 1);
        }
      } else if (stoppedSinceRef.current === null) {
        // First time we see `running: false` in this mount. Stash the
        // timestamp so the visibility check can compute grace period.
        stoppedSinceRef.current = Date.now();
        forceTick((n) => n + 1);
      }
    } catch {
      // transient — leave last-known state in place
    }
  }, [nodeService, setHasEverBeenRunning]);

  useEffect(() => {
    void refresh();
    // Poll only when the alarm is currently visible (regression or grace
    // elapsed). During the cold-start window we leave the initial probe
    // to fire on mount and don't poll — there's nothing the user can
    // act on until the runtime either comes up or the grace period
    // expires.
    const alarmVisible =
      running === false && (hasEverBeenRunningRef.current || (stoppedSinceRef.current !== null
        && Date.now() - stoppedSinceRef.current > STARTUP_GRACE_MS));
    if (alarmVisible) {
      const id = window.setInterval(() => { void refresh(); }, 5_000);
      return () => window.clearInterval(id);
    }
    return undefined;
  }, [running, refresh]);

  // While the grace period is ticking down but hasn't elapsed yet, force
  // a re-render every second so the visibility check transitions from
  // "hidden (cold start)" to "visible (failed to start)" without the
  // user having to navigate.
  useEffect(() => {
    if (running !== false) return;
    if (hasEverBeenRunningRef.current) return;
    if (stoppedSinceRef.current === null) return;
    if (Date.now() - stoppedSinceRef.current > STARTUP_GRACE_MS) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => window.clearInterval(id);
  }, [running]);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    setRestartError(null);
    try {
      const oc = await nodeService.restartOpenClaw();
      setRunning(oc.running);
      if (oc.running) {
        setHasEverBeenRunning(true);
        if (stoppedSinceRef.current !== null) {
          stoppedSinceRef.current = null;
          forceTick((n) => n + 1);
        }
      }
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestarting(false);
    }
  }, [nodeService, setHasEverBeenRunning]);

  // Show the alarm when ANY of the following are true:
  //   1. **Regression** — runtime is enabled, was up at least once, and
  //      is now down. (HasEverBeenRunning is persisted to localStorage
  //      so a regression is still surfaced after a remount.)
  //   2. **Failed to start** — runtime is enabled, never came up, and
  //      the grace period (45s) has elapsed since we first saw it down.
  //   3. The initial probe has completed (running !== null).
  // Hide during the cold-start window so a fresh install doesn't see a
  // red "stopped" alarm before the runtime has had a chance to come up.
  const regression =
    enabled && running === false && hasEverBeenRunningRef.current;
  const failedToStart =
    enabled &&
    running === false &&
    !hasEverBeenRunningRef.current &&
    stoppedSinceRef.current !== null &&
    Date.now() - stoppedSinceRef.current > STARTUP_GRACE_MS;
  if (!regression && !failedToStart) {
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
