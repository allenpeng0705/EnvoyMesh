export * from "./envoy-ai-thread.js";
export * from "./model-thinking.js";
export * from "./ai-knowledge-base.js";
export * from "./ai-embedding-limits.js";
export * from "./rag-index-status.js";
export * from "./connectivity-tuning.js";
export * from "./contact-ai-access.js";
export * from "./ai-identity-prefix.js";
export * from "./autonomous-policy.js";
export * from "./auto-reply-limits.js";
export * from "./agent-circle.js";
export * from "./envoy-pair-uri.js";
export * from "./pairing-token.js";
export * from "./envoy-contact-link.js";
export * from "./chat-device-auth.js";
export * from "./chat-attachments.js";
export * from "./attachment-transfer.js";
export * from "./chat-actor.js";
export * from "./agent-visibility.js";
export * from "./agent-activity-map.js";
export * from "./agent-interaction.js";
export * from "./agent-network-mode.js";
export * from "./approval-queue.js";
export * from "./approval-executor.js";
export * from "./task-dispatcher.js";
export * from "./default-bootstrap.js";
export * from "./group-chat-delivery.js";
export * from "./node-service.js";
/** Phase 34: re-export the typed `Artifact` discriminated union so the Social UI can render task.results. */
export type {
  Artifact,
  CompositeArtifact,
  CompositeArtifactPart,
  FileArtifact,
  ChainReport,
  ChainReportSection,
  StructuredArtifact,
  TextArtifact,
  TaskResultPayload,
} from "@envoymesh/protocol";
export * from "./bond-target.js";
export * from "./document-autonomy.js";
export * from "./profile-media.js";
export * from "./strip-image-metadata.js";
export * from "./document-agent-loop.js";
export * from "./owner-agent-loop.js";
export * from "./owner-agent-types.js";
export * from "./answer-block-file.js";
export * from "./owner-agent-tool-allowlist.js";
export * from "./owner-agent-planner.js";
export * from "./library-request-share.js";
export * from "./transfer-status.js";
export * from "./knowledge-syndication.js";
export * from "./envoy-disclosure.js";
export * from "./emp-supported-capabilities.js";
export * from "./capability-intent-routing.js";
export * from "./capability-provider.js";
export * from "./capability-route-executor.js";
export * from "./social-proxy-session.js";
export * from "./document-acquisition.js";
export * from "./friend-autopilot.js";
export * from "./ipfs-pinning.js";
export * from "./wan-join-invite.js";
export * from "./company-invite.js";
export * from "./kiosk-status.js";
export * from "./fleet-manifest.js";
export * from "./h2a-wire-semantics.js";
export * from "./owner-did-presentation.js";
/** Types only — runtime lives in `@envoymesh/api/did-import` (Node identity / crypto). */
export type { ResolveDidImportResult, ResolvedDidImport } from "./did-import.js";
export * from "./wan-signoff-evidence.js";
export * from "./commerce-receipt.js";
export * from "./wan-two-nat-checklist.js";
export * from "./discovery-hop.js";
export * from "./discovery-privacy.js";
/** Types only — runtime lives in `@envoymesh/api/discovery-referral-attestation`. */
export type { UnsignedDiscoveryReferralAttestation } from "./discovery-referral-attestation.js";
export * from "./sync-state.js";
export * from "./ws-protocol.js";
export * from "./terminal.js";
export * from "./terminal-agent.js";
export * from "./terminal-wire.js";
export * from "./home-remote.js";
/** Explicit export: Vite pre-bundle can skip `bondTrustRank` when re-exported only via star from `node-service`. */
export { bondTrustRank } from "./bond-trust-rank.js";
/** Explicit export: Vite/Rollup may not trace star re-exports from `node-service`. */
export {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_LIBRARY_ITEM_PREVIEW_BYTES,
} from "./node-service.js";
export {
  chatRoomThreadKey,
  parseChatRoomThreadKey,
  isChatRoomThreadKey,
} from "./chat-room-thread.js";
export {
  deriveLocationDiscoveryTopics,
  locationSearchTopics,
  encodeGeohash,
  decodeGeohash,
  NEARBY_GEOHASH_PRECISION,
  normalizeLocationSlug,
  normalizeCountryCode,
  parseGeoDiscoveryTopic,
  formatGeoTopicLabel,
  geohashNeighborPrefixes,
  GEO_TOPIC_PREFIX,
  hashDiscoveryTag,
  hashGeoDiscoveryTopics,
  geoDiscoveryTagHashesFromProfile,
  matchGeoDiscoveryTagHashes,
  friendMatchingGeoSearchTopics,
  friendMatchingGeoTagHashes,
  resolveFriendMatchingGeoInput,
} from "./discovery-location.js";
export type { FriendMatchingGeoScope } from "./discovery-location.js";
export type { DiscoveryLocation, DiscoveryLocationPrecision } from "@envoymesh/protocol";
export {
  profileCapabilityTags,
  profileCapabilityDiscoveryTopics,
  syncProfileTagsToManifestCapabilities,
} from "./profile-capabilities.js";
export type { ProfileCapabilityEntry } from "./profile-capabilities.js";
/** Explicit export: Social UI imports these; keep browser-safe (no node-only deps). */
export {
  mergeGroupDeliveryAck,
  groupDeliveryRecipientCount,
  isGroupDeliveryComplete,
  hasPartialGroupDelivery,
} from "./group-chat-delivery.js";