/**
 * Local verifier scoreboard (design §9.1).
 *
 * Append-only, owner-signed, per-(node, runtime) ledger of verifier-ruleset
 * evolution experiments. This is the *store* for Penguin's 5-step protocol
 * (SNAPSHOT → HYPOTHESIZE → CANDIDATE → EVALUATE → COMMIT/REVERT) applied at
 * the agent-runtime level: each `kept` / `reverted` row records a ruleset
 * experiment with its before/after pass rates.
 *
 * The LLM-driven EVALUATE step ("re-run 50 tasks with the candidate ruleset")
 * is the deferred part of self-evolution; what lands here is the durable,
 * audit-ready ledger that step reads and writes.
 *
 * Contamination guard (Penguin discipline): entries carry only the hypothesis
 * and aggregate pass rates — never the private rubric.
 *
 * Design doc: `docs/improving-agent-network.en.md` §9.1.
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { AgentRuntimeSchema, type AgentRuntime } from "@envoymesh/protocol";
import { verifyCanonicalPayload } from "@envoymesh/identity";

export const VerifierScoreboardEntrySchema = z.object({
  /** Monotonically increasing per runtime. */
  version: z.number().int().positive(),
  runtime: AgentRuntimeSchema,
  /** The experiment's hypothesis (why this ruleset change was tried). */
  hypothesis: z.string().min(1),
  /** Hash of the verifier ruleset under test. */
  rulesetHash: z.string().min(1),
  meanScore: z.number().min(0).max(1),
  passRateBefore: z.number().min(0).max(1),
  passRateAfter: z.number().min(0).max(1),
  nRuns: z.number().int().nonnegative(),
  /** `kept` = COMMIT, `reverted` = REVERT. */
  status: z.enum(["kept", "reverted"]),
  /** Ed25519 of the owner over the canonical JSON of the rest of the entry. */
  ownerSignature: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type VerifierScoreboardEntry = z.infer<typeof VerifierScoreboardEntrySchema>;

/** Strip the owner signature for signing / verification. */
export function forScoreboardSigning(
  entry: VerifierScoreboardEntry,
): Omit<VerifierScoreboardEntry, "ownerSignature"> {
  const { ownerSignature: _ownerSignature, ...unsigned } = entry;
  return unsigned;
}

/** Next version in the per-runtime sequence (for adopters of pulled rules). */
export function nextScoreboardVersion(latest: VerifierScoreboardEntry | null): number {
  return (latest?.version ?? 0) + 1;
}

const MAX_JSONL_LINE_CHARS = 1_000_000;

export interface VerifierScoreboardOptions {
  /** `~/.envoymesh/agent-state/<peer>/verifier-scoreboard.jsonl` */
  filePath: string;
  /** The owner public key PEM — entries must verify against it. */
  ownerPublicKeyPem: string;
}

/**
 * Append-only local scoreboard. `append` rejects entries that are not
 * owner-signed or that regress the per-runtime version sequence.
 */
export class VerifierScoreboard {
  private readonly appendQueued: (value: unknown) => Promise<void>;
  private readonly filePath: string;
  private readonly ownerPublicKeyPem: string;

  constructor(opts: VerifierScoreboardOptions) {
    this.filePath = opts.filePath;
    this.ownerPublicKeyPem = opts.ownerPublicKeyPem;
    this.appendQueued = createSerialJsonlAppender(this.filePath);
  }

  /**
   * Append an owner-signed entry. Verifies the signature against the owner
   * public key and enforces `version > latest(version)` for the runtime.
   */
  async append(entry: VerifierScoreboardEntry): Promise<VerifierScoreboardEntry> {
    const parsed = VerifierScoreboardEntrySchema.parse(entry);
    if (
      !verifyCanonicalPayload(
        forScoreboardSigning(parsed),
        parsed.ownerSignature,
        this.ownerPublicKeyPem,
      )
    ) {
      throw new Error("scoreboard entry is not signed by the owner");
    }
    const latest = await this.latest(parsed.runtime);
    if (latest && parsed.version <= latest.version) {
      throw new Error(
        `scoreboard version regressed for runtime=${parsed.runtime}: ${parsed.version} <= ${latest.version}`,
      );
    }
    await this.appendQueued(parsed);
    return parsed;
  }

  /** All entries, oldest first. Malformed lines are skipped, not fatal. */
  async readAll(): Promise<VerifierScoreboardEntry[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (err) {
      if (isMissingFileError(err)) return [];
      throw err;
    }
    const out: VerifierScoreboardEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(VerifierScoreboardEntrySchema.parse(JSON.parse(trimmed)));
      } catch {
        // Skip corrupt lines — the ledger must stay readable.
      }
    }
    return out;
  }

  /** Latest entry for a runtime (or `null` when none exist). */
  async latest(runtime: AgentRuntime): Promise<VerifierScoreboardEntry | null> {
    const entries = await this.readAll();
    const scoped = entries.filter((e) => e.runtime === runtime);
    if (scoped.length === 0) return null;
    return scoped[scoped.length - 1]!;
  }
}

function createSerialJsonlAppender(path: string): (value: unknown) => Promise<void> {
  let tail: Promise<unknown> = Promise.resolve();
  return (value: unknown) => {
    const done = tail.then(() => appendJsonLine(path, value));
    tail = done.then(
      () => {},
      () => {},
    );
    return done;
  };
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  const line = JSON.stringify(value);
  if (line.length > MAX_JSONL_LINE_CHARS) {
    throw new Error(`JSONL record exceeds MAX_JSONL_LINE_CHARS (${MAX_JSONL_LINE_CHARS})`);
  }
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.appendFile(path, `${line}\n`, { mode: 0o600 });
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
