import {
  classifyDocumentIntent,
  resolveBondTarget,
  type DocumentAgentToolResult,
  type DocumentAgentTurnResult,
} from "./document-agent-loop.js";
import type { MatchedAgentCapabilityRoute } from "./capability-intent-routing.js";
import type { OwnerAgentDomain, OwnerAgentPostureFlags, OwnerAgentApprovalSummary } from "./owner-agent-types.js";
import { runOwnerAgentPlannerLoop, type OwnerAgentPlannerTurnRecord } from "./owner-agent-planner.js";

export type { OwnerAgentDomain, OwnerAgentPostureFlags, OwnerAgentApprovalSummary } from "./owner-agent-types.js";

export interface OwnerAgentTurnResult {
  answer: string;
  domain: OwnerAgentDomain;
  /** routeId, document intent kind, or "knowledge" */
  intent: string;
  toolsUsed: string[];
  routeId?: string;
  jobId?: string;
  correlationId?: string;
  pendingApproval?: boolean;
  approvalItems?: OwnerAgentApprovalSummary[];
  matchedRoutes?: MatchedAgentCapabilityRoute[];
}

export interface OwnerAgentTurnDeps {
  message: string;
  runDocumentTurn: () => Promise<DocumentAgentTurnResult>;
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<DocumentAgentToolResult>;
  matchRoutes: (goal: string) => MatchedAgentCapabilityRoute[];
  postureEnabled: OwnerAgentPostureFlags;
  /** Phase 18B — LLM planner; omit when model disabled. */
  askPlanner?: (prompt: string) => Promise<string | null>;
  agentIdentitySection?: string;
  scanOutbound?: (text: string) => boolean;
  startDocumentAcquisitionJob?: (query: string) => Promise<{ jobId: string; correlationId: string }>;
  startCapabilityProviderJob?: (input: {
    goal: string;
    capabilityIds?: string[];
  }) => Promise<{ jobId: string; correlationId: string }>;
  runSocialProxyPass?: () => Promise<{ ok: boolean; error?: string; correlationId?: string }>;
  countPendingApprovals?: () => Promise<number>;
  getBonds?: () => Promise<Parameters<typeof resolveBondTarget>[0]>;
  auditPlannerRound?: (record: OwnerAgentPlannerTurnRecord) => Promise<void>;
  /** Phase 24B — Multi-step agent chain (decompose + execute). */
  runAgentChain?: (
    description: string,
    initialInput?: string,
  ) => Promise<{
    ok: boolean;
    completedSteps: number;
    totalSteps: number;
    finalOutput?: string;
    error?: string;
  }>;
  /** Phase 24D — Pre-evaluate an inbound task.propose against the local auto-accept policy. */
  evaluateServiceTask?: (task: {
    capabilityTags: string[];
    requestedSensitivity: string;
    proposedActions: string[];
    proposerBondLevel: string;
  }) => Promise<{ accept: boolean; reason: string }>;
}

const ROUTE_SCORE_THRESHOLD = 5;

const DOCUMENT_HUNT =
  /\b(find|get|acquire|hunt|search for|look for|locate|need|want)\b.+\b(document|file|paper|pdf|report|library|vault)\b/i;

const CAPABILITY_QUERY =
  /\b(who can|find (?:someone|a peer|people)|capable|capability|expert|provider|service)\b/i;

const SERVICE_BONDED_TASK = /^(?:ask|tell|request)\s+(.+?)\s+to\s+(.+)$/i;
const SERVICE_PROPOSE_TASK = /^propose\s+(?:a\s+)?task\s+to\s+(.+?)(?::| —|-)\s*(.+)$/i;
const SERVICE_NEGOTIATE =
  /^negotiate\s+with\s+(.+?)\s+(?:about|for|on)\s+(.+)$/i;

/** Parse owner message naming a bonded contact for direct task negotiation (Phase 18C). */
export function parseBondedServiceTask(
  message: string,
): { targetHint: string; objective: string } | null {
  const text = message.trim();
  for (const pattern of [SERVICE_BONDED_TASK, SERVICE_PROPOSE_TASK, SERVICE_NEGOTIATE]) {
    const match = text.match(pattern);
    if (match?.[1] && match[2]) {
      return { targetHint: match[1].trim(), objective: match[2].trim() };
    }
  }
  return null;
}

function formatRoutePlan(route: MatchedAgentCapabilityRoute): string {
  const steps = route.steps
    .map((s) => `  • ${s.phase}: ${s.description}`)
    .join("\n");
  return `Matched route **${route.label}** (\`${route.routeId}\`, score ${route.score}).\nPlanned steps:\n${steps}`;
}

function postureHint(posture: string, settingsPath: string): string {
  return `Enable **${posture}** in Settings → AI → Autonomous postures (${settingsPath}), then try again.`;
}

function mapDocumentTurn(turn: DocumentAgentTurnResult): OwnerAgentTurnResult {
  return {
    answer: turn.answer,
    domain: turn.intent === "knowledge" ? "knowledge" : "document",
    intent: turn.intent,
    toolsUsed: turn.toolsUsed,
  };
}

/** Prefer explicit document/service intent over incidental social keyword matches. */
export function pickOwnerAgentRoute(
  message: string,
  routes: MatchedAgentCapabilityRoute[],
  posture: OwnerAgentPostureFlags,
): MatchedAgentCapabilityRoute | undefined {
  const ranked = routes.filter((route) => route.score >= ROUTE_SCORE_THRESHOLD);
  if (ranked.length === 0) return undefined;

  if (
    DOCUMENT_HUNT.test(message) &&
    posture.documentAcquisition &&
    !posture.autonomousKillSwitch
  ) {
    const documentRoute = ranked.find((route) => route.domain === "document");
    if (documentRoute) return documentRoute;
  }

  if (CAPABILITY_QUERY.test(message) && posture.capabilityProvider && !posture.autonomousKillSwitch) {
    const serviceRoute = ranked.find((route) => route.domain === "service");
    if (serviceRoute) return serviceRoute;
  }

  return ranked[0];
}

async function handleDocumentDomain(
  deps: OwnerAgentTurnDeps,
  route: MatchedAgentCapabilityRoute,
  message: string,
  toolsUsed: string[],
): Promise<OwnerAgentTurnResult> {
  if (deps.postureEnabled.autonomousKillSwitch) {
    return {
      answer:
        "Autonomous agent actions are paused (kill switch is on). Turn it off in Settings → AI to start document hunts.",
      domain: "document",
      intent: route.routeId,
      toolsUsed,
      routeId: route.routeId,
      matchedRoutes: [route],
    };
  }

  if (DOCUMENT_HUNT.test(message) && deps.postureEnabled.documentAcquisition && deps.startDocumentAcquisitionJob) {
    try {
      const started = await deps.startDocumentAcquisitionJob(message);
      toolsUsed.push("startDocumentAcquisitionJob");
      return {
        answer:
          `${formatRoutePlan(route)}\n\nStarted an async **document acquisition** job.\n` +
          `• Job ID: \`${started.jobId}\`\n` +
          `• Correlation: \`${started.correlationId}\`\n\n` +
          "Track progress in **Activity**. I will search your vault, bonded catalogs, and negotiate retrieval under your mandate.",
        domain: "document",
        intent: route.routeId,
        toolsUsed,
        routeId: route.routeId,
        jobId: started.jobId,
        correlationId: started.correlationId,
        matchedRoutes: [route],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        answer: `Could not start document acquisition: ${msg}\n\n${formatRoutePlan(route)}`,
        domain: "document",
        intent: route.routeId,
        toolsUsed,
        routeId: route.routeId,
        matchedRoutes: [route],
      };
    }
  }

  const turn = await deps.runDocumentTurn();
  return {
    ...mapDocumentTurn(turn),
    routeId: route.routeId,
    matchedRoutes: [route],
  };
}

async function handleSocialDomain(
  deps: OwnerAgentTurnDeps,
  route: MatchedAgentCapabilityRoute,
  message: string,
  toolsUsed: string[],
): Promise<OwnerAgentTurnResult> {
  if (!deps.postureEnabled.trustMode) {
    return {
      answer:
        `${formatRoutePlan(route)}\n\n` +
        postureHint("Trust mode", "Node → Trust mode") +
        "\nTrust mode is required for stranger-safe intros and social proxy.",
      domain: "social",
      intent: route.routeId,
      toolsUsed,
      routeId: route.routeId,
      matchedRoutes: [route],
    };
  }

  if (deps.postureEnabled.autonomousKillSwitch) {
    return {
      answer:
        "Autonomous agent actions are paused (kill switch is on). Turn it off in Settings → AI to run friend discovery.",
      domain: "social",
      intent: route.routeId,
      toolsUsed,
      routeId: route.routeId,
      matchedRoutes: [route],
    };
  }

  const parts: string[] = [formatRoutePlan(route)];

  if (deps.postureEnabled.socialProxy && deps.runSocialProxyPass) {
    const pass = await deps.runSocialProxyPass();
    toolsUsed.push("runSocialProxyPass");
    if (pass.ok) {
      parts.push(
        "Started a **social proxy** discovery pass. I will look for matching strangers and may propose intros — approve them in **Inbox**.",
      );
      if (pass.correlationId) {
        parts.push(`Correlation: \`${pass.correlationId}\``);
      }
    } else {
      parts.push(`Social proxy pass did not start: ${pass.error ?? "unknown error"}`);
    }
  } else {
    parts.push(postureHint("Social proxy", "Autonomous postures → Social proxy"));
  }

  const topicMatch = message.match(/\b(?:interested in|who like|about)\s+(.+)/i);
  if (topicMatch && deps.postureEnabled.trustMode) {
    const topic = topicMatch[1]!.trim().slice(0, 80);
    toolsUsed.push("mesh.intro.broadcast_search");
    const result = await deps.executeTool("mesh.intro.broadcast_search", {
      topic,
      maxResponses: 8,
    });
    if (result.ok) {
      parts.push(`Broadcast intro search sent for topic "${topic}". Watch **Inbox** for proposals.`);
    } else if (result.error?.includes("approval")) {
      parts.push(`Intro broadcast requires your approval in **Inbox** before I can search for "${topic}".`);
      return {
        answer: parts.join("\n\n"),
        domain: "social",
        intent: route.routeId,
        toolsUsed,
        routeId: route.routeId,
        pendingApproval: true,
        matchedRoutes: [route],
      };
    } else {
      parts.push(`Intro broadcast: ${result.error ?? "failed"}`);
    }
  }

  const pending = deps.countPendingApprovals ? await deps.countPendingApprovals() : 0;
  if (pending > 0) {
    parts.push(`You have **${pending}** pending approval(s) in Inbox.`);
  }

  return {
    answer: parts.join("\n\n"),
    domain: "social",
    intent: route.routeId,
    toolsUsed,
    routeId: route.routeId,
    matchedRoutes: [route],
  };
}

async function tryBondedServiceTaskPropose(
  deps: OwnerAgentTurnDeps,
  parsed: { targetHint: string; objective: string },
  toolsUsed: string[],
  route?: MatchedAgentCapabilityRoute,
): Promise<OwnerAgentTurnResult | null> {
  if (!deps.getBonds || deps.postureEnabled.autonomousKillSwitch) {
    return null;
  }
  const bonds = await deps.getBonds();
  const target = resolveBondTarget(bonds, parsed.targetHint);
  if (!target) {
    return null;
  }

  const label = target.displayName ?? target.peerOwnerId.slice(0, 20);
  const parts: string[] = route ? [formatRoutePlan(route)] : [];
  toolsUsed.push("mesh.task.propose");
  const result = await deps.executeTool("mesh.task.propose", {
    targetOwnerId: target.peerOwnerId,
    objective: parsed.objective,
  });

  if (result.ok) {
    const taskId =
      result.result && typeof result.result === "object" && "taskId" in result.result
        ? String((result.result as { taskId?: string }).taskId ?? "")
        : undefined;
    parts.push(
      `Sent **task.propose** to **${label}**.\n` +
        `• Objective: ${parsed.objective.slice(0, 120)}${parsed.objective.length > 120 ? "…" : ""}` +
        (taskId ? `\n• Task ID: \`${taskId}\`` : "") +
        (result.correlationId ? `\n• Correlation: \`${result.correlationId}\`` : ""),
    );
    return {
      answer: parts.join("\n\n"),
      domain: "service",
      intent: "task.propose",
      toolsUsed,
      routeId: route?.routeId,
      correlationId: result.correlationId,
      matchedRoutes: route ? [route] : undefined,
    };
  }

  const pendingApproval = /approval/i.test(result.error ?? "");
  parts.push(`Could not propose task to ${label}: ${result.error ?? "unknown error"}`);
  return {
    answer: parts.join("\n\n"),
    domain: "service",
    intent: "task.propose",
    toolsUsed,
    routeId: route?.routeId,
    correlationId: result.correlationId,
    pendingApproval,
    matchedRoutes: route ? [route] : undefined,
  };
}

async function handleServiceDomain(
  deps: OwnerAgentTurnDeps,
  route: MatchedAgentCapabilityRoute,
  message: string,
  toolsUsed: string[],
): Promise<OwnerAgentTurnResult> {
  if (deps.postureEnabled.autonomousKillSwitch) {
    return {
      answer:
        "Autonomous agent actions are paused (kill switch is on). Turn it off in Settings → AI to find service providers.",
      domain: "service",
      intent: route.routeId,
      toolsUsed,
      routeId: route.routeId,
      matchedRoutes: [route],
    };
  }

  const parts: string[] = [formatRoutePlan(route)];

  const bondedTask = parseBondedServiceTask(message);
  if (bondedTask) {
    const proposed = await tryBondedServiceTaskPropose(deps, bondedTask, toolsUsed, route);
    if (proposed) {
      return proposed;
    }
    parts.push(
      `Could not match **${bondedTask.targetHint}** to a bonded contact — starting provider discovery instead.`,
    );
  }

  if (deps.postureEnabled.capabilityProvider && deps.startCapabilityProviderJob) {
    try {
      const capabilityIds =
        route.matchedCapabilityIds.length > 0 ? route.matchedCapabilityIds : undefined;
      const started = await deps.startCapabilityProviderJob({
        goal: message,
        capabilityIds,
      });
      toolsUsed.push("mesh.capability_provider.start");
      parts.push(
        `Started a **capability provider** job to find peers who can help.\n` +
          `• Job ID: \`${started.jobId}\`\n` +
          `• Correlation: \`${started.correlationId}\`\n\n` +
          "Track progress in **Activity**. Steps that need your approval will appear in **Inbox**.",
      );
      return {
        answer: parts.join("\n\n"),
        domain: "service",
        intent: route.routeId,
        toolsUsed,
        routeId: route.routeId,
        jobId: started.jobId,
        correlationId: started.correlationId,
        matchedRoutes: [route],
      };
    } catch (err) {
      parts.push(`Could not start capability provider job: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (CAPABILITY_QUERY.test(message)) {
    parts.push(postureHint("Capability provider", "Autonomous postures → Capability provider"));
  }

  return {
    answer: parts.join("\n\n"),
    domain: "service",
    intent: route.routeId,
    toolsUsed,
    routeId: route.routeId,
    matchedRoutes: [route],
  };
}

/**
 * Owner-facing native agent turn (Phase 18A).
 * Route-driven orchestration over ToolRegistry + posture jobs.
 */
export async function runOwnerAgentTurn(deps: OwnerAgentTurnDeps): Promise<OwnerAgentTurnResult> {
  const message = deps.message.trim();
  if (!message) {
    return {
      answer: "Please describe what you'd like help with — friends, documents, capabilities, or a service.",
      domain: "knowledge",
      intent: "empty",
      toolsUsed: [],
    };
  }

  const docIntent = classifyDocumentIntent(message);
  if (docIntent.kind !== "knowledge") {
    const turn = await deps.runDocumentTurn();
    return mapDocumentTurn(turn);
  }

  const toolsUsed: string[] = [];
  const bondedTask = parseBondedServiceTask(message);
  if (bondedTask) {
    const proposed = await tryBondedServiceTaskPropose(deps, bondedTask, toolsUsed);
    if (proposed) {
      return proposed;
    }
  }

  const routes = deps.matchRoutes(message);
  const top = pickOwnerAgentRoute(message, routes, deps.postureEnabled);

  if (top) {
    toolsUsed.push("mesh.match_capability_route");

    switch (top.domain) {
      case "document":
        return handleDocumentDomain(deps, top, message, toolsUsed);
      case "social":
        return handleSocialDomain(deps, top, message, toolsUsed);
      case "service":
        return handleServiceDomain(deps, top, message, toolsUsed);
      default:
        break;
    }
  }

  if (deps.askPlanner) {
    const planned = await runOwnerAgentPlannerLoop({
      message,
      postureEnabled: deps.postureEnabled,
      matchedRoutes: routes,
      agentIdentitySection: deps.agentIdentitySection,
      askPlanner: deps.askPlanner,
      executeTool: deps.executeTool,
      startDocumentAcquisitionJob: deps.startDocumentAcquisitionJob,
      runSocialProxyPass: deps.runSocialProxyPass,
      scanOutbound: deps.scanOutbound,
      auditPlannerRound: deps.auditPlannerRound,
    });
    if (planned) {
      return planned;
    }
  }

  const turn = await deps.runDocumentTurn();
  return mapDocumentTurn(turn);
}
