import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../models/terminal_session.dart';
import '../../providers/chat_provider.dart';
import '../../providers/terminal_provider.dart';
import '../../services/coding_ext_sessions.dart';

/// In-session task list (Paseo left-panel analogue, Phase 68-C4).
class CodingSessionListHost {
  const CodingSessionListHost({
    required this.currentEhChatId,
    required this.onOpenEh,
    required this.onOpenPi,
    required this.onOpenExt,
    required this.onNewTask,
    this.currentPiSessionId,
    this.currentExtSessionId,
  });

  final String? currentEhChatId;
  final String? currentPiSessionId;
  final String? currentExtSessionId;
  final Future<void> Function(ChatThread thread) onOpenEh;
  final Future<void> Function(TerminalSession session) onOpenPi;
  final Future<void> Function(CodingExtSession session) onOpenExt;
  final Future<void> Function() onNewTask;
}

Future<void> showCodingSessionListSheet(
  BuildContext context,
  WidgetRef ref,
  CodingSessionListHost host,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _CodingSessionListSheet(host: host),
  );
}

class _CodingSessionListSheet extends ConsumerWidget {
  const _CodingSessionListSheet({required this.host});

  final CodingSessionListHost host;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final chat = ref.watch(chatProvider);
    final term = ref.watch(terminalProvider);
    final eh = chat.threads
        .where((t) => t.type == ChatThreadType.envoyHarness)
        .toList();
    final pi = term.sessions.where((s) => s.isPi).toList();
    return FutureBuilder<List<CodingExtSession>>(
      future: loadCodingExtSessions(),
      builder: (context, snap) {
        final ext = snap.data ?? const [];
        final maxH = MediaQuery.sizeOf(context).height * 0.75;
        return SafeArea(
          child: SizedBox(
            height: maxH,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Text(
                    l10n.codingSessionDrawerTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.add),
                  title: Text(l10n.codingNewTaskTitle),
                  onTap: () {
                    Navigator.of(context).pop();
                    // ignore: discarded_futures
                    host.onNewTask();
                  },
                ),
                Expanded(
                  child: ListView(
                    children: [
                      if (eh.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                          child: Text(
                            l10n.codingSectionEnvoyHarness,
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                        ),
                      for (final t in eh)
                        ListTile(
                          selected: _ehChatId(t) == host.currentEhChatId,
                          leading: const Icon(Icons.smart_toy_outlined),
                          title: Text(t.displayName),
                          subtitle: t.description != null
                              ? Text(
                                  t.description!,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                )
                              : null,
                          onTap: () {
                            Navigator.of(context).pop();
                            // ignore: discarded_futures
                            host.onOpenEh(t);
                          },
                        ),
                      if (pi.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                          child: Text(
                            'Pi',
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                        ),
                      for (final s in pi)
                        ListTile(
                          selected: s.id == host.currentPiSessionId,
                          leading: const Icon(Icons.terminal),
                          title: Text(s.name),
                          subtitle: s.cwd != null ? Text(s.cwd!) : null,
                          onTap: () {
                            Navigator.of(context).pop();
                            // ignore: discarded_futures
                            host.onOpenPi(s);
                          },
                        ),
                      if (ext.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                          child: Text(
                            l10n.codingSectionExtAgent,
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                        ),
                      for (final s in ext)
                        ListTile(
                          selected: s.id == host.currentExtSessionId,
                          leading: const Icon(Icons.extension),
                          title: Text(s.title),
                          subtitle: Text(s.cwd, maxLines: 1),
                          onTap: () {
                            Navigator.of(context).pop();
                            // ignore: discarded_futures
                            host.onOpenExt(s);
                          },
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String? _ehChatId(ChatThread t) {
    final parts = t.id.split(':eh:');
    return parts.length > 1 ? parts[1] : null;
  }
}