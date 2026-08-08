/**
 * Bounded LAN-first warm/send dials shared by chat "Checking…" and pre-send warm.
 */
import {
  isLikelyInboundConnSnapshotDialHint,
  isPrivateLanTcpDialHint,
  type EnvoyMesh,
} from "@envoymesh/network";

/** Dial-hint assembly budget. Keep short — chat "Checking…" waits on this. */
export const WARM_CONTACT_DIAL_HINTS_TIMEOUT_MS = 5_000;
/** Cap full warm dial when VPN is active so chat does not sit Offline for minutes. */
export const WARM_CONTACT_VPN_DIAL_TIMEOUT_MS = 12_000;
/**
 * Phase-1 same-subnet warm for stable private-LAN listen ports. Sized for ~2
 * stable private-LAN hint dials at 3s each.
 */
export const WARM_CONTACT_SAME_SUBNET_BUDGET_MS = 8_000;
/**
 * Phase-1 when LAN hints are only high-port (tcp/0) snapshots — fail fast so
 * stale same-/24 directory evidence cannot burn a full stable LAN budget.
 */
export const WARM_CONTACT_SAME_SUBNET_EPHEMERAL_BUDGET_MS = 2_500;
/**
 * Phase-2 / WAN warm budget. Same-subnet leftover circuits use a 5s fast-fail
 * in network; this outer cap bounds Checking… / pre-send warm.
 */
export const WARM_CONTACT_DIAL_BUDGET_MS = 35_000;

/** Unblocks when an underlying fs read or dial never settles. */
export function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout?.();
      } catch {
        /* ignore */
      }
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export type EnsureReachableMesh = Pick<EnvoyMesh, "ensurePeerReachable" | "getPeerConnectionInfo">;

export type EnsureReachableWithBudgetInput = {
  mesh: EnsureReachableMesh;
  transportPeerId: string;
  protocol: string;
  dialHints: string[];
  preferCircuitHints?: boolean;
  sameSubnetLanFirst: boolean;
  forceFreshDial?: boolean;
  upgradeRelayToDirect?: boolean;
  verifyConnection?: boolean;
  likelyVpnActive?: boolean;
};

function hasStablePrivateLanHint(hints: readonly string[]): boolean {
  return hints.some(
    (h) =>
      isPrivateLanTcpDialHint(h) &&
      !h.includes("/p2p-circuit/") &&
      !isLikelyInboundConnSnapshotDialHint(h),
  );
}

/**
 * ensurePeerReachable with the same two-phase / budget policy used for warm
 * contact (Checking…) and pre-send warm. Aborts in-flight dials when a budget
 * elapses so late connects do not race the next phase unnoticed.
 */
export async function ensureReachableWithLanFirstBudget(
  input: EnsureReachableWithBudgetInput,
): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }> {
  const preferCircuitHints = input.preferCircuitHints === true;
  const likelyVpnActive = input.likelyVpnActive === true;
  const isUpgrade = input.upgradeRelayToDirect === true;
  const lanFirst = input.sameSubnetLanFirst && !preferCircuitHints;
  const lanOnly = input.dialHints.filter((h) => !h.includes("/p2p-circuit/"));
  const hasCircuit = input.dialHints.some((h) => h.includes("/p2p-circuit/"));
  const hasStableLan = hasStablePrivateLanHint(lanOnly);
  // Dedicated LAN-only phase only with stable listen ports, or when there is
  // no circuit fallback. Ephemeral-only + circuits → one combined pass so
  // stale same-/24 directory snapshots cannot burn ~8s before relay.
  const tryLanOnlyFirst =
    lanFirst && !isUpgrade && lanOnly.length > 0 && (hasStableLan || !hasCircuit);

  const run = (hints: string[], sameSubnet: boolean, signal: AbortSignal) =>
    input.mesh.ensurePeerReachable(input.transportPeerId, input.protocol, {
      dialHints: hints,
      preferCircuitHints,
      sameSubnetLanFirst: sameSubnet,
      forceFreshDial: input.forceFreshDial,
      upgradeRelayToDirect: input.upgradeRelayToDirect,
      verifyConnection: input.verifyConnection,
      signal,
    });

  const bounded = async (
    hints: string[],
    sameSubnet: boolean,
    budgetMs: number,
    label: string,
  ) => {
    const ac = new AbortController();
    try {
      return await raceWithTimeout(run(hints, sameSubnet, ac.signal), budgetMs, label, () =>
        ac.abort(),
      );
    } catch {
      if (!ac.signal.aborted) ac.abort();
      return input.mesh.getPeerConnectionInfo(input.transportPeerId);
    }
  };

  if (tryLanOnlyFirst) {
    const phase1Budget = hasStableLan
      ? WARM_CONTACT_SAME_SUBNET_BUDGET_MS
      : WARM_CONTACT_SAME_SUBNET_EPHEMERAL_BUDGET_MS;
    const phase1 = await bounded(lanOnly, true, phase1Budget, "warmContactLanDial");
    if (phase1.connected) return phase1;
    const phase2Budget = likelyVpnActive
      ? WARM_CONTACT_VPN_DIAL_TIMEOUT_MS
      : WARM_CONTACT_DIAL_BUDGET_MS;
    return bounded(input.dialHints, true, phase2Budget, "warmContactDial");
  }

  // Same-subnet evidence from high-port snapshots only: LAN short-timeouts then
  // circuit fast-fail in one walk (no exclusive LAN-only phase).
  if (lanFirst && hasCircuit && !hasStableLan && !isUpgrade) {
    const budget = likelyVpnActive
      ? WARM_CONTACT_VPN_DIAL_TIMEOUT_MS
      : WARM_CONTACT_DIAL_BUDGET_MS;
    return bounded(input.dialHints, true, budget, "warmContactDial");
  }

  const budgetMs = isUpgrade
    ? WARM_CONTACT_DIAL_BUDGET_MS
    : lanFirst
      ? hasStableLan
        ? WARM_CONTACT_SAME_SUBNET_BUDGET_MS
        : WARM_CONTACT_SAME_SUBNET_EPHEMERAL_BUDGET_MS
      : likelyVpnActive
        ? WARM_CONTACT_VPN_DIAL_TIMEOUT_MS
        : WARM_CONTACT_DIAL_BUDGET_MS;

  return bounded(input.dialHints, lanFirst, budgetMs, "warmContactDial");
}
