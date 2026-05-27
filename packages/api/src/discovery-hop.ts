import type { DiscoveryRequestPayload } from "@envoymesh/protocol";

export const DISCOVERY_MAX_HOPS_CAP = 4;

export function discoveryHopDefaults(payload: Pick<DiscoveryRequestPayload, "maxHops" | "currentHop">): {
  maxHops: number;
  currentHop: number;
} {
  const maxHops = Math.min(payload.maxHops ?? 1, DISCOVERY_MAX_HOPS_CAP);
  const currentHop = Math.min(payload.currentHop ?? 0, DISCOVERY_MAX_HOPS_CAP);
  return { maxHops, currentHop };
}

export function canForwardDiscoveryHop(payload: Pick<DiscoveryRequestPayload, "maxHops" | "currentHop">): boolean {
  const { maxHops, currentHop } = discoveryHopDefaults(payload);
  return currentHop < maxHops;
}

export function nextDiscoveryHop(payload: DiscoveryRequestPayload): number {
  const { currentHop } = discoveryHopDefaults(payload);
  return currentHop + 1;
}

export function responseHopDistance(requestPayload: Pick<DiscoveryRequestPayload, "currentHop">): number {
  return (requestPayload.currentHop ?? 0) + 1;
}
