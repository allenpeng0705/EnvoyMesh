import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../services/feature_flags.dart';
import '../providers/node_provider.dart';
import '../providers/social_context_provider.dart';

/// AppBar control to switch Social persona: Home vs On this phone.
class SocialContextSwitcher extends ConsumerWidget {
  const SocialContextSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final ctx = ref.watch(socialContextProvider);
    final nodeState = ref.watch(nodeProvider);
    // The phone persona is part of the mobile node feature: never offer it while
    // that feature is off (the widget is currently unused; this keeps a future
    // usage from leaking the switch into a release build).
    if (!ref.watch(mobileNodeEnabledProvider)) {
      return const SizedBox.shrink();
    }
    final label = ctx.isPhone
        ? l10n.socialContextPhone
        : (nodeState.activeNode?.name ?? l10n.socialContextHome);

    return TextButton.icon(
      onPressed: () => _openSheet(context, ref),
      icon: Icon(
        ctx.isPhone ? Icons.smartphone_outlined : Icons.home_outlined,
        size: 18,
      ),
      label: Text(
        label,
        overflow: TextOverflow.ellipsis,
      ),
      style: TextButton.styleFrom(
        visualDensity: VisualDensity.compact,
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
    );
  }

  Future<void> _openSheet(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final nodeState = ref.read(nodeProvider);
    final current = ref.read(socialContextProvider);

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Text(
                  l10n.socialContextSheetTitle,
                  style: Theme.of(ctx).textTheme.titleMedium,
                ),
              ),
              ListTile(
                leading: const Icon(Icons.smartphone_outlined),
                title: Text(l10n.socialContextPhone),
                subtitle: Text(l10n.socialContextPhoneSubtitle),
                selected: current.isPhone,
                onTap: () async {
                  await ref.read(socialContextProvider.notifier).selectPhone();
                  if (ctx.mounted) Navigator.pop(ctx);
                },
              ),
              for (final node in nodeState.pairedNodes)
                ListTile(
                  leading: const Icon(Icons.home_outlined),
                  title: Text(node.name),
                  subtitle: Text(l10n.socialContextHomeSubtitle),
                  selected: current.isHome &&
                      (current.homeNodeId == node.id ||
                          (current.homeNodeId == null &&
                              nodeState.activeNode?.id == node.id)),
                  onTap: () async {
                    // Ensure this home is the active pair session for RPC.
                    if (nodeState.activeNode?.id != node.id) {
                      await ref
                          .read(nodeProvider.notifier)
                          .switchToNode(node.id);
                    }
                    await ref
                        .read(socialContextProvider.notifier)
                        .selectHome(node.id);
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                ),
              if (nodeState.pairedNodes.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    l10n.socialContextNoHome,
                    style: Theme.of(ctx).textTheme.bodySmall,
                  ),
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }
}
