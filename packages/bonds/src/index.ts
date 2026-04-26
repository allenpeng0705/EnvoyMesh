import type {
  Capability,
  EnvoyIntent,
  Mandate,
  MandateAction,
  MandateCostLimit,
  MandatePeerScope,
  Sensitivity,
} from "@envoymesh/protocol";

export type BondLevel = "self" | "direct" | "referred" | "public" | "blocked";

export type PolicyDecision =
  | { action: "allow"; maxSensitivity: Sensitivity }
  | { action: "deny"; reason: string }
  | { action: "challenge"; challengeType: "referral_or_manual_approval" }
  | { action: "approval_required"; reason: string };

export interface BondRecord {
  peerId: string;
  level: BondLevel;
  displayName?: string;
}

export interface PolicyRequest {
  peerId: string;
  bondLevel: BondLevel;
  intent: EnvoyIntent;
  requestedSensitivity?: Sensitivity;
  allowRawFiles?: boolean;
}

export type CapabilityDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string; requiredCapabilities: Capability[] };

export type MandateActionDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "approval_required"; reason: string };

export interface MandateActionRequest {
  mandate: Mandate;
  requestedAction: MandateAction;
  peerScope?: MandatePeerScope;
  requestedSensitivity?: Sensitivity;
  requestedCost?: MandateCostLimit;
  now?: string;
}

const sensitivityRank: Record<Sensitivity, number> = {
  public: 0,
  friends: 1,
  trusted: 2,
  private: 3,
};

const capabilityRequirements: Partial<Record<EnvoyIntent, Capability[][]>> = {
  "agent.card.request": [["message.send"], ["ui.channel"]],
  "agent.card.response": [["message.send"], ["ui.channel"]],
  "auth.challenge": [["message.send"], ["ui.channel"]],
  "auth.challenge.response": [["message.send"], ["ui.channel"]],
  "system.signal": [["message.send"], ["mesh.listen"], ["mesh.discovery"], ["ui.channel"]],
  "bond.request": [["message.send"]],
  "bond.challenge": [["message.send"]],
  "bond.challenge.response": [["message.send"]],
  "discovery.request": [["mesh.discovery"], ["message.send"]],
  "discovery.response": [["mesh.discovery"], ["message.send"]],
  "knowledge.query": [["vault.retrieve"]],
  "knowledge.response": [["message.send"]],
  "task.mandate": [["message.send"]],
  "task.propose": [["message.send"]],
  "task.negotiate": [["message.send"]],
  "task.accept": [["task.execute"]],
  "task.reject": [["message.send"]],
  "task.cancel": [["message.send"], ["approval.prompt"]],
  "task.heartbeat": [["message.send"], ["task.execute"]],
  "task.result": [["message.send"]],
  "report.create": [["task.execute"], ["message.send"]],
  "sync.state": [["device.sync"]],
};

export function evaluateCapability(
  intent: EnvoyIntent,
  capabilities: readonly Capability[],
): CapabilityDecision {
  const alternatives = capabilityRequirements[intent];

  if (!alternatives) {
    return { action: "allow" };
  }

  if (alternatives.some((required) => required.every((capability) => capabilities.includes(capability)))) {
    return { action: "allow" };
  }

  return {
    action: "deny",
    reason: `missing capability for ${intent}`,
    requiredCapabilities: [...new Set(alternatives.flat())],
  };
}

export function evaluatePolicy(request: PolicyRequest): PolicyDecision {
  if (request.bondLevel === "blocked") {
    return { action: "deny", reason: "peer is blocked" };
  }

  if (request.allowRawFiles) {
    return { action: "approval_required", reason: "raw file sharing requires approval" };
  }

  if (request.bondLevel === "public") {
    return evaluatePublicPolicy(request.intent);
  }

  if (request.bondLevel === "referred") {
    return evaluateReferredPolicy(request);
  }

  if (request.bondLevel === "direct") {
    return limitSensitivity(request.requestedSensitivity, "friends");
  }

  return { action: "allow", maxSensitivity: "private" };
}

function evaluatePublicPolicy(intent: EnvoyIntent): PolicyDecision {
  if (intent === "bond.request" || intent === "bond.challenge.response") {
    return { action: "challenge", challengeType: "referral_or_manual_approval" };
  }

  if (intent === "system.ping") {
    return { action: "allow", maxSensitivity: "public" };
  }

  return { action: "deny", reason: "public peers cannot use this intent" };
}

function evaluateReferredPolicy(request: PolicyRequest): PolicyDecision {
  if (request.intent === "knowledge.query") {
    return limitSensitivity(request.requestedSensitivity, "public");
  }

  if (request.intent === "system.ping" || request.intent === "bond.request") {
    return { action: "allow", maxSensitivity: "public" };
  }

  return { action: "approval_required", reason: "referred peer requires approval" };
}

function limitSensitivity(
  requestedSensitivity: Sensitivity | undefined,
  maximumAllowed: Sensitivity,
): PolicyDecision {
  const requested = requestedSensitivity ?? maximumAllowed;

  if (sensitivityRank[requested] > sensitivityRank[maximumAllowed]) {
    return {
      action: "approval_required",
      reason: `requested sensitivity exceeds ${maximumAllowed}`,
    };
  }

  return { action: "allow", maxSensitivity: requested };
}

export function evaluateMandateAction(request: MandateActionRequest): MandateActionDecision {
  if (new Date(request.mandate.expiresAt).getTime() <= new Date(request.now ?? new Date().toISOString()).getTime()) {
    return { action: "deny", reason: "mandate has expired" };
  }

  if (request.mandate.disallowedActions.includes(request.requestedAction)) {
    return { action: "deny", reason: `${request.requestedAction} is explicitly disallowed` };
  }

  if (!request.mandate.allowedActions.includes(request.requestedAction)) {
    return { action: "approval_required", reason: `${request.requestedAction} is outside mandate actions` };
  }

  if (
    request.peerScope &&
    !request.mandate.allowedPeerScopes.includes(request.peerScope)
  ) {
    return { action: "approval_required", reason: `${request.peerScope} peer scope is outside mandate` };
  }

  if (
    request.requestedSensitivity &&
    sensitivityRank[request.requestedSensitivity] > sensitivityRank[request.mandate.maxSensitivity]
  ) {
    return {
      action: "approval_required",
      reason: `requested sensitivity exceeds ${request.mandate.maxSensitivity}`,
    };
  }

  if (request.requestedCost) {
    const costDecision = evaluateMandateCost(request.requestedCost, request.mandate.maxCost);
    if (costDecision) {
      return costDecision;
    }
  }

  if (request.mandate.requiresApprovalFor.includes(request.requestedAction)) {
    return { action: "approval_required", reason: `${request.requestedAction} requires owner approval` };
  }

  return { action: "allow" };
}

function evaluateMandateCost(
  requestedCost: MandateCostLimit,
  maxCost: MandateCostLimit,
): Extract<MandateActionDecision, { action: "approval_required" }> | undefined {
  if (requestedCost.currency !== maxCost.currency) {
    return {
      action: "approval_required",
      reason: `requested currency ${requestedCost.currency} differs from mandate currency ${maxCost.currency}`,
    };
  }

  if (requestedCost.amount > maxCost.amount) {
    return {
      action: "approval_required",
      reason: `requested cost exceeds ${maxCost.amount} ${maxCost.currency}`,
    };
  }

  return undefined;
}
