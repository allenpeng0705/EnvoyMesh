import { parseEnvoyJoinUri } from "./wan-join-invite.js";

export type EnvoyContactLinkV1 = {
  v: 1;
  peerId?: string;
  joinToken?: string;
  displayName?: string;
  ownerId?: string;
};

export function buildEnvoyContactUri(input: {
  peerId?: string;
  joinToken?: string;
  displayName?: string;
  ownerId?: string;
}): string {
  const params = new URLSearchParams();
  params.set("v", "1");
  if (input.peerId?.trim()) params.set("peerId", input.peerId.trim());
  if (input.joinToken?.trim()) params.set("join", input.joinToken.trim());
  if (input.displayName?.trim()) params.set("name", input.displayName.trim());
  if (input.ownerId?.trim()) params.set("ownerId", input.ownerId.trim());
  return `envoy://contact?${params.toString()}`;
}

export function parseEnvoyContactUri(input: string): EnvoyContactLinkV1 {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Contact link is empty");
  }

  let url: URL;
  if (trimmed.startsWith("envoy://contact")) {
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid contact link");
    }
    if (url.protocol !== "envoy:" || url.hostname !== "contact") {
      throw new Error("Expected envoy://contact link");
    }
  } else if (trimmed.startsWith("contact?")) {
    url = new URL(`envoy://${trimmed}`);
  } else {
    throw new Error("Expected envoy://contact link");
  }

  const version = url.searchParams.get("v")?.trim();
  if (version && version !== "1") {
    throw new Error(`unsupported contact link version: ${version}`);
  }

  const peerId = url.searchParams.get("peerId")?.trim() || undefined;
  const joinRaw = url.searchParams.get("join")?.trim() || undefined;
  let joinToken: string | undefined;
  if (joinRaw) {
    if (joinRaw.startsWith("envoy://join")) {
      joinToken = parseEnvoyJoinUri(joinRaw);
    } else {
      joinToken = joinRaw;
    }
  }
  const displayName = url.searchParams.get("name")?.trim() || undefined;
  const ownerId = url.searchParams.get("ownerId")?.trim() || undefined;

  if (!peerId && !joinToken) {
    throw new Error("Contact link must include peerId or join");
  }

  return {
    v: 1,
    peerId,
    joinToken,
    displayName,
    ownerId,
  };
}
