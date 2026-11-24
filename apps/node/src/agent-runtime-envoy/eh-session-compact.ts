/**
 * FH-P2-D — optional EH session auto-compact after long Coding threads.
 *
 * Sessions live under `{productDir}/envoy-harness/sessions/`. When
 * `ENVOYMESH_EH_AUTO_COMPACT_AFTER_MSGS` is >0, the node may call ACP
 * `session/compact` after a turn (harness keeps the last N messages).
 */

export const DEFAULT_EH_AUTO_COMPACT_AFTER_MSGS = 0;
export const DEFAULT_EH_AUTO_COMPACT_KEEP = 40;

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export type EhAutoCompactPolicy = {
  /** When 0, auto-compact is disabled. */
  afterMessageCount: number;
  keep: number;
};

export function resolveEhAutoCompactPolicy(): EhAutoCompactPolicy {
  return {
    afterMessageCount: parsePositiveInt(
      "ENVOYMESH_EH_AUTO_COMPACT_AFTER_MSGS",
      DEFAULT_EH_AUTO_COMPACT_AFTER_MSGS,
    ),
    keep: Math.max(
      10,
      parsePositiveInt("ENVOYMESH_EH_AUTO_COMPACT_KEEP", DEFAULT_EH_AUTO_COMPACT_KEEP),
    ),
  };
}

export function shouldAutoCompactEhSession(
  messageCount: number,
  policy: EhAutoCompactPolicy = resolveEhAutoCompactPolicy(),
): boolean {
  return (
    policy.afterMessageCount > 0 && messageCount >= policy.afterMessageCount
  );
}