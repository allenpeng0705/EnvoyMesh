/// Terminal Agent slash helpers — mirrors Social `terminal-slash-commands.ts`.

enum TerminalPanelMode { manual, agent }

sealed class TerminalSlashAction {
  const TerminalSlashAction();
}

class TerminalSlashHelp extends TerminalSlashAction {
  const TerminalSlashHelp();
}

class TerminalSlashManual extends TerminalSlashAction {
  const TerminalSlashManual();
}

class TerminalSlashAgent extends TerminalSlashAction {
  const TerminalSlashAgent();
}

class TerminalSlashModelShow extends TerminalSlashAction {
  const TerminalSlashModelShow();
}

class TerminalSlashModelList extends TerminalSlashAction {
  const TerminalSlashModelList();
}

class TerminalSlashModelSet extends TerminalSlashAction {
  const TerminalSlashModelSet(this.modelName);
  final String modelName;
}

class TerminalSlashModelDefault extends TerminalSlashAction {
  const TerminalSlashModelDefault();
}

class TerminalSlashExplain extends TerminalSlashAction {
  const TerminalSlashExplain(this.topic);
  final String? topic;
}

class TerminalSlashSuggestOn extends TerminalSlashAction {
  const TerminalSlashSuggestOn();
}

class TerminalSlashSuggestOff extends TerminalSlashAction {
  const TerminalSlashSuggestOff();
}

class TerminalSlashRun extends TerminalSlashAction {
  const TerminalSlashRun();
}

class TerminalSlashConfirm extends TerminalSlashAction {
  const TerminalSlashConfirm();
}

class TerminalSlashCancel extends TerminalSlashAction {
  const TerminalSlashCancel();
}

class TerminalSlashHistory extends TerminalSlashAction {
  const TerminalSlashHistory();
}

class TerminalSlashObserve extends TerminalSlashAction {
  const TerminalSlashObserve();
}

class TerminalSlashOpenClaw extends TerminalSlashAction {
  const TerminalSlashOpenClaw(this.prompt);
  final String prompt;
}

class TerminalSlashPrepareOn extends TerminalSlashAction {
  const TerminalSlashPrepareOn();
}

class TerminalSlashPrepareOff extends TerminalSlashAction {
  const TerminalSlashPrepareOff();
}

class TerminalSlashWatch extends TerminalSlashAction {
  const TerminalSlashWatch(this.goal);
  final String goal;
}

class TerminalSlashPin extends TerminalSlashAction {
  const TerminalSlashPin(this.contextSessionId);
  final String? contextSessionId;
}

class TerminalSlashStep extends TerminalSlashAction {
  const TerminalSlashStep(this.stepIndex);
  final int stepIndex;
}

class TerminalSlashGoal extends TerminalSlashAction {
  const TerminalSlashGoal(this.prompt);
  final String prompt;
}

class TerminalSlashGoalStop extends TerminalSlashAction {
  const TerminalSlashGoalStop();
}

class TerminalSlashGoalContinue extends TerminalSlashAction {
  const TerminalSlashGoalContinue();
}

class TerminalSlashWatchBg extends TerminalSlashAction {
  const TerminalSlashWatchBg(this.goal);
  final String goal;
}

class TerminalSlashWatchBgOff extends TerminalSlashAction {
  const TerminalSlashWatchBgOff();
}

class TerminalSlashExecOn extends TerminalSlashAction {
  const TerminalSlashExecOn();
}

class TerminalSlashExecOff extends TerminalSlashAction {
  const TerminalSlashExecOff();
}

class TerminalSlashNl extends TerminalSlashAction {
  const TerminalSlashNl(this.prompt);
  final String prompt;
}

TerminalSlashAction? parseTerminalSlashCommand(String input) {
  final trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return trimmed.isNotEmpty ? TerminalSlashNl(trimmed) : null;
  }

  final parts =
      trimmed.substring(1).split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  final cmd = parts.isEmpty ? '' : parts.first.toLowerCase();
  final rest = parts.skip(1).join(' ').trim();

  switch (cmd) {
    case 'help':
      return const TerminalSlashHelp();
    case 'manual':
    case 'shell':
      return const TerminalSlashManual();
    case 'agent':
      return const TerminalSlashAgent();
    case 'model':
      if (rest.isEmpty || rest == 'show') return const TerminalSlashModelShow();
      if (rest == 'list') return const TerminalSlashModelList();
      if (rest == 'default') return const TerminalSlashModelDefault();
      return TerminalSlashModelSet(rest);
    case 'explain':
      return TerminalSlashExplain(rest.isEmpty ? null : rest);
    case 'suggest':
      if (rest == 'off') return const TerminalSlashSuggestOff();
      return const TerminalSlashSuggestOn();
    case 'run':
      return const TerminalSlashRun();
    case 'confirm':
      return const TerminalSlashConfirm();
    case 'cancel':
      return const TerminalSlashCancel();
    case 'history':
      return const TerminalSlashHistory();
    case 'observe':
      return const TerminalSlashObserve();
    case 'openclaw':
      if (rest.isEmpty) return const TerminalSlashHelp();
      return TerminalSlashOpenClaw(rest);
    case 'prepare':
      if (rest == 'off') return const TerminalSlashPrepareOff();
      return const TerminalSlashPrepareOn();
    case 'watch':
      return TerminalSlashWatch(rest);
    case 'pin':
      return TerminalSlashPin(rest.isEmpty ? null : rest);
    case 'step':
      final index = int.tryParse(rest);
      if (index == null || index < 1) return const TerminalSlashHelp();
      return TerminalSlashStep(index - 1);
    case 'goal':
      if (rest.isEmpty) return const TerminalSlashHelp();
      return TerminalSlashGoal(rest);
    case 'goalstop':
    case 'goal-stop':
      return const TerminalSlashGoalStop();
    case 'goalcontinue':
    case 'goal-continue':
      return const TerminalSlashGoalContinue();
    case 'watchbg':
    case 'watch-bg':
      if (rest.isEmpty) return const TerminalSlashHelp();
      return TerminalSlashWatchBg(rest);
    case 'watchbgoff':
    case 'watchbg-off':
    case 'unwatchbg':
      return const TerminalSlashWatchBgOff();
    case 'exec':
      if (rest == 'off') return const TerminalSlashExecOff();
      return const TerminalSlashExecOn();
    default:
      return TerminalSlashNl(trimmed);
  }
}

/// Autocomplete catalog for Terminal Agent slash commands.
const terminalAgentSlashCatalog = <Map<String, String>>[
  {'slash': '/help', 'summary': 'List Terminal Agent commands'},
  {'slash': '/manual', 'summary': 'Switch to Manual mode'},
  {'slash': '/agent', 'summary': 'Switch to Agent mode'},
  {'slash': '/model', 'summary': 'Show assist model', 'argsHint': '[list|default|<name>]'},
  {'slash': '/explain', 'summary': 'Summarize scrollback', 'argsHint': '[topic]'},
  {'slash': '/suggest', 'summary': 'Inline completions', 'argsHint': 'on|off'},
  {'slash': '/run', 'summary': 'Execute pending proposal'},
  {'slash': '/confirm', 'summary': 'Confirm pending proposal'},
  {'slash': '/cancel', 'summary': 'Dismiss pending proposal'},
  {'slash': '/history', 'summary': 'Recent proposals'},
  {'slash': '/observe', 'summary': 'Wait for output stable, continue goal'},
  {'slash': '/openclaw', 'summary': 'Numbered plan via OpenClaw', 'argsHint': '<goal>'},
  {'slash': '/prepare', 'summary': 'PS1 markers for observe', 'argsHint': '[off]'},
  {'slash': '/watch', 'summary': 'React to new scrollback', 'argsHint': '[goal]'},
  {'slash': '/pin', 'summary': 'Pin another session as context', 'argsHint': '[sessionId]'},
  {'slash': '/step', 'summary': 'Propose command for plan step', 'argsHint': '<n>'},
  {'slash': '/goal', 'summary': 'Start goal-driven loop', 'argsHint': '<objective>'},
  {'slash': '/goalstop', 'summary': 'Cancel active goal loop'},
  {'slash': '/goalcontinue', 'summary': 'Advance goal loop after run'},
  {'slash': '/watchbg', 'summary': 'Background watch when stable', 'argsHint': '<goal>'},
  {'slash': '/watchbgoff', 'summary': 'Stop background watch'},
  {'slash': '/exec', 'summary': 'Linked exec pane', 'argsHint': '[off]'},
];

List<Map<String, String>> filterTerminalAgentSlashCommands(String value) {
  if (!RegExp(r'^/\S*$').hasMatch(value)) return const [];
  final prefix = value.toLowerCase();
  return terminalAgentSlashCatalog
      .where((c) => (c['slash'] ?? '').toLowerCase().startsWith(prefix))
      .toList();
}

String terminalSlashHelpText({
  required TerminalPanelMode mode,
  required String modelLabel,
  String autoRunPolicy = 'ask',
  bool inlineSuggest = false,
}) {
  return [
    'Terminal Agent commands:',
    '/help — this message',
    '/manual · /shell — switch to Manual mode',
    '/agent — switch to Agent mode',
    '/model — show assist model',
    '/model list — list configured model names',
    '/model <name> — per-session model override',
    '/model default — clear session override',
    '/explain [topic] — summarize scrollback (read-only)',
    '/suggest on · /suggest off — inline completions in Manual mode',
    '/run — execute pending proposal',
    '/confirm — confirm destructive/moderate proposal',
    '/cancel — dismiss pending proposal',
    '/history — recent proposals (metadata)',
    '/observe — wait for output stable, continue last goal',
    '/openclaw <goal> — numbered plan via OpenClaw (home node)',
    '/prepare — enable PS1 markers for exit-code observe',
    '/prepare off — disable prepare mode',
    '/watch [goal] — react to new scrollback (uses last goal if omitted)',
    '/pin [sessionId] — pin another session as read-only context (omit to unpin)',
    '/step <n> — propose command for plan step n (after /openclaw)',
    '/goal <objective> — start goal-driven loop (propose → run → observe)',
    '/goalstop — cancel active goal loop',
    '/goalcontinue — advance goal loop after command runs',
    '/watchbg <goal> — proactive watch: propose when output is stable',
    '/watchbgoff — stop background watch',
    '/exec — enable linked exec pane (agent commands run separately)',
    '/exec off — disable exec pane',
    '',
    'Mode: ${mode == TerminalPanelMode.agent ? 'agent' : 'manual'}',
    'Assist model: $modelLabel',
    'Auto-run: $autoRunPolicy',
    'Inline suggest: ${inlineSuggest ? 'on' : 'off'}',
  ].join('\n');
}
