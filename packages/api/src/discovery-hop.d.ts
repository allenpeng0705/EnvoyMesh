import type { DiscoveryRequestPayload } from "@envoymesh/protocol";
export declare const DISCOVERY_MAX_HOPS_CAP = 4;
export declare function discoveryHopDefaults(payload: Pick<DiscoveryRequestPayload, "maxHops" | "currentHop">): {
    maxHops: number;
    currentHop: number;
};
export declare function canForwardDiscoveryHop(payload: Pick<DiscoveryRequestPayload, "maxHops" | "currentHop">): boolean;
export declare function nextDiscoveryHop(payload: DiscoveryRequestPayload): number;
export declare function responseHopDistance(requestPayload: Pick<DiscoveryRequestPayload, "currentHop">): number;
//# sourceMappingURL=discovery-hop.d.ts.map