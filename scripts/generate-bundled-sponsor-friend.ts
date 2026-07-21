#!/usr/bin/env tsx
/**
 * Write bundled-sponsor-friend.json for distributor installer builds.
 *
 * Env (all optional except when enabling):
 *   ENVOYMESH_SPONSOR_FRIEND_ENABLED=true
 *   ENVOYMESH_SPONSOR_CONTACT_URI=envoy://contact?...
 *   ENVOYMESH_SPONSOR_OWNER_ID=envoy:owner:...
 *   ENVOYMESH_SPONSOR_PEER_ID=12D3...
 *   ENVOYMESH_SPONSOR_JOIN_TOKEN=...
 *   ENVOYMESH_SPONSOR_DISPLAY_NAME=You
 *   ENVOYMESH_SPONSOR_HELLO_MESSAGE=Hello!
 *   ENVOYMESH_SPONSOR_PROOF_OF_CONTEXT=shared-secret
 *   ENVOYMESH_SPONSOR_MAX_ATTEMPTS=12
 *   ENVOYMESH_SPONSOR_RETRY_DELAY_MS=5000
 *   ENVOYMESH_BUNDLED_SPONSOR_FRIEND_OUT=path/to/bundled-sponsor-friend.json
 *   ENVOYMESH_SPONSOR_ALLOW_NO_CIRCUIT=true  — skip circuit multiaddr check
 *
 * Create ENVOYMESH_SPONSOR_CONTACT_URI in Social → Share contact card with
 * Link expires = "1 year (installer / distributor)" (8760 hours).
 * Mint only while the sponsor shows relay=RESERVED (circuit path required
 * for WAN auto-bond).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  decodeWanJoinInviteV1,
  parseEnvoyContactUri,
  parseEnvoyJoinUri,
} from "@envoymesh/api";

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envStr(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function assertSponsorInviteQuality(contactUri: string): void {
  const link = parseEnvoyContactUri(contactUri);
  if (!link.joinToken) {
    throw new Error(
      "bundled sponsor contactUri has no join token — regenerate with Social → Share contact (1 year installer link)",
    );
  }
  const invite = decodeWanJoinInviteV1(parseEnvoyJoinUri(link.joinToken));
  const addrs = [
    ...(invite.targetMultiaddrs ?? []),
    ...(invite.bootstrapPeers ?? []),
  ];
  const hasCircuit = addrs.some((a) => a.includes("/p2p-circuit/"));
  const hasPrivateLan = addrs.some(
    (a) =>
      a.includes("/ip4/192.168.") ||
      a.includes("/ip4/10.") ||
      /\/ip4\/172\.(1[6-9]|2\d|3[01])\./.test(a),
  );
  if (!hasCircuit && !envFlag("ENVOYMESH_SPONSOR_ALLOW_NO_CIRCUIT")) {
    throw new Error(
      "bundled sponsor invite has no /p2p-circuit/ multiaddr — mint while relay=RESERVED " +
        "(or set ENVOYMESH_SPONSOR_ALLOW_NO_CIRCUIT=true for LAN-only fleet builds)",
    );
  }
  if (hasPrivateLan && hasCircuit) {
    console.warn(
      "[generate-bundled-sponsor-friend] invite still lists RFC1918 bootstrap/target addrs; " +
        "WAN dial hygiene will prefer circuit first, but regenerate with a fresh wan-public invite if possible",
    );
  }
  if (invite.expiresAt) {
    const exp = Date.parse(invite.expiresAt);
    if (Number.isFinite(exp) && exp < Date.now()) {
      throw new Error(
        `bundled sponsor invite expired at ${invite.expiresAt} — regenerate before packaging`,
      );
    }
  }
}

async function main(): Promise<void> {
  const enabled = envFlag("ENVOYMESH_SPONSOR_FRIEND_ENABLED");
  const out =
    resolve(process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_OUT?.trim() || "bundled-sponsor-friend.json");

  const payload: Record<string, unknown> = {
    enabled,
  };
  const contactUri = envStr("ENVOYMESH_SPONSOR_CONTACT_URI");
  if (contactUri) {
    payload.contactUri = contactUri;
    if (enabled) {
      assertSponsorInviteQuality(contactUri);
    }
  }
  if (envStr("ENVOYMESH_SPONSOR_OWNER_ID")) payload.ownerId = envStr("ENVOYMESH_SPONSOR_OWNER_ID");
  if (envStr("ENVOYMESH_SPONSOR_PEER_ID")) payload.peerId = envStr("ENVOYMESH_SPONSOR_PEER_ID");
  if (envStr("ENVOYMESH_SPONSOR_JOIN_TOKEN")) payload.joinToken = envStr("ENVOYMESH_SPONSOR_JOIN_TOKEN");
  if (envStr("ENVOYMESH_SPONSOR_DISPLAY_NAME")) {
    payload.displayName = envStr("ENVOYMESH_SPONSOR_DISPLAY_NAME");
  }
  if (envStr("ENVOYMESH_SPONSOR_HELLO_MESSAGE")) {
    payload.helloMessage = envStr("ENVOYMESH_SPONSOR_HELLO_MESSAGE");
  }
  if (envStr("ENVOYMESH_SPONSOR_PROOF_OF_CONTEXT")) {
    payload.proofOfContext = envStr("ENVOYMESH_SPONSOR_PROOF_OF_CONTEXT");
  }
  if (envStr("ENVOYMESH_SPONSOR_MAX_ATTEMPTS")) {
    payload.maxAttempts = Number.parseInt(envStr("ENVOYMESH_SPONSOR_MAX_ATTEMPTS")!, 10);
  }
  if (envStr("ENVOYMESH_SPONSOR_RETRY_DELAY_MS")) {
    payload.retryDelayMs = Number.parseInt(envStr("ENVOYMESH_SPONSOR_RETRY_DELAY_MS")!, 10);
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${out}`);
}

void main();
