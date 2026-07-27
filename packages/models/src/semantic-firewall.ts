/** Hard cap for model-bound prompts (characters, not bytes). */
export const MAX_MODEL_PROMPT_CHARS = 48_000;

/** Max text scanned for egress secrets (planner/model answers). */
const MAX_EGRESS_SCAN_CHARS = 16_384;

/** Stop after this many pattern hits to avoid regex runaway on long prose. */
const MAX_EGRESS_MATCHES = 32;

/** Max matches collected per pattern (overlapping patterns like BIP39). */
const MAX_MATCHES_PER_PATTERN = 8;

/** Max consecutive newline characters after normalization (DoS / log spam guard). */
const MAX_CONSECUTIVE_NEWLINES = 50;

export type SemanticFirewallResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** Result of egress content scanning — checks for secret material before outbound send. */
export type EgressScanResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; matches: EgressSecretMatch[] };

/** A detected secret pattern in egress content. */
export interface EgressSecretMatch {
  pattern: string;
  description: string;
  index: number;
  length: number;
}

/**
 * Deterministic, non-LLM checks on text before it is passed to any model provider.
 * Intended as a first line of defense against trivial injection and malformed input.
 *
 * For model *output* tool-call arguments, see `evaluateToolCallFirewall` in `tool-call-firewall.ts`.
 */
export function evaluateSemanticFirewall(input: { text: string }): SemanticFirewallResult {
  const text = input.text;

  if (text.trim().length === 0) {
    return { ok: false, reason: "prompt is empty" };
  }

  if (text.length > MAX_MODEL_PROMPT_CHARS) {
    return { ok: false, reason: `prompt exceeds max length (${MAX_MODEL_PROMPT_CHARS})` };
  }

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return { ok: false, reason: "prompt contains disallowed control characters" };
    }
    if (code === 127) {
      return { ok: false, reason: "prompt contains disallowed control characters" };
    }
  }

  const normalized = collapseLongNewlineRuns(text, MAX_CONSECUTIVE_NEWLINES);
  return { ok: true, text: normalized };
}

function collapseLongNewlineRuns(source: string, maxRun: number): string {
  if (maxRun < 1) {
    return source;
  }

  const pattern = new RegExp(`\n{${maxRun + 1},}`, "g");
  return source.replace(pattern, "\n".repeat(maxRun));
}

// ─── Egress scanning for secrets ────────────────────────────────────────────────

/** Pattern groups for secret detection. Each entry has a human-readable description. */
const EGRESS_SECRET_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // PEM-encoded private key blocks
  {
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]{1,200}?-----END \1?PRIVATE KEY-----/,
    description: "PEM private key block",
  },
  // AWS access key + secret (combined)
  {
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}:[0-9A-Za-z\/+=]{40,}/,
    description: "AWS access key + secret",
  },
  // AWS secret access key (standalone)
  {
    pattern: /(?<![0-9A-Za-z])sk(?![0-9A-Za-z])[0-9A-Za-z\/+=]{32,}(?![0-9A-Za-z\/+=])/,
    description: "AWS secret access key",
  },
  // Generic API key / bearer token
  {
    pattern: /(?<![0-9A-Za-z])[0-9A-Za-z]{20,80}(?![0-9A-Za-z\/+=])(?<![a-z])(?:api[_-]?key|apikey|secret[_-]?key|bearer|token|auth)[^0-9A-Za-z]{0,10}[0-9A-Za-z]{20,80}(?![0-9A-Za-z\/+=])/i,
    description: "API key or bearer token",
  },
  // Connection string with password
  {
    pattern: /(?:postgres|mysql|mongodb|redis|amqp|ssh|ftp):\/\/[^\s:]+:[^@\s]+@[^\s]+/,
    description: "Connection string with credentials",
  },
  // GitHub / GitLab / generic personal access token
  {
    pattern: /(?<![0-9A-Za-z])(?:ghp|gho|ghu|ghs|ghr|glpat|gitlab|password|passwd|secret)[^0-9A-Za-z]{0,5}[0-9A-Za-z_]{20,80}(?![0-9A-Za-z])/i,
    description: "Personal access token",
  },
  // BIP39 seed phrase (12–24 lowercase words on one line — avoid prose backtracking)
  {
    pattern: /^(?:[a-z]{3,}\s+){11,23}[a-z]{3,}$/im,
    description: "Possible seed phrase (requires manual review)",
  },
  // JSON Web Token (header.payload.signature)
  {
    pattern: /eyJ[0-9A-Za-z_-]*\.eyJ[0-9A-Za-z_-]*\.[0-9A-Za-z_-]*/,
    description: "JSON Web Token (JWT)",
  },
  // Generic secret embedded in config
  {
    pattern: /(?<![0-9A-Za-z"'])(?:password|passwd|secret|private|token|api[_-]?key)\s*[=:]\s*["']?[0-9A-Za-z_!@#$%^&*-]{8,64}["']?/i,
    description: "Embedded secret in config-like text",
  },
];

/**
 * Scan outbound content for obvious secret material before sending.
 * Used as a second line of defense — model outputs, tool results, and chat
 * messages are scanned before egress.
 *
 * Returns `ok: true` with the original text if nothing suspicious is found.
 * Returns `ok: false` with match details if secrets are detected.
 */
export function evaluateEgressContent(input: { text: string }): EgressScanResult {
  const text = (input.text ?? "").slice(0, MAX_EGRESS_SCAN_CHARS);
  if (text.trim().length === 0) {
    return { ok: true, text: input.text ?? "" };
  }

  const matches: EgressSecretMatch[] = [];

  for (const { pattern, description } of EGRESS_SECRET_PATTERNS) {
    let match: RegExpExecArray | null;
    let patternMatches = 0;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        pattern: description,
        description,
        index: match.index,
        length: match[0].length,
      });
      patternMatches += 1;
      if (patternMatches >= MAX_MATCHES_PER_PATTERN || matches.length >= MAX_EGRESS_MATCHES) {
        break;
      }
      if (match.index === pattern.lastIndex) {
        pattern.lastIndex += 1;
      }
    }
    if (matches.length >= MAX_EGRESS_MATCHES) {
      break;
    }
  }

  if (matches.length > 0) {
    return {
      ok: false,
      reason: `egress content contains ${matches.length} secret-like pattern(s); review required`,
      matches,
    };
  }

  return { ok: true, text };
}
