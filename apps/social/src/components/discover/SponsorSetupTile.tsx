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
import { useNodeService } from "../../hooks/useNodeService.js";
import { parseContactCode } from "../../lib/discover-contact-code.js";

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "succeeded"; helloMessageId?: string }
  | { kind: "failed"; reason: string }
  | { kind: "skipped"; reason: string };

export function SponsorSetupTile() {
  const t = useT();
  const nodeService = useNodeService();
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
    } catch {
      // transient — leave last-known state in place
    }
  }, [nodeService, runState.kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll periodically while the tile is active so background activity
  // (NodeStateContext's auto-trigger, the runtime persisting per-attempt
  // errors) shows up. The earlier useEffect only refreshes on mount and
  // when `runState.kind` changes — but NodeStateContext's auto-trigger
  // doesn't update the tile's local `runState`, so without this poll the
  // tile would stay on the mount-time snapshot ("Not started yet") even
  // after the runtime has run and persisted failures.
  //
  // Gate on `isActive` so the poll stops once the tile hides itself
  // (lastRunSucceeded → return null). One RPC per 2s while visible.
  const isActive = Boolean(
    status?.config.enabled &&
      status.config.ownerId &&
      !(status.state?.completedAt && runState.kind !== "running"),
  );
  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => { void refresh(); }, 2_000);
    return () => window.clearInterval(id);
  }, [refresh, isActive]);

  const sponsorName = useMemo(
    () => status?.config.displayName ?? status?.config.ownerId ?? null,
    [status],
  );

  const handleRetry = useCallback(async () => {
    setRunState({ kind: "running" });
    try {
      const result = await nodeService.runSetupSponsorFriend();
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
        setRunState({ kind: "skipped", reason: result.reason ?? "skipped" });
      } else {
        setRunState({ kind: "failed", reason: result.reason ?? "sponsor hello failed" });
      }
      await refresh();
    } catch (e) {
      setRunState({ kind: "failed", reason: e instanceof Error ? e.message : String(e) });
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

  // Hide the tile when the resolved config has no ownerId (no sponsor at
  // all). The discover view's "no contacts" empty state will surface the
  // standard search/paste flows in that case.
  if (!status || !status.config.enabled || !status.config.ownerId) {
    return null;
  }

  // Hide on success — the contact will now show in the bond list and
  // re-surfacing the tile is noise. The user can still trigger a fresh
  // run by re-pairing / re-pasting if they want to re-run.
  const lastAttempt = status.state;
  const lastRunSucceeded = Boolean(lastAttempt?.completedAt) && runState.kind !== "running";
  if (lastRunSucceeded) {
    return null;
  }

  const statusKey =
    runState.kind === "running"
      ? "discover.sponsorTile.statusRunning"
      : runState.kind === "succeeded"
        ? "discover.sponsorTile.statusSucceeded"
        : runState.kind === "failed"
          ? "discover.sponsorTile.statusFailed"
          : runState.kind === "skipped"
            ? "discover.sponsorTile.statusSkipped"
            : lastAttempt?.lastError
              ? "discover.sponsorTile.statusFailed"
              : "discover.sponsorTile.statusIdle";
  const statusParams: Record<string, string> = {
    name: sponsorName ?? status.config.ownerId,
  };
  if (runState.kind === "skipped") statusParams.reason = runState.reason;
  if (runState.kind === "failed") statusParams.reason = runState.reason;
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
      {lastAttempt?.lastErrorKind === "network-unreachable" && (
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
