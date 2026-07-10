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
  lastErrorKind?: "network-unreachable" | "proof-token-mismatch" | "other";
  attempts?: number;
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
  lastErrorKind?: "network-unreachable" | "proof-token-mismatch" | "other";
};

const DEFAULT_HELLO = "Hello!";
const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_RETRY_DELAY_MS = 5000;

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
