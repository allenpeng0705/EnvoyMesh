/**
 * stopNode runtime (Step 20c).
 *
 * Extracted from `node-service-impl.ts` (Node Lifecycle section).
 * Owns the public `stopNode` method that tears down timers, mesh
 * connections, and emits the lifecycle-status events.
 *
 * The runtime takes a `StopNodeContext` with ~12 accessors for the
 * class state it reads or mutates. The class method collapses to
 * a 3-line delegation.
 */
import type { NodeStatus } from "@envoymesh/api";

/** A no-arg function that performs a teardown step (set when undefined). */
export type StopFn = (() => void) | undefined;

export interface StopNodeContext {
  /** Current node lifecycle status string. */
  getNodeStatus(): NodeStatus;
  /** Replace the node lifecycle status string. */
  setNodeStatus(status: NodeStatus): void;
  /** Emit a lifecycle event. */
  emit(event: string, payload: unknown): void;
  /** Clear all in-flight profile requests. */
  clearProfileRequestInflight(): void;
  /** Stop the pairing-kiosk server. */
  stopPairingKiosk(): Promise<void>;
  /** Get (and clear) the relay-client-scheduler stop hook. */
  getAndClearRelayClientSchedulerStop(): StopFn;
  /** Get (and clear) the node-stats-logging stop hook. */
  getAndClearNodeStatsLoggingStop(): StopFn;
  /** Get (and clear) the capability-discovery timer. */
  getAndClearCapabilityDiscoveryTimer(): NodeJS.Timeout | undefined;
  /** Get (and clear) the bond-warm timer. */
  getAndClearBondWarmTimer(): NodeJS.Timeout | undefined;
  /** Get (and clear) the profile-refresh startup timer. */
  getAndClearProfileRefreshStartupTimer(): NodeJS.Timeout | undefined;
  /** Get (and clear) the chat-room sync flush timer. */
  getAndClearChatRoomSyncFlushTimer(): NodeJS.Timeout | null | undefined;
  /** Get the live mesh instance (or undefined). */
  getMesh(): { stop(): Promise<void> } | undefined;
  /** Set the live mesh instance (or undefined). */
  setMesh(mesh: { stop(): Promise<void> } | undefined): void;
  /** Clear the external mesh reference. */
  clearExternalMesh(): void;
  /** Get (and clear) the advertise-interests timer. */
  getAndClearAdvertiseInterestsTimer(): NodeJS.Timeout | undefined;
  /** Get (and clear) the advertise-interests startup timeout. */
  getAndClearAdvertiseInterestsStartupTimeout(): NodeJS.Timeout | undefined;
  /** Get (and clear) the debounced early relay.checkin timer. */
  getAndClearEarlyRelayCheckinTimer(): ReturnType<typeof setTimeout> | undefined;
  /** Local device id (used in the node:offline event). */
  getDeviceId(): string | undefined;
}

export async function stopNodeViaRuntime(ctx: StopNodeContext): Promise<void> {
  if (ctx.getNodeStatus() === "offline") {
    return;
  }
  ctx.setNodeStatus("stopping");
  ctx.emit("node:status", { status: ctx.getNodeStatus() });
  ctx.clearProfileRequestInflight();

  try {
    await ctx.stopPairingKiosk();
    ctx.getAndClearRelayClientSchedulerStop()?.();
    const capDiscoveryTimer = ctx.getAndClearCapabilityDiscoveryTimer();
    if (capDiscoveryTimer) clearTimeout(capDiscoveryTimer);
    ctx.getAndClearNodeStatsLoggingStop()?.();
    const bondWarm = ctx.getAndClearBondWarmTimer();
    if (bondWarm) clearInterval(bondWarm);
    const profileRefresh = ctx.getAndClearProfileRefreshStartupTimer();
    if (profileRefresh) clearTimeout(profileRefresh);
    const chatFlush = ctx.getAndClearChatRoomSyncFlushTimer();
    if (chatFlush) clearInterval(chatFlush);
    // Don't clear _relayBootstrapPeers — keep the last known relay list so
    // getPairingPayload() can still return useful fallback addresses if called
    // during a brief stop/start window (e.g. QR modal open during node restart).
    const mesh = ctx.getMesh();
    if (mesh) {
      await mesh.stop();
      ctx.setMesh(undefined);
    }
    ctx.clearExternalMesh();
    const advertiseTimer = ctx.getAndClearAdvertiseInterestsTimer();
    if (advertiseTimer) clearInterval(advertiseTimer);
    const advertiseTimeout = ctx.getAndClearAdvertiseInterestsStartupTimeout();
    if (advertiseTimeout) clearTimeout(advertiseTimeout);
    const earlyCheckin = ctx.getAndClearEarlyRelayCheckinTimer();
    if (earlyCheckin) clearTimeout(earlyCheckin);
  } catch (error) {
    console.error("[node-service] Error stopping mesh:", error);
  }

  ctx.setNodeStatus("offline");
  ctx.emit("node:status", { status: ctx.getNodeStatus() });
  ctx.emit("node:offline", { peerId: ctx.getDeviceId() ?? "" });
}