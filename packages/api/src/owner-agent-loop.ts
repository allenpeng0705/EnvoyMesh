import {
  classifyDocumentIntent,
  resolveBondTarget,
  type DocumentAgentToolResult,
  type DocumentAgentTurnResult,
} from "./document-agent-loop.js";
import type { MatchedAgentCapabilityRoute } from "./capability-intent-routing.js";
import type {
  AnswerFormat,
  OwnerAgentDomain,
  OwnerAgentPostureFlags,
  OwnerAgentApprovalSummary,
  StructuredBlock,
} from "./owner-agent-types.js";
import { runOwnerAgentPlannerLoop, type OwnerAgentPlannerTurnRecord } from "./owner-agent-planner.js";

export type {
  AnswerFormat,
  OwnerAgentDomain,
  OwnerAgentPostureFlags,
  OwnerAgentApprovalSummary,
  StructuredBlock,
} from "./owner-agent-types.js";

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
  /**
   * How `answer` (and `blocks`) should be rendered. Default: "markdown".
   * The LLM planner chooses this; legacy callers can leave it unset.
   */
  format?: AnswerFormat;
  /**
   * Structured content chosen by the LLM. Only populated when
   * `format === "structured"`. The UI renders these as React components
   * instead of Markdown.
   */
  blocks?: StructuredBlock[];
  /** "openclaw" if answered by bundled agent, "native" if fallback model, "scripted-tutor" for no-model onboarding, absent if unknown. */
  modelUsed?: "openclaw" | "native" | "scripted-tutor";
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
  /** Phase 24A — Full A2A task negotiation lifecycle. */
  runTaskNegotiation?: (
    objective: string,
    capabilityTags: string[],
  ) => Promise<unknown>;
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
  /** Phase 18 — Cluster discovery results. */
  discoverAndCluster?: (seedTopics?: string[], seedCapabilities?: string[]) => Promise<unknown>;
  /** Phase 23D — Local chat RAG over chat history. */
  chatRagSearch?: (query: string, opts?: { ownerId?: string; maxResults?: number }) => Promise<unknown>;
  /** Phase 25D — Predict owner intent from partial input. */
  predictIntent?: (partial: string) => unknown;
  /** Phase 23A — Agent circle operations. */
  listAgentCircles?: () => Promise<unknown>;
  createAgentCircle?: (input: unknown) => Promise<unknown>;
  updateAgentCircle?: (circleId: string, update: unknown) => Promise<unknown>;
  deleteAgentCircle?: (circleId: string) => Promise<unknown>;
  proposeAgentCircles?: () => Promise<unknown>;
  /**
   * Phase 40 — Multi-agent chain collaboration. Decomposes a multi-step goal
   * into subtasks, broadcasts the chain mandate, collects bids, awards
   * workers, and (in the background) synthesizes a final report.
   *
   * Returns the chainId + initial subtask summary. The synthesis report is
   * published asynchronously; callers can poll `chainGetState` for status.
   */
  runChain?: (input: {
    goal: string;
    chainId?: string;
    maxChainCostUsd?: number;
    costCeilingUsd?: number;
    allowLlm?: boolean;
    assignerPeerId?: string;
  }) => Promise<{
    ok: boolean;
    chainId: string;
    chainMandateId: string;
    subtasks: Array<{ subtaskId: string; depth: number; requiredSkill: string; objective: string }>;
    error?: string;
    assignerPeerId?: string;
    handedOff?: boolean;
  }>;
}

const ROUTE_SCORE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Phase 40 — Multi-step goal detection (chain heuristic)
// ---------------------------------------------------------------------------

/**
 * Verbs that suggest a sub-action in a multi-step request. We keep this list
 * intentionally tight: "do X and Y" should trigger; "find a contact" should not.
 */
const MULTI_STEP_VERBS = [
  "summarize",
  "compile",
  "draft",
  "research",
  "analyze",
  "compare",
  "synthesize",
  "review",
  "outline",
  "investigate",
  "plan",
  "audit",
];

/** Prepositions / conjunctions that often separate sub-tasks in one request. */
const MULTI_STEP_SEPARATORS = /\b(?:,\s*and\s+|,\s*then\s+|\s+and\s+(?:also\s+)?|\s+then\s+|\s+;\s+|\s+\/\s+|\s+\|\s+)/i;

const COMPOUND_SUMMARIZE = /^(?:summarize|compile|draft|research|analyze|compare|review|outline|investigate|plan|audit)\b/i;

/**
 * Detect whether a natural-language message describes a multi-step goal that
 * would benefit from the chain orchestrator. Three signals trigger a match:
 *
 *   1. ≥2 multi-step verbs (e.g. "analyze and summarize").
 *   2. A compound-summarize prefix ("summarize X, Y, and Z") with ≥2
 *      comma/and-separated items.
 *   3. ≥2 of the same verb in the message (rare; e.g. "review X, review Y").
 *
 * Returns the inferred list of sub-tasks, or null when the message is
 * a single-step request and should fall through to the route handlers.
 */
export function detectMultiStepGoal(message: string): {
  subGoals: string[];
  reason: "two_verbs" | "compound_summarize" | "repeated_verb";
} | null {
  const text = message.trim();
  if (text.length === 0) return null;

  // 1. ≥2 multi-step verbs
  const lower = text.toLowerCase();
  const verbsFound = MULTI_STEP_VERBS.filter((v) => lower.includes(v));
  if (verbsFound.length >= 2) {
    return { subGoals: splitIntoSubGoals(text), reason: "two_verbs" };
  }

  // 2. Compound-summarize prefix with ≥2 items
  if (COMPOUND_SUMMARIZE.test(text) && MULTI_STEP_SEPARATORS.test(text)) {
    return { subGoals: splitIntoSubGoals(text), reason: "compound_summarize" };
  }

  return null;
}

function splitIntoSubGoals(message: string): string[] {
  // Strip a leading verb so each sub-goal reads naturally.
  const stripped = message.replace(COMPOUND_SUMMARIZE, "").trim();
  if (stripped.length === 0) return [message];
  return stripped
    .split(MULTI_STEP_SEPARATORS)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `${COMPOUND_SUMMARIZE.exec(message)?.[0] ?? "do"} ${s}`);
}

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
  // Casual messages (greetings, meta-questions like "what can you do?") should
  // fall through to the LLM planner rather than triggering an internal route.
  // We bump the threshold based on the message's token count so a short message
  // needs a stronger match to fire a route.
  const tokens = message
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const dynamicThreshold = tokens.length <= 2 ? 10 : tokens.length <= 4 ? 7 : ROUTE_SCORE_THRESHOLD;
  const ranked = routes.filter((route) => route.score >= dynamicThreshold);
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
 *
 * Decision flow:
 *   1. Explicit document commands ("list my library") go straight to the
 *      document turn — they're unambiguous and don't need LLM arbitration.
 *   2. Explicit bonded-task syntax ("ask Bob to X") calls the contact directly.
 *   3. When an LLM planner is configured, it is the primary decision maker:
 *      routes are passed as hints, and the LLM picks a tool or composes a
 *      natural-language answer. The user sees a conversational reply — never
 *      the internal "Matched route / Planned steps" scaffolding.
 *   4. When the LLM is unavailable (no model, model disabled, or planner
 *      returned null), fall back to the route-driven handlers so the system
 *      stays functional.
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

  // Phase 40 — multi-step goal detection. If the message clearly describes
  // a multi-step workflow (≥2 verbs, "summarize X, Y, and Z"), route straight
  // to the chain orchestrator. We only do this when the chain runtime is
  // configured (runChain dep) and Trust mode is on (chains publish
  // network-wide).
  const multiStep = detectMultiStepGoal(message);
  if (multiStep && deps.runChain && deps.postureEnabled.trustMode && !deps.postureEnabled.autonomousKillSwitch) {
    const started = await deps.runChain({ goal: message, allowLlm: false });
    if (started.ok) {
      toolsUsed.push("mesh.chain.run");
      const subTaskLines = started.subtasks
        .map((s) => `- \`${s.subtaskId}\` (${s.requiredSkill}, depth ${s.depth}): ${s.objective}`)
        .join("\n");
      return {
        answer:
          `Started a **multi-agent chain** to handle this multi-step request.\n\n` +
          `**Chain ID:** \`${started.chainId}\`\n` +
          `**Mandate ID:** \`${started.chainMandateId}\`\n` +
          `**Sub-tasks (${started.subtasks.length}):**\n${subTaskLines}\n\n` +
          `Workers are bidding now. I'll synthesize a final report once they finish. ` +
          `Track progress with \`chainGetState({ chainId: "${started.chainId}" })\` or open the **Chains** view.`,
        domain: "service",
        intent: "task.chain.run",
        toolsUsed,
        jobId: started.chainId,
        correlationId: started.chainId,
      };
    }
    // Fall through to the LLM planner / route handlers if chain start failed.
  }

  // LLM is the primary decision maker when available. The matched routes are
  // passed as context so the LLM can pick the right tool without ever showing
  // the user the internal "Matched route" scaffolding.
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

  // No LLM available — fall back to the route-driven path so legacy flows
  // (document acquisition jobs, social proxy passes, capability provider
  // jobs) still work without a configured model.
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

  const turn = await deps.runDocumentTurn();
  return mapDocumentTurn(turn);
}
