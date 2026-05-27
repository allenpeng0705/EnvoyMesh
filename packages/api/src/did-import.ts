/**
 * Resolve external did:key / DID documents for bonded lookup and hello flows (Phase 15E).
 */

import { deriveOwnerId } from "@envoymesh/identity";
import {
  buildOwnerDidPresentation,
  deriveDidKeyFromEd25519PublicKey,
  didKeysMatch,
  ed25519RawPublicKeyFromSpkiPem,
  parseDidLookupInput,
  type DidKeyDocument,
} from "./owner-did-presentation.js";

const ED25519_SPKI_PREFIX = Uint8Array.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(input: string): Uint8Array {
  const trimmed = input.trim();
  if (!trimmed) return new Uint8Array(0);

  let leadingZeros = 0;
  for (const char of trimmed) {
    if (char !== "1") break;
    leadingZeros += 1;
  }

  const digits: number[] = [0];
  for (const char of trimmed) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error("invalid base58 character");
    }
    let carry = value;
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j]! * 58;
      digits[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const decoded = new Uint8Array(leadingZeros + digits.length);
  for (let i = 0; i < digits.length; i += 1) {
    decoded[decoded.length - 1 - i] = digits[i]!;
  }
  return decoded;
}

/** Decode multibase `z…` Ed25519 did:key payload (0xed 0x01 + 32 bytes). */
export function ed25519RawPublicKeyFromDidKeyMultibase(multibase: string): Uint8Array {
  const body = multibase.startsWith("z") ? multibase.slice(1) : multibase;
  const bytes = base58Decode(body);
  if (bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01) {
    throw new Error("expected did:key Ed25519 multibase payload");
  }
  return bytes.subarray(2);
}

export function ed25519SpkiPemFromRawPublicKey(rawPublicKey: Uint8Array): string {
  if (rawPublicKey.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes");
  }
  const der = new Uint8Array(ED25519_SPKI_PREFIX.length + rawPublicKey.length);
  der.set(ED25519_SPKI_PREFIX);
  der.set(rawPublicKey, ED25519_SPKI_PREFIX.length);
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(der).toString("base64")
      : btoa(String.fromCharCode(...der));
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

export interface ResolvedDidImport {
  did: string;
  ownerId: string;
  publicKeyPem: string;
  document?: DidKeyDocument;
  source: "did-key" | "did-document";
}

export type ResolveDidImportResult =
  | { ok: true; resolved: ResolvedDidImport }
  | { ok: false; reason: string };

function resolveFromPublicKeyPem(publicKeyPem: string, didHint?: string, document?: DidKeyDocument): ResolveDidImportResult {
  try {
    const ownerId = deriveOwnerId(publicKeyPem);
    const presentation = buildOwnerDidPresentation({ ownerId, publicKeyPem });
    if (didHint && !didKeysMatch(didHint, presentation.did)) {
      return { ok: false, reason: "public key does not match did:key" };
    }
    return {
      ok: true,
      resolved: {
        did: presentation.did,
        ownerId,
        publicKeyPem,
        document: document ?? presentation.document,
        source: document ? "did-document" : "did-key",
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "failed to resolve DID",
    };
  }
}

export function parseExternalDidDocumentJson(raw: string): ResolveDidImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "DID document must be a JSON object" };
  }
  const doc = parsed as DidKeyDocument & { alsoKnownAs?: string[] };
  const docId = typeof doc.id === "string" ? doc.id.trim() : "";
  const parsedDid = docId.startsWith("did:key:") ? parseDidLookupInput(docId) : { kind: "invalid" as const };
  const envoyAlias = (doc.alsoKnownAs ?? []).find((entry) => typeof entry === "string" && entry.startsWith("envoy:owner:"));

  const vm = Array.isArray(doc.verificationMethod) ? doc.verificationMethod[0] : undefined;
  const multibase =
    typeof vm?.publicKeyMultibase === "string"
      ? vm.publicKeyMultibase
      : parsedDid.kind === "did-key"
        ? parsedDid.publicKeyMultibase
        : undefined;

  if (!multibase) {
    return { ok: false, reason: "DID document missing Ed25519 publicKeyMultibase" };
  }

  try {
    const rawKey = ed25519RawPublicKeyFromDidKeyMultibase(multibase);
    const publicKeyPem = ed25519SpkiPemFromRawPublicKey(rawKey);
    const didHint = parsedDid.kind === "did-key" ? parsedDid.did : docId.startsWith("did:key:") ? docId : undefined;
    const result = resolveFromPublicKeyPem(publicKeyPem, didHint, doc);
    if (!result.ok) return result;
    if (envoyAlias && result.resolved.ownerId !== envoyAlias) {
      return { ok: false, reason: "alsoKnownAs envoy:owner id does not match derived owner id" };
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "failed to parse DID document key",
    };
  }
}

/** Resolve `did:key:…`, `envoy:owner:…`, or a JSON DID document string. */
export function resolveDidImportInput(raw: string): ResolveDidImportResult {
  const input = raw.trim();
  if (!input) {
    return { ok: false, reason: "empty input" };
  }

  if (input.startsWith("{")) {
    return parseExternalDidDocumentJson(input);
  }

  const parsed = parseDidLookupInput(input);
  if (parsed.kind === "envoy-owner" && parsed.ownerId) {
    return { ok: false, reason: "envoy:owner id requires public key PEM or DID document" };
  }

  if (parsed.kind === "did-key" && parsed.publicKeyMultibase) {
    try {
      const rawKey = ed25519RawPublicKeyFromDidKeyMultibase(parsed.publicKeyMultibase);
      const derivedDid = deriveDidKeyFromEd25519PublicKey(rawKey);
      if (parsed.did && !didKeysMatch(parsed.did, derivedDid)) {
        return { ok: false, reason: "did:key multibase does not match did string" };
      }
      const publicKeyPem = ed25519SpkiPemFromRawPublicKey(rawKey);
      return resolveFromPublicKeyPem(publicKeyPem, parsed.did);
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "invalid did:key",
      };
    }
  }

  return { ok: false, reason: "unsupported input — paste did:key:z… or JSON DID document" };
}

/** Verify an existing owner public key PEM matches a did:key string. */
export function verifyDidKeyMatchesPublicKeyPem(did: string, publicKeyPem: string): boolean {
  const parsed = parseDidLookupInput(did);
  if (parsed.kind !== "did-key" || !parsed.did) return false;
  try {
    const raw = ed25519RawPublicKeyFromSpkiPem(publicKeyPem);
    const derived = deriveDidKeyFromEd25519PublicKey(raw);
    return didKeysMatch(parsed.did, derived);
  } catch {
    return false;
  }
}
