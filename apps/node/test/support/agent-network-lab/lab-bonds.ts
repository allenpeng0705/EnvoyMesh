/**
 * Phase 60F — symmetric bond graph helpers for the Agent Network lab.
 */

export type LabBondLevel = "direct" | "referred" | "public" | "blocked";

export type LabBondEdge = {
  fromOwnerId: string;
  toOwnerId: string;
  level: LabBondLevel;
};

/** Undirected convenience: both directions get the same level. */
export function labSymmetricBonds(
  ownerA: string,
  ownerB: string,
  level: LabBondLevel = "direct",
): LabBondEdge[] {
  return [
    { fromOwnerId: ownerA, toOwnerId: ownerB, level },
    { fromOwnerId: ownerB, toOwnerId: ownerA, level },
  ];
}

export function labTriangleBonds(
  assigner: string,
  harness: string,
  openclaw: string,
  level: LabBondLevel = "direct",
): LabBondEdge[] {
  return [
    ...labSymmetricBonds(assigner, harness, level),
    ...labSymmetricBonds(assigner, openclaw, level),
    ...labSymmetricBonds(harness, openclaw, level),
  ];
}

export class AgentNetworkLabBondStore {
  private readonly edges = new Map<string, LabBondLevel>();

  constructor(initial: readonly LabBondEdge[] = []) {
    for (const edge of initial) this.set(edge);
  }

  set(edge: LabBondEdge): void {
    this.edges.set(this.key(edge.fromOwnerId, edge.toOwnerId), edge.level);
  }

  level(fromOwnerId: string, toOwnerId: string): LabBondLevel {
    return this.edges.get(this.key(fromOwnerId, toOwnerId)) ?? "public";
  }

  isDirect(fromOwnerId: string, toOwnerId: string): boolean {
    return this.level(fromOwnerId, toOwnerId) === "direct";
  }

  private key(a: string, b: string): string {
    return `${a}→${b}`;
  }
}
