/**
 * Browser / Capacitor-safe exports from @envoymesh/network (no node:crypto, no libp2p node stack).
 */
export { encodeEnvelope, decodeEnvelope } from "./codec.js";
export {
  buildSyntheticRelayCircuitHints,
  dedupeDialHintStrings,
  prioritizeCircuitDialHints,
} from "./relay-circuit-hints.js";
