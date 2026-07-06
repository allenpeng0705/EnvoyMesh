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
 *
 * Create ENVOYMESH_SPONSOR_CONTACT_URI in Social → Share contact card with
 * Link expires = "1 year (installer / distributor)" (8760 hours).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envStr(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

async function main(): Promise<void> {
  const enabled = envFlag("ENVOYMESH_SPONSOR_FRIEND_ENABLED");
  const out =
    resolve(process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_OUT?.trim() || "bundled-sponsor-friend.json");

  const payload: Record<string, unknown> = {
    enabled,
  };
  if (envStr("ENVOYMESH_SPONSOR_CONTACT_URI")) {
    payload.contactUri = envStr("ENVOYMESH_SPONSOR_CONTACT_URI");
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
