/**
 * Bond Steward (Phase 23C)
 *
 * Detects dormant bonds — bonded contacts with no recent chat activity —
 * and generates stewardship suggestions for the owner.
 */

export interface BondStewardDeps {
  /** Get all bonds with their trust levels. */
  getBonds: () => Promise<Array<{
    peerOwnerId: string;
    displayName?: string;
    level: string;
    createdAt: string;
  }>>;
  /** Get the last interaction timestamp for a contact (from chat logs). */
  getLastInteractionAt: (ownerId: string) => Promise<string | null>;
}

export interface DormantBond {
  peerOwnerId: string;
  displayName?: string;
  bondLevel: string;
  /** Days since last interaction. */
  dormantDays: number;
  /** ISO timestamp of last interaction. */
  lastInteractionAt: string | null;
}

export interface BondStewardResult {
  dormantBonds: DormantBond[];
  summary: string;
}

/**
 * Find dormant bonds — bonded contacts with no chat activity
 * beyond the threshold.
 */
export async function findDormantBonds(
  deps: BondStewardDeps,
  thresholdDays: number = 90,
): Promise<BondStewardResult> {
  const bonds = await deps.getBonds();
  const directBonds = bonds.filter((b) => b.level === "direct");
  const now = Date.now();
  const dormantBonds: DormantBond[] = [];

  for (const bond of directBonds) {
    const lastInteractionAt = await deps.getLastInteractionAt(bond.peerOwnerId);
    const lastMs = lastInteractionAt ? new Date(lastInteractionAt).getTime() : null;
    const dormantDays = lastMs
      ? Math.floor((now - lastMs) / (1000 * 60 * 60 * 24))
      : // No interaction recorded — use bond creation date or mark as never interacted
        Math.floor((now - new Date(bond.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    if (dormantDays >= thresholdDays) {
      dormantBonds.push({
        peerOwnerId: bond.peerOwnerId,
        displayName: bond.displayName,
        bondLevel: bond.level,
        dormantDays,
        lastInteractionAt,
      });
    }
  }

  dormantBonds.sort((a, b) => b.dormantDays - a.dormantDays);

  const summary =
    dormantBonds.length === 0
      ? "All bonds are active — no dormant contacts."
      : `${dormantBonds.length} dormant bond${dormantBonds.length === 1 ? "" : "s"} detected. Longest dormant: ${dormantBonds[0].dormantDays} days.`;

  return { dormantBonds, summary };
}
