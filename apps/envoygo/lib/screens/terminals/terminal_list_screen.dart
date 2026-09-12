import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../navigation/owner_tabs.dart';
import '../../providers/chat_provider.dart';
import '../../providers/node_provider.dart';
import '../../widgets/pair_required_panel.dart';
import '../../providers/terminal_provider.dart';
import '../../utils/localized_labels.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/thread_tile.dart';
import 'terminal_create_actions.dart';
import 'terminal_detail_screen.dart';

/// Owner Terminal tab — shell sessions only (Phase 68-C1b.3).
///
/// Pi / Envoy Harness live under the Coding tab.
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

  static bool _isCodingRole(String? role) =>
      role == 'pi' || role == 'envoy-harness';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final hasHome = ref.watch(nodeProvider).activeNode != null;
    final sessionsById = {
      for (final s in ref.watch(terminalProvider).sessions) s.id: s,
    };
    final threads = ref
        .watch(chatProvider)
        .threads
        .where((t) {
          if (t.type == ChatThreadType.pi) return false;
          if (t.type != ChatThreadType.terminal) return false;
          final parts = t.id.split(':term:');
          final sessionId = parts.length > 1 ? parts[1] : '';
          final session = sessionsById[sessionId];
          if (session != null) return !_isCodingRole(session.role);
          // No session metadata: hide EH/π-titled leftovers.
          final name = t.displayName;
          if (name.startsWith('EH ') || name.startsWith('π')) return false;
          return true;
        })
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navTerminal),
        actions: const [ConnectionIndicator(), SizedBox(width: 12)],
      ),
      body: threads.isEmpty
          ? _EmptyTerminals(
              hasHome: hasHome,
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
                    final session = sessionsById[sessionId];
                    final role = session?.role;
                    if (_isCodingRole(role) ||
                        thread.displayName.startsWith('EH ') ||
                        thread.displayName.startsWith('π')) {
                      ref
                          .read(chatProvider.notifier)
                          .selectTab(OwnerTabs.coding);
                      return;
                    }
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
              tooltip: l10n.chatsNewTerminal,
              onPressed: () => showCreateTerminalDialog(context, ref),
              child: const Icon(Icons.add),
            )
          : null,
    );
  }
}

class _EmptyTerminals extends StatelessWidget {
  const _EmptyTerminals({
    required this.hasHome,
    required this.onNewTerminal,
  });

  final bool hasHome;
  final VoidCallback onNewTerminal;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    // No home node: the whole tab runs on the computer, so show the shared
    // pairing panel rather than an empty list with a hint.
    if (!hasHome) return const PairRequiredPanel(icon: Icons.terminal);
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
              l10n.termEmptyHint,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.tonalIcon(
              onPressed: onNewTerminal,
              icon: const Icon(Icons.terminal),
              label: Text(l10n.chatsNewTerminal),
            ),
          ],
        ),
      ),
    );
  }
}
