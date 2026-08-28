#!/usr/bin/env node
/**
 * Sign an EnvoyMesh relay-roster document (Phase 46E).
 *
 * Env:
 *   ENVOYMESH_RELAY_ROSTER_SIGNING_KEY_PEM — Ed25519 private key PEM
 *
 * Args:
 *   [path] — JSON file (default: stdin)
 */
import { readFileSync } from "node:fs";
import { signCanonicalPayload } from "@envoymesh/identity";
import {
  parseUnsignedRelayRosterDocument,
  relayRosterForSigning,
} from "@envoymesh/api";

const keyPem = process.env.ENVOYMESH_RELAY_ROSTER_SIGNING_KEY_PEM?.trim();
if (!keyPem) {
  console.error("error: set ENVOYMESH_RELAY_ROSTER_SIGNING_KEY_PEM to an Ed25519 private key PEM");
  process.exit(1);
}

const path = process.argv[2];
const raw = path ? readFileSync(path, "utf8") : readFileSync(0, "utf8");
const parsed = JSON.parse(raw);
const { signature: _drop, ...rest } = parsed;
const unsigned = parseUnsignedRelayRosterDocument(rest);
const signature = signCanonicalPayload(unsigned, keyPem);
const signed = { ...unsigned, signature };
// Re-strip via helper to guarantee canonical field set
const check = relayRosterForSigning(signed);
void check;
process.stdout.write(`${JSON.stringify(signed, null, 2)}\n`);
