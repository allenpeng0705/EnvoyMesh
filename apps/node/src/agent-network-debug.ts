/**
 * Agent Network setup / join debug logging.
 * Filter node:dev with `[agent-network.` during LAN office demos.
 */

export function shortId(id: string | undefined | null, keep = 12): string {
  if (!id) return "?";
  if (id.length <= keep + 2) return id;
  return `${id.slice(0, keep)}…`;
}

/** Fingerprint a fleet/LAN token without logging the secret. */
export function tokenFingerprint(token: string | undefined | null): string {
  if (!token || !token.trim()) return "(empty)";
  const t = token.trim();
  if (t.length <= 8) return `len=${t.length}`;
  return `len=${t.length} head=${t.slice(0, 4)}…`;
}

export function anLog(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[agent-network.${scope}] ${message}`, detail);
  } else {
    console.info(`[agent-network.${scope}] ${message}`);
  }
}

export function anWarn(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (detail && Object.keys(detail).length > 0) {
    console.warn(`[agent-network.${scope}] ${message}`, detail);
  } else {
    console.warn(`[agent-network.${scope}] ${message}`);
  }
}
