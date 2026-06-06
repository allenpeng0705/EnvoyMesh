export interface TerminalFailureDetection {
  failed: boolean;
  snippet?: string;
  reason?: string;
}

const FAILURE_PATTERNS: RegExp[] = [
  /\berror:/i,
  /\bFAILED\b/,
  /\bTraceback\b/,
  /npm ERR!/,
  /pnpm ERR!/,
  /\bELIFECYCLE\b/,
  /Command failed with exit code [1-9]\d*/,
  /\[envoy-prepare exit:([1-9]|\d{2,})\]/,
  /CategoryInfo\s*:.*Error/i,
  /AssertionError/,
  /panic:/,
  /\bFATAL\b/,
  /\bFAIL\b.*\btest/i,
];

export function detectTerminalFailure(
  scrollback: string,
  options?: { prepareModeEnabled?: boolean; tailBytes?: number },
): TerminalFailureDetection {
  void options?.prepareModeEnabled;
  const tailBytes = options?.tailBytes ?? 4000;
  const tail = scrollback.slice(-tailBytes);
  const lines = tail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const recentLines = lines.slice(-40).join("\n");

  for (const pattern of FAILURE_PATTERNS) {
    const match = recentLines.match(pattern);
    if (!match) continue;
    const idx = recentLines.indexOf(match[0]);
    const snippet = recentLines.slice(Math.max(0, idx - 120), idx + 320).trim();
    return { failed: true, snippet, reason: match[0].slice(0, 80) };
  }

  return { failed: false };
}

const GOAL_STOP_WORDS = new Set([
  "check",
  "show",
  "get",
  "print",
  "display",
  "what",
  "which",
  "verify",
  "confirm",
  "tell",
  "find",
  "look",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "about",
  "version",
  "versions",
  "how",
  "many",
  "much",
  "does",
  "have",
  "has",
  "is",
  "are",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function goalKeywords(goal: string): string[] {
  return goal
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !GOAL_STOP_WORDS.has(word));
}

function isInformationalGoal(goal: string): boolean {
  const goalLower = goal.toLowerCase();
  return (
    /\b(check|show|get|print|display|what(?:'s| is)|which|verify|confirm|tell me|find out|look up)\b/i.test(goalLower) ||
    /\bversion\b/i.test(goalLower) ||
    /\bhow many\b/i.test(goalLower)
  );
}

function hasVersionLikeOutput(text: string): boolean {
  return /\b(?:v?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?|\d{4}\.\d+(?:\.\d+)?)\b/.test(text);
}

function detectInformationalGoalSuccess(scrollback: string, goal: string): boolean {
  if (!isInformationalGoal(goal)) return false;

  const tail = scrollback.slice(-4000);
  const keywords = goalKeywords(goal);

  if (/\bversion\b/i.test(goal)) {
    if (!hasVersionLikeOutput(tail)) return false;
    if (keywords.length === 0) return true;
    return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(tail));
  }

  if (keywords.length === 0) return false;
  const matchedKeywords = keywords.filter((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(tail),
  );
  if (matchedKeywords.length === 0) return false;

  const contentLines = tail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^envoy>/i.test(line));
  return contentLines.some((line) => line.length >= 3);
}

export function detectGoalSuccess(scrollback: string, goal: string): boolean {
  const tail = scrollback.slice(-4000);
  if (detectTerminalFailure(tail).failed) return false;

  if (detectInformationalGoalSuccess(scrollback, goal)) {
    return true;
  }

  const goalLower = goal.toLowerCase();
  const successIntent = /green|pass|passing|succeed|success|done|complete|until ok/i.test(goalLower);
  if (!successIntent) return false;

  return (
    /\ball tests passed\b/i.test(tail) ||
    /\btests passed\b/i.test(tail) ||
    /\b0 failed\b/i.test(tail) ||
    /\b0 errors\b/i.test(tail) ||
    /\bbuild succeeded\b/i.test(tail) ||
    /\bSUCCESS\b/.test(tail)
  );
}
