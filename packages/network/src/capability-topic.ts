import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

/** Prefix for capability strings before hashing into a provider CID (interop contract). */
export const CAPABILITY_TOPIC_NAMESPACE = "envoymesh:cap:v1:" as const;

/** Multicodec `raw` — topic identity is the SHA-256 digest of the namespaced UTF-8 string. */
const RAW_CODEC = 0x55;

/**
 * Deterministic CID used as the DHT provider key for a capability advertisement topic.
 * Callers must trim/normalize topic strings consistently across the network.
 */
export async function cidForCapabilityTopic(topic: string): Promise<CID> {
  const normalized = topic.trim();
  if (!normalized) {
    throw new Error("capability topic must be a non-empty string");
  }
  const bytes = new TextEncoder().encode(`${CAPABILITY_TOPIC_NAMESPACE}${normalized}`);
  const digest = await sha256.digest(bytes);
  return CID.createV1(RAW_CODEC, digest);
}
