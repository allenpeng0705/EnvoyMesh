/**
 * Derive the bridge HTTP base from a `bridgeUrl` that points at
 * `…/bridge/send`, `…/bridge`, or a bare base like `http://127.0.0.1:3031`.
 *
 * The returned base always ends in `/bridge` (or is empty for empty input),
 * so the callers `bridgeListToolsUrl` / `bridgeExecuteToolUrl` / `bridgeSendUrl`
 * can safely append `/list-tools`, `/execute-tool`, or `/send` respectively.
 *
 * Pre-fix this only handled the `/bridge/send` suffix case, which produced
 * 404s on the tool endpoints whenever a user configured a slightly different
 * bridgeUrl (e.g. trailing slash, or `/bridge` without `/send`).
 */
export function resolveBridgeBaseUrl(bridgeUrl: string): string {
  const trimmed = bridgeUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return trimmed;
  }
  // Strip a trailing /send (which would be the /bridge/send config style).
  if (trimmed.endsWith("/send")) {
    return trimmed.slice(0, -"/send".length);
  }
  // Already includes the /bridge segment — return as-is.
  if (trimmed.endsWith("/bridge")) {
    return trimmed;
  }
  // Bare base like http://host:port — append /bridge.
  return `${trimmed}/bridge`;
}

export function bridgeListToolsUrl(bridgeUrl: string): string {
  return `${resolveBridgeBaseUrl(bridgeUrl)}/list-tools`;
}

export function bridgeExecuteToolUrl(bridgeUrl: string): string {
  return `${resolveBridgeBaseUrl(bridgeUrl)}/execute-tool`;
}

export function bridgeSendUrl(bridgeUrl: string): string {
  return `${resolveBridgeBaseUrl(bridgeUrl)}/send`;
}
