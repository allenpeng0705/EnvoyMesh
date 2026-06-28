/**
 * Outbound P2P delivery stack — lock, warm coordinator, path memory, health.
 *
 * Import from here instead of individual modules so chat, calls, attachments,
 * and bond warm share one stable surface and tests can reset state in one place.
 */
export {
  withOutboundPeerLock,
  withOutboundSendLock,
  resetOutboundPeerLockForTests,
} from "../outbound-peer-lock.js";

export {
  COORDINATOR_DISCONNECTED_WARM_MS,
  COORDINATOR_RELAY_UPGRADE_MS,
  COORDINATOR_KEEPALIVE_PROBE_MS,
  COORDINATOR_SEND_PREPARE_MS,
  classifyWarmDialKind,
  evaluateWarmCoordinator,
  recordWarmDialStarted,
  isWarmInFlight,
  markWarmInFlight,
  resetWarmCoordinatorForTests,
  type WarmDialKind,
  type WarmCoordinatorDecision,
} from "../outbound-warm-coordinator.js";

export {
  recordSuccessfulOutboundPath,
  prioritizeHintsWithPathMemory,
  getStoredOutboundPath,
  resetOutboundPathMemoryForTests,
} from "../outbound-path-memory.js";

export {
  markOutboundPeerVerified,
  isOutboundPeerRecentlyVerified,
  clearOutboundPeerFreshness,
  resetOutboundPeerFreshnessForTests,
} from "../outbound-peer-freshness.js";

export { shouldPreferCircuitDialHints } from "../outbound-dial-hints.js";

export { buildPeerConnectionHealth } from "../peer-connection-health.js";

export { outboundDeliveryTrace } from "../outbound-delivery-trace.js";

export { prepareOutboundPeerConnection } from "../chat-outbound-deliver.js";
