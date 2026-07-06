import { parseEnvoyJoinUri } from "@envoymesh/api";
import { parseEnvoyContactUri } from "@envoymesh/api";

export type ParsedContactCode =
  | { kind: "pair"; pairUri: string; inviteUri: string }
  | { kind: "contact"; contactUri: string; peerId?: string; wanJoinToken?: string; displayName?: string }
  | { kind: "invite"; inviteUri: string; token: string; wsUrl?: string; ownerId?: string }
  | { kind: "wan-join"; inviteUri: string; wanJoinToken: string }
  | { kind: "join-invalid"; inviteUri: string }
  | { kind: "invite-invalid"; inviteUri: string }
  | { kind: "peer-id"; peerId: string }
  | { kind: "invalid"; message: string };

/**
 * Parse an `envoy://invite?token=…` company/kiosk invite URI.
 *
 * These are minted by the issuer's Company Invites / Pairing Kiosk and redeemed
 * by a joiner pasting them into the Discover paste box. The `token` is the
 * bearer secret; `wsUrl`/`ownerId`/`ownerPublicKey` carry the issuer's
 * connection info so the joiner's node can reach the issuer and bond.
 *
 * Strict on the `envoy://invite` / `invite?` prefix to reject clipboard-
 * injection confusion (mirrors `parseEnvoyJoinUri`).
 */
function parseEnvoyInvite(input: string): {
  token: string;
  wsUrl?: string;
  ownerId?: string;
  ownerPublicKey?: string;
  agentPeerId?: string;
  agentName?: string;
} {
  const trimmed = input.trim();
  let search: URLSearchParams;
  if (trimmed.startsWith("envoy://invite")) {
    const url = new URL(trimmed);
    if (url.protocol !== "envoy:" || url.hostname !== "invite") {
      throw new Error("Expected envoy://invite link");
    }
    search = url.searchParams;
  } else if (trimmed.startsWith("invite?")) {
    search = new URLSearchParams(trimmed.slice("invite?".length));
  } else {
    throw new Error("Expected envoy://invite link");
  }
  const token = search.get("token")?.trim();
  if (!token) throw new Error("Invite link is missing token");
  return {
    token,
    wsUrl: search.get("wsUrl")?.trim() || undefined,
    ownerId: search.get("ownerId")?.trim() || undefined,
    ownerPublicKey: search.get("ownerPublicKey")?.trim() || undefined,
    agentPeerId: search.get("agentPeerId")?.trim() || undefined,
    agentName: search.get("agentName")?.trim() || undefined,
  };
}

/** True for typical libp2p peer IDs (base58btc, often starting with Qm or 12D3). */
export function looksLikePeerId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 32 || trimmed.length > 128) return false;
  if (!/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(trimmed)) {
    return false;
  }
  return trimmed.startsWith("Qm") || trimmed.startsWith("12D3");
}

/** Extract peer ID or invite URI from pasted contact codes (multiaddr, envoy://, raw peer id). */
export function parseContactCode(input: string): ParsedContactCode {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      kind: "invalid",
      message: "Paste a link or code from your friend, or use People nearby on the same Wi‑Fi.",
    };
  }

  if (trimmed.startsWith("envoy://pair")) {
    return { kind: "pair", inviteUri: trimmed, pairUri: trimmed };
  }

  if (trimmed.startsWith("envoy://contact") || trimmed.startsWith("contact?")) {
    try {
      const contact = parseEnvoyContactUri(trimmed);
      return {
        kind: "contact",
        contactUri: trimmed.startsWith("envoy://") ? trimmed : `envoy://${trimmed}`,
        peerId: contact.peerId,
        wanJoinToken: contact.joinToken,
        displayName: contact.displayName,
      };
    } catch (error) {
      return {
        kind: "invalid",
        message: error instanceof Error ? error.message : "That contact link looks invalid.",
      };
    }
  }

  // Company / kiosk invite: envoy://invite?token=… (Phase 35A / 35D joiner side).
  if (trimmed.startsWith("envoy://invite") || trimmed.startsWith("invite?")) {
    try {
      const invite = parseEnvoyInvite(trimmed);
      return {
        kind: "invite",
        inviteUri: trimmed.startsWith("envoy://") ? trimmed : `envoy://${trimmed}`,
        token: invite.token,
        wsUrl: invite.wsUrl,
        ownerId: invite.ownerId,
      };
    } catch {
      return { kind: "invite-invalid", inviteUri: trimmed };
    }
  }

  if (trimmed.startsWith("envoy://join")) {
    try {
      const token = parseEnvoyJoinUri(trimmed);
      return { kind: "wan-join", inviteUri: trimmed, wanJoinToken: token };
    } catch {
      return { kind: "join-invalid", inviteUri: trimmed };
    }
  }

  if (trimmed.startsWith("join?") || trimmed.includes("token=")) {
    try {
      const token = parseEnvoyJoinUri(trimmed);
      return { kind: "wan-join", inviteUri: trimmed, wanJoinToken: token };
    } catch {
      return { kind: "join-invalid", inviteUri: trimmed };
    }
  }

  const p2pMatch = trimmed.match(/\/p2p\/([^/\s?#]+)/);
  if (p2pMatch?.[1]) {
    return { kind: "peer-id", peerId: p2pMatch[1] };
  }

  if (looksLikePeerId(trimmed)) {
    return { kind: "peer-id", peerId: trimmed };
  }

  if (trimmed.startsWith("/ip")) {
    return {
      kind: "invalid",
      message: "That network address looks incomplete. Ask your friend to send their full contact link from Share contact card.",
    };
  }

  if (trimmed.includes("://") || trimmed.includes("@")) {
    return {
      kind: "invalid",
      message: "That link is not a contact or invite we recognize. Try Share contact card from your friend, or use People nearby.",
    };
  }

  return {
    kind: "invalid",
    message:
      "That does not look like a contact code. Paste a link from Share contact card, or switch to People nearby if you are on the same Wi‑Fi.",
  };
}
