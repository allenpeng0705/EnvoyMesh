/// EnvoyAI slash helpers for EnvoyGo (mirrors Social `envoy-ai-slash-commands.ts`).

bool isEnvoyAiSlashSuggestInput(String value) {
  return RegExp(r'^/\S*$').hasMatch(value);
}

bool isEnvoyAiHelpCommand(String text) {
  final trimmed = text.trim();
  if (!trimmed.startsWith('/')) return false;
  final parts = trimmed.substring(1).split(RegExp(r'\s+'));
  final cmd = parts.isEmpty ? '' : parts.first;
  return cmd.toLowerCase() == 'help';
}

class EnvoyAiSlashAction {
  final String type;
  final String? prompt;
  final String? text;
  const EnvoyAiSlashAction._(this.type, {this.prompt, this.text});
  const EnvoyAiSlashAction.help() : this._('help');
  const EnvoyAiSlashAction.clear() : this._('clear');
  const EnvoyAiSlashAction.status() : this._('status');
  const EnvoyAiSlashAction.model() : this._('model');
  const EnvoyAiSlashAction.skills() : this._('skills');
  const EnvoyAiSlashAction.approvals() : this._('approvals');
  const EnvoyAiSlashAction.report() : this._('report');
  const EnvoyAiSlashAction.expand(String prompt) : this._('expand', prompt: prompt);
  const EnvoyAiSlashAction.unknown(String text) : this._('unknown_slash', text: text);
}

/// Keep in sync with apps/node/src/envoy-ai-command-catalog.ts ENVOY_AI_FEATURE_EXPAND_PROMPTS.
const _featureExpand = {
  'about':
      'Explain EnvoyMesh to me like a product guide: what it is (decentralized mesh, local-first, no central account), and briefly cover major surfaces — Discover/chat, EnvoyAI, Ext Agent, Terminals + Terminal Agent, Pi coding, Team jobs / Agent Network, Family Network, and Content (Feed, Blog, Explore, My Files). Tell me where to open each in Social (desktop) or EnvoyGo (phone).',
  'terminal':
      'Explain how Terminals work in EnvoyMesh: open Chat → Terminals for a home-node shell; Terminal Agent can propose commands in Manual or Agent mode. Mention that Terminal-local slash commands (/goal, /watch, /openclaw, /manual, /agent, etc.) live only in the Terminal panel, not in EnvoyAI chat. Tell me how to start a session on desktop Social and on EnvoyGo.',
  'team':
      'Explain Team jobs and Agent Network in EnvoyMesh in detail, with a step-by-step LAN office setup.\n\n'
      'What they are: Team jobs split a goal across bonded contacts\' agents (plan → bid/award → merge results). Agent Network is opt-in worker membership — peers only recruit you if Join Agent Network is on.\n\n'
      'Where to configure (desktop Social on each home node — not EnvoyGo): Nav → Team jobs → Manage workers. Worker profile (Join Agent Network + skills/role) is under Team jobs → Your worker profile. EnvoyGo can start/view Team jobs against a paired home node but cannot set up the fleet/LAN.\n\n'
      'Prerequisites for LAN: each desk machine runs EnvoyMesh with its own owner identity (do not clone profile dirs); same Wi-Fi/Ethernet subnet; firewall allows libp2p + mDNS; assigner has a usable AI model under Settings → AI. No public relay required for a LAN lab.\n\n'
      'Recommended path — Office LAN (do this on EVERY desk machine):\n'
      '1. Open Team jobs → Manage workers.\n'
      '2. Under Office LAN, click Enable office LAN team. That turns on Join Agent Network, LAN Auto-Bond, auto-join Agent Network, lan-fast discovery, and creates a shared fleet token if missing.\n'
      '3. On the first machine, Copy token and share it out-of-band.\n'
      '4. On other machines, Enable office LAN team (or paste the same token under LAN Auto-Bond → Save).\n'
      '5. Pass check: Contacts shows the other machines at direct trust; New team job no longer fails with no_workers.\n\n'
      'Manual alternative: Manage workers → enable LAN Auto-Bond with a matching fleet token (≥8 chars), then separately expand Your worker profile → Join Agent Network. Bond-only LAN peers are trusted but not recruitable until Join is on (Office LAN preset turns Join on for you).\n\n'
      'Advanced (optional): Fleet Manifest for pre-staged large fleets; Pairing Kiosk for walk-up invites. Company invite minting UI is not in Manage workers today — prefer Office LAN or Pairing Kiosk.\n\n'
      'After setup: start New team job on the assigner; workers with Join on appear in the pool. Remind me that /team explains this — it does not switch views.',
  'family':
      'Explain Family Network in EnvoyMesh: private home-node profiles, invite QR for family phones, and that family devices get EnvoyAI + family chat only — not mesh contacts, vault, or terminal. Tell me where to open Family settings on desktop (Settings → Family) and on EnvoyGo.',
  'extagent':
      'Explain Ext Agent in EnvoyMesh: optional bridge to external agents (Codex, Claude Code, Hermes, etc.), how to enable/pick an agent under Settings → AI, the Ext Agent chat thread, and that each agent has its own / command catalog (unlike EnvoyAI).',
  'envoyai':
      'Explain EnvoyAI (built-in OpenClaw on the home node) versus Ext Agent versus Pi: EnvoyAI has mesh tools, skills, and approvals; Ext Agent forwards to an external process; Pi is a local coding agent without mesh tools. Tell me how to use /help and feature slash commands here, and where Skills and Approvals live on desktop Social.',
  'pi':
      'Explain the Pi local coding agent in EnvoyMesh: it works in a project folder (edit files, run shell) and does not use mesh tools. Tell me how to start Pi from Chat → Terminals or New Pi on desktop and EnvoyGo, and how it differs from EnvoyAI and Ext Agent.',
  'content':
      'Explain EnvoyMesh Content surfaces: Feed (short updates for bonded contacts), Blog (longer posts on the mesh), Explore (browse peer sites), and My Files (vault library — import, publish, share). Tell me where to open Content on desktop Social and on EnvoyGo.',
};

EnvoyAiSlashAction? parseEnvoyAiSlashCommand(String input) {
  final trimmed = input.trim();
  if (trimmed.isEmpty || !trimmed.startsWith('/')) return null;
  final parts =
      trimmed.substring(1).split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return null;
  final cmd = parts.first.toLowerCase();
  final rest = parts.skip(1).join(' ').trim();

  switch (cmd) {
    case 'help':
      return const EnvoyAiSlashAction.help();
    case 'clear':
      return const EnvoyAiSlashAction.clear();
    case 'status':
      return const EnvoyAiSlashAction.status();
    case 'model':
      return const EnvoyAiSlashAction.model();
    case 'skills':
      return const EnvoyAiSlashAction.skills();
    case 'approvals':
      return const EnvoyAiSlashAction.approvals();
    case 'report':
      return const EnvoyAiSlashAction.report();
    case 'about':
    case 'terminal':
    case 'team':
    case 'family':
    case 'extagent':
    case 'envoyai':
    case 'pi':
    case 'content':
      return EnvoyAiSlashAction.expand(_featureExpand[cmd]!);
    case 'bonds':
      return const EnvoyAiSlashAction.expand(
        'Using EnvoyMesh mesh tools, summarize my bonded contacts, trust tiers, and any notable offline or dormant bonds.',
      );
    case 'files':
      return const EnvoyAiSlashAction.expand(
        'Using EnvoyMesh mesh tools, list files in my vault and OpenClaw workspace. Summarize what’s available.',
      );
    case 'discover':
      return EnvoyAiSlashAction.expand(
        rest.isEmpty
            ? 'Using EnvoyMesh discovery tools, help me discover peers and capabilities on the mesh.'
            : 'Using EnvoyMesh discovery tools, help me find peers related to: $rest',
      );
    case 'knowledge':
      if (rest.isEmpty) return const EnvoyAiSlashAction.help();
      return EnvoyAiSlashAction.expand(
        'Using EnvoyMesh vault and mesh knowledge tools, answer this: $rest',
      );
    case 'share':
      return EnvoyAiSlashAction.expand(
        rest.isEmpty
            ? 'Using EnvoyMesh share tools, explain how I can share a vault library file with a bonded contact, and help me do it if I name a file and contact.'
            : 'Using EnvoyMesh share tools, help me share a vault file with a contact. Context: $rest',
      );
    default:
      return EnvoyAiSlashAction.unknown(trimmed);
  }
}

List<Map<String, dynamic>> filterEnvoyAiSlashCommands(
  List<Map<String, dynamic>> commands,
  String value,
) {
  if (!isEnvoyAiSlashSuggestInput(value)) return const [];
  final prefix = value.toLowerCase();
  return commands.where((c) {
    final slash = (c['slash'] as String?)?.toLowerCase() ?? '';
    return slash.startsWith(prefix);
  }).toList();
}

String formatEnvoyAiSlashHelp(Map<String, dynamic> catalog) {
  final lines = <String>['EnvoyAI slash commands:'];
  final commands = (catalog['commands'] as List?) ?? const [];
  if (commands.isEmpty) {
    lines.add('(none)');
  } else {
    for (final raw in commands) {
      if (raw is! Map) continue;
      final slash = raw['slash']?.toString() ?? '';
      final args = (raw['argsHint'] as String?)?.trim();
      final summary = raw['summary']?.toString() ?? '';
      lines.add(args == null || args.isEmpty ? '$slash — $summary' : '$slash $args — $summary');
    }
  }
  final limitations = (catalog['limitations'] as List?) ?? const [];
  if (limitations.isNotEmpty) {
    lines.add('');
    lines.add('Notes:');
    for (final note in limitations) {
      lines.add('• $note');
    }
  }
  return lines.join('\n');
}
