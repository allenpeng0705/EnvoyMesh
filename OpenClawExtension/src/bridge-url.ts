/**
 * Derive the bridge HTTP base from a `bridgeUrl` that points at
 * `…/bridge/send`, `…/bridge/`, `…/bridge`, or even a bare base like
 * `http://127.0.0.1:3031`. The result is always a base URL with no trailing
 * slash and no path beyond `/bridge`, so appending `/bridge/list-tools`,
 * `/bridge/execute-tool`, etc. always works.
 *
 * Pre-fix this only handled the `/bridge/send` suffix case, which caused 404s
 * on the tool endpoints whenever a user configured a slightly different
 * bridgeUrl (e.g. trailing slash, or `/bridge` without `/send`).
 */
export function resolveBridgeBaseUrl(bridgeUrl: string): string {
  const trimmed = bridgeUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return trimmed;
  }
  // Strip a trailing /bridge/send if present.
  if (trimmed.endsWith("/bridge/send")) {
    return trimmed.slice(0, -"/bridge/send".length);
  }
  // If the user already gave us `/bridge` (or `/bridge/...` under the base),
  // keep that — appending `/bridge/...` would double the segment.
  if (trimmed.endsWith("/bridge")) {
    return trimmed;
  }
  // Otherwise the user gave us a bare base; tool endpoints live under
  // /bridge/… on the standard EnvoyMesh bridge.
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
