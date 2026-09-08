import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/social_context_provider.dart';

enum _PhoneMeshUiStatus { offline, connecting, connected, error }

_PhoneMeshUiStatus _resolveStatus({
  required bool hasBackend,
  required PhoneMeshRuntimeState mesh,
}) {
  if (!hasBackend) return _PhoneMeshUiStatus.connecting;
  if (mesh.lastError != null && mesh.lastError!.isNotEmpty) {
    return _PhoneMeshUiStatus.error;
  }
  if (mesh.sessionActive) return _PhoneMeshUiStatus.connected;
  return _PhoneMeshUiStatus.connecting;
}

/// Cell-tower phone-mesh status. Tap opens a short status sheet.
class PhoneMeshIndicator extends ConsumerWidget {
  const PhoneMeshIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final mesh = ref.watch(phoneMeshRuntimeProvider);
    final backend = ref.watch(phoneSocialBackendProvider);
    final status = _resolveStatus(hasBackend: backend != null, mesh: mesh);

    final Color color;
    final String tooltip;
    switch (status) {
      case _PhoneMeshUiStatus.connected:
        color = Colors.green;
        tooltip = l10n.phoneMeshStatusConnected;
      case _PhoneMeshUiStatus.connecting:
        color = Colors.orange;
        tooltip = l10n.phoneMeshStatusConnecting;
      case _PhoneMeshUiStatus.error:
        color = Colors.red;
        tooltip = l10n.phoneMeshStatusError;
      case _PhoneMeshUiStatus.offline:
        color = Colors.grey;
        tooltip = l10n.phoneMeshStatusOffline;
    }

    return IconButton(
      tooltip: tooltip,
      visualDensity: VisualDensity.standard,
      padding: const EdgeInsets.all(8),
      constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
      onPressed: () => _showStatusSheet(context, ref),
      icon: Icon(Icons.cell_tower, color: color, size: 22),
    );
  }

  void _showStatusSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => const _PhoneMeshStatusSheet(),
    );
  }
}

class _PhoneMeshStatusSheet extends ConsumerWidget {
  const _PhoneMeshStatusSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final mesh = ref.watch(phoneMeshRuntimeProvider);
    final backend = ref.watch(phoneSocialBackendProvider);
    final status = _resolveStatus(hasBackend: backend != null, mesh: mesh);
    final scheme = Theme.of(context).colorScheme;

    final Color color;
    final IconData icon;
    final String statusLabel;
    final String body;
    switch (status) {
      case _PhoneMeshUiStatus.connected:
        color = Colors.green;
        icon = Icons.cell_tower;
        statusLabel = l10n.phoneMeshStatusConnected;
        body = mesh.discoveryActive
            ? l10n.phoneMeshDescConnectedDiscovering
            : l10n.phoneMeshDescConnected;
      case _PhoneMeshUiStatus.connecting:
        color = Colors.orange;
        icon = Icons.cell_tower;
        statusLabel = l10n.phoneMeshStatusConnecting;
        body = l10n.phoneMeshDescConnecting;
      case _PhoneMeshUiStatus.error:
        color = Colors.red;
        icon = Icons.cell_tower;
        statusLabel = l10n.phoneMeshStatusError;
        body = (mesh.lastError != null && mesh.lastError!.isNotEmpty)
            ? l10n.phoneMeshDescError(mesh.lastError!)
            : l10n.phoneMeshDescErrorGeneric;
      case _PhoneMeshUiStatus.offline:
        color = Colors.grey;
        icon = Icons.cell_tower;
        statusLabel = l10n.phoneMeshStatusOffline;
        body = l10n.phoneMeshDescOffline;
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.phoneMeshSheetTitle,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(icon, color: color),
              title: Text(statusLabel),
              subtitle: Text(
                body,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                      height: 1.4,
                    ),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(l10n.setupGuideDoneCta),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
