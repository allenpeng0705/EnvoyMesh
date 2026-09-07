import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/social_context_provider.dart';

/// Shows [child] on Home Social context; otherwise a short Home-only message.
class HomeOnlyWhenNeeded extends ConsumerWidget {
  const HomeOnlyWhenNeeded({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPhone = ref.watch(socialContextProvider).isPhone;
    if (!isPhone) return child;
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.home_outlined,
              size: 40,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              l10n.socialHomeOnlyTitle,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              l10n.socialHomeOnlyBody,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Banner under Social AppBar when On this phone mesh is active.
class PhoneMeshForegroundBanner extends ConsumerWidget {
  const PhoneMeshForegroundBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ctx = ref.watch(socialContextProvider);
    if (!ctx.isPhone) return const SizedBox.shrink();
    final runtime = ref.watch(phoneMeshRuntimeProvider);
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final text = runtime.sessionActive
        ? l10n.socialPhoneMeshForegroundHint
        : (runtime.lastError ?? l10n.socialPhoneMeshStarting);

    return Material(
      color: theme.colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Icon(
              runtime.sessionActive
                  ? Icons.cell_tower
                  : Icons.hourglass_top_outlined,
              size: 18,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                style: theme.textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
