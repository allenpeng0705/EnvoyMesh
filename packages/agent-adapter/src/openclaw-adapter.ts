/**
 * OpenClawAdapter — the canonical `AgentAdapter` for Built-in OpenClaw.
 *
 * **Grounded (2026-08-18):** this adapter does NOT talk to the raw
 * `OpenClawRuntime` child-process class. Production execution goes through
 * the host's existing ask path (`askOpenClawViaRuntime` in
 * `apps/node/src/node-service-openclaw-runtime.ts`), which wires policy
 * prompts + RAG context + the webhook bridge under a per-ask lock. That
 * function is injected as `askViaRuntime`, matching the dependency-injection
 * pattern already used by `createOpenClawChainSubtaskExecutor`.
 *
 * The adapter is deliberately **runtime-agnostic**: it imports no app-level
 * module. The host provides everything runtime-specific via the constructor
 * (`askViaRuntime`, `isReady`, `workerPeerId`, `signResult`).
 *
 * Design doc: `docs/improving-agent-network.en.md` §5.2.
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

/** Skills this adapter advertises on the mesh. Team-job `requiredSkill` tags. */
export const OPENCLAW_SKILLS: SkillDescriptor[] = [
  {
    skillId: "research",
    description: "Research a topic across the node's contacts and knowledge.",
    costCeilingUsd: 5,
    maxSensitivity: "friends",
    tags: ["research", "knowledge"],
  },
  {
    skillId: "summarize",
    description: "Produce a structured summary of a long document or chat thread.",
    costCeilingUsd: 3,
    maxSensitivity: "private",
    tags: ["text", "analysis"],
  },
  {
    skillId: "translate",
    description: "Translate text between natural languages.",
    costCeilingUsd: 2,
    maxSensitivity: "friends",
    tags: ["language", "text"],
  },
  {
    skillId: "draft",
    description: "Draft a message, brief, or report for a Team job.",
    costCeilingUsd: 3,
    maxSensitivity: "private",
    tags: ["text", "writing"],
  },
  // Phase 8 / Step 3 commit 2 — B-class skills are
  // NOT in OPENCLAW_SKILLS in v0. The bridge owns
  // the canonical impl (per Step 3 plan §3.1); the
  // merged manifest's fail-loud policy
  // (`SkillIdCollisionError`) treats duplicate
  // skillIds across runtimes as a hard error. v0
  // exposes the 3 B-class skills on envoy-harness
  // only (8 skills total in `ENVOY_HARNESS_SKILLS`).
  // When the OpenClaw skill handler lands (a future
  // chunk per Step 3 plan §3.6), the 3 B-class
  // skills will move to OpenClaw (envoy-harness loses
  // them) or namespace them under OpenClaw (e.g.
  // `openclaw.setup-sponsor-friend`). The choice
  // depends on Q5 routing — out of Step 3 scope.
];

export interface OpenClawAdapterInput {
  /** Production ask path: prompt → result text (e.g. `askOpenClawViaRuntime`). */
  askViaRuntime: (prompt: string) => Promise<string>;
  /** Readiness probe — same contract as `isOpenClawReady()`. */
  isReady: () => boolean;
  /** The node's agent peerId; stamped into every result. */
  workerPeerId: string;
  /**
   * Sign an unsigned `AgentResult` with the node-controlled signing key.
   * The adapter does not invent or hold a key — the node provisions it.
   */
  signResult: (unsigned: AgentResult) => SignedAgentResult;
  /**
   * Runtime version for the manifest. Either a static string or a resolver.
   * Defaults to `"unknown"` (the real `OpenClawRuntime` has no `version()`).
   */
  runtimeVersion?: string | (() => string | Promise<string>);
  /**
   * Optional prompt builder. Defaults to a Team-job-shaped prompt that
   * mirrors `buildOpenClawSubtaskPrompt`'s core (skill hint + objective +
   * input artifacts). The app may inject the richer builder that also
   * carries constraints / role / thread.
   */
  buildPrompt?: (input: ExecuteInput) => string;
}

/**
 * The canonical OpenClaw adapter. Wraps the host's ask path and produces
 * signed, typed results; carries its own first-cut deterministic verifier.
 */
export class OpenClawAdapter implements AgentAdapter {
  readonly runtime = "openclaw" as const;

  private readonly askViaRuntime: (prompt: string) => Promise<string>;
  private readonly isReady: () => boolean;
  private readonly workerPeerId: string;
  private readonly signResult: (unsigned: AgentResult) => SignedAgentResult;
  private readonly runtimeVersion: string | (() => string | Promise<string>);
  private readonly buildPrompt: (input: ExecuteInput) => string;

  constructor(input: OpenClawAdapterInput) {
    this.askViaRuntime = input.askViaRuntime;
    this.isReady = input.isReady;
    this.workerPeerId = input.workerPeerId;
    this.signResult = input.signResult;
    this.runtimeVersion = input.runtimeVersion ?? "unknown";
    this.buildPrompt = input.buildPrompt ?? defaultOpenClawPrompt;
  }

  describeSkills(): SkillDescriptor[] {
    return OPENCLAW_SKILLS;
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
    const text = (await this.askViaRuntime(prompt)).trim();
    if (input.signal.aborted) {
      throw new Error("MAP execute aborted during run");
    }

    const content: ContentBlock[] = [
      { kind: "text", text, mimeType: "text/markdown" },
    ];
    const metrics: AgentMetrics = {
      durationMs: Date.now() - startedAt,
      costUsd: 0, // askOpenClawViaRuntime does not report per-ask cost today
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
    // First-cut deterministic verifier. Sprint 2 replaces this with the
    // composable rule engine (non-empty / objective-coherence / markdown /
    // owner-topics) — see design §5.3.
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
    return [
      {
        kind: "pass",
        score: 0.85,
        confidence: "medium",
        notes: "non-empty, non-echo result (first-cut verifier)",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Default prompt builder + helpers
// ---------------------------------------------------------------------------

function defaultOpenClawPrompt(input: ExecuteInput): string {
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
    "Produce a clear, useful result for the orchestrator. Be concise and factual.",
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

function firstTextContent(content: readonly ContentBlock[]): string | undefined {
  const block = content.find((b) => b.kind === "text");
  if (!block || block.kind !== "text") return undefined;
  const trimmed = block.text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
