/**
 * Phase 66B — one-click ensure Join + lease publish for same-owner / bonded fleet.
 */

export type EnsureFleetWorkersParams = {
  /** Bonded owner ids (`envoy:owner:…`). Empty/omit → all direct|referred bonds. */
  ownerIds?: string[];
};

export type EnsureFleetWorkersPeerAction =
  | "join_local"
  | "lease_published_local"
  | "card_refresh"
  | "lease_request_sent"
  | "skipped_blocked"
  | "skipped_public"
  | "skipped_self";

export type EnsureFleetWorkersPeerResult = {
  ownerId: string;
  displayName?: string;
  ok: boolean;
  actions: EnsureFleetWorkersPeerAction[];
  reason?: string;
};

export type EnsureFleetWorkersResult = {
  localJoinEnabled: boolean;
  localLeasePublished: boolean;
  peers: EnsureFleetWorkersPeerResult[];
};
