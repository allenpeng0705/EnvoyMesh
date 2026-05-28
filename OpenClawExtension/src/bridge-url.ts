/** Derive bridge HTTP base from `bridgeUrl` (…/bridge/send). */
export function resolveBridgeBaseUrl(bridgeUrl: string): string {
  const trimmed = bridgeUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/bridge/send")) {
    return trimmed.slice(0, -"/bridge/send".length);
  }
  return trimmed;
}

export function bridgeListToolsUrl(bridgeUrl: string): string {
  return `${resolveBridgeBaseUrl(bridgeUrl)}/bridge/list-tools`;
}

export function bridgeExecuteToolUrl(bridgeUrl: string): string {
  return `${resolveBridgeBaseUrl(bridgeUrl)}/bridge/execute-tool`;
}
