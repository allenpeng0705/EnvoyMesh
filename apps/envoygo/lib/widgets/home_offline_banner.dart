import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/node_provider.dart';
import '../utils/localized_labels.dart';
import 'home_connection_sheet.dart';

/// Thin strip under primary AppBars when paired but home is not connected.
class HomeOfflineBanner extends ConsumerWidget {
  const HomeOfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final node = ref.watch(nodeProvider);
    final paired = node.activeNode != null || node.pairedNodes.isNotEmpty;
    if (!paired) return const SizedBox.shrink();
    if (node.connectionState == NodeConnectionState.connected) {
      return const SizedBox.shrink();
    }

    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final connecting =
        node.connectionState == NodeConnectionState.connecting;
    final title = connecting
        ? l10n.homeOfflineBannerReconnecting
        : l10n.homeOfflineBannerTitle;
    final detail = homeNodeErrorLabel(
      l10n,
      node.homeNodeErrorCode,
    );

    return Material(
      color: connecting
          ? scheme.tertiaryContainer
          : scheme.errorContainer,
      child: InkWell(
        onTap: () => showHomeConnectionSheet(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Icon(
                connecting ? Icons.cloud_sync_outlined : Icons.cloud_off_outlined,
                size: 18,
                color: connecting
                    ? scheme.onTertiaryContainer
                    : scheme.onErrorContainer,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: connecting
                                ? scheme.onTertiaryContainer
                                : scheme.onErrorContainer,
                          ),
                    ),
                    Text(
                      connecting ? l10n.homeOfflineBannerSubtitle : detail,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: connecting
                                ? scheme.onTertiaryContainer
                                : scheme.onErrorContainer,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                size: 18,
                color: connecting
                    ? scheme.onTertiaryContainer
                    : scheme.onErrorContainer,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
