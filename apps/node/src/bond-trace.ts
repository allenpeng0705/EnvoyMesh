/**
 * Grep-friendly auto-bond / WAN join tracing.
 *
 * Copy Win logs matching `[bond-trace]` when investigating 5G failures.
 *
 * Steps:
 *  1/4  Reach community relay (TCP hop / local reservation warmup)
 *  2/4  Sponsor has a dialable public /p2p-circuit/ path (Allen RESERVED)
 *  3/4  Local libp2p dial to sponsor via that circuit succeeds
 *  4/4  bond.request delivered + bond.established ack from sponsor
 */

export type BondTraceStep = 1 | 2 | 3 | 4;
export type BondTraceStatus = "PASS" | "FAIL" | "WAIT" | "INFO" | "SKIP";

const STEP_LABEL: Record<BondTraceStep, string> = {
  1: "reach-relay",
  2: "sponsor-circuit",
  3: "circuit-dial",
  4: "bond-ack",
};

export function bondTrace(
  step: BondTraceStep,
  status: BondTraceStatus,
  detail: string,
  extra?: Record<string, string | number | boolean | undefined | null>,
): void {
  const parts = [
    `[bond-trace] step=${step}/4`,
    `name=${STEP_LABEL[step]}`,
    `status=${status}`,
    detail.trim(),
  ];
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === null || v === "") continue;
      parts.push(`${k}=${String(v)}`);
    }
  }
  const line = parts.join(" ");
  if (status === "FAIL") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Classify a dial multiaddr for bond-trace summaries. */
export function classifyBondDialTarget(addr: string): "public-circuit" | "private-circuit" | "lan" | "other" {
  if (addr.includes("/p2p-circuit/")) {
    if (/\/ip4\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(addr)) {
      return "private-circuit";
    }
    return "public-circuit";
  }
  if (/\/ip4\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(addr)) {
    return "lan";
  }
  return "other";
}
