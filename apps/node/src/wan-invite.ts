import type { NodeArgs } from "./args.js";

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
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeWanJoinInviteV1(token: string): WanJoinInviteV1 {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("join-invite token is empty");
  }
  let json: string;
  try {
    json = Buffer.from(trimmed, "base64url").toString("utf8");
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

export function applyJoinInviteToNodeArgs(args: NodeArgs, token: string): void {
  const invite = decodeWanJoinInviteV1(token);
  if (invite.expiresAt) {
    const expiresMs = Date.parse(invite.expiresAt);
    if (!Number.isFinite(expiresMs)) {
      throw new Error(`join-invite.expiresAt is not a valid ISO timestamp: ${invite.expiresAt}`);
    }
    if (Date.now() > expiresMs) {
      throw new Error(`join-invite expired at ${invite.expiresAt}`);
    }
  }

  args.bootstrapPeers.push(...invite.bootstrapPeers);
  args.bootstrapPresets.push(...invite.bootstrapPresets);

  if (invite.targetPeerId) {
    args.bootstrapPeers.push(invite.targetPeerId);
  }
  if (invite.targetMultiaddrs) {
    args.bootstrapPeers.push(...invite.targetMultiaddrs);
  }
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
