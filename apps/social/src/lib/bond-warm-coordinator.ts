/** Shared cooldown so sidebar preload and chat reachability do not stack redundant warms. */
export const BOND_WARM_COOLDOWN_MS = 90_000;

const lastWarmAt = new Map<string, number>();
const inFlight = new Set<string>();

export function canStartBondWarm(ownerId: string, now = Date.now()): boolean {
  const id = ownerId.trim();
  if (!id || inFlight.has(id)) return false;
  const last = lastWarmAt.get(id) ?? 0;
  return now - last >= BOND_WARM_COOLDOWN_MS;
}

export function markBondWarmStarted(ownerId: string): void {
  const id = ownerId.trim();
  if (!id) return;
  inFlight.add(id);
}

export function markBondWarmFinished(ownerId: string, now = Date.now()): void {
  const id = ownerId.trim();
  if (!id) return;
  inFlight.delete(id);
  lastWarmAt.set(id, now);
}

/** Test helper */
export function resetBondWarmCoordinatorForTests(): void {
  lastWarmAt.clear();
  inFlight.clear();
}
