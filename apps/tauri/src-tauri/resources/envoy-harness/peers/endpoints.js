/**
 * Parse static peer endpoint specs (`id@host:port`) for mesh wiring.
 */
/** Parse one `id@host:port` peer endpoint. */
export function parsePeerEndpoint(raw) {
    const trimmed = raw.trim();
    const at = trimmed.lastIndexOf("@");
    if (at <= 0 || at === trimmed.length - 1) {
        throw new Error(`expected <id>@<host:port>, got "${trimmed}"`);
    }
    const id = trimmed.slice(0, at);
    const endpoint = trimmed.slice(at + 1);
    if (!endpoint.includes(":")) {
        throw new Error(`peer endpoint must be <host:port>, got "${endpoint}"`);
    }
    return { id, endpoint };
}
/**
 * Parse a list of peer endpoints from a comma- or whitespace-separated string.
 * Each token must be `id@host:port`.
 */
export function parsePeerEndpointsList(raw) {
    const tokens = raw
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    return tokens.map((token) => parsePeerEndpoint(token));
}
/** Read `ENVOY_PEERS` when set (`id@host:port` tokens, comma or space separated). */
export function parsePeerEndpointsFromEnv(env = process.env) {
    const raw = env["ENVOY_PEERS"];
    if (raw === undefined || raw.trim().length === 0)
        return [];
    return parsePeerEndpointsList(raw);
}
//# sourceMappingURL=endpoints.js.map