/**
 * Shared bootstrap peer reprobe scheduler.
 * Used by CLI and NodeService so dial-budget deferral stays consistent.
 */
import { createAuditEvent } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";

export const BOOTSTRAP_REPROBE_JITTER_MS = 15_000;
export const MAX_BOOTSTRAP_PROBE_RESULTS = 512;

export type BootstrapProbeResult = {
  peer: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
};

export interface BootstrapReprobeDeps {
  mesh: EnvoyMesh;
  /** Interval including idle stretch; called each schedule. */
  getIntervalMs: () => number;
  upsertSeedSuccess?: (
    peer: string,
    source: "bootstrap-probe",
  ) => Promise<void>;
  appendAuditEvent?: (event: ReturnType<typeof createAuditEvent>) => Promise<void> | void;
  /** Optional shared results buffer (CLI diagnostics / relay-health). */
  probeResults?: BootstrapProbeResult[];
  logPrefix?: string;
}

export interface BootstrapReprobeHandle {
  stop: () => void;
  /** Push an entry into the optional results buffer (startup probe, etc.). */
  pushResult: (entry: BootstrapProbeResult) => void;
}

function pushBootstrapProbeResult(
  results: BootstrapProbeResult[] | undefined,
  entry: BootstrapProbeResult,
): void {
  if (!results) return;
  results.push(entry);
  if (results.length > MAX_BOOTSTRAP_PROBE_RESULTS) {
    results.splice(0, results.length - MAX_BOOTSTRAP_PROBE_RESULTS);
  }
}

/**
 * Schedule recurring bootstrap peer probes. Defers when dial queue is congested.
 */
export function startBootstrapReprobeScheduler(
  peers: string[],
  deps: BootstrapReprobeDeps,
): BootstrapReprobeHandle {
  const logPrefix = deps.logPrefix ?? "[connectivity]";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cursor = 0;
  let running = false;
  let stopped = false;

  const pushResult = (entry: BootstrapProbeResult) => {
    pushBootstrapProbeResult(deps.probeResults, entry);
  };

  const schedule = (): void => {
    if (stopped || peers.length === 0) return;
    const jitterMs = Math.floor(Math.random() * BOOTSTRAP_REPROBE_JITTER_MS);
    timer = setTimeout(() => {
      void runOnce();
    }, deps.getIntervalMs() + jitterMs);
  };

  const runOnce = async (): Promise<void> => {
    if (stopped || peers.length === 0) return;
    if (running) {
      schedule();
      return;
    }
    running = true;
    try {
      const dialBudget = deps.mesh.getDialBudget();
      if (dialBudget.deferBackgroundWork) {
        console.warn(
          `${logPrefix} bootstrap reprobe deferred (dialQueue=${dialBudget.dialQueueLength} congested)`,
        );
        return;
      }

      let peer: string | undefined;
      for (let i = 0; i < peers.length; i++) {
        const candidate = peers[cursor % peers.length];
        cursor = (cursor + 1) % peers.length;
        if (!candidate) continue;
        if (candidate.includes("/p2p-circuit/")) continue;
        const selfId = deps.mesh.peerId;
        if (candidate === selfId || candidate.includes(`/p2p/${selfId}`)) continue;
        peer = candidate;
        break;
      }
      if (!peer) return;

      try {
        const latencyMs = await deps.mesh.probePeer(peer);
        pushResult({ peer, ok: true, latencyMs });
        await deps.upsertSeedSuccess?.(peer, "bootstrap-probe");
        void deps.appendAuditEvent?.(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "connectivity.reprobe.ok",
            remotePeerId: peer,
            latencyMs,
            outcome: "record",
            summary: `bootstrap reprobe ok peer=${peer} latencyMs=${latencyMs}`,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("probePeer skipped:")) {
          return;
        }
        pushResult({ peer, ok: false, error: message });
        console.warn(
          `${logPrefix} bootstrap reprobe FAILED for ${peer.slice(0, 60)}…: ${message.slice(0, 80)}`,
        );
        const recent = (deps.probeResults ?? []).slice(-peers.length);
        if (recent.length >= peers.length && recent.every((r) => !r.ok)) {
          console.warn(
            `${logPrefix} ALL bootstrap reprobe peers failed this cycle (${peers.length}/${peers.length})`,
          );
        }
        void deps.appendAuditEvent?.(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "connectivity.reprobe.fail",
            remotePeerId: peer,
            outcome: "record",
            summary: `bootstrap reprobe failed peer=${peer} error=${message}`,
          }),
        );
      }
    } finally {
      running = false;
      schedule();
    }
  };

  schedule();

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    pushResult,
  };
}
