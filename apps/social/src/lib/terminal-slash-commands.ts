export type TerminalPanelMode = "manual" | "agent";

export type TerminalSlashAction =
  | { type: "help" }
  | { type: "manual" }
  | { type: "agent" }
  | { type: "model_show" }
  | { type: "model_list" }
  | { type: "model_set"; modelName: string }
  | { type: "model_default" }
  | { type: "explain"; topic?: string }
  | { type: "suggest_on" }
  | { type: "suggest_off" }
  | { type: "run" }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "history" }
  | { type: "observe" }
  | { type: "openclaw"; prompt: string }
  | { type: "prepare_on" }
  | { type: "prepare_off" }
  | { type: "watch"; goal: string }
  | { type: "pin"; contextSessionId?: string }
  | { type: "step"; stepIndex: number }
  | { type: "goal"; prompt: string }
  | { type: "goal_stop" }
  | { type: "goal_continue" }
  | { type: "watchbg"; goal: string }
  | { type: "watchbg_off" }
  | { type: "exec_on" }
  | { type: "exec_off" }
  | { type: "nl"; prompt: string };

export function parseTerminalSlashCommand(input: string): TerminalSlashAction | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed ? { type: "nl", prompt: trimmed } : null;
  }

  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  const cmd = parts[0]?.toLowerCase() ?? "";
  const rest = parts.slice(1).join(" ").trim();

  switch (cmd) {
    case "help":
      return { type: "help" };
    case "manual":
    case "shell":
      return { type: "manual" };
    case "agent":
      return { type: "agent" };
    case "model":
      if (!rest || rest === "show") return { type: "model_show" };
      if (rest === "list") return { type: "model_list" };
      if (rest === "default") return { type: "model_default" };
      return { type: "model_set", modelName: rest };
    case "explain":
      return { type: "explain", topic: rest || undefined };
    case "suggest":
      if (rest === "off") return { type: "suggest_off" };
      return { type: "suggest_on" };
    case "run":
      return { type: "run" };
    case "confirm":
      return { type: "confirm" };
    case "cancel":
      return { type: "cancel" };
    case "history":
      return { type: "history" };
    case "observe":
      return { type: "observe" };
    case "openclaw":
      if (!rest) return { type: "help" };
      return { type: "openclaw", prompt: rest };
    case "prepare":
      if (rest === "off") return { type: "prepare_off" };
      return { type: "prepare_on" };
    case "watch":
      return { type: "watch", goal: rest || "" };
    case "pin":
      return { type: "pin", contextSessionId: rest || undefined };
    case "step": {
      const index = Number.parseInt(rest, 10);
      if (!Number.isFinite(index) || index < 1) return { type: "help" };
      return { type: "step", stepIndex: index - 1 };
    }
    case "goal":
      if (!rest) return { type: "help" };
      return { type: "goal", prompt: rest };
    case "goalstop":
    case "goal-stop":
      return { type: "goal_stop" };
    case "goalcontinue":
    case "goal-continue":
      return { type: "goal_continue" };
    case "watchbg":
    case "watch-bg":
      if (!rest) return { type: "help" };
      return { type: "watchbg", goal: rest };
    case "watchbgoff":
    case "watchbg-off":
    case "unwatchbg":
      return { type: "watchbg_off" };
    case "exec":
      if (rest === "off") return { type: "exec_off" };
      return { type: "exec_on" };
    default:
      return { type: "nl", prompt: trimmed };
  }
}

export function terminalSlashHelpText(input: {
  mode: TerminalPanelMode;
  modelLabel: string;
  autoRunPolicy: string;
  inlineSuggest: boolean;
}): string {
  return [
    "Terminal Agent commands:",
    "/help — this message",
    "/manual · /shell — switch to Manual mode",
    "/agent — switch to Agent mode",
    "/model — show assist model",
    "/model list — list configured model names",
    "/model <name> — per-session model override",
    "/model default — clear session override",
    "/explain [topic] — summarize scrollback (read-only)",
    "/suggest on · /suggest off — inline completions in Manual mode",
    "/run — execute pending proposal",
    "/confirm — confirm destructive/moderate proposal",
    "/cancel — dismiss pending proposal",
    "/history — recent proposals (metadata)",
    "/observe — wait for output stable, continue last goal",
    "/openclaw <goal> — numbered plan via OpenClaw (home node)",
    "/prepare — enable PS1 markers for exit-code observe",
    "/prepare off — disable prepare mode",
    "/watch [goal] — react to new scrollback (uses last goal if omitted)",
    "/pin [sessionId] — pin another session as read-only context (omit to unpin)",
    "/step <n> — propose command for plan step n (after /openclaw)",
    "/goal <objective> — start goal-driven loop (propose → run → observe)",
    "/goalstop — cancel active goal loop",
    "/goalcontinue — advance goal loop after command runs",
    "/watchbg <goal> — proactive watch: propose when output is stable",
    "/watchbgoff — stop background watch",
    "/exec — enable linked exec pane (agent commands run separately)",
    "/exec off — disable exec pane",
    "Manual xterm (when enabled in Settings): /envoy <prompt> — send to Agent mode",
    "Context markers (read-only, injected into assist prompt):",
    "  @vault:path/to/file.md  @workspace:AGENTS.md  @git:diff|stat|last|status",
    "",
    `Mode: ${input.mode}`,
    `Assist model: ${input.modelLabel}`,
    `Auto-run: ${input.autoRunPolicy}`,
    `Inline suggest: ${input.inlineSuggest ? "on" : "off"}`,
  ].join("\n");
}
