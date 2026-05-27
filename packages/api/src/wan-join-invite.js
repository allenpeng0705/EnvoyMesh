export function encodeWanJoinInviteV1(invite) {
    const json = JSON.stringify(invite);
    if (typeof Buffer !== "undefined") {
        return Buffer.from(json, "utf8").toString("base64url");
    }
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeWanJoinInviteV1(token) {
    const trimmed = token.trim();
    if (!trimmed) {
        throw new Error("join-invite token is empty");
    }
    let json;
    try {
        if (typeof Buffer !== "undefined") {
            json = Buffer.from(trimmed, "base64url").toString("utf8");
        }
        else {
            const padded = trimmed.replace(/-/g, "+").replace(/_/g, "/");
            json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
        }
    }
    catch {
        throw new Error("join-invite token is not valid base64url");
    }
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        throw new Error("join-invite token is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("join-invite payload must be an object");
    }
    const obj = parsed;
    if (obj.v !== 1) {
        throw new Error(`unsupported join-invite version: ${String(obj.v)}`);
    }
    if (typeof obj.createdAt !== "string" || !obj.createdAt.trim()) {
        throw new Error("join-invite.createdAt must be a non-empty string");
    }
    const bootstrapPeers = readStringArray(obj.bootstrapPeers, "bootstrapPeers", { required: true });
    const bootstrapPresets = readStringArray(obj.bootstrapPresets, "bootstrapPresets", { required: false });
    const targetMultiaddrs = readStringArray(obj.targetMultiaddrs, "targetMultiaddrs", { required: false });
    const targetPeerId = typeof obj.targetPeerId === "string" && obj.targetPeerId.trim() ? obj.targetPeerId.trim() : undefined;
    const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : undefined;
    const expiresAt = typeof obj.expiresAt === "string" && obj.expiresAt.trim() ? obj.expiresAt.trim() : undefined;
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
export function assertWanJoinInviteNotExpired(invite, nowMs = Date.now()) {
    if (!invite.expiresAt)
        return;
    const expiresMs = Date.parse(invite.expiresAt);
    if (!Number.isFinite(expiresMs)) {
        throw new Error(`join-invite.expiresAt is not a valid ISO timestamp: ${invite.expiresAt}`);
    }
    if (nowMs > expiresMs) {
        throw new Error(`join-invite expired at ${invite.expiresAt}`);
    }
}
/** Extract token from `envoy://join?token=…`, raw query, or bare base64url token. */
export function parseEnvoyJoinUri(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error("Join invite link is empty");
    }
    if (trimmed.startsWith("envoy://join")) {
        let url;
        try {
            url = new URL(trimmed);
        }
        catch {
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
        if (token)
            return token;
    }
    return trimmed;
}
export function buildEnvoyJoinUri(token) {
    const params = new URLSearchParams({ token: token.trim() });
    return `envoy://join?${params.toString()}`;
}
export function dedupeBootstrapStrings(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}
/** Addresses to persist as discovery seeds when accepting an invite. */
export function wanJoinInviteSeedAddrs(invite) {
    return dedupeBootstrapStrings([
        ...invite.bootstrapPeers,
        ...(invite.targetMultiaddrs ?? []),
        ...(invite.targetPeerId ? [invite.targetPeerId] : []),
    ]);
}
export function mergeWanJoinInviteBootstrap(input) {
    const seedAddrs = wanJoinInviteSeedAddrs(input.invite);
    return {
        bootstrapPeers: dedupeBootstrapStrings([
            ...input.bootstrapPeers,
            ...input.invite.bootstrapPeers,
            ...(input.invite.targetMultiaddrs ?? []),
            ...(input.invite.targetPeerId ? [input.invite.targetPeerId] : []),
        ]),
        bootstrapPresets: dedupeBootstrapStrings([
            ...input.bootstrapPresets,
            ...input.invite.bootstrapPresets,
        ]),
        seedAddrs,
    };
}
function readStringArray(value, key, options) {
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
//# sourceMappingURL=wan-join-invite.js.map