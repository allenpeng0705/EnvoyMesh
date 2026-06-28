/** Convert relay base WebSocket URL to the /ws/client direct-control endpoint. */
export function relayDirectClientWsUrl(relayWsUrl: string): string {
  const url = new URL(relayWsUrl);
  let pathOnly = url.pathname.replace(/\/$/, "") || "";
  if (pathOnly.includes("/ws/client")) {
    return url.toString();
  }
  if (/\/ws$/i.test(pathOnly)) {
    url.pathname = pathOnly.replace(/\/ws$/i, "/ws/client");
    return url.toString();
  }
  url.pathname = `${pathOnly}/ws/client`.replace(/\/{2,}/g, "/");
  return url.toString();
}
