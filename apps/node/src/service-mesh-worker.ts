/**
 * Service Mesh Worker (Phase 24D)
 *
 * Background worker that matches incoming task.propose requests
 * to locally advertised capabilities and auto-accepts within mandate bounds.
 */

export interface ServiceMeshDeps {
  /** Check if a capability tag is advertised by this node. */
  hasCapability: (tag: string) => boolean;
  /** Get the active mandate policy for auto-accepting tasks. */
  getAutoAcceptPolicy: () => Promise<{
    enabled: boolean;
    maxSensitivity: string;
    maxConcurrentTasks: number;
    allowedActions: string[];
  }>;
  /** Get current active task count. */
  getActiveTaskCount: () => Promise<number>;
}

export interface ServiceMeshDecision {
  /** Whether to auto-accept the task. */
  accept: boolean;
  /** Reason for the decision. */
  reason: string;
}

/**
 * Evaluate whether an inbound task.propose should be auto-accepted.
 */
export async function evaluateServiceTask(
  deps: ServiceMeshDeps,
  task: {
    capabilityTags: string[];
    requestedSensitivity: string;
    proposedActions: string[];
    proposerBondLevel: string;
  },
): Promise<ServiceMeshDecision> {
  const policy = await deps.getAutoAcceptPolicy();

  if (!policy.enabled) {
    return { accept: false, reason: "service mesh auto-accept disabled" };
  }

  // Capability match
  const hasMatchingCapability = task.capabilityTags.some((tag) => deps.hasCapability(tag));
  if (!hasMatchingCapability) {
    return { accept: false, reason: `no matching capability for tags: ${task.capabilityTags.join(", ")}` };
  }

  // Sensitivity ceiling
  const sensitivityOrder = ["public", "friends", "private"];
  const policyIdx = sensitivityOrder.indexOf(policy.maxSensitivity);
  const taskIdx = sensitivityOrder.indexOf(task.requestedSensitivity);
  if (taskIdx > policyIdx) {
    return {
      accept: false,
      reason: `task sensitivity (${task.requestedSensitivity}) exceeds policy max (${policy.maxSensitivity})`,
    };
  }

  // Concurrent task cap
  const activeCount = await deps.getActiveTaskCount();
  if (activeCount >= policy.maxConcurrentTasks) {
    return {
      accept: false,
      reason: `max concurrent tasks reached (${policy.maxConcurrentTasks})`,
    };
  }

  // Action allowlist
  const disallowed = task.proposedActions.filter((a) => !policy.allowedActions.includes(a));
  if (disallowed.length > 0) {
    return {
      accept: false,
      reason: `disallowed actions: ${disallowed.join(", ")}`,
    };
  }

  return { accept: true, reason: "within mandate bounds" };
}
