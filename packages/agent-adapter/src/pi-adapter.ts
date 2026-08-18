/**
 * PiAdapter — the `AgentAdapter` for the Pi runtime (in-process CLI coding
 * agent).
 *
 * Unlike OpenClaw (an LLM chat surface), Pi acts on the filesystem: it reads
 * files, runs commands, and proposes edits. The adapter's verifier therefore
 * looks for *behavioral* failure modes instead of prose quality:
 *
 * - **Loop detection** — the same tool with identical args called
 *   `PI_LOOP_THRESHOLD`+ times means Pi is spinning (e.g. re-reading a file).
 * - **Command sequence** — destructive commands (`rm -rf`, `git reset --hard`,
 *   `DROP TABLE`, …) in the trace are an instant fail.
 *
 * The host injects the run path (`runPi`) and the signer (`signResult`),
 * matching the DI pattern of `OpenClawAdapter`; the adapter never imports a
 * runtime-specific module. The `trace` is carried inside a `structured` block
 * (`envoymesh://pi/run/v1`) so the verifier can audit it from the result alone.
 *
 * Design doc: `docs/improving-agent-network.en.md` §5.3 (PiAdapter sketch).
 */

import type {
  AgentMetrics,
  AgentResult,
  CapabilityManifest,
  ContentBlock,
  NamedArtifact,
  SignedAgentResult,
  SkillDescriptor,
  Verdict,
} from "@envoymesh/protocol";
import type {
  AgentAdapter,
  BuildManifestInput,
  ExecuteInput,
  VerifyInput,
} from "./agent-adapter.js";

/** Skills this adapter advertises on the mesh. */
export const PI_SKILLS: SkillDescriptor[] = [
  {
    skillId: "code_review",
    description: "Review a code change for correctness, risk, and test coverage.",
    costCeilingUsd: 4,
    maxSensitivity: "friends",
    tags: ["code", "review"],
  },
  {
    skillId: "debug",
    description: "Investigate a failing test or stack trace and propose a fix.",
    costCeilingUsd: 5,
    maxSensitivity: "private",
    tags: ["code", "debug"],
  },
  {
    skillId: "refactor",
    description: "Restructure a module while preserving its behavior.",
    costCeilingUsd: 5,
    maxSensitivity: "private",
    tags: ["code", "refactor"],
  },
];

/** Schema ref on the structured block that carries Pi's run trace. */
export const PI_RESULT_SCHEMA_REF = "envoymesh://pi/run/v1";

/** Loop detection threshold: same tool + same args ≥ this count → fail. */
export const PI_LOOP_THRESHOLD = 5;

/** One recorded tool call in Pi's trace. */
export interface PiTraceCall {
  tool: string;
  /** Arguments for that call (e.g. a file path, a shell command). */
  args?: Record<string, unknown>;
}

/** What the host's Pi run path returns. */
export interface PiRunResult {
  /** Human-readable narrative of what Pi did. */
  summary: string;
  /** Optional structured outputs (files written, diffs, findings). */
  outputs?: Record<string, unknown>;
  /** The tool-call trace Pi executed — audited by the Pi verifier. */
  trace?: PiTraceCall[];
}

export interface PiAdapterInput {
  /** Production run path: objective → Pi's result (e.g. a `PiRuntime.prompt` adapter). */
  runPi: (input: { objective: string; prompt: string; signal: AbortSignal }) => Promise<PiRunResult>;
  /** Readiness probe — same contract as `isReady()` for the Pi runtime. */
  isReady: () => boolean;
  /** The node's agent peerId; stamped into every result. */
  workerPeerId: string;
  /** Sign an unsigned `AgentResult` with the node-controlled signing key. */
  signResult: (unsigned: AgentResult) => SignedAgentResult;
  /** Runtime version for the manifest. Defaults to `"unknown"`. */
  runtimeVersion?: string | (() => string | Promise<string>);
  /** Optional prompt builder. Defaults to a Team-job-shaped prompt. */
  buildPrompt?: (input: ExecuteInput) => string;
}

/**
 * The Pi adapter. Wraps the host's run path, produces signed typed results,
 * and carries a first-cut behavioral verifier (loop + command-sequence rules).
 */
export class PiAdapter implements AgentAdapter {
  readonly runtime = "pi" as const;

  private readonly runPi: PiAdapterInput["runPi"];
  private readonly isReady: () => boolean;
  private readonly workerPeerId: string;
  private readonly signResult: (unsigned: AgentResult) => SignedAgentResult;
  private readonly runtimeVersion: string | (() => string | Promise<string>);
  private readonly buildPrompt: (input: ExecuteInput) => string;

  constructor(input: PiAdapterInput) {
    this.runPi = input.runPi;
    this.isReady = input.isReady;
    this.workerPeerId = input.workerPeerId;
    this.signResult = input.signResult;
    this.runtimeVersion = input.runtimeVersion ?? "unknown";
    this.buildPrompt = input.buildPrompt ?? defaultPiPrompt;
  }

  describeSkills(): SkillDescriptor[] {
    return PI_SKILLS;
  }

  async buildManifest(input: BuildManifestInput): Promise<CapabilityManifest> {
    const raw =
      typeof this.runtimeVersion === "function"
        ? await this.runtimeVersion()
        : this.runtimeVersion;
    return {
      runtime: this.runtime,
      runtimeVersion: raw || "unknown",
      peerId: input.peerId,
      ownerId: input.ownerId,
      skills: this.describeSkills(),
      reputationBySkill: input.reputationBySkill,
      issuedAt: new Date().toISOString(),
      ttlSeconds: 300,
    };
  }

  async execute(input: ExecuteInput): Promise<SignedAgentResult> {
    if (input.signal.aborted) {
      throw new Error("MAP execute aborted before start");
    }
    const prompt = this.buildPrompt(input);
    const startedAt = Date.now();
    const run = await this.runPi({
      objective: input.objective,
      prompt,
      signal: input.signal,
    });
    if (input.signal.aborted) {
      throw new Error("MAP execute aborted during run");
    }

    const content: ContentBlock[] = [
      { kind: "text", text: run.summary.trim(), mimeType: "text/markdown" },
    ];
    if (run.trace && run.trace.length > 0) {
      content.push({
        kind: "structured",
        schemaRef: PI_RESULT_SCHEMA_REF,
        data: {
          summary: run.summary,
          trace: run.trace,
          ...(run.outputs !== undefined ? { outputs: run.outputs } : {}),
        },
      });
    }

    const metrics: AgentMetrics = {
      durationMs: Date.now() - startedAt,
      costUsd: 0, // Pi runs on local hardware; no metered spend today
    };
    const unsigned: AgentResult = {
      skillId: input.skillId,
      runtime: this.runtime,
      peerId: this.workerPeerId,
      correlationId: input.correlationId,
      content,
      citations: [],
      metrics,
      completedAt: new Date().toISOString(),
    };
    return this.signResult(unsigned);
  }

  async verify(input: VerifyInput): Promise<Verdict[]> {
    const text = firstTextContent(input.result.content);
    if (!text) {
      return [
        { kind: "fail", reason: "result contains no text content", rollback: true },
      ];
    }
    if (text === input.objective.trim()) {
      return [
        {
          kind: "fail",
          reason: "result merely echoes the objective verbatim",
          rollback: true,
        },
      ];
    }

    const trace = extractPiTrace(input.result.content);
    if (trace) {
      const loop = detectLoop(trace);
      if (loop) return [loop];
      const destructive = detectDestructiveCommand(trace);
      if (destructive) return [destructive];
      return [
        {
          kind: "pass",
          score: 0.85,
          confidence: "medium",
          notes: "non-empty, non-echo result; no Pi loop or destructive command sequence",
        },
      ];
    }
    return [
      {
        kind: "pass",
        score: 0.8,
        confidence: "low",
        notes: "non-empty, non-echo result; no tool trace to audit (first-cut verifier)",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Verifier rules
// ---------------------------------------------------------------------------

/**
 * `LoopDetectionVerifier` — the same tool with identical args invoked
 * `PI_LOOP_THRESHOLD`+ times is a loop (design §5.3: "did the same file get
 * read 5 times?").
 */
export function detectLoop(trace: readonly PiTraceCall[]): Verdict | undefined {
  const counts = new Map<string, { tool: string; count: number }>();
  for (const call of trace) {
    const key = `${call.tool}:${stableStringify(call.args)}`;
    const slot = counts.get(key) ?? { tool: call.tool, count: 0 };
    slot.count += 1;
    counts.set(key, slot);
  }
  for (const [key, slot] of counts) {
    if (slot.count >= PI_LOOP_THRESHOLD) {
      return {
        kind: "fail",
        reason: `loop detected: tool '${slot.tool}' invoked ${slot.count} times with identical arguments (${key.slice(0, 120)})`,
        rollback: true,
      };
    }
  }
  return undefined;
}

/** Destructive command / tool patterns Pi must never run unattended. */
const DESTRUCTIVE_TOOLS = new Set([
  "rm",
  "rmdir",
  "del",
  "format",
  "mkfs",
  "dd",
  "shutdown",
  "reboot",
]);

/** Substring patterns inside shell-command args that are instant fails. */
const DESTRUCTIVE_ARG_PATTERNS = [
  /(^|[\s;&|])(rm\s+-rf|rm\s+-r|rm\s+-\w*f)/i,
  /(^|[\s;&|])git\s+reset\s+--hard/i,
  /(^|[\s;&|])git\s+clean\s+-\w*f/i,
  /\bdrop\s+table\b/i,
  /\btruncate\b/i,
  /\b:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/i, // fork bomb
];

/**
 * `CommandSequenceVerifier` — a destructive tool or shell pattern in the
 * trace is an instant fail (design §5.3: "was the right tool called?").
 * Patterns are matched against the raw string argument values (not the
 * JSON rendering, where surrounding quote characters would hide matches).
 */
export function detectDestructiveCommand(
  trace: readonly PiTraceCall[],
): Verdict | undefined {
  for (const call of trace) {
    if (DESTRUCTIVE_TOOLS.has(call.tool.toLowerCase())) {
      return {
        kind: "fail",
        reason: `destructive command in Pi trace: tool '${call.tool}'${call.args ? ` ${stableStringify(call.args).slice(0, 120)}` : ""}`,
        rollback: true,
      };
    }
    if (call.args) {
      const values: string[] = [];
      collectStringArgs(call.args, values);
      for (const value of values) {
        for (const pattern of DESTRUCTIVE_ARG_PATTERNS) {
          if (pattern.test(value)) {
            return {
              kind: "fail",
              reason: `destructive command in Pi trace: ${pattern.source} in ${value.slice(0, 120)}`,
              rollback: true,
            };
          }
        }
      }
    }
  }
  return undefined;
}

/** Collect every string leaf under an args object for pattern matching. */
function collectStringArgs(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStringArgs(v, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStringArgs(v, out);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPiTrace(content: readonly ContentBlock[]): readonly PiTraceCall[] | undefined {
  for (const block of content) {
    if (block.kind !== "structured") continue;
    if (!block.schemaRef.startsWith("envoymesh://pi/")) continue;
    const data = block.data as { trace?: unknown } | undefined;
    const trace = data?.trace;
    if (!Array.isArray(trace)) return undefined;
    const calls: PiTraceCall[] = [];
    for (const entry of trace) {
      if (!entry || typeof entry !== "object") continue;
      const tool = (entry as { tool?: unknown }).tool;
      if (typeof tool !== "string" || !tool) continue;
      const args = (entry as { args?: unknown }).args;
      calls.push({
        tool,
        ...(args && typeof args === "object" ? { args: args as Record<string, unknown> } : {}),
      });
    }
    return calls.length > 0 ? calls : undefined;
  }
  return undefined;
}

function stableStringify(value: unknown): string {
  try {
    if (value === undefined) return "";
    if (typeof value !== "object" || value === null) return String(value);
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = (value as Record<string, unknown>)[key];
    }
    return JSON.stringify(sorted);
  } catch {
    return String(value);
  }
}

function firstTextContent(content: readonly ContentBlock[]): string | undefined {
  const block = content.find((b) => b.kind === "text");
  if (!block || block.kind !== "text") return undefined;
  const trimmed = block.text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Default prompt builder
// ---------------------------------------------------------------------------

function defaultPiPrompt(input: ExecuteInput): string {
  const parts = [
    "You are a Team job worker on the EnvoyMesh Agent Network.",
    `Required skill hint: ${input.skillId}`,
    `Objective:\n${input.objective}`,
  ];
  if (input.inputArtifacts.length > 0) {
    const lines = input.inputArtifacts
      .map((n) => `- ${n.key}: ${describeArtifact(n)}`)
      .join("\n");
    parts.push(`Input artifacts:\n${lines}`);
  }
  parts.push(
    "Work on the repository, then report a concise summary of what you changed or concluded.",
  );
  return parts.join("\n\n");
}

function describeArtifact(named: NamedArtifact): string {
  const a = named.artifact;
  if (a && typeof a === "object") {
    const kind = (a as { kind?: unknown }).kind;
    if (kind === "text") {
      const content = (a as { content?: string }).content ?? "";
      return content.length > 2000 ? `${content.slice(0, 2000)}…` : content;
    }
    if (kind === "file") {
      return `path: ${(a as { vaultPath?: string }).vaultPath ?? "?"}`;
    }
    if (kind === "structured") {
      const data = (a as { data?: unknown }).data;
      try {
        const json = JSON.stringify(data);
        return json.length > 2000 ? `${json.slice(0, 2000)}…` : json;
      } catch {
        return "structured (unserializable)";
      }
    }
  }
  return "unknown";
}
