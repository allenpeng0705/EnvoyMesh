const MAX_SCROLLBACK_CHARS = 24_000;

/** Remove control chars that fail the model semantic firewall (keep tab/LF/CR). */
export function stripDisallowedTerminalControlChars(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      out += text[index]!;
    }
  }
  return out;
}

/** Strip ANSI escape sequences and collapse excessive blank lines. */
export function scrubTerminalScrollback(raw: string): string {
  const withoutAnsi = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  const normalized = withoutAnsi.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cleaned = stripDisallowedTerminalControlChars(normalized);
  const collapsed = cleaned.replace(/\n{51,}/g, "\n".repeat(50));
  if (collapsed.length <= MAX_SCROLLBACK_CHARS) {
    return collapsed;
  }
  return collapsed.slice(-MAX_SCROLLBACK_CHARS);
}

export function detectShellContext(scrollback: string, shell?: string): {
  likelyRemoteSsh: boolean;
  likelyPowerShell: boolean;
  promptHint?: string;
} {
  const tail = scrollback.slice(-4000);
  const shellLower = shell?.toLowerCase() ?? "";
  const likelyPowerShell =
    shellLower.includes("powershell") ||
    shellLower.includes("pwsh") ||
    /\bPS [A-Z]:\\/.test(tail) ||
    /CategoryInfo\s*:/.test(tail);
  const sshMatch = tail.match(/(?:root|ubuntu|ec2-user|admin)@[^\s:]+[:#$]\s*[^\n]*$/m);
  const localMatch = tail.match(/(?:^|\n)[^\s@]+@[^\s:]+[:#$]\s*[^\n]*$/m);
  const psMatch = tail.match(/(?:^|\n)PS [^\n]+>\s*[^\n]*$/m);
  const promptHint = sshMatch?.[0]?.trim() ?? psMatch?.[0]?.trim() ?? localMatch?.[0]?.trim();
  return {
    likelyRemoteSsh: Boolean(sshMatch),
    likelyPowerShell,
    promptHint,
  };
}

export function buildTerminalAssistPrompt(input: {
  scrollback: string;
  userPrompt: string;
  cwd?: string;
  shell?: string;
  contextBlock?: string;
}): string {
  const scrubbed = scrubTerminalScrollback(input.scrollback);
  const context = detectShellContext(scrubbed, input.shell);
  const cwdLine = input.cwd ? `Working directory (spawn): ${input.cwd}` : "";
  const shellLine = input.shell ? `Shell: ${input.shell}` : "";
  const promptLine = context.promptHint ? `Latest prompt line: ${context.promptHint}` : "";
  const remoteLine = context.likelyRemoteSsh
    ? "Context: likely SSH remote session (infer OS/package manager from scrollback)."
    : context.likelyPowerShell
      ? "Context: PowerShell session — use PowerShell cmdlets/syntax when appropriate (Get-ChildItem, Select-String, etc.)."
      : "Context: local Unix-like shell session.";
  const contextBlock = input.contextBlock?.trim() ? `${input.contextBlock.trim()}\n\n` : "";

  return `You are a terminal command assistant for EnvoyMesh. The user operates a real shell in a PTY.

Your job: propose exactly ONE shell command to satisfy the user's request.

Rules:
- Respond with JSON ONLY — no markdown fences, no prose outside JSON.
- Schema: {"command":"...","rationale":"...","riskTier":"safe|moderate|destructive","requiresConfirmation":boolean}
- "command" must be a single line suitable for PTY stdin (may include && or ; but no newlines).
- Prefer read-only diagnostics before destructive actions.
- Never propose exfiltration, credential harvesting, or unrelated mesh/network actions.
- Use scrollback context (paths, errors, package manager, remote host) when inferring commands.
- riskTier is a hint only; the server re-classifies risk deterministically.

${remoteLine}
${cwdLine}
${shellLine}
${promptLine}

${contextBlock}Recent terminal scrollback (oldest truncated):
---
${scrubbed || "(empty)"}
---

User request:
${input.userPrompt.trim()}

JSON response:`;
}

export function buildTerminalExplainPrompt(input: {
  scrollback: string;
  topic?: string;
  cwd?: string;
}): string {
  const scrubbed = scrubTerminalScrollback(input.scrollback);
  const topicLine = input.topic?.trim()
    ? `Focus on: ${input.topic.trim()}`
    : "Summarize what happened recently in the terminal.";

  return `You are a read-only terminal analyst for EnvoyMesh. Explain recent terminal output to the owner.

Rules:
- Plain text only — no shell commands, no JSON, no "run this" suggestions.
- Be concise (2-6 sentences).
- Do not invent output not present in scrollback.

${input.cwd ? `Spawn cwd: ${input.cwd}` : ""}
${topicLine}

Scrollback:
---
${scrubbed || "(empty)"}
---

Explanation:`;
}

const MAX_TURN_HISTORY_CHARS = 4000;

export function squashTerminalTurnHistory(
  turns: readonly { role: string; text: string }[],
): string {
  if (turns.length === 0) return "";
  const lines = turns.map((turn) => `${turn.role}: ${turn.text.trim()}`);
  const joined = lines.join("\n");
  if (joined.length <= MAX_TURN_HISTORY_CHARS) {
    return joined;
  }
  if (turns.length <= 2) {
    return joined.slice(-MAX_TURN_HISTORY_CHARS);
  }
  const head = lines.slice(0, 1).join("\n");
  const tail = lines.slice(-3).join("\n");
  const omitted = turns.length - 4;
  const squashed = `${head}\n… (${omitted} earlier turns omitted) …\n${tail}`;
  return squashed.slice(-MAX_TURN_HISTORY_CHARS);
}

export function buildTerminalSuggestPrompt(input: {
  scrollback: string;
  partialInput: string;
  cwd?: string;
  shell?: string;
}): string {
  const scrubbed = scrubTerminalScrollback(input.scrollback);
  const partial = input.partialInput.trim();
  if (!partial) {
    return "";
  }

  return `You complete shell commands for EnvoyMesh terminal assist.

Rules:
- Respond with JSON ONLY: {"completion":"full command","suggestions":["alt1","alt2"]}
- "completion" must start with or contain the user's partial input when sensible.
- Prefer safe read-only commands when ambiguous.
- Single line only; no newlines.

Partial input: ${partial}
${input.cwd ? `Cwd: ${input.cwd}` : ""}
${input.shell ? `Shell: ${input.shell}` : ""}

Scrollback tail:
---
${scrubbed.slice(-6000) || "(empty)"}
---

JSON:`;
}
