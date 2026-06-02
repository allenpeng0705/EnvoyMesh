import type { MatchedAgentCapabilityRoute } from "./capability-intent-routing.js";
import type { DocumentAgentToolResult } from "./document-agent-loop.js";
import type { OwnerAgentTurnResult } from "./owner-agent-loop.js";
import {
  filterOwnerAgentTools,
  findOwnerAgentTool,
  isOwnerAgentToolAllowed,
  type OwnerAgentToolSpec,
} from "./owner-agent-tool-allowlist.js";
import type { OwnerAgentDomain } from "./owner-agent-types.js";
import type { OwnerAgentPostureFlags } from "./owner-agent-types.js";

export const OWNER_AGENT_PLANNER_MAX_ROUNDS = 5;

export type OwnerAgentPlannerAction =
  | { action: "answer"; text: string; domain?: OwnerAgentDomain }
  | { action: "tool"; toolName: string; params?: Record<string, unknown> };

export interface OwnerAgentPlannerTurnRecord {
  round: number;
  toolName?: string;
  ok?: boolean;
  summary: string;
}

export interface OwnerAgentPlannerDeps {
  message: string;
  postureEnabled: OwnerAgentPostureFlags;
  matchedRoutes: MatchedAgentCapabilityRoute[];
  agentIdentitySection?: string;
  allowedTools?: OwnerAgentToolSpec[];
  askPlanner: (prompt: string) => Promise<string | null>;
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<DocumentAgentToolResult>;
  startDocumentAcquisitionJob?: (query: string) => Promise<{ jobId: string; correlationId: string }>;
  runSocialProxyPass?: () => Promise<{ ok: boolean; error?: string; correlationId?: string }>;
  scanOutbound?: (text: string) => boolean;
  /** Phase 18B — audit each planner round (including job tools not routed via executeTool). */
  auditPlannerRound?: (record: OwnerAgentPlannerTurnRecord) => Promise<void>;
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

export function parseOwnerAgentPlannerResponse(text: string): OwnerAgentPlannerAction | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const action = parsed.action;
    if (action === "answer" && typeof parsed.text === "string" && parsed.text.trim()) {
      const domain = parsed.domain;
      return {
        action: "answer",
        text: parsed.text.trim(),
        domain:
          domain === "social" ||
          domain === "document" ||
          domain === "service" ||
          domain === "knowledge"
            ? domain
            : undefined,
      };
    }
    if (action === "tool" && typeof parsed.toolName === "string" && parsed.toolName.trim()) {
      const params =
        parsed.params && typeof parsed.params === "object" && !Array.isArray(parsed.params)
          ? (parsed.params as Record<string, unknown>)
          : {};
      return { action: "tool", toolName: parsed.toolName.trim(), params };
    }
  } catch {
    return null;
  }
  return null;
}

export function buildOwnerAgentPlannerPrompt(input: {
  message: string;
  tools: OwnerAgentToolSpec[];
  routes: MatchedAgentCapabilityRoute[];
  history: OwnerAgentPlannerTurnRecord[];
  agentIdentitySection?: string;
}): string {
  const toolLines = input.tools
    .map(
      (t) =>
        `- ${t.name} (${t.domain}): ${t.description}${t.paramHint ? ` Params: ${t.paramHint}` : ""}`,
    )
    .join("\n");

  const routeLines =
    input.routes.length > 0
      ? input.routes
          .map(
            (r) =>
              `- ${r.routeId} (${r.domain}, score ${r.score}): ${r.label}`,
          )
          .join("\n")
      : "(none)";

  const historyLines =
    input.history.length > 0
      ? input.history.map((h) => `Round ${h.round}: ${h.summary}`).join("\n")
      : "(none yet)";

  return `You are the owner's native EnvoyMesh agent. Choose tools to help with friends, documents, peer capabilities, or services — always within policy.

Respond with a single JSON object only (no prose outside JSON):
{"action":"tool","toolName":"<name>","params":{...}}
or
{"action":"answer","text":"<reply>","domain":"social|document|service|knowledge"}

Rules:
- Prefer tools over guessing. Use at most one tool per response; the runtime loops until done.
- Never invent peer IDs, file paths, or credentials.
- If a posture is disabled, explain in an answer action instead of calling that tool.
- When tool results are enough, respond with action "answer".
${input.agentIdentitySection ?? ""}

Matched workflow routes:
${routeLines}

Allowed tools:
${toolLines}

Prior tool rounds:
${historyLines}

Owner request:
${input.message.trim()}`;
}

function summarizeToolResult(toolName: string, result: DocumentAgentToolResult): string {
  if (!result.ok) {
    return `${toolName} failed: ${result.error ?? "unknown error"}`;
  }
  const payload =
    result.result === undefined
      ? "ok"
      : typeof result.result === "string"
        ? result.result.slice(0, 500)
        : JSON.stringify(result.result).slice(0, 500);
  return `${toolName} ok: ${payload}`;
}

function domainFromTool(toolName: string): OwnerAgentDomain {
  const spec = findOwnerAgentTool(toolName);
  return spec?.domain ?? "knowledge";
}

async function executeOwnerAgentTool(
  deps: OwnerAgentPlannerDeps,
  toolName: string,
  params: Record<string, unknown>,
  toolsUsed: string[],
): Promise<{ record: OwnerAgentPlannerTurnRecord; pendingApproval?: boolean; jobId?: string; correlationId?: string }> {
  const spec = findOwnerAgentTool(toolName);
  if (!spec || !isOwnerAgentToolAllowed(toolName, deps.postureEnabled)) {
    return {
      record: {
        round: 0,
        toolName,
        ok: false,
        summary: `${toolName} is not allowed or not available with current settings`,
      },
    };
  }

  if (deps.postureEnabled.autonomousKillSwitch && spec.kind === "job") {
    return {
      record: {
        round: 0,
        toolName,
        ok: false,
        summary: "Autonomous kill switch is on — job tools blocked",
      },
    };
  }

  if (spec.kind === "job") {
    if (toolName === "owner.start_document_acquisition") {
      if (!deps.startDocumentAcquisitionJob) {
        return {
          record: { round: 0, toolName, ok: false, summary: "Document acquisition not configured" },
        };
      }
      const query = typeof params.query === "string" ? params.query.trim() : deps.message;
      try {
        const started = await deps.startDocumentAcquisitionJob(query || deps.message);
        toolsUsed.push(toolName);
        return {
          record: {
            round: 0,
            toolName,
            ok: true,
            summary: `Started document acquisition job ${started.jobId}`,
          },
          jobId: started.jobId,
          correlationId: started.correlationId,
        };
      } catch (err) {
        return {
          record: {
            round: 0,
            toolName,
            ok: false,
            summary: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }
    if (toolName === "owner.run_social_proxy_pass") {
      if (!deps.runSocialProxyPass) {
        return {
          record: { round: 0, toolName, ok: false, summary: "Social proxy not configured" },
        };
      }
      const pass = await deps.runSocialProxyPass();
      toolsUsed.push(toolName);
      return {
        record: {
          round: 0,
          toolName,
          ok: pass.ok,
          summary: pass.ok
            ? `Social proxy pass started${pass.correlationId ? ` (${pass.correlationId})` : ""}`
            : `Social proxy failed: ${pass.error ?? "unknown"}`,
        },
        correlationId: pass.correlationId,
      };
    }
  }

  if (deps.scanOutbound && deps.scanOutbound(JSON.stringify(params))) {
    return {
      record: {
        round: 0,
        toolName,
        ok: false,
        summary: `${toolName} blocked: params failed egress safety scan`,
      },
    };
  }

  const result = await deps.executeTool(toolName, params);
  toolsUsed.push(toolName);
  const pendingApproval = !result.ok && /approval/i.test(result.error ?? "");
  return {
    record: {
      round: 0,
      toolName,
      ok: result.ok,
      summary: summarizeToolResult(toolName, result),
    },
    pendingApproval,
  };
}

/**
 * Bounded LLM + tool loop for owner agent (Phase 18B).
 * Returns null when the planner is unavailable (caller should fall back).
 */
export async function runOwnerAgentPlannerLoop(
  deps: OwnerAgentPlannerDeps,
): Promise<OwnerAgentTurnResult | null> {
  const tools = deps.allowedTools ?? filterOwnerAgentTools(deps.postureEnabled);
  const history: OwnerAgentPlannerTurnRecord[] = [];
  const toolsUsed: string[] = [];
  let lastDomain: OwnerAgentDomain = "knowledge";
  let jobId: string | undefined;
  let correlationId: string | undefined;
  let pendingApproval = false;

  for (let round = 1; round <= OWNER_AGENT_PLANNER_MAX_ROUNDS; round += 1) {
    const prompt = buildOwnerAgentPlannerPrompt({
      message: deps.message,
      tools,
      routes: deps.matchedRoutes,
      history,
      agentIdentitySection: deps.agentIdentitySection,
    });

    const raw = await deps.askPlanner(prompt);
    if (raw === null) {
      return null;
    }

    const parsed = parseOwnerAgentPlannerResponse(raw);
    if (!parsed) {
      const invalidRecord: OwnerAgentPlannerTurnRecord = {
        round,
        summary: "Planner returned invalid JSON; retrying",
      };
      history.push(invalidRecord);
      await deps.auditPlannerRound?.(invalidRecord);
      continue;
    }

    if (parsed.action === "answer") {
      if (deps.scanOutbound && deps.scanOutbound(parsed.text)) {
        return {
          answer:
            "I cannot show that response — it failed outbound safety checks. Try rephrasing your request.",
          domain: "knowledge",
          intent: "planner_blocked",
          toolsUsed,
          pendingApproval,
          jobId,
          correlationId,
          matchedRoutes: deps.matchedRoutes,
        };
      }
      return {
        answer: parsed.text,
        domain: parsed.domain ?? lastDomain,
        intent: "planner_answer",
        toolsUsed,
        pendingApproval,
        jobId,
        correlationId,
        matchedRoutes: deps.matchedRoutes,
      };
    }

    lastDomain = domainFromTool(parsed.toolName);
    const executed = await executeOwnerAgentTool(
      deps,
      parsed.toolName,
      parsed.params ?? {},
      toolsUsed,
    );
    const roundRecord = { ...executed.record, round };
    history.push(roundRecord);
    await deps.auditPlannerRound?.(roundRecord);
    if (executed.jobId) jobId = executed.jobId;
    if (executed.correlationId) correlationId = executed.correlationId;
    if (executed.pendingApproval) pendingApproval = true;
  }

  return {
    answer:
      toolsUsed.length > 0
        ? `I used ${toolsUsed.length} tool step(s) but need a clearer goal to finish. Check **Activity** or **Inbox** for pending work.`
        : "I could not plan the next step. Try enabling the relevant posture in Settings → AI, or rephrase your request.",
    domain: lastDomain,
    intent: "planner_exhausted",
    toolsUsed,
    pendingApproval,
    jobId,
    correlationId,
    matchedRoutes: deps.matchedRoutes,
  };
}
