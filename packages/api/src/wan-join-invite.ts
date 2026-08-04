/** WAN cold-start join invite (v1) — unsigned bootstrap seed bundle. */
export type WanJoinInviteV1 = {
  v: 1;
  createdAt: string;
  expiresAt?: string;
  note?: string;
  targetPeerId?: string;
  targetMultiaddrs?: string[];
  bootstrapPeers: string[];
  bootstrapPresets: string[];
};

export function encodeWanJoinInviteV1(invite: WanJoinInviteV1): string {
  const json = JSON.stringify(invite);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeWanJoinInviteV1(token: string): WanJoinInviteV1 {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("join-invite token is empty");
  }
  let json: string;
  try {
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(trimmed, "base64url").toString("utf8");
    } else {
      const padded = trimmed.replace(/-/g, "+").replace(/_/g, "/");
      json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    }
  } catch {
    throw new Error("join-invite token is not valid base64url");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("join-invite token is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("join-invite payload must be an object");
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.v !== 1) {
    throw new Error(`unsupported join-invite version: ${String(obj.v)}`);
  }
  if (typeof obj.createdAt !== "string" || !obj.createdAt.trim()) {
    throw new Error("join-invite.createdAt must be a non-empty string");
  }

  const bootstrapPeers = readStringArray(obj.bootstrapPeers, "bootstrapPeers", { required: true });
  const bootstrapPresets = readStringArray(obj.bootstrapPresets, "bootstrapPresets", { required: false });
  const targetMultiaddrs = readStringArray(obj.targetMultiaddrs, "targetMultiaddrs", { required: false });
  const targetPeerId =
    typeof obj.targetPeerId === "string" && obj.targetPeerId.trim() ? obj.targetPeerId.trim() : undefined;
  const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : undefined;
  const expiresAt =
    typeof obj.expiresAt === "string" && obj.expiresAt.trim() ? obj.expiresAt.trim() : undefined;

  return {
    v: 1,
    createdAt: obj.createdAt.trim(),
    expiresAt,
    note,
    targetPeerId,
    targetMultiaddrs: targetMultiaddrs.length > 0 ? targetMultiaddrs : undefined,
    bootstrapPeers,
    bootstrapPresets,
  };
}

export function assertWanJoinInviteNotExpired(invite: WanJoinInviteV1, nowMs = Date.now()): void {
  if (!invite.expiresAt) return;
  const expiresMs = Date.parse(invite.expiresAt);
  if (!Number.isFinite(expiresMs)) {
    throw new Error(`join-invite.expiresAt is not a valid ISO timestamp: ${invite.expiresAt}`);
  }
  if (nowMs > expiresMs) {
    throw new Error(`join-invite expired at ${invite.expiresAt}`);
  }
}

/** Extract token from `envoy://join?token=…`, raw query, or bare base64url token. */
export function parseEnvoyJoinUri(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Join invite link is empty");
  }

  if (trimmed.startsWith("envoy://join")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid join invite link");
    }
    if (url.protocol !== "envoy:" || url.hostname !== "join") {
      throw new Error("Expected envoy://join link");
    }
    const token = url.searchParams.get("token")?.trim();
    if (!token) {
      throw new Error("Join invite link is missing token");
    }
    return token;
  }

  if (trimmed.startsWith("join?")) {
    const token = new URLSearchParams(trimmed.slice("join?".length)).get("token")?.trim();
    if (!token) {
      throw new Error("Join invite link is missing token");
    }
    return token;
  }

  if (trimmed.includes("token=")) {
    const token = new URLSearchParams(trimmed.replace(/^\?/, "")).get("token")?.trim();
    if (token) return token;
  }

  return trimmed;
}

export function buildEnvoyJoinUri(token: string): string {
  const params = new URLSearchParams({ token: token.trim() });
  return `envoy://join?${params.toString()}`;
}

export function dedupeBootstrapStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Addresses to persist as discovery seeds when accepting an invite. */
export function wanJoinInviteSeedAddrs(invite: WanJoinInviteV1): string[] {
  return dedupeBootstrapStrings([
    ...invite.bootstrapPeers,
    ...(invite.targetMultiaddrs ?? []),
    ...(invite.targetPeerId ? [invite.targetPeerId] : []),
  ]);
}

/**
 * Quick sanity check for a peer ID string. A corrupted peer ID crashes
 * `@libp2p/bootstrap` on startup and makes the node unrecoverable.
 * This is intentionally lenient — it only catches obviously broken strings
 * (wrong characters, too short). The real validation happens downstream
 * in `peerIdFromString()` inside `isUnusableBootstrapMultiaddr()`.
 */
function isValidPeerIdShape(s: string): boolean {
  const t = s.trim();
  if (t.length < 10) return false;
  // All characters must be valid base58 (no 0, O, I, l)
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(t);
}

/** True for RFC1918 / loopback listen addrs (not usable as WAN bootstrap). */
export function isPrivateOrLoopbackMultiaddr(addr: string): boolean {
  const t = addr.trim();
  if (/\/ip4\/127\./.test(t) || t.includes("/ip6/::1")) return true;
  if (/\/ip4\/10\./.test(t) || /\/ip4\/192\.168\./.test(t)) return true;
  return /\/ip4\/172\.(1[6-9]|2\d|3[01])\./.test(t);
}

/**
 * Multiaddrs safe to treat as libp2p bootstrap / rendezvous relay targets.
 *
 * Join invites also carry sponsor dial hints (`/p2p-circuit/…`, LAN listen
 * addrs, bare peer ids). Those belong in discovery seed stores for
 * `sendHello`, NOT in `bootstrapPeers` used to register rendezvous or to
 * warm relay reservations — otherwise WAN installs burn dials on
 * unreachable LAN and try to "register with" the sponsor circuit.
 */
export function isBootstrapRelayMultiaddr(addr: string): boolean {
  const t = addr.trim();
  if (!t.startsWith("/") || !t.includes("/p2p/")) return false;
  if (t.includes("/p2p-circuit/")) return false;
  if (isPrivateOrLoopbackMultiaddr(t)) return false;
  return true;
}

/**
 * Filter out bootstrap entries that could crash @libp2p/bootstrap.
 * Multiaddrs with corrupted peer IDs or bare invalid peer IDs are dropped.
 */
function filterUnsafeBootstrapEntries(entries: readonly string[]): string[] {
  return entries.filter((entry) => {
    const t = entry.trim();
    if (!t) return false;
    // Bare peer ID (no / prefix)
    if (!t.startsWith("/")) {
      if (!isValidPeerIdShape(t)) {
        console.warn(`[wan-join-invite] dropping invalid bare peerId: ${t}`);
        return false;
      }
      return true;
    }
    // Multiaddr — check ALL /p2p/<peerId> segments, not just the last one.
    // Circuit multiaddrs have two: /p2p/<relayId>/p2p-circuit/p2p/<targetId>.
    // A corrupted relay ID (e.g. containing lowercase-L) would crash
    // multiaddr parsing at dial time if not caught here.
    const segments = t.split("/p2p/");
    for (let i = 1; i < segments.length; i++) {
      const peerIdStr = segments[i]!.split("/")[0]!.trim();
      if (peerIdStr && !isValidPeerIdShape(peerIdStr)) {
        console.warn(`[wan-join-invite] dropping multiaddr with invalid peerId in /p2p/ segment: ${t.slice(0, 80)}`);
        return false;
      }
    }
    return true;
  });
}

export function mergeWanJoinInviteBootstrap(input: {
  bootstrapPeers: readonly string[];
  bootstrapPresets: readonly string[];
  invite: WanJoinInviteV1;
}): { bootstrapPeers: string[]; bootstrapPresets: string[]; seedAddrs: string[] } {
  const seedAddrs = wanJoinInviteSeedAddrs(input.invite);
  const inviteEntries = filterUnsafeBootstrapEntries([
    ...input.invite.bootstrapPeers,
    ...(input.invite.targetMultiaddrs ?? []),
    ...(input.invite.targetPeerId ? [input.invite.targetPeerId] : []),
  ]);
  // Persist only public relay/bootstrap multiaddrs. Circuit + LAN + bare
  // peer ids remain in seedAddrs for outbound dial hints.
  const bootstrapFromInvite = inviteEntries.filter(isBootstrapRelayMultiaddr);
  return {
    bootstrapPeers: dedupeBootstrapStrings([
      ...input.bootstrapPeers,
      ...bootstrapFromInvite,
    ]),
    bootstrapPresets: dedupeBootstrapStrings([
      ...input.bootstrapPresets,
      ...input.invite.bootstrapPresets,
    ]),
    seedAddrs,
  };
}

function readStringArray(
  value: unknown,
  key: string,
  options: { required: boolean },
): string[] {
  if (value === undefined) {
    if (options.required) {
      throw new Error(`join-invite.${key} is required`);
    }
    return [];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`join-invite.${key} must be an array of strings`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}
