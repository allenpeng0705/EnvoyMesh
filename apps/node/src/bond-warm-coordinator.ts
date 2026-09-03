/** Dedupe background warmContactConnection calls per bonded owner (UI preload + bond warm + chat poll). */
export const OWNER_WARM_COOLDOWN_MS = 90_000;

const lastWarmAt = new Map<string, number>();
const inFlight = new Set<string>();

export function canStartOwnerWarm(ownerId: string, now = Date.now()): boolean {
  const id = ownerId.trim();
  if (!id || inFlight.has(id)) return false;
  const last = lastWarmAt.get(id) ?? 0;
  return now - last >= OWNER_WARM_COOLDOWN_MS;
}

export function markOwnerWarmStarted(ownerId: string): void {
  const id = ownerId.trim();
  if (!id) return;
  inFlight.add(id);
}

export function markOwnerWarmFinished(ownerId: string, now = Date.now()): void {
  const id = ownerId.trim();
  if (!id) return;
  inFlight.delete(id);
  lastWarmAt.set(id, now);
}

/**
 * Drop finished warm timestamps older than maxAgeMs (default 2× cooldown).
 * In-flight owners are kept. Returns number of entries removed.
 */
export function pruneOwnerWarmCoordinator(
  maxAgeMs = OWNER_WARM_COOLDOWN_MS * 2,
  now = Date.now(),
): number {
  const cutoff = now - maxAgeMs;
  let pruned = 0;
  for (const [ownerId, at] of lastWarmAt) {
    if (inFlight.has(ownerId)) continue;
    if (at < cutoff) {
      lastWarmAt.delete(ownerId);
      pruned++;
    }
  }
  return pruned;
}

export function resetOwnerWarmCoordinatorForTests(): void {
  lastWarmAt.clear();
  inFlight.clear();
}
