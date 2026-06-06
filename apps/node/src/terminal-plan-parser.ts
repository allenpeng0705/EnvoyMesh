/** Parse numbered plan steps from OpenClaw / LLM free text. */
export function parseNumberedPlanSteps(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const steps: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join(" ").trim();
    if (joined) steps.push(joined);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const numbered = trimmed.match(/^\d+[\.)]\s+(.*)$/);
    if (numbered) {
      flush();
      current.push(numbered[1]!.trim());
      continue;
    }
    if (current.length > 0) {
      current.push(trimmed);
    }
  }
  flush();

  return steps.filter(Boolean).slice(0, 20);
}

export function commandFromPlanStep(step: string): string {
  const trimmed = step.trim();
  const backtick = trimmed.match(/^`([^`]+)`$/);
  if (backtick) return backtick[1]!.trim();
  const inline = trimmed.match(/^run\s+`?([^`]+)`?\s*$/i);
  if (inline) return inline[1]!.trim();
  if (/^(sudo\s+|systemctl\s+|apt\s+|npm\s+|git\s+|docker\s+|kubectl\s+|ls\b|cat\b|pwd\b|cd\b)/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}
