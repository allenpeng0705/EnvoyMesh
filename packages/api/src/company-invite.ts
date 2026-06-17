/**
 * Company invite — Phase 35A (Fleet Onboarding A: Company invite link).
 *
 * A long-lived, owner-issued token a joiner can paste into their home node to
 * complete a `pairDevice` handshake without scanning a QR code or being on
 * the same LAN. Tokens are bearer secrets; the home node persists them in
 * `LocalCompanyInviteStore` and the same store enforces `expiresAt`,
 * `usedAt`, and `revokedAt`.
 *
 * The `uri` field is what humans copy/paste: an `envoy://invite?token=…`
 * form the joiner's UI parses back into a token.
 */
export interface CompanyInviteRecord {
  /** Server-assigned id. */
  inviteId: string;
  /** Opaque bearer token. */
  token: string;
  ownerId: string;
  ownerPublicKey?: string;
  agentPeerId?: string;
  agentName?: string;
  wsUrl: string;
  lanWsUrl?: string;
  relayWsUrl?: string;
  homeNodePeerId?: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  expiresAt: string;
  usedAt?: string;
  usedByDeviceId?: string;
  revokedAt?: string;
  note?: string;
}

export interface CreateCompanyInviteParams {
  /** Hours until expiry (default 168 = 7 days, max 24*365). */
  expiresInHours?: number;
  /** Free-text label shown in the table. */
  note?: string;
}

export interface CreateCompanyInviteResult {
  invite: CompanyInviteRecord;
  uri: string;
}

export interface ListCompanyInvitesResult {
  invites: CompanyInviteRecord[];
}

export interface RevokeCompanyInviteResult {
  ok: true;
  invite: CompanyInviteRecord;
}
