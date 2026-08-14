/**
 * Phase 58A — Fleet readiness checklist for Team jobs.
 *
 * Pure status model used by Social `FleetReadinessPanel` (and mirrored on
 * EnvoyGo). Each row is pass / warn / fail / skip with one recommended CTA.
 */

import { isTeamJobReady } from "./chain-bond-health.js";
import type { ChainBondHealth } from "./chain-bond-health.js";
import type { CachedAgentCardSummary } from "@envoymesh/api";

export type FleetReadinessTone = "pass" | "warn" | "fail" | "skip";

export type FleetReadinessAction =
  | "manageWorkers"
  | "openSettingsAi"
  | "openDiscover"
  | "refreshCards"
  | "retryProbe"
  | "none";

export type FleetReadinessRowId =
  | "join"
  | "engine"
  | "bonds"
  | "peerJoin"
  | "freshCard"
  | "online"
  | "otherReady";

export interface FleetReadinessRow {
  id: FleetReadinessRowId;
  tone: FleetReadinessTone;
  action: FleetReadinessAction;
}

export interface FleetReadinessInput {
  /** Local Join Agent Network (`capabilityProviderEnabled`). */
  localJoin: boolean;
  /**
   * Local AN engine ready (OpenClaw / Ext). `null` = unknown / not applicable
   * until Join is on.
   */
  engineReady: boolean | null;
  /** Bonded contacts excluding local "You". */
  bondedPeerCount: number;
  /** Peers with agent-network opt-in on a cached card. */
  peersOptedIn: number;
  /** Opted-in peers whose cardStatus is ready (not stale/missing). */
  peersFreshCard: number;
  /** Opted-in peers with stale cards. */
  peersStaleCard: number;
  /** Opted-in peers confirmed online. */
  peersOnline: number;
  /** Opted-in peers confirmed offline. */
  peersOffline: number;
  /** Selectable now (incl. You) via {@link isTeamJobReady}. */
  selectableCount: number;
  /** Selectable peers excluding local You. */
  otherReadyCount: number;
}

export interface FleetReadinessResult {
  rows: FleetReadinessRow[];
  /** True when Preview / Start should stay blocked. */
  blocked: boolean;
  /** True when calling chainPreviewGoal is pointless until the user acts. */
  skipPreview: boolean;
}

export interface FleetReadinessCandidate {
  isSelf?: boolean;
  card: CachedAgentCardSummary | undefined;
  health: ChainBondHealth;
}

/**
 * Summarize worker candidates + local Join into checklist input.
 * `bondedPeerCount` should be the true bond count (may exceed candidate rows).
 */
export function summarizeFleetReadinessInput(params: {
  localJoin: boolean;
  engineReady: boolean | null;
  bondedPeerCount: number;
  candidates: FleetReadinessCandidate[];
}): FleetReadinessInput {
  const peers = params.candidates.filter((c) => !c.isSelf);
  let peersOptedIn = 0;
  let peersFreshCard = 0;
  let peersStaleCard = 0;
  let peersOnline = 0;
  let peersOffline = 0;
  let selectableCount = 0;
  let otherReadyCount = 0;

  for (const c of params.candidates) {
    const ready = isTeamJobReady(c.card, c.health);
    if (ready) {
      selectableCount += 1;
      if (!c.isSelf) otherReadyCount += 1;
    }
  }

  for (const c of peers) {
    if (!c.health.optIn) continue;
    peersOptedIn += 1;
    if (c.health.cardStatus === "ready") peersFreshCard += 1;
    if (c.health.cardStatus === "stale") peersStaleCard += 1;
    if (c.health.onlineStatus === "online") peersOnline += 1;
    if (c.health.onlineStatus === "offline") peersOffline += 1;
  }

  return {
    localJoin: params.localJoin,
    engineReady: params.engineReady,
    bondedPeerCount: params.bondedPeerCount,
    peersOptedIn,
    peersFreshCard,
    peersStaleCard,
    peersOnline,
    peersOffline,
    selectableCount,
    otherReadyCount,
  };
}

export function buildFleetReadinessChecklist(
  input: FleetReadinessInput,
): FleetReadinessResult {
  const rows: FleetReadinessRow[] = [];

  rows.push({
    id: "join",
    tone: input.localJoin ? "pass" : "fail",
    action: input.localJoin ? "none" : "manageWorkers",
  });

  if (!input.localJoin) {
    rows.push({ id: "engine", tone: "skip", action: "none" });
  } else if (input.engineReady === false) {
    rows.push({ id: "engine", tone: "fail", action: "openSettingsAi" });
  } else if (input.engineReady === null) {
    rows.push({ id: "engine", tone: "warn", action: "openSettingsAi" });
  } else {
    rows.push({ id: "engine", tone: "pass", action: "none" });
  }

  rows.push({
    id: "bonds",
    tone: input.bondedPeerCount > 0 ? "pass" : "fail",
    action: input.bondedPeerCount > 0 ? "none" : "openDiscover",
  });

  if (input.bondedPeerCount === 0) {
    rows.push({ id: "peerJoin", tone: "skip", action: "none" });
    rows.push({ id: "freshCard", tone: "skip", action: "none" });
    rows.push({ id: "online", tone: "skip", action: "none" });
  } else if (input.peersOptedIn === 0) {
    // Manage workers: see Join status / invite peers (hint still explains "ask them").
    rows.push({ id: "peerJoin", tone: "fail", action: "manageWorkers" });
    rows.push({ id: "freshCard", tone: "skip", action: "none" });
    rows.push({ id: "online", tone: "skip", action: "none" });
  } else {
    rows.push({ id: "peerJoin", tone: "pass", action: "none" });

    if (input.peersFreshCard > 0) {
      rows.push({
        id: "freshCard",
        tone: input.peersStaleCard > 0 ? "warn" : "pass",
        action: input.peersStaleCard > 0 ? "refreshCards" : "none",
      });
    } else if (input.peersStaleCard > 0) {
      rows.push({ id: "freshCard", tone: "warn", action: "refreshCards" });
    } else {
      rows.push({ id: "freshCard", tone: "fail", action: "refreshCards" });
    }

    if (input.peersOnline > 0) {
      rows.push({ id: "online", tone: "pass", action: "none" });
    } else if (input.peersOffline > 0 && input.peersOffline >= input.peersOptedIn) {
      rows.push({ id: "online", tone: "fail", action: "retryProbe" });
    } else {
      // Still probing (unknown) or mixed — don't hard-fail.
      rows.push({ id: "online", tone: "warn", action: "retryProbe" });
    }
  }

  if (input.otherReadyCount > 0) {
    rows.push({ id: "otherReady", tone: "pass", action: "none" });
  } else if (input.selectableCount > 0) {
    rows.push({ id: "otherReady", tone: "warn", action: "openDiscover" });
  } else {
    rows.push({
      id: "otherReady",
      tone: "fail",
      action: input.localJoin ? "openDiscover" : "manageWorkers",
    });
  }

  const visible = rows.filter((r) => r.tone !== "skip");
  const blocked =
    !input.localJoin ||
    input.selectableCount === 0 ||
    input.engineReady === false;
  const skipPreview =
    input.selectableCount === 0 &&
    (!input.localJoin || input.bondedPeerCount === 0 || input.engineReady === false);

  return { rows: visible, blocked, skipPreview };
}
