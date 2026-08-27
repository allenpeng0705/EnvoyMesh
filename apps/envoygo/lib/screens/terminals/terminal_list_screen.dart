import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../providers/node_provider.dart';
import '../../providers/terminal_provider.dart';
import '../../utils/localized_labels.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/thread_tile.dart';
import 'terminal_create_actions.dart';
import 'terminal_detail_screen.dart';

/// Owner Terminal tab — session list, empty hints, New Pi / New Terminal FAB.
class TerminalHomeScreen extends ConsumerWidget {
  const TerminalHomeScreen({super.key});

  static String _sessionTitle(String displayName) {
    var name = displayName;
    if (name.startsWith(ThreadTitleSentinels.terminalPrefix)) {
      name = name.substring(ThreadTitleSentinels.terminalPrefix.length);
    }
    if (name.startsWith('π ')) {
      name = name.substring(2);
    }
    return name;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final hasHome = ref.watch(nodeProvider).activeNode != null;
    final threads = ref
        .watch(chatProvider)
        .threads
        .where((t) =>
            t.type == ChatThreadType.terminal || t.type == ChatThreadType.pi)
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navTerminal),
        actions: const [ConnectionIndicator(), SizedBox(width: 12)],
      ),
      body: threads.isEmpty
          ? _EmptyTerminals(
              hasHome: hasHome,
              onNewPi: () => showCreatePiDialog(context, ref),
              onNewEnvoy: () => showCreateEnvoyDialog(context, ref),
              onNewTerminal: () => showCreateTerminalDialog(context, ref),
            )
          : ListView.builder(
              itemCount: threads.length,
              itemBuilder: (context, index) {
                final thread = threads[index];
                return ThreadTile(
                  thread: thread,
                  onTap: () {
                    final parts = thread.id.split(':term:');
                    final sessionId = parts.length > 1 ? parts[1] : '';
                    final session = ref
                        .read(terminalProvider)
                        .sessions
                        .where((s) => s.id == sessionId)
                        .firstOrNull;
                    final role = session?.role ??
                        (thread.displayName.startsWith('EH ')
                            ? 'envoy-harness'
                            : thread.displayName.startsWith('π')
                                ? 'pi'
                                : null);
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => TerminalDetailScreen(
                          sessionId: sessionId,
                          sessionName: _sessionTitle(thread.displayName),
                          sessionRole: role,
                        ),
                      ),
                    );
                  },
                );
              },
            ),
      floatingActionButton: hasHome
          ? FloatingActionButton(
              heroTag: 'terminal-compose',
              tooltip: l10n.chatsFabNew,
              onPressed: () => _showNewActions(context, ref),
              child: const Icon(Icons.add),
            )
          : null,
    );
  }

  void _showNewActions(BuildContext context, WidgetRef ref) {
    if (ref.read(nodeProvider).activeNode == null) return;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final l10n = AppLocalizations.of(sheetContext);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.integration_instructions_outlined),
                title: Text(l10n.chatsNewEnvoy),
                subtitle: Text(l10n.chatsNewEnvoyHint),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  showCreateEnvoyDialog(context, ref);
                },
              ),
              ListTile(
                leading: const SizedBox(
                  width: 24,
                  child: Center(
                    child: Text(
                      'π',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                title: Text(l10n.chatsNewPi),
                subtitle: Text(l10n.chatsNewPiHint),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  showCreatePiDialog(context, ref);
                },
              ),
              ListTile(
                leading: const Icon(Icons.terminal),
                title: Text(l10n.chatsNewTerminal),
                subtitle: Text(l10n.chatsNewTerminalHint),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  showCreateTerminalDialog(context, ref);
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }
}

class _EmptyTerminals extends StatelessWidget {
  const _EmptyTerminals({
    required this.hasHome,
    required this.onNewPi,
    required this.onNewEnvoy,
    required this.onNewTerminal,
  });

  final bool hasHome;
  final VoidCallback onNewPi;
  final VoidCallback onNewEnvoy;
  final VoidCallback onNewTerminal;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.terminal, size: 64, color: scheme.outline),
            const SizedBox(height: 16),
            Text(
              l10n.termNone,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              hasHome ? l10n.termEmptyHint : l10n.pairingNeedHomeHint,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
            if (hasHome) ...[
              const SizedBox(height: 24),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                alignment: WrapAlignment.center,
                children: [
                  FilledButton.tonalIcon(
                    onPressed: onNewEnvoy,
                    icon: const Icon(Icons.integration_instructions_outlined),
                    label: Text(l10n.chatsNewEnvoy),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: onNewPi,
                    icon: const Text('π', style: TextStyle(fontWeight: FontWeight.w700)),
                    label: Text(l10n.chatsNewPi),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: onNewTerminal,
                    icon: const Icon(Icons.terminal),
                    label: Text(l10n.chatsNewTerminal),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
