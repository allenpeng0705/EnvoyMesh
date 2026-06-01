/** Human profile capability entry (matches HumanProfilePayload.capabilities union). */
export type ProfileCapabilityEntry =
  | { tag: string }
  | { type: string; params?: Record<string, unknown>; confidence?: number }
  | { descriptor: string };

/** Extract searchable capability tag strings from a signed human profile. */
export function profileCapabilityTags(
  capabilities?: ProfileCapabilityEntry[] | null,
): string[] {
  if (!capabilities?.length) return [];
  const tags: string[] = [];
  for (const cap of capabilities) {
    if ("tag" in cap && cap.tag?.trim()) {
      tags.push(cap.tag.trim().toLowerCase());
    } else if ("descriptor" in cap && cap.descriptor?.trim()) {
      tags.push(cap.descriptor.trim().toLowerCase());
    }
  }
  return [...new Set(tags)];
}

/**
 * DHT capability-topic strings for profile tags.
 * Advertises both the raw tag (interest-style search) and `capability:{tag}` (device-capability convention).
 */
export function profileCapabilityDiscoveryTopics(tags: readonly string[]): string[] {
  const topics = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    topics.add(tag);
    topics.add(`capability:${tag}`);
  }
  return [...topics];
}

function normalizeProfileCapabilityTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Sync Profile About capability tags into a capability manifest.
 * Adds tags present on the profile and removes tags dropped since the previous profile save.
 */
export function syncProfileTagsToManifestCapabilities(input: {
  manifestCapabilities: readonly string[];
  previousProfileTags: readonly string[];
  nextProfileTags: readonly string[];
}): { capabilities: string[]; changed: boolean } {
  const previous = new Set(
    input.previousProfileTags.map(normalizeProfileCapabilityTag).filter(Boolean),
  );
  const next = [
    ...new Set(input.nextProfileTags.map(normalizeProfileCapabilityTag).filter(Boolean)),
  ];
  const nextSet = new Set(next);
  const toRemove = [...previous].filter((tag) => !nextSet.has(tag));

  const manifestNorm = new Set(
    input.manifestCapabilities.map(normalizeProfileCapabilityTag).filter(Boolean),
  );
  let changed = false;
  let capabilities = [...input.manifestCapabilities];

  if (toRemove.length > 0) {
    const removeSet = new Set(toRemove);
    const filtered = capabilities.filter(
      (cap) => !removeSet.has(normalizeProfileCapabilityTag(cap)),
    );
    if (filtered.length !== capabilities.length) {
      capabilities = filtered;
      changed = true;
      for (const tag of toRemove) {
        manifestNorm.delete(tag);
      }
    }
  }

  for (const tag of next) {
    if (!manifestNorm.has(tag)) {
      capabilities.push(tag);
      manifestNorm.add(tag);
      changed = true;
    }
  }

  return { capabilities, changed };
}
