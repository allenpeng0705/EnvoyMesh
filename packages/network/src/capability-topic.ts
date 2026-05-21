import { sign as Ed25519Sign, verify as Ed25519Verify } from "node:crypto";
import { canonicalJson } from "@envoymesh/protocol";
import type { SignedCapabilityTopicRecord, UnsignedCapabilityTopicRecord } from "@envoymesh/protocol";

export { CAPABILITY_TOPIC_NAMESPACE, cidForCapabilityTopic } from "./capability-topic-cid.js";

/**
 * Create a signed capability topic record by signing the unsigned fields with an Ed25519 key.
 * The `multiaddr` passed here should be the clean transport address WITHOUT query params
 * (e.g. `/ip4/1.2.3.4/tcp/4000/p2p/12D3KooW...`). Query params are added by
 * `encodeCapabilityTopicRecordToMultiaddr`.
 */
export function createSignedCapabilityTopicRecord(input: {
  topic: string;
  peerId: string;
  multiaddr: string;
  ttlSeconds: number;
  org?: string;
  net?: string;
  ver?: string;
  privateKey: string; // PEM-encoded Ed25519 private key
}): SignedCapabilityTopicRecord {
  const { privateKey, ...unsigned } = input;
  const createdAt = new Date().toISOString();
  const payload: UnsignedCapabilityTopicRecord = { ...unsigned, createdAt };
  const payloadBytes = Buffer.from(canonicalJson(payload), "utf8");
  const signature = Ed25519Sign(null, payloadBytes, privateKey).toString("base64url");
  return { ...payload, signature };
}

/**
 * Verify a signed capability topic record:
 * - Signature must be valid against the publisher's public key
 * - Record must not be stale (now - createdAt <= ttlSeconds)
 * - topic, peerId, multiaddr must be non-empty
 */
export function verifySignedCapabilityTopicRecord(
  record: SignedCapabilityTopicRecord,
  publicKey: string, // PEM-encoded Ed25519 public key
): { ok: true } | { ok: false; reason: string } {
  // Non-empty field checks
  if (!record.topic || !record.peerId || !record.multiaddr) {
    return { ok: false, reason: "topic, peerId, and multiaddr are required" };
  }

  // Staleness check
  const createdAt = new Date(record.createdAt).getTime();
  const now = Date.now();
  const ageMs = now - createdAt;
  if (ageMs > record.ttlSeconds * 1000) {
    return { ok: false, reason: `record is stale (age ${ageMs}ms > ttl ${record.ttlSeconds * 1000}ms)` };
  }

  // Signature verification
  const { signature: _sig, ...unsigned } = record;
  const payloadBytes = Buffer.from(canonicalJson(unsigned), "utf8");
  const signatureBuffer = Buffer.from(record.signature, "base64url");
  const valid = Ed25519Verify(null, payloadBytes, publicKey, signatureBuffer);
  if (!valid) {
    return { ok: false, reason: "invalid signature" };
  }

  return { ok: true };
}

// ============================================
// Multiaddr Query Param Encoding / Decoding
// ============================================

/**
 * Encode a signed capability topic record into a multiaddr with query params.
 * The `record.multiaddr` should be the clean transport address WITHOUT query params.
 *
 * Returns the full multiaddr string, e.g.:
 *   /ip4/1.2.3.4/tcp/4000/p2p/12D3KooW...?topic=...&sig=...&ts=...&ttl=600&org=acme
 */
export function encodeCapabilityTopicRecordToMultiaddr(record: SignedCapabilityTopicRecord): string {
  const [base, _existingQuery] = record.multiaddr.split("?");
  const params = new URLSearchParams();
  params.set("topic", record.topic);
  params.set("sig", record.signature);
  params.set("ts", record.createdAt);
  params.set("ttl", String(record.ttlSeconds));
  if (record.org) params.set("org", record.org);
  if (record.net) params.set("net", record.net);
  if (record.ver) params.set("ver", record.ver);
  return `${base}?${params.toString()}`;
}

/**
 * Decode a capability-topic encoded multiaddr back into an unsigned record + signature.
 * Returns null if the multiaddr does not have capability-topic query params.
 *
 * The peerId is NOT encoded in the multiaddr — it comes from the DHT provider record
 * ({ id: PeerId, multiaddrs[] }) separately. Pass it to `decodeCapabilityTopicRecordFromMultiaddr`
 * along with the decoded fields.
 *
 * Note: the decoded record is NOT verified — use `verifySignedCapabilityTopicRecord`
 * to validate signature and freshness after constructing the full record.
 */
export function decodeCapabilityTopicRecordFromMultiaddr(
  multiaddr: string,
): {
  topic: string;
  signature: string;
  createdAt: string;
  ttlSeconds: number;
  org?: string;
  net?: string;
  ver?: string;
  /** The clean multiaddr without query params */
  cleanMultiaddr: string;
} | null {
  const [base, queryString] = multiaddr.split("?");
  if (!queryString) return null;

  const params = new URLSearchParams(queryString);
  const topic = params.get("topic");
  const sig = params.get("sig");
  const ts = params.get("ts");
  const ttl = params.get("ttl");
  const org = params.get("org") ?? undefined;
  const net = params.get("net") ?? undefined;
  const ver = params.get("ver") ?? undefined;

  if (!topic || !sig || !ts || !ttl) return null;

  const ttlNum = Number(ttl);
  if (!Number.isFinite(ttlNum) || ttlNum < 1) return null;

  return {
    topic,
    signature: sig,
    createdAt: ts,
    ttlSeconds: ttlNum,
    org,
    net,
    ver,
    cleanMultiaddr: base,
  };
}

