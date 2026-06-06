import { z } from "zod";

import type { TerminalCommandRiskTier } from "@envoymesh/api";

export const TerminalCommandProposalSchema = z.object({
  command: z.string().min(1).max(4096),
  riskTier: z.enum(["safe", "moderate", "destructive"]).optional(),
  rationale: z.string().max(2000).optional(),
  requiresConfirmation: z.boolean().optional(),
});

export type ParsedTerminalCommandProposal = z.infer<typeof TerminalCommandProposalSchema>;

const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bpoweroff\b/i,
  /\bhalt\b/i,
  /\brm\s+-[^\s]*r[^\s]*f\b/i,
  /\brm\s+-[^\s]*f[^\s]*r\b/i,
  /\brm\s+-rf\b/i,
  /\brm\s+-fr\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bDELETE\s+FROM\s+\S+\s*;\s*$/i,
  /\bkill\s+-9\b/i,
  /\bkillall\b/i,
  /\bwipefs\b/i,
  /\bfdisk\b/i,
  /\bformat\s+[a-z]:/i,
  /\bchmod\s+-R\s+777\s+\/\b/,
  /\b:\(\)\{\s*:\|:&\s*\};:/,
];

const MODERATE_PATTERNS: readonly RegExp[] = [
  /\bsudo\b/i,
  /\bsu\s+-/i,
  /\bapt(-get)?\s+(install|remove|purge|upgrade)\b/i,
  /\byum\s+(install|remove|update)\b/i,
  /\bdnf\s+(install|remove|update)\b/i,
  /\bbrew\s+(install|uninstall|upgrade)\b/i,
  /\bnpm\s+install\s+-g\b/i,
  /\bpip\s+install\b/i,
  /\bcurl\s+[^\n|]*\|\s*(ba)?sh\b/i,
  /\bwget\s+[^\n|]*\|\s*(ba)?sh\b/i,
  /\bsystemctl\s+(stop|restart|disable|mask)\b/i,
  /\bservice\s+\S+\s+(stop|restart)\b/i,
  /\bgit\s+push\s+[^\n]*--force\b/i,
  /\bgit\s+push\s+[^\n]*-f\b/i,
  /\bchmod\s+[0-7]{3,4}\b/i,
  /\bchown\b/i,
  /\bmv\s+\/[^\s]+\s+\/[^\s]+/i,
  /\bscp\b/i,
  /\brsync\b/i,
];

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export function parseTerminalCommandProposal(
  raw: string,
): { ok: true; proposal: ParsedTerminalCommandProposal } | { ok: false; reason: string } {
  const jsonText = extractJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: "terminal.agent.invalidJson" };
  }

  const result = TerminalCommandProposalSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "terminal.agent.invalidProposal" };
  }

  if (!result.data.command.trim()) {
    return { ok: false, reason: "terminal.agent.missingCommand" };
  }

  return { ok: true, proposal: result.data };
}

/** Best-effort command extraction when the model returns prose instead of JSON. */
export function inferTerminalCommandFallback(raw: string, userPrompt: string): string | null {
  const fenced = raw.match(/```(?:bash|sh|shell|zsh)?\s*\n?([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const line = fenced[1]
      .split("\n")
      .map((row) => row.trim())
      .find((row) => row && !row.startsWith("#"));
    if (line) return line;
  }

  const inline = raw.match(/`([^`\n]+)`/);
  if (inline?.[1]?.trim()) {
    return inline[1].trim();
  }

  const prompt = userPrompt.toLowerCase();
  if (/openclaw/.test(prompt) && /version/.test(prompt)) {
    return "openclaw --version";
  }

  return null;
}

export function classifyTerminalCommandRisk(command: string): TerminalCommandRiskTier {
  const normalized = command.trim();
  if (!normalized) {
    return "moderate";
  }
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(normalized)) {
      return "destructive";
    }
  }
  for (const pattern of MODERATE_PATTERNS) {
    if (pattern.test(normalized)) {
      return "moderate";
    }
  }
  return "safe";
}

export function requiresConfirmationForRisk(
  tier: TerminalCommandRiskTier,
  autoRunPolicy: import("@envoymesh/api").TerminalAutoRunPolicy = "always-confirm",
): boolean {
  if (tier === "safe") {
    return autoRunPolicy === "always-confirm" || autoRunPolicy === "off";
  }
  return true;
}

export function compileTerminalCommandPatterns(patterns: readonly string[] | undefined): RegExp[] {
  if (!patterns?.length) return [];
  const compiled: RegExp[] = [];
  for (const raw of patterns) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      compiled.push(new RegExp(trimmed, "i"));
    } catch {
      //
    }
  }
  return compiled;
}

export function matchesAnyPattern(command: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(command));
}

export function resolveProposalRisk(
  command: string,
  modelHint?: TerminalCommandRiskTier,
  options?: {
    allowPatterns?: readonly RegExp[];
    denyPatterns?: readonly RegExp[];
    destructivePatterns?: readonly RegExp[];
    autoRunPolicy?: import("@envoymesh/api").TerminalAutoRunPolicy;
  },
): { riskTier: TerminalCommandRiskTier; requiresConfirmation: boolean } {
  const normalized = command.trim();
  const denyPatterns = options?.denyPatterns ?? [];
  const allowPatterns = options?.allowPatterns ?? [];
  const autoRunPolicy = options?.autoRunPolicy ?? "always-confirm";

  if (denyPatterns.length > 0 && matchesAnyPattern(normalized, denyPatterns)) {
    return { riskTier: "destructive", requiresConfirmation: true };
  }

  const extraDestructive = options?.destructivePatterns ?? [];
  if (extraDestructive.length > 0 && matchesAnyPattern(normalized, extraDestructive)) {
    return { riskTier: "destructive", requiresConfirmation: true };
  }

  let riskTier = classifyTerminalCommandRisk(normalized);
  if (riskTier === "safe" && modelHint === "destructive") {
    riskTier = "destructive";
  } else if (riskTier === "safe" && modelHint === "moderate") {
    riskTier = "moderate";
  }

  if (allowPatterns.length > 0 && matchesAnyPattern(normalized, allowPatterns)) {
    riskTier = "safe";
  }

  return {
    riskTier,
    requiresConfirmation: requiresConfirmationForRisk(riskTier, autoRunPolicy),
  };
}
