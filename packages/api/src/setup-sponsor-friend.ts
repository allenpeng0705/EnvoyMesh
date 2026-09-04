import { parseEnvoyContactUri } from "./envoy-contact-link.js";

/** Bundled / persisted config for zero-step first friend on first setup. */
export type SetupSponsorFriendConfig = {
  /** Master switch — when false, no auto-hello runs. Default false. */
  enabled: boolean;
  /** Full `envoy://contact?…` URI (preferred). */
  contactUri?: string;
  /** Sponsor owner id (alternative to contactUri). */
  ownerId?: string;
  /** Sponsor libp2p peer id for lookup / hello routing. */
  peerId?: string;
  /** WAN join token from sponsor contact link. */
  joinToken?: string;
  /** Sponsor display name (informational). */
  displayName?: string;
  /** Message sent with bond.request. Default: "Hello!" */
  helloMessage?: string;
  /**
   * Shared secret sent as `proofOfContext` on bond.request.
   * Must match sponsor `bondAutonomySponsorProofToken` when that is set.
   */
  proofOfContext?: string;
  /** Retry when sponsor is not reachable yet. Default 12. */
  maxAttempts?: number;
  /** Delay between retries in ms. Default 5000. */
  retryDelayMs?: number;
  /**
   * How long to pause auto-retry after a cycle exhausts `maxAttempts`
   * (or hits a permanent skip like `profile-not-ready`). Default 60000.
   * The tile shows a countdown to `cooldownUntil`; the user can manually
   * bypass with the Retry button.
   */
  cooldownMs?: number;
  /**
   * Force-start a fresh cycle even if `cooldownUntil` is in the future
   * or the human profile isn't loaded yet. Set by the manual Retry
   * button. Default false.
   */
  forceBypassGuards?: boolean;
};

export type SetupSponsorFriendState = {
  completedAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  /**
   * Classified failure kind for the last error. Drives which hint the UI
   * surfaces — a `network-unreachable` failure shouldn't suggest
   * `bondAutonomy.sponsorProofToken` configuration (the message comes from
   * the transport layer, not the bond handler). The classification is
   * done in the runtime (`classifySponsorError`) and stored alongside
   * `lastError` so the UI doesn't have to re-derive it from raw text.
   */
  lastErrorKind?:
    | "network-unreachable"
    | "proof-token-mismatch"
    | "profile-not-ready"
    | "mesh-not-ready"
    | "protocol-mismatch"
    | "sponsor-no-ack"
    | "other";
  attempts?: number;
  /**
   * ISO timestamp until which auto-retry is paused after a failed cycle.
   * The runtime sets this to `now + cooldownMs` when the loop exhausts
   * `maxAttempts`. The tile surfaces a countdown instead of "Retrying" so
   * the user gets a real signal that the loop is taking a breather, not
   * silently hammering the dial. Manual Retry bypasses the cooldown.
   */
  cooldownUntil?: string;
  /**
   * Why a sponsor hello was skipped (not started, not auto-retrying). Set
   * when the runtime refuses to start a fresh cycle — current values:
   *   - `"cooldown"` — `cooldownUntil` is in the future.
   *   - `"auto-exhausted"` — one auto cycle burned `maxAttempts`; only manual Retry.
   *   - `"profile-not-ready"` — `getHumanProfile()` returned null.
   *   - `"mesh-not-ready"` — libp2p mesh isn't fully up yet.
   *   - `"protocol-mismatch"` — `bond.request` landed on the wrong protocol.
   *   - `"disabled-or-incomplete"` — config not enabled or no ownerId.
   *   - `"already-completed"` — `setupSponsorFriendCompletedAt` is set.
   *   - `"already-bonded"` — sponsor is already a direct/referred contact.
   *   - `"sponsor-is-self-peer"` / `"sponsor-is-self-owner"` — local profile matches.
   */
  skipReason?: string;
};

/**
 * Full status the settings/discover UI consumes — resolved effective config
 * plus the last-attempt state from persisted config. The fresh-install UX
 * surfaces this so the user can see "we tried to add <sponsor> and here's
 * why it didn't work", not just the badge.
 */
export type SetupSponsorFriendStatus = {
  /** The resolved effective config (bundled + persisted, merged). */
  config: ResolvedSetupSponsorFriend;
  /** The persisted last-attempt state — null when no run has been recorded yet. */
  state: SetupSponsorFriendState;
  /**
   * True when the bundled/persisted config carries a `proofOfContext`. When
   * true, the sponsor side needs to set `bondAutonomy.sponsorProofToken`
   * to the same value to auto-accept. The UI surfaces this as a hint on
   * failure so the user knows what to ask the sponsor to configure.
   */
  sponsorProofTokenRequired: boolean;
};

export type ResolvedSetupSponsorFriend = {
  enabled: boolean;
  /**
   * The envoy://contact?… URI that was the source of truth for ownerId/peerId/joinToken/displayName.
   * Persisted alongside the parsed fields so the Settings UI can show the user a single,
   * copy-pasteable URI instead of four disconnected inputs.
   */
  contactUri?: string;
  ownerId?: string;
  peerId?: string;
  joinToken?: string;
  displayName?: string;
  helloMessage: string;
  proofOfContext?: string;
  maxAttempts: number;
  retryDelayMs: number;
  /** Where the effective config came from. */
  source: "bundled" | "persisted" | "merged" | "none";
};

export type RunSetupSponsorFriendResult = {
  ok: boolean;
  /**
   * When true, the runtime kicked off the retry loop in the background
   * and returned immediately. The UI should poll
   * `getSetupSponsorFriendStatus` to see the final result. Without this
   * the RPC client's default 30-120s timeout would fire before the
   * runtime's worst-case retry budget (12 attempts × 30s+) completes,
   * surfacing a misleading "Request runSetupSponsorFriend timed out"
   * error.
   */
  running?: boolean;
  skipped?: boolean;
  reason?: string;
  ownerId?: string;
  helloMessageId?: string;
  /**
   * Classified failure kind — only set when `ok` is false. Mirrors
   * `SetupSponsorFriendState.lastErrorKind`. Lets the UI surface a
   * specific hint immediately on a manual retry (without waiting for
   * the persisted state to be re-read).
   */
  lastErrorKind?:
    | "network-unreachable"
    | "proof-token-mismatch"
    | "profile-not-ready"
    | "mesh-not-ready"
    | "protocol-mismatch"
    | "sponsor-no-ack"
    | "other";
  /**
   * ISO timestamp at which the auto-retry cooldown expires. Set when the
   * runtime returns `skipped: true, reason: "cooldown"`. The UI shows a
   * countdown to this value and gates the next auto-trigger on it.
   */
  cooldownUntil?: string;
};

const DEFAULT_HELLO = "Hello!";
const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_COOLDOWN_MS = 60_000;

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return n > 0 ? n : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Parse a partial config object from JSON / env / node-config. */
export function parseSetupSponsorFriendConfig(raw: unknown): SetupSponsorFriendConfig | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.enabled !== "boolean") return undefined;
  return {
    enabled: obj.enabled,
    contactUri: normalizeOptionalString(obj.contactUri),
    ownerId: normalizeOptionalString(obj.ownerId),
    peerId: normalizeOptionalString(obj.peerId),
    joinToken: normalizeOptionalString(obj.joinToken),
    displayName: normalizeOptionalString(obj.displayName),
    helloMessage: normalizeOptionalString(obj.helloMessage),
    proofOfContext: normalizeOptionalString(obj.proofOfContext),
    maxAttempts: obj.maxAttempts === undefined ? undefined : normalizePositiveInt(obj.maxAttempts, DEFAULT_MAX_ATTEMPTS),
    retryDelayMs:
      obj.retryDelayMs === undefined ? undefined : normalizePositiveInt(obj.retryDelayMs, DEFAULT_RETRY_DELAY_MS),
    cooldownMs: obj.cooldownMs === undefined ? undefined : normalizePositiveInt(obj.cooldownMs, DEFAULT_COOLDOWN_MS),
    forceBypassGuards: obj.forceBypassGuards === undefined
      ? undefined
      : normalizeBoolean(obj.forceBypassGuards, false),
  };
}

function fieldsFromContactUri(contactUri: string): Pick<
  ResolvedSetupSponsorFriend,
  "ownerId" | "peerId" | "joinToken" | "displayName"
> {
  const contact = parseEnvoyContactUri(contactUri);
  return {
    ownerId: contact.ownerId,
    peerId: contact.peerId,
    joinToken: contact.joinToken,
    displayName: contact.displayName,
  };
}

/**
 * Resolve the sponsor's libp2p peer id from an explicit field or `envoy://contact?…`.
 * Used at mesh start for strict-dial allow-listing when `setupSponsorFriendPeerId`
 * was never persisted (common: only `setupSponsorFriendContactUri` is set).
 */
export function extractSponsorPeerId(input: {
  peerId?: string | null;
  contactUri?: string | null;
}): string | undefined {
  const direct = typeof input.peerId === "string" ? input.peerId.trim() : "";
  if (direct) return direct;
  const uri = typeof input.contactUri === "string" ? input.contactUri.trim() : "";
  if (!uri) return undefined;
  try {
    return fieldsFromContactUri(uri).peerId?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map persisted `setupSponsorFriend*` node-config fields into the merge shape
 * used by {@link resolveSetupSponsorFriendConfig}.
 */
export function persistedNodeConfigToSponsorFriendConfig(config: {
  setupSponsorFriendEnabled?: boolean;
  setupSponsorFriendContactUri?: string;
  setupSponsorFriendOwnerId?: string;
  setupSponsorFriendPeerId?: string;
  setupSponsorFriendJoinToken?: string;
  setupSponsorFriendDisplayName?: string;
  setupSponsorFriendHelloMessage?: string;
  setupSponsorFriendProofOfContext?: string;
  setupSponsorFriendMaxAttempts?: number;
  setupSponsorFriendRetryDelayMs?: number;
  setupSponsorFriendCooldownMs?: number;
} | null | undefined): SetupSponsorFriendConfig | null {
  if (!config?.setupSponsorFriendEnabled) return null;
  return {
    enabled: true,
    contactUri: config.setupSponsorFriendContactUri,
    ownerId: config.setupSponsorFriendOwnerId,
    peerId: config.setupSponsorFriendPeerId,
    joinToken: config.setupSponsorFriendJoinToken,
    displayName: config.setupSponsorFriendDisplayName,
    helloMessage: config.setupSponsorFriendHelloMessage,
    proofOfContext: config.setupSponsorFriendProofOfContext,
    maxAttempts: config.setupSponsorFriendMaxAttempts,
    retryDelayMs: config.setupSponsorFriendRetryDelayMs,
    cooldownMs: config.setupSponsorFriendCooldownMs,
  };
}

/**
 * Merge bundled defaults with persisted overrides (persisted wins on conflict).
 * Returns `source: none` when disabled or missing sponsor owner id.
 */
export function resolveSetupSponsorFriendConfig(input: {
  bundled?: SetupSponsorFriendConfig | null;
  persisted?: SetupSponsorFriendConfig | null;
}): ResolvedSetupSponsorFriend {
  const bundled = input.bundled ?? undefined;
  const persisted = input.persisted ?? undefined;

  if (!bundled?.enabled && !persisted?.enabled) {
    return {
      enabled: false,
      helloMessage: DEFAULT_HELLO,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      source: "none",
    };
  }

  const enabled = persisted?.enabled ?? bundled?.enabled ?? false;
  if (!enabled) {
    return {
      enabled: false,
      helloMessage: DEFAULT_HELLO,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      source: "none",
    };
  }

  const contactUri = persisted?.contactUri ?? bundled?.contactUri;
  let fromContact: ReturnType<typeof fieldsFromContactUri> = {};
  if (contactUri) {
    try {
      fromContact = fieldsFromContactUri(contactUri);
    } catch {
      fromContact = {};
    }
  }

  const ownerId = persisted?.ownerId ?? fromContact.ownerId ?? bundled?.ownerId;
  const peerId = persisted?.peerId ?? fromContact.peerId ?? bundled?.peerId;
  const joinToken = persisted?.joinToken ?? fromContact.joinToken ?? bundled?.joinToken;
  const displayName = persisted?.displayName ?? fromContact.displayName ?? bundled?.displayName;
  const helloMessage = persisted?.helloMessage ?? bundled?.helloMessage ?? DEFAULT_HELLO;
  const proofOfContext = persisted?.proofOfContext ?? bundled?.proofOfContext;
  const maxAttempts = persisted?.maxAttempts ?? bundled?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = persisted?.retryDelayMs ?? bundled?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const source: ResolvedSetupSponsorFriend["source"] =
    bundled && persisted ? "merged" : persisted ? "persisted" : bundled ? "bundled" : "none";

  return {
    enabled: Boolean(ownerId),
    contactUri,
    ownerId,
    peerId,
    joinToken,
    displayName,
    helloMessage,
    proofOfContext,
    maxAttempts,
    retryDelayMs,
    source: ownerId ? source : "none",
  };
}

/** Bond autonomy policy fields exposed via node-config (sponsor-side auto-accept). */
export type BondAutonomyNodeConfig = {
  enabled?: boolean;
  maxAutoBondsPerDay?: number;
  requireReferralProof?: boolean;
  maxAutoBondTier?: "referred" | "direct";
  minTrustOverlapScore?: number;
  notifyOwnerOnAutoBond?: boolean;
  /**
   * When set, inbound bond.request is auto-accepted only when
   * `proofOfContext` matches this token exactly.
   */
  sponsorProofToken?: string;
};

export function resolveBondAutonomyPostureFromConfig(
  config: BondAutonomyNodeConfig | undefined,
): import("@envoymesh/protocol").BondAutonomyPosturePolicy | null {
  if (!config?.enabled) return null;
  return {
    maxAutoBondsPerDay: config.maxAutoBondsPerDay ?? 50,
    requireReferralProof: config.requireReferralProof ?? true,
    maxAutoBondTier: config.maxAutoBondTier ?? "direct",
    minTrustOverlapScore: config.minTrustOverlapScore ?? 0,
    notifyOwnerOnAutoBond: config.notifyOwnerOnAutoBond ?? true,
  };
}
