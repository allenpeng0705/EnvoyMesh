export type BondLevel = "direct" | "referred" | "public" | "blocked";

/** Lower is stronger trust — useful for sorting contacts / discovery results. */
export function bondTrustRank(level: BondLevel): number {
  switch (level) {
    case "direct":
      return 0;
    case "referred":
      return 1;
    case "public":
      return 2;
    case "blocked":
      return 99;
    default:
      return 50;
  }
}
