import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_mesh_work.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/product/node_service_client.dart';
import '../chat/envoy_harness_chat_screen.dart';

Future<void> showCodingMeshWorkSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _CodingMeshWorkSheet(),
  );
}

String _folderLabel(String cwd) {
  final parts = cwd.split(RegExp(r'[/\\]'));
  return parts.isEmpty ? cwd : parts.last;
}

class _CodingMeshWorkSheet extends ConsumerStatefulWidget {
  const _CodingMeshWorkSheet();

  @override
  ConsumerState<_CodingMeshWorkSheet> createState() =>
      _CodingMeshWorkSheetState();
}

class _CodingMeshWorkSheetState extends ConsumerState<_CodingMeshWorkSheet> {
  List<CodingMeshWorkItem> _items = const [];
  bool _loading = true;
  String? _busyId;
  String? _error;

  NodeServiceClient? get _client => ref.read(nodeServiceProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // ignore: discarded_futures
      _reload();
    });
  }

  Future<void> _reload() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = _client;
    if (client == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = l10n.codingMeshWorkListFailed;
      });
      return;
    }
    try {
      final rows = await client.listEhMeshWorkItems();
      if (!mounted) return;
      setState(() {
        _items = rows
            .where(
              (r) => r.status == 'pending' || r.status == 'running',
            )
            .toList(growable: false);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = l10n.codingMeshWorkListFailed;
      });
    }
  }

  Future<void> _runAction(String id, Future<void> Function() action) async {
    setState(() {
      _busyId = id;
      _error = null;
    });
    final l10n = AppLocalizations.of(context);
    try {
      await action();
      await _reload();
    } catch (_) {
      if (mounted) {
        setState(() => _error = l10n.codingMeshWorkActionFailed);
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _openEhChat(String chatId) async {
    if (!mounted) return;
    await ref.read(chatProvider.notifier).syncEhChats();
    if (!mounted) return;
    ChatThread? thread;
    for (final t in ref.read(chatProvider).threads) {
      if (t.id.endsWith(':eh:$chatId')) {
        thread = t;
        break;
      }
    }
    final resolved = thread;
    if (resolved == null) return;
    Navigator.of(context).pop();
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => EnvoyHarnessChatScreen(
          threadId: resolved.id,
          displayName: resolved.displayName,
          chatId: chatId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.72;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: SizedBox(
          height: maxHeight,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.codingMeshWorkTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.codingMeshWorkDesc,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_items.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(l10n.codingMeshWorkEmpty),
                )
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final item = _items[index];
                      final title = (item.title?.isNotEmpty == true)
                          ? item.title!
                          : l10n.codingMeshWorkUntitled;
                      final busy = _busyId == item.id;
                      return ListTile(
                        title: Text(title),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${_folderLabel(item.cwd)}'
                              '${item.source == 'bond' ? ' · ${l10n.codingMeshWorkSourceBond}' : ''}',
                            ),
                            Text(
                              item.prompt.length > 120
                                  ? '${item.prompt.substring(0, 120)}…'
                                  : item.prompt,
                            ),
                            if (item.lastError != null &&
                                item.lastError!.isNotEmpty)
                              Text(
                                item.lastError!,
                                style: TextStyle(color: scheme.error),
                              ),
                          ],
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => _runAction(
                                        item.id,
                                        () async {
                                          await _client?.dismissEhMeshWorkItem(
                                            item.id,
                                          );
                                        },
                                      ),
                              child: Text(l10n.codingMeshWorkDismiss),
                            ),
                            FilledButton(
                              onPressed: busy
                                  ? null
                                  : () => _runAction(item.id, () async {
                                        final row = await _client!
                                            .runEhMeshWorkItemNow(item.id);
                                        final itemAfter =
                                            CodingMeshWorkItem.fromJson(row);
                                        final chatId = itemAfter.chatId?.trim();
                                        if (chatId != null && chatId.isNotEmpty) {
                                          await _openEhChat(chatId);
                                        }
                                      }),
                              child: Text(l10n.codingRunMeshWork),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: scheme.error)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}