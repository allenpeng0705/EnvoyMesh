export function bridgeAuthHeaders(bridgeSecret?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = bridgeSecret?.trim();
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  return headers;
}
