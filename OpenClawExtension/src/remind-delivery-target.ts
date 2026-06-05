export function normalizeEnvoymeshDeliveryTarget(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^envoymesh:/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("envoy:owner:") || trimmed.startsWith("envoy_")) {
    return `envoymesh:${trimmed}`;
  }
  return trimmed;
}

/** Canonical target key for matching cron delivery targets to bridge sends. */
export function canonicalEnvoymeshDeliveryTarget(to: string): string {
  return normalizeEnvoymeshDeliveryTarget(to).replace(/^envoymesh:/i, "").trim();
}
