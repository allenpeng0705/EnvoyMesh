/**
 * Sponsor-friend setup tile — visible on the discover view when the bundled
 * or persisted config points at a sponsor. Replaces the silent
 * "you have no contacts" blank state on a fresh install with a visible
 * "we tried to add <sponsor>, here's why" affordance, a Retry button, and
 * a "Use a different contact" paste flow.
 *
 * The bundled config is loaded by the node service from
 * `bundled-sponsor-friend.json` (or env var override) on startup. This
 * tile surfaces the resolved state plus the last-attempt result so the
 * operator can see *why* the bond didn't establish (most common cause:
 * the sponsor's `bondAutonomy.sponsorProofToken` doesn't match the
 * bundled `proofOfContext` — the tile surfaces a hint to copy-paste).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { parseContactCode } from "../../lib/discover-contact-code.js";

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "succeeded"; helloMessageId?: string }
  | { kind: "failed"; reason: string; errorKind?: string }
  | { kind: "skipped"; reason: string }
  | { kind: "cooldown"; until: string; reason: string; errorKind?: string }
  | { kind: "profileNotReady"; reason: string };

export function SponsorSetupTile() {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds } = useNodeState();
  const [status, setStatus] = useState<
    import("@envoymesh/api").SetupSponsorFriendStatus | null
  >(null);
  const [runState, setRunState] = useState<RunState>({ kind: "idle" });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteInfo, setPasteInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await nodeService.getSetupSponsorFriendStatus();
      setStatus(s);
      // If a previous auto-trigger has already succeeded, fold that into
      // the runState so the tile shows the success message instead of
      // "Not started yet" on every poll.
      if (s.state?.completedAt && runState.kind === "idle") {
        setRunState({ kind: "succeeded" });
      }
      return s;
    } catch {
      // transient — leave last-known state in place
      return null;
    }
  }, [nodeService, runState.kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // No auto-trigger on Discover mount — first-run SetupView owns the only
  // automatic attempt. Opening Discover (or cooldown expiry) used to spawn
  // another full dial loop and burn Windows CPU/network. Retry is explicit.

  // Reflect persisted first-run / manual-run outcomes into local runState.
  useEffect(() => {
    if (!status) return;
    if (runState.kind === "running") return;
    if (status.state?.completedAt) {
      setRunState((prev) => (prev.kind === "idle" ? { kind: "succeeded" } : prev));
      return;
    }
    // Permanent auto-stop after one exhausted cycle — show failed + Retry,
    // not a multi-year "cooldown" countdown.
    if (status.state?.skipReason === "auto-exhausted") {
      setRunState({
        kind: "failed",
        reason: status.state.lastError ?? "sponsor not reachable",
        errorKind: status.state.lastErrorKind,
      });
      return;
    }
    const cooldownMs = status.state?.cooldownUntil
      ? Date.parse(status.state.cooldownUntil) - Date.now()
      : 0;
    if (cooldownMs > 0 && cooldownMs < 24 * 60 * 60 * 1000) {
      setRunState({
        kind: "cooldown",
        until: status.state!.cooldownUntil!,
        reason: status.state?.lastError ?? "sponsor not reachable",
        errorKind: status.state?.lastErrorKind,
      });
      return;
    }
    if (status.state?.lastError) {
      setRunState({
        kind: "failed",
        reason: status.state.lastError,
        errorKind: status.state.lastErrorKind,
      });
    }
  }, [status, runState.kind]);

  // Poll while the tile is visible so a first-run SetupView attempt (or a
  // manual Retry) that finishes in the background updates the UI.
  //
  // Gate on `isActive` so the poll stops once the tile hides itself
  // (lastRunSucceeded → return null). One RPC per 2s while visible.
  const isActive = Boolean(
    bonds.length === 0 &&
      status?.config.enabled &&
      status.config.ownerId &&
      !(status.state?.completedAt && runState.kind !== "running"),
  );
  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => { void refresh(); }, 2_000);
    return () => window.clearInterval(id);
  }, [refresh, isActive]);

  // If the bundled sponsor is already bonded (e.g. via Discover / LAN / QR
  // while auto-setup still had a stale mesh error), mark the setup complete
  // so persisted lastError/cooldown don't resurrect the tile later.
  useEffect(() => {
    const sponsorId = status?.config.ownerId;
    if (!sponsorId) return;
    const bonded = bonds.some(
      (b) => b.peerOwnerId === sponsorId && b.level !== "blocked",
    );
    if (!bonded) return;
    if (status.state?.completedAt && !status.state.lastError) return;
    void nodeService.runSetupSponsorFriend({}).catch(() => undefined);
  }, [
    bonds,
    nodeService,
    status?.config.ownerId,
    status?.state?.completedAt,
    status?.state?.lastError,
  ]);

  const sponsorName = useMemo(
    () => status?.config.displayName ?? status?.config.ownerId ?? null,
    [status],
  );

  const handleRetry = useCallback(async () => {
    setRunState({ kind: "running" });
    try {
      // Manual Retry always bypasses the runtime's cooldown + profile
      // guards. The user explicitly asked for a fresh attempt.
      const result = await nodeService.runSetupSponsorFriend({ forceBypassGuards: true });
      // The runtime is now fire-and-forget: the RPC returns immediately
      // with `{ ok: true, running: true }` and the retry loop continues
      // in the background. The result of each attempt is persisted to
      // node-config.json; the polling useEffect (above) surfaces the
      // final state. The only "ok without running" case is the
      // `skipped: true` path (already-completed, sponsor-is-self, etc.).
      if (result.running) {
        // Stay in "running" state; the polling useEffect will surface
        // the actual outcome (success, classified failure, or
        // already-completed) when the runtime finishes.
        await refresh();
        return;
      }
      if (result.ok) {
        setRunState({ kind: "succeeded", helloMessageId: result.helloMessageId });
      } else if (result.skipped) {
        if (result.reason === "profile-not-ready") {
          setRunState({
            kind: "profileNotReady",
            reason: "Finish setting up your profile, then tap Retry.",
          });
          return;
        }
        setRunState({ kind: "skipped", reason: result.reason ?? "skipped" });
      } else {
        setRunState({ kind: "failed", reason: result.reason ?? "sponsor hello failed" });
      }
      await refresh();
    } catch (e) {
      // Mid-RPC WS drop: the server's heartbeat may have terminated us
      // while sendHello was blocking the node event loop. The runtime
      // loop is likely still healthy — re-poll the status to learn
      // whether it had already classified a failure, and only demote
      // to "failed" if the persisted state confirms it.
      const message = e instanceof Error ? e.message : String(e);
      const latest = await refresh();
      if (latest?.state?.lastError) {
        setRunState({ kind: "failed", reason: latest.state.lastError });
      } else {
        // No persisted failure → the loop is probably still running.
        // Stay in "running" and let the polling useEffect surface the
        // outcome. This prevents the "flash and show Retry" UX when a
        // transient WS blip happens during the loop.
        setRunState({ kind: "running" });
      }
      // Suppress unused-var warning for `message` (kept for the case
      // where a future change wants to surface it).
      void message;
    }
  }, [nodeService, refresh]);

  const handleApplyPaste = useCallback(async () => {
    setPasteError(null);
    setPasteInfo(null);
    const parsed = parseContactCode(pasteValue.trim());
    if (parsed.kind !== "contact" && parsed.kind !== "wan-join" && parsed.kind !== "invite") {
      setPasteError("That doesn't look like a contact code. It should start with envoy://");
      return;
    }
    setPasteBusy(true);
    try {
      if ("wanJoinToken" in parsed && parsed.wanJoinToken) {
        await nodeService.applyWanJoinInvite(parsed.wanJoinToken);
      } else if (parsed.kind === "invite" && parsed.token && parsed.wsUrl) {
        const r = await nodeService.redeemCompanyInvite({
          token: parsed.token,
          wsUrl: parsed.wsUrl,
          ownerId: parsed.ownerId,
        });
        if (!r.ok) {
          throw new Error(r.reason ?? "redeem failed");
        }
      }
      setPasteInfo(t("discover.sponsorTile.pasteApplied"));
      setPasteValue("");
      setPasteOpen(false);
      // Re-trigger the sponsor setup so the new contact is acted on.
      await handleRetry();
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : String(e));
    } finally {
      setPasteBusy(false);
    }
  }, [pasteValue, nodeService, handleRetry, t]);

  // Hide when the user already has any contact — this tile is only for
  // first-friend onboarding. Stale mesh/cooldown errors from a prior
  // auto-attempt must not keep "Add your first contact" visible after
  // Allen Peng (or anyone) is already bonded via Discover / LAN / QR.
  if (bonds.length > 0) {
    return null;
  }

  // Hide the tile when the resolved config has no ownerId (no sponsor at
  // all). The discover view's "no contacts" empty state will surface the
  // standard search/paste flows in that case.
  if (!status || !status.config.enabled || !status.config.ownerId) {
    return null;
  }

  // Hide on a clean success — the contact will now show in the bond
  // list and re-surfacing the tile is noise. BUT if there's any
  // sign of failure (lastError, lastErrorKind set, or zero attempts
  // recorded), keep the tile visible so the user can re-trigger via
  // "Try again". This is the escape hatch for the false-positive
  // bug: pre-fix the runtime used to mark `setupSponsorFriendCompletedAt`
  // the instant `sendHello` returned locally, before the sponsor's
  // `bond.established` event fired. Without this fallback, users with
  // a stuck `completedAt` have no UI to clear the state.
  const lastAttempt = status.state;
  const looksSuccessful = Boolean(lastAttempt?.completedAt) && runState.kind !== "running";
  const hasFailureSignal =
    Boolean(lastAttempt?.lastError) ||
    Boolean(lastAttempt?.lastErrorKind) ||
    (lastAttempt?.attempts ?? 0) === 0;
  if (looksSuccessful && !hasFailureSignal) {
    return null;
  }

  // Cooldown countdown — recompute on each render so the user sees seconds
  // tick down. Re-evaluated when the polling useEffect fires every 2s.
  let cooldownSecondsRemaining: number | null = null;
  if (runState.kind === "cooldown") {
    const ms = Date.parse(runState.until) - Date.now();
    cooldownSecondsRemaining = ms > 0 ? Math.ceil(ms / 1000) : 0;
  } else if (
    runState.kind !== "running" &&
    runState.kind !== "succeeded" &&
    lastAttempt?.cooldownUntil
  ) {
    const ms = Date.parse(lastAttempt.cooldownUntil) - Date.now();
    if (ms > 0) cooldownSecondsRemaining = Math.ceil(ms / 1000);
  }

  const statusKey =
    runState.kind === "running"
      ? "discover.sponsorTile.statusRunning"
      : runState.kind === "succeeded"
        ? "discover.sponsorTile.statusSucceeded"
        : runState.kind === "cooldown"
          ? "discover.sponsorTile.statusCooldown"
          : runState.kind === "profileNotReady"
            ? "discover.sponsorTile.statusProfileNotReady"
            : runState.kind === "failed"
              ? "discover.sponsorTile.statusFailed"
              : runState.kind === "skipped"
                ? "discover.sponsorTile.statusSkipped"
                : cooldownSecondsRemaining != null
                  ? "discover.sponsorTile.statusCooldown"
                  : lastAttempt?.lastErrorKind === "profile-not-ready"
                    ? "discover.sponsorTile.statusProfileNotReady"
                    : lastAttempt?.lastError
                      ? "discover.sponsorTile.statusFailed"
                      : "discover.sponsorTile.statusIdle";
  const statusParams: Record<string, string> = {
    name: sponsorName ?? status.config.ownerId,
  };
  if (runState.kind === "skipped") statusParams.reason = runState.reason;
  if (runState.kind === "failed") statusParams.reason = runState.reason;
  if (runState.kind === "cooldown") {
    statusParams.reason = runState.reason;
    statusParams.seconds = String(cooldownSecondsRemaining ?? 0);
  } else if (
    runState.kind !== "running" &&
    runState.kind !== "succeeded" &&
    runState.kind !== "profileNotReady" &&
    cooldownSecondsRemaining != null
  ) {
    statusParams.reason = lastAttempt?.lastError ?? "sponsor not reachable";
    statusParams.seconds = String(cooldownSecondsRemaining);
  }
  if (runState.kind === "idle" && lastAttempt?.lastError) statusParams.reason = lastAttempt.lastError;

  return (
    <div className="sponsor-setup-tile" role="region" aria-label={t("discover.sponsorTile.heading")}>
      <div className="sponsor-setup-tile-header">
        <h3>{t("discover.sponsorTile.heading")}</h3>
        {sponsorName && (
          <div className="sponsor-setup-tile-target">
            {t("discover.sponsorTile.configuredFor", { name: sponsorName })}
          </div>
        )}
      </div>
      <div className={`sponsor-setup-tile-status status-${runState.kind}`}>
        {t(statusKey, statusParams)}
      </div>
      {lastAttempt?.lastErrorKind === "proof-token-mismatch" &&
        status.sponsorProofTokenRequired &&
        status.config.proofOfContext && (
          <div className="sponsor-setup-tile-hint">
            {t("discover.sponsorTile.proofTokenHint", {
              token: status.config.proofOfContext,
              name: sponsorName ?? status.config.ownerId,
            })}
          </div>
        )}
      {(lastAttempt?.lastErrorKind === "network-unreachable" ||
        runState.kind === "cooldown") && (
        <div className="sponsor-setup-tile-hint">
          {t("discover.sponsorTile.networkHint", {
            name: sponsorName ?? status.config.ownerId ?? "sponsor",
          })}
        </div>
      )}
      <div className="sponsor-setup-tile-actions">
        <button
          className="btn btn-primary"
          onClick={() => void handleRetry()}
          disabled={runState.kind === "running"}
        >
          {runState.kind === "running"
            ? t("discover.sponsorTile.retrying")
            : t("discover.sponsorTile.retryNow")}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setPasteOpen((v) => !v);
            setPasteError(null);
            setPasteInfo(null);
          }}
        >
          {t("discover.sponsorTile.useDifferentContact")}
        </button>
      </div>
      {pasteOpen && (
        <div className="sponsor-setup-tile-paste">
          <input
            className="sponsor-setup-tile-paste-input"
            type="text"
            value={pasteValue}
            placeholder={t("discover.sponsorTile.pastePrompt")}
            onChange={(e) => setPasteValue(e.target.value)}
            disabled={pasteBusy}
          />
          <div className="sponsor-setup-tile-paste-actions">
            <button
              className="btn btn-primary"
              onClick={() => void handleApplyPaste()}
              disabled={pasteBusy || pasteValue.trim().length === 0}
            >
              {t("discover.sponsorTile.pasteApply")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setPasteOpen(false);
                setPasteValue("");
                setPasteError(null);
                setPasteInfo(null);
              }}
              disabled={pasteBusy}
            >
              {t("discover.sponsorTile.pasteCancel")}
            </button>
          </div>
          {pasteError && <div className="sponsor-setup-tile-paste-error">{pasteError}</div>}
          {pasteInfo && <div className="sponsor-setup-tile-paste-info">{pasteInfo}</div>}
        </div>
      )}
    </div>
  );
}
