import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../screens/pairing/pairing_scan_screen.dart';
import '../screens/onboarding/setup_guide_screen.dart';

/// The one "you need a home node" surface, shared by every tab that runs on the
/// computer (Social, Terminal, Knowledge).
///
/// Copy is deliberately identical everywhere — one explanation, one action —
/// because the tabs differ in *what* they run on the home node, not in how the
/// user fixes it. The body covers both paths: install EnvoyMesh on a PC and scan
/// its QR, or join a family home with their invite (no install).
class PairRequiredPanel extends ConsumerWidget {
  const PairRequiredPanel({super.key, required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: scheme.outline),
            const SizedBox(height: 16),
            Text(
              l10n.setupGuidePairRequiredTitle,
              textAlign: TextAlign.center,
              style: text.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.pairRequiredBody,
              textAlign: TextAlign.center,
              style: text.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const PairingScanScreen(),
                ),
              ),
              child: Text(l10n.setupGuidePairCta),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => showSetupGuide(context),
              child: Text(l10n.setupGuideTitle),
            ),
          ],
        ),
      ),
    );
  }
}
