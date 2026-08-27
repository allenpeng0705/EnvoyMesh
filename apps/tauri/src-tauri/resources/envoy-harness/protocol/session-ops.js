/**
 * Shared session operations for protocol + REPL parity
 * (review, init, summarize, plan, memory formatting).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { applyTransition, createPlanState, PlanTransitionError, } from "../plan/index.js";
import { runGitDiff } from "./git-runner.js";
const SUMMARIZE_SYSTEM = "You are a session summarizer. Summarize the dropped conversation below into 2-4 sentences, preserving decisions, file paths, and unresolved questions. Output ONLY the summary.";
const INIT_SYSTEM_PROMPT = `You are an AGENTS.md generator.
Examine the current working directory and write a concise AGENTS.md (max 200 lines) that captures:
- The project's purpose (what it does, in 1-2 sentences)
- The tech stack (language, framework, key dependencies)
- The build / test / lint commands
- Code style conventions (if you can infer them)
- Anything unusual about the project that an AI agent would need to know.

Output ONLY the AGENTS.md content (markdown). No preamble.`;
const INIT_USER_PROMPT = "Examine the current working directory and write an AGENTS.md.";
const REVIEW_SYSTEM_PROMPT = `You are a code reviewer for a software project.
Examine the provided git diff carefully and write a structured review with findings, missing tests, style notes, and an overall summary.
Be specific. Quote relevant code. Do NOT write preamble — start with findings.`;
const REVIEW_MAX_DIFF_CHARS = 200_000;
function extractText(content) {
    return content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
}
/** LLM summarizer for compact --summarize (REPL parity). */
export async function summarizeDroppedMessages(agent, dropped) {
    const text = dropped
        .map((m) => `${m.role}: ${JSON.stringify(m.content)}`)
        .join("\n");
    const result = await agent.getModel().complete({
        messages: [
            {
                role: "system",
                content: [{ type: "text", text: SUMMARIZE_SYSTEM }],
            },
            { role: "user", content: [{ type: "text", text }] },
        ],
        tools: [],
    });
    return extractText(result.content);
}
/** Model review of git diff (REPL /review parity). */
export async function runSessionReview(agent, cwd, staged) {
    const diff = runGitDiff(cwd, { staged });
    if (diff.stderr.length > 0 && diff.exitCode !== 0 && diff.exitCode !== 1) {
        throw new Error(diff.stderr.trim());
    }
    const stdout = diff.stdout.trim();
    if (stdout.length === 0) {
        return "no changes to review";
    }
    let diffText = stdout;
    if (diffText.length > REVIEW_MAX_DIFF_CHARS) {
        diffText =
            diffText.slice(0, REVIEW_MAX_DIFF_CHARS) +
                `\n\n[truncated to ${REVIEW_MAX_DIFF_CHARS} chars]`;
    }
    const result = await agent.getModel().complete({
        messages: [
            {
                role: "system",
                content: [{ type: "text", text: REVIEW_SYSTEM_PROMPT }],
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Examine the following git diff and write the code review.\n\n${diffText}`,
                    },
                ],
            },
        ],
        tools: [],
    });
    const review = extractText(result.content);
    if (review.length === 0) {
        throw new Error("model returned no review text");
    }
    return review;
}
/** Generate AGENTS.md (REPL /init parity). */
export async function runSessionInit(agent, cwd) {
    if (agent.getPermissionMode() === "read-only") {
        throw new Error("session is read-only (use /sandbox workspace-write first)");
    }
    const target = path.join(cwd, "AGENTS.md");
    const result = await agent.getModel().complete({
        messages: [
            {
                role: "system",
                content: [{ type: "text", text: INIT_SYSTEM_PROMPT }],
            },
            { role: "user", content: [{ type: "text", text: INIT_USER_PROMPT }] },
        ],
        tools: [],
    });
    const text = extractText(result.content);
    if (text.length === 0) {
        throw new Error("model returned no text");
    }
    await fs.writeFile(target, text + "\n", "utf-8");
    const lines = text.split("\n").length;
    return {
        path: target,
        lines,
        preview: `wrote AGENTS.md: ${target} (${lines} lines)`,
    };
}
/** Plan lifecycle (REPL /plan parity). */
export function runPlanAction(session, action, text, reason) {
    const current = session.getPlan() ?? createPlanState();
    try {
        switch (action) {
            case "enter": {
                const next = applyTransition(current, { kind: "enter" });
                session.setPlan(next);
                return `plan mode: entered (status: ${next.reviewStatus})`;
            }
            case "show": {
                if (!current.active) {
                    return "(no active plan; use /plan enter to start)";
                }
                if (current.planText.length === 0) {
                    return `(plan is empty, status: ${current.reviewStatus}; use /plan edit <text>)`;
                }
                const rej = current.rejectionReason
                    ? `, rejected: ${current.rejectionReason}`
                    : "";
                return [
                    `--- plan (${current.reviewStatus}, updated ${current.updatedAt}${rej}) ---`,
                    current.planText,
                    "---",
                ].join("\n");
            }
            case "edit": {
                if (text === undefined || text.length === 0) {
                    throw new Error("usage: /plan edit <text>");
                }
                const next = applyTransition(current, {
                    kind: "edit",
                    planText: text,
                });
                session.setPlan(next);
                return `plan updated (${text.length} chars, status reverted to draft)`;
            }
            case "propose": {
                const next = applyTransition(current, { kind: "propose" });
                session.setPlan(next);
                return `plan proposed (status: ${next.reviewStatus})`;
            }
            case "approve": {
                const next = applyTransition(current, { kind: "approve" });
                session.setPlan(next);
                return "plan approved (injected on next model call)";
            }
            case "reject": {
                const transition = reason !== undefined && reason.length > 0
                    ? { kind: "reject", reason }
                    : { kind: "reject" };
                const next = applyTransition(current, transition);
                session.setPlan(next);
                return reason !== undefined && reason.length > 0
                    ? `plan rejected: ${reason}`
                    : "plan rejected";
            }
            case "exit": {
                const next = applyTransition(current, { kind: "exit" });
                session.setPlan(next);
                return "plan mode: exited (plan preserved for audit)";
            }
            default:
                throw new Error(`unknown plan action: ${action}`);
        }
    }
    catch (err) {
        if (err instanceof PlanTransitionError) {
            throw new Error(err.message);
        }
        throw err;
    }
}
export function formatSubagentRecords(records) {
    if (records.length === 0) {
        return "no sub-agents spawned in this session";
    }
    const running = records.filter((r) => r.status === "running").length;
    const lines = [
        `sub-agents: ${records.length} (${running} running)`,
        ...records.map((r) => {
            const icon = r.status === "running"
                ? "▶"
                : r.status === "completed"
                    ? "✓"
                    : r.status === "failed"
                        ? "✗"
                        : "?";
            const short = r.sessionId.length > 8
                ? `${r.sessionId.slice(0, 8)}…`
                : r.sessionId;
            const cost = r.costUsd !== undefined ? ` $${r.costUsd.toFixed(4)}` : "";
            const dur = r.durationMs !== undefined ? ` ${(r.durationMs / 1000).toFixed(1)}s` : "";
            const obj = r.objective.length > 50
                ? `${r.objective.slice(0, 50)}…`
                : r.objective;
            return `  ${icon}  ${r.capabilityTag}  ${short}${cost}${dur}  ${obj}`;
        }),
    ];
    return lines.join("\n");
}
export async function runMemoryOp(store, op, name, body) {
    switch (op) {
        case "list": {
            const list = await store.list();
            if (list.length === 0)
                return "(no memories)";
            return list
                .map((m) => {
                const tags = m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
                return `- ${m.name}${tags} — ${m.title}`;
            })
                .join("\n");
        }
        case "read": {
            if (name === undefined)
                throw new Error("usage: /memory read <name>");
            const mem = await store.read(name);
            if (mem === undefined)
                throw new Error(`memory not found: ${name}`);
            return `# ${mem.title}\n\n${mem.body}`;
        }
        case "add": {
            if (name === undefined || body === undefined || body.length === 0) {
                throw new Error("usage: /memory add <name> <body>");
            }
            const title = name
                .replace(/[-_]+/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());
            await store.write({
                name,
                title,
                tags: [],
                created: new Date().toISOString().slice(0, 10),
                body,
            });
            return `added: ${name}`;
        }
        default:
            throw new Error(`unknown memory op: ${op}`);
    }
}
export function formatPlanState(plan) {
    if (plan === undefined || !plan.active) {
        return "(no active plan)";
    }
    return `plan: ${plan.reviewStatus}, ${plan.planText.length} chars`;
}
//# sourceMappingURL=session-ops.js.map