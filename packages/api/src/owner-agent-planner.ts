import type { MatchedAgentCapabilityRoute } from "./capability-intent-routing.js";
import type { DocumentAgentToolResult } from "./document-agent-loop.js";
import type { OwnerAgentTurnResult } from "./owner-agent-loop.js";
import {
  filterOwnerAgentTools,
  findOwnerAgentTool,
  isOwnerAgentToolAllowed,
  type OwnerAgentToolSpec,
} from "./owner-agent-tool-allowlist.js";
import type {
  AnswerFormat,
  OwnerAgentDomain,
  OwnerAgentPostureFlags,
  StructuredBlock,
} from "./owner-agent-types.js";
import { parseStructuredCardFile } from "./answer-block-file.js";

export const OWNER_AGENT_PLANNER_MAX_ROUNDS = 5;

export type OwnerAgentPlannerAction =
  | {
      action: "answer";
      text: string;
      domain?: OwnerAgentDomain;
      format?: AnswerFormat;
      blocks?: StructuredBlock[];
    }
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
  /** Phase 40 — multi-agent chain collaboration. */
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

/**
 * Normalize Markdown text emitted by the planner LLM.
 * Common LLM sloppiness we fix:
 *   - Bullet markers other than "- " (e.g. "• ", "* ", "+ " without space).
 *   - Lists that have lost their blank-line separator from the previous paragraph.
 *   - Stray "\\n" or "\\t" escape sequences that the model wrote as literal text.
 *   - Trailing whitespace and 3+ consecutive blank lines.
 *   - Bold/italic markers with no closing token.
 */
export function cleanPlannerText(input: string): string {
  let text = input;

  // Unescape literal escape sequences the model sometimes writes.
  text = text.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');

  // Normalize bullet markers: at the start of a line, replace "•", "*", or "+"
  // (followed by a space) with "- ". A leading "-" with a space is already
  // correct, so leave it. Also handle "•" with or without a trailing space.
  text = text.replace(/^([\t ]*)[•]( ?)/gm, "$1- ");
  text = text.replace(/^([\t ]*)[*]( )/gm, "$1-$2");
  text = text.replace(/^([\t ]*)[+]( )/gm, "$1-$2");

  // Normalize numbered list markers: ensure "1." is followed by a space.
  text = text.replace(/^(\s*)(\d+)\.(?=\S)/gm, "$1$2. ");

  // Trim trailing whitespace on each line (do this before inserting blank lines
  // so the regex doesn't see phantom whitespace at line ends).
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  // Ensure blank line before a list block (so lists don't fuse into paragraphs).
  // Walk line-by-line: when a list item follows a non-list line, insert a blank
  // line. Consecutive list items keep a single newline between them.
  {
    const lines = text.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const isListItem = /^- |\d+\. /.test(line);
      if (isListItem && out.length > 0) {
        const prevLine = out[out.length - 1] ?? "";
        const prevIsListItem = /^- |\d+\. /.test(prevLine);
        const prevIsBlank = prevLine.trim() === "";
        if (!prevIsListItem && !prevIsBlank) {
          out.push("");
        }
      }
      out.push(line);
    }
    text = out.join("\n");
  }

  // Collapse 3+ blank lines into a single blank line.
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

export function parseStructuredBlocks(value: unknown): StructuredBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks: StructuredBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const obj = item as Record<string, unknown>;
    const type = obj.type;
    if (type === "paragraph" && typeof obj.text === "string" && obj.text.trim()) {
      blocks.push({ type: "paragraph", text: obj.text });
      continue;
    }
    if (type === "list" && Array.isArray(obj.items)) {
      const items = obj.items.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      if (items.length === 0) return undefined;
      const block: StructuredBlock = {
        type: "list",
        items,
        ordered: obj.ordered === true,
        style: obj.style === "check" ? "check" : "bullet",
      };
      blocks.push(block);
      continue;
    }
    if (type === "card" && typeof obj.title === "string" && obj.title.trim()) {
      const file = parseStructuredCardFile(obj.file);
      const card: Extract<StructuredBlock, { type: "card" }> = {
        type: "card",
        title: obj.title.trim(),
        subtitle: typeof obj.subtitle === "string" ? obj.subtitle : undefined,
        meta: Array.isArray(obj.meta)
          ? obj.meta.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          : undefined,
        ...(file ? { file } : {}),
      };
      if (obj.cta && typeof obj.cta === "object" && !Array.isArray(obj.cta)) {
        const cta = obj.cta as Record<string, unknown>;
        if (typeof cta.label === "string" && typeof cta.action === "string") {
          card.cta = { label: cta.label, action: cta.action };
        }
      }
      blocks.push(card);
      continue;
    }
    if (type === "status" && typeof obj.text === "string" && obj.text.trim()) {
      const tone =
        obj.tone === "success" || obj.tone === "warn" || obj.tone === "error" ? obj.tone : "info";
      blocks.push({ type: "status", tone, text: obj.text });
      continue;
    }
    // Unknown block type — bail out so we fall back to plain text.
    return undefined;
  }
  return blocks.length > 0 ? blocks : undefined;
}

function parseAnswerFormat(value: unknown): AnswerFormat | undefined {
  if (value === "plain" || value === "markdown" || value === "structured") return value;
  return undefined;
}

export function parseOwnerAgentPlannerResponse(text: string): OwnerAgentPlannerAction | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const action = parsed.action;
    if (action === "answer" && typeof parsed.text === "string" && parsed.text.trim()) {
      const domain = parsed.domain;
      const format = parseAnswerFormat(parsed.format);
      const blocks = parseStructuredBlocks(parsed.blocks);
      // If the LLM says "structured" but produced no valid blocks, fall back to
      // markdown rather than rendering an empty response.
      const effectiveFormat: AnswerFormat | undefined =
        format === "structured" && !blocks ? "markdown" : format;
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
        format: effectiveFormat,
        blocks,
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

  return `You are the owner's native EnvoyMesh agent. You chat with the owner in plain, friendly language — never expose internal mechanics like "matched route" or "planned steps". Help with friends, documents, peer capabilities, or services — always within policy.

You choose the best format for your reply. Three options:

1. "plain" — short text, a greeting, or a single-fact answer. No formatting. The "text" field carries the reply directly.

   When to use: "Hi!", "What can you do?", a one-sentence confirmation, a short apology.

2. "markdown" — longer text with lists, code, or headings. Rendered as GitHub-Flavored Markdown. In the "text" field:
   - Bulleted list → "- item" (hyphen + space). Do not use "*" or "+".
   - Numbered list → "1. step", "2. step".
   - Code, file paths, peer IDs, owner IDs → wrap in single backticks (e.g. \`envoy:owner:abc123\`).
   - A short heading → "### Group title" — only when you really have multiple sections.
   - Never use raw HTML. Never write "\\n" or "\\t" as literal text.

3. "structured" — distinct UI sections that should not be Markdown-parsed. Use this when the reply is naturally a list of items, contact cards, file cards, or a status update. Provide a "blocks" array.

   When to use: listing files, listing contacts, showing a job status, showing a set of options for the owner to pick from.

   Block types:
   - { "type": "paragraph", "text": "..." } — a short prose line.
   - { "type": "list", "items": ["a", "b"], "ordered": false, "style": "bullet" } — a list. "style" can be "bullet" (default) or "check".
   - { "type": "card", "title": "report.pdf", "subtitle": "PDF · 1.2 MB", "meta": ["path: reports/q1.pdf"], "file": { "source": "vault", "relativePath": "reports/q1.pdf" }, "cta": { "label": "Open", "action": "openLocalFile" } } — a single item card. Include "file" (and optional "cta") when showing a local vault/workspace file the owner can open.
   - { "type": "status", "tone": "info|success|warn|error", "text": "..." } — a status banner.

   If you use "structured", also keep a short "text" (one or two sentences) so the reply still reads naturally if the renderer falls back to plain text.

Respond with a single JSON object only (no prose outside JSON):
{"action":"tool","toolName":"<name>","params":{...}}
or
{"action":"answer","text":"<reply>","domain":"social|document|service|knowledge","format":"plain|markdown|structured","blocks":[...]}

Rules:
- Pick the format that fits the reply: short chat → "plain", explanations with lists → "markdown", distinct UI sections → "structured". When unsure, default to "markdown".
- For casual greetings, small talk, or meta-questions ("hello", "what can you do?"), answer directly with action "answer" — no tool needed.
- Prefer tools when the owner has a concrete task (find a file, search contacts, start a job, share a doc, etc.).
- Use at most one tool per response; the runtime loops until done.
- Never invent peer IDs, file paths, or credentials.
- If a posture is disabled, explain in an answer action instead of calling that tool.
- After a job-style tool ("owner.start_document_acquisition", "owner.run_social_proxy_pass") succeeds, do not call it again. Reply with action "answer" confirming the work has started.
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
    if (toolName === "mesh.chain.run") {
      if (!deps.runChain) {
        return {
          record: { round: 0, toolName, ok: false, summary: "Chain orchestrator not configured" },
        };
      }
      const goal =
        typeof params.goal === "string" && params.goal.trim().length > 0
          ? params.goal.trim()
          : deps.message;
      const maxChainCostUsd =
        typeof params.maxChainCostUsd === "number" ? params.maxChainCostUsd : undefined;
      const costCeilingUsd =
        typeof params.costCeilingUsd === "number" ? params.costCeilingUsd : undefined;
      const assignerPeerId =
        typeof params.assignerPeerId === "string" && params.assignerPeerId.trim()
          ? params.assignerPeerId.trim()
          : undefined;
      try {
        const started = await deps.runChain({
          goal,
          maxChainCostUsd,
          costCeilingUsd,
          allowLlm: false,
          assignerPeerId,
        });
        toolsUsed.push(toolName);
        return {
          record: {
            round: 0,
            toolName,
            ok: started.ok,
            summary: started.ok
              ? started.handedOff
                ? `Chain ${started.chainId} handed off to Assigner ${started.assignerPeerId}`
                : `Chain ${started.chainId} started with ${started.subtasks.length} subtask(s)`
              : `Chain start failed: ${started.error ?? "unknown error"}`,
          },
          jobId: started.ok ? started.chainId : undefined,
          correlationId: started.ok ? started.chainId : undefined,
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
      const cleaned = cleanPlannerText(parsed.text);
      if (deps.scanOutbound && deps.scanOutbound(cleaned)) {
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
        answer: cleaned,
        domain: parsed.domain ?? lastDomain,
        intent: "planner_answer",
        toolsUsed,
        pendingApproval,
        jobId,
        correlationId,
        matchedRoutes: deps.matchedRoutes,
        format: parsed.format,
        blocks: parsed.blocks,
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
