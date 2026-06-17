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

export function getPairingUriForInvite(invite: CompanyInviteRecord): string {
  const params = new URLSearchParams();
  params.set("token", invite.token);
  params.set("wsUrl", invite.wsUrl);
  appendOptional(params, "lanWsUrl", invite.lanWsUrl);
  appendOptional(params, "relayWsUrl", invite.relayWsUrl);
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
    ownerId: optional(search, "ownerId"),
    ownerPublicKey: optional(search, "ownerPublicKey"),
    agentPeerId: optional(search, "agentPeerId"),
    agentName: optional(search, "agentName"),
    homeNodePeerId: optional(search, "homeNodePeerId"),
  };
}
