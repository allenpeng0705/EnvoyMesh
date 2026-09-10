import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../constants/envoy_links.dart';
import '../../l10n/app_localizations.dart';
import '../../services/feature_flags.dart';
import '../../services/onboarding_preferences.dart';
import '../../theme/app_theme.dart';
import '../../utils/open_external_url.dart';
import '../pairing/pairing_scan_screen.dart';

/// Detailed EnvoyGo ↔ EnvoyMesh setup guide.
///
/// Shown automatically after welcome slides on first launch, and anytime
/// via the info icon ([showSetupGuide]).
class SetupGuideScreen extends ConsumerStatefulWidget {
  const SetupGuideScreen({
    super.key,
    this.isFirstLaunch = false,
    this.requirePairing = false,
    this.onPairLater,
  });

  /// When true, closing marks the guide as completed for first-run gating.
  final bool isFirstLaunch;

  /// Pairing-gate mode: the guide is the app entry (rendered by [AppEntry]
  /// rather than pushed), so it must not pop the root route and must answer to
  /// [onPairLater] instead.
  final bool requirePairing;

  /// Gate mode only: the user chose to pair later, so open the app shell.
  final VoidCallback? onPairLater;

  @override
  ConsumerState<SetupGuideScreen> createState() => _SetupGuideScreenState();
}

class _SetupGuideScreenState extends ConsumerState<SetupGuideScreen> {
  bool _closing = false;

  Future<void> _markCompleteIfNeeded() async {
    if (widget.isFirstLaunch) {
      await OnboardingPreferences.setGuideCompleted();
    }
  }

  Future<void> _finish({bool openPairing = false}) async {
    if (_closing) return;
    setState(() => _closing = true);
    await _markCompleteIfNeeded();
    if (!mounted) return;
    final nav = Navigator.of(context);
    if (openPairing) {
      final route = MaterialPageRoute(
        builder: (_) => const PairingScanScreen(),
      );
      // Gate mode: the guide is the root route's content, so it must stay
      // beneath the pairing flow — the success path pops to the *first* route
      // (PairingConfirmScreen), which would otherwise strand the user there.
      if (widget.requirePairing) {
        await nav.push(route);
        return;
      }
      if (widget.isFirstLaunch) {
        await nav.pushReplacement(route);
        return;
      }
      nav.pop();
      await nav.push(route);
      return;
    }
    // Gate mode: never pop the root route — hand control back to the caller.
    final onPairLater = widget.onPairLater;
    if (onPairLater != null) {
      onPairLater();
      return;
    }
    nav.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final mobileNodeEnabled = ref.watch(mobileNodeEnabledProvider);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _closing) return;
        await _finish();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.setupGuideTitle),
          leading: IconButton(
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            icon: const Icon(Icons.close),
            onPressed: _closing ? null : () => _finish(),
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppTheme.xl,
                  AppTheme.lg,
                  AppTheme.xl,
                  AppTheme.lg,
                ),
                children: [
                  if (widget.requirePairing) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(AppTheme.md),
                      decoration: BoxDecoration(
                        color: scheme.primaryContainer,
                        borderRadius: BorderRadius.circular(AppTheme.md),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.setupGuidePairRequiredTitle,
                            style: text.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: scheme.onPrimaryContainer,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            l10n.setupGuidePairRequiredBody,
                            style: text.bodyMedium?.copyWith(
                              color: scheme.onPrimaryContainer,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppTheme.lg),
                  ],
                  Text(
                    l10n.setupGuideIntro,
                    style: text.bodyLarge?.copyWith(
                      color: scheme.onSurfaceVariant,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: AppTheme.xl),
                  _GuideStep(
                    number: 1,
                    title: l10n.setupGuideStep1Title,
                    body: l10n.setupGuideStep1Body,
                    icon: Icons.computer_outlined,
                  ),
                  _GuideStep(
                    number: 2,
                    title: l10n.setupGuideStep2Title,
                    body: l10n.setupGuideStep2Body,
                    icon: Icons.download_outlined,
                    action: FilledButton.tonalIcon(
                      onPressed: () =>
                          openExternalUrl(kEnvoyMeshDownloadUrl),
                      icon: const Icon(Icons.open_in_new, size: AppTheme.iconSm),
                      label: Text(l10n.setupGuideDownloadCta),
                    ),
                  ),
                  _GuideStep(
                    number: 3,
                    title: l10n.setupGuideStep3Title,
                    body: l10n.setupGuideStep3Body,
                    icon: Icons.qr_code_2_outlined,
                  ),
                  _GuideStep(
                    number: 4,
                    title: l10n.setupGuideStep4Title,
                    body: l10n.setupGuideStep4Body,
                    icon: Icons.phonelink_setup_outlined,
                  ),
                  _GuideStep(
                    number: 5,
                    title: l10n.setupGuideStep5Title,
                    body: l10n.setupGuideStep5Body,
                    icon: Icons.check_circle_outline,
                  ),
                  const SizedBox(height: AppTheme.lg),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest
                          .withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                      border: Border.all(color: scheme.outlineVariant),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(AppTheme.lg),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            // With the mobile node off there is no unpaired
                            // mode: never promise phone chats / Discover here.
                            mobileNodeEnabled
                                ? l10n.setupGuidePhoneOnlyTitle
                                : l10n.setupGuideNoHomeTitle,
                            style: text.titleSmall,
                          ),
                          const SizedBox(height: AppTheme.sm),
                          Text(
                            mobileNodeEnabled
                                ? l10n.setupGuidePhoneOnlyBody
                                : l10n.setupGuideNoHomeBody,
                            style: text.bodyMedium?.copyWith(
                              color: scheme.onSurfaceVariant,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppTheme.xl,
                  AppTheme.sm,
                  AppTheme.xl,
                  AppTheme.lg,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SizedBox(
                      height: 48,
                      child: FilledButton(
                        onPressed:
                            _closing ? null : () => _finish(openPairing: true),
                        child: Text(l10n.setupGuidePairCta),
                      ),
                    ),
                    const SizedBox(height: AppTheme.xs),
                    TextButton(
                      onPressed: _closing ? null : () => _finish(),
                      child: Text(
                        widget.requirePairing
                            ? l10n.setupGuidePairLaterCta
                            : (widget.isFirstLaunch
                                ? l10n.setupGuideSkipCta
                                : l10n.setupGuideDoneCta),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GuideStep extends StatelessWidget {
  const _GuideStep({
    required this.number,
    required this.title,
    required this.body,
    required this.icon,
    this.action,
  });

  final int number;
  final String title;
  final String body;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: scheme.primaryContainer,
            foregroundColor: scheme.onPrimaryContainer,
            child: Icon(icon, size: AppTheme.iconMd),
          ),
          const SizedBox(width: AppTheme.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$number. $title',
                  style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppTheme.xs),
                Text(
                  body,
                  style: text.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    height: 1.45,
                  ),
                ),
                if (action != null) ...[
                  const SizedBox(height: AppTheme.md),
                  action!,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Push the setup guide (reusable from AppBars and first-launch flow).
Future<void> showSetupGuide(
  BuildContext context, {
  bool isFirstLaunch = false,
}) {
  return Navigator.of(context).push(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => SetupGuideScreen(isFirstLaunch: isFirstLaunch),
    ),
  );
}
