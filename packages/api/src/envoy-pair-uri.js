function paramsToPairWithHomeNode(searchParams) {
    const required = (key) => {
        const value = searchParams.get(key)?.trim();
        if (!value) {
            throw new Error(`Pairing link is missing ${key}`);
        }
        return value;
    };
    const optional = (key) => {
        const value = searchParams.get(key)?.trim();
        return value || undefined;
    };
    return {
        wsUrl: required("wsUrl"),
        token: required("token"),
        ownerPublicKey: required("ownerPublicKey"),
        ownerId: required("ownerId"),
        relayPeerId: optional("relayPeerId"),
        agentPeerId: optional("agentPeerId"),
        agentPubKey: optional("agentPubKey"),
        agentName: optional("agentName"),
        homeNodePeerId: optional("homeNodePeerId"),
    };
}
/**
 * Parse an `envoy://pair?...` URI (or raw query string) into params for {@link NodeService.pairWithHomeNode}.
 */
export function parseEnvoyPairUri(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error("Pairing link is empty");
    }
    if (trimmed.startsWith("envoy://pair")) {
        let url;
        try {
            url = new URL(trimmed);
        }
        catch {
            throw new Error("Invalid pairing link");
        }
        if (url.protocol !== "envoy:" || url.hostname !== "pair") {
            throw new Error("Expected envoy://pair link from desktop Settings");
        }
        return paramsToPairWithHomeNode(url.searchParams);
    }
    const query = trimmed.startsWith("pair?") ? trimmed.slice("pair?".length) : trimmed.replace(/^\?/, "");
    if (!query.includes("=")) {
        throw new Error("Expected envoy://pair link from desktop Settings");
    }
    return paramsToPairWithHomeNode(new URLSearchParams(query));
}
//# sourceMappingURL=envoy-pair-uri.js.map