/**
 * Phase 58C — classify observed job for worker-facing badges (read-only).
 */

export type ObservedJobBadge =
  | "assignedToYou"
  | "waitingOnAssigner"
  | "blockedOnPrior"
  | "done"
  | "failed"
  | "watching";

export type ObservedStepLike = {
  state: string;
  workerPeerId?: string;
  waitingOn?: Array<unknown>;
};

export function classifyObservedJobBadge(opts: {
  phase: string;
  steps: ObservedStepLike[];
  localAgentPeerId?: string | null;
}): ObservedJobBadge {
  const { phase, steps, localAgentPeerId } = opts;
  if (phase === "cancelled") return "failed";
  if (phase === "completed") return "done";

  const mine = localAgentPeerId
    ? steps.filter((s) => s.workerPeerId === localAgentPeerId)
    : [];

  if (mine.some((s) => s.state === "failed")) return "failed";
  if (mine.length > 0 && mine.every((s) => s.state === "done" || s.state === "cancelled")) {
    return "done";
  }
  if (mine.some((s) => s.state === "running" || s.state === "awarded")) {
    return "assignedToYou";
  }
  if (
    steps.some(
      (s) =>
        (s.state === "pending" || s.state === "offered") &&
        Array.isArray(s.waitingOn) &&
        s.waitingOn.length > 0,
    )
  ) {
    return "blockedOnPrior";
  }
  if (
    phase === "assigning" ||
    phase === "waitingWorkers" ||
    phase === "bidding" ||
    phase === "synthesizing"
  ) {
    return "waitingOnAssigner";
  }
  return "watching";
}
