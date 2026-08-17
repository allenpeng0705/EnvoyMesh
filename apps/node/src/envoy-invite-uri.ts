/**
 * `envoy://invite?…` URI builder + parser — Phase 35A (Fleet Onboarding A).
 *
 * The joiner pastes this URI into the Social UI. The form mirrors the existing
 * `envoy://pair` URI surface so the same QR-style fields are available; the
 * server-side `token` is the bearer secret a freshly-installed node presents
 * to complete `pairDevice`.
 */
import type { CompanyInviteRecord } from "@envoymesh/api";

function appendOptional(params: URLSearchParams, key: string, value?: string): void {
  if (value && value.length > 0) {
    params.set(key, value);
  }
}

/**
 * Max extra relay bases packed into the invite URI. Each relay costs ~45–50
 * URI chars and every extra one pushes the QR code into a denser version,
 * which makes it harder to scan from a phone. EnvoyGo already carries the
 * community relay as its last-resort fallback, so the QR only needs a few
 * operator relays for regional redundancy — not the full configured list.
 */
export const MAX_INVITE_RELAY_WS_URLS = 3;

export function getPairingUriForInvite(invite: CompanyInviteRecord): string {
  const params = new URLSearchParams();
  params.set("token", invite.token);
  params.set("wsUrl", invite.wsUrl);
  appendOptional(params, "lanWsUrl", invite.lanWsUrl);
  appendOptional(params, "relayWsUrl", invite.relayWsUrl);
  if (invite.relayWsUrls && invite.relayWsUrls.length > 0) {
    // Comma-joined to keep the URI compact; relay WS URLs never contain
    // commas. Capped so QR density stays bounded however many relays the
    // node has configured.
    params.set("rels", invite.relayWsUrls.slice(0, MAX_INVITE_RELAY_WS_URLS).join(","));
  }
  appendOptional(params, "ownerId", invite.ownerId);
  appendOptional(params, "ownerPublicKey", invite.ownerPublicKey);
  appendOptional(params, "agentPeerId", invite.agentPeerId);
  appendOptional(params, "agentName", invite.agentName);
  appendOptional(params, "homeNodePeerId", invite.homeNodePeerId);
  appendOptional(params, "inviteId", invite.inviteId);
  return `envoy://invite?${params.toString()}`;
}

export interface ParsedEnvoyInviteUri {
  token: string;
  wsUrl: string;
  inviteId?: string;
  lanWsUrl?: string;
  relayWsUrl?: string;
  /** Extra Envoy relay WS bases from the comma-joined `rels` param. */
  relayWsUrls?: string[];
  ownerId?: string;
  ownerPublicKey?: string;
  agentPeerId?: string;
  agentName?: string;
  homeNodePeerId?: string;
}

function require(searchParams: URLSearchParams, key: string): string {
  const v = searchParams.get(key)?.trim();
  if (!v) throw new Error(`Invite link is missing ${key}`);
  return v;
}

function optional(searchParams: URLSearchParams, key: string): string | undefined {
  const v = searchParams.get(key)?.trim();
  return v ? v : undefined;
}

export function parseEnvoyInviteUri(input: string): ParsedEnvoyInviteUri {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Invite link is empty");

  let search: URLSearchParams;
  if (trimmed.startsWith("envoy://invite")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid invite link");
    }
    if (url.protocol !== "envoy:" || url.hostname !== "invite") {
      throw new Error("Expected envoy://invite link from home node");
    }
    search = url.searchParams;
  } else if (trimmed.startsWith("invite?")) {
    // Lenient form for keyboard-pasting convenience: `invite?token=…&wsUrl=…`
    // (the `envoy://` scheme is missing because the joiner hand-typed it).
    search = new URLSearchParams(trimmed.slice("invite?".length));
  } else {
    // Reject anything that isn't a recognisable invite URI. We do NOT fall
    // back to "any string with `=`" — that would let a clipboard payload
    // like `ownerPublicKey=PEM&wsUrl=…` slip through and surface a
    // misleading "missing token" error to the user.
    throw new Error("Expected envoy://invite link from home node");
  }

  return {
    token: require(search, "token"),
    wsUrl: require(search, "wsUrl"),
    inviteId: optional(search, "inviteId"),
    lanWsUrl: optional(search, "lanWsUrl"),
    relayWsUrl: optional(search, "relayWsUrl"),
    relayWsUrls: parseCsvParam(search, "rels"),
    ownerId: optional(search, "ownerId"),
    ownerPublicKey: optional(search, "ownerPublicKey"),
    agentPeerId: optional(search, "agentPeerId"),
    agentName: optional(search, "agentName"),
    homeNodePeerId: optional(search, "homeNodePeerId"),
  };
}

function parseCsvParam(search: URLSearchParams, key: string): string[] | undefined {
  const raw = search.get(key)?.trim();
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}
