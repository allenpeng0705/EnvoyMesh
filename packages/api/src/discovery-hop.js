export const DISCOVERY_MAX_HOPS_CAP = 4;
export function discoveryHopDefaults(payload) {
    const maxHops = Math.min(payload.maxHops ?? 1, DISCOVERY_MAX_HOPS_CAP);
    const currentHop = Math.min(payload.currentHop ?? 0, DISCOVERY_MAX_HOPS_CAP);
    return { maxHops, currentHop };
}
export function canForwardDiscoveryHop(payload) {
    const { maxHops, currentHop } = discoveryHopDefaults(payload);
    return currentHop < maxHops;
}
export function nextDiscoveryHop(payload) {
    const { currentHop } = discoveryHopDefaults(payload);
    return currentHop + 1;
}
export function responseHopDistance(requestPayload) {
    return (requestPayload.currentHop ?? 0) + 1;
}
//# sourceMappingURL=discovery-hop.js.map