import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../services/onboarding_preferences.dart';
import '../../theme/app_theme.dart';

/// First-launch carousel introducing EnvoyGo, EnvoyMesh, and pairing.
class WelcomeSlidesScreen extends StatefulWidget {
  const WelcomeSlidesScreen({
    super.key,
    required this.onFinished,
    this.requirePairing = false,
  });

  /// When true the app cannot be used unpaired, so the last slide says so
  /// instead of promising an on-phone mesh.
  final bool requirePairing;

  /// Called after slides are marked complete (guide may still be pending).
  final VoidCallback onFinished;

  @override
  State<WelcomeSlidesScreen> createState() => _WelcomeSlidesScreenState();
}

class _WelcomeSlidesScreenState extends State<WelcomeSlidesScreen> {
  final _pageController = PageController();
  int _index = 0;
  bool _finishing = false;

  static const _pageCount = 4;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    if (_finishing) return;
    setState(() => _finishing = true);
    await OnboardingPreferences.setSlidesCompleted();
    if (!mounted) return;
    // Routing belongs to AppEntry: it decides between the pairing gate, the
    // profile step and the app shell. Pushing the guide from here too used to
    // stack two copies (tap "Explore first" → flash → the same page again with
    // "Pair later").
    widget.onFinished();
  }

  void _next() {
    if (_finishing) return;
    if (_index >= _pageCount - 1) {
      _finish();
      return;
    }
    _pageController.nextPage(
      duration: AppTheme.durationNormal,
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final mobileNodeEnabled = !widget.requirePairing;
    final pages = [
      _SlideData(
        icon: Icons.phone_iphone_outlined,
        title: l10n.welcomeSlide1Title,
        body: l10n.welcomeSlide1Body,
      ),
      _SlideData(
        icon: Icons.home_outlined,
        title: l10n.welcomeSlide2Title,
        body: l10n.welcomeSlide2Body,
      ),
      _SlideData(
        icon: Icons.qr_code_scanner_outlined,
        title: l10n.welcomeSlide3Title,
        body: l10n.welcomeSlide3Body,
      ),
      // With the mobile node off, unpaired use is not a mode we support — say so
      // instead of promising an on-phone mesh.
      _SlideData(
        icon: Icons.hub_outlined,
        title: mobileNodeEnabled
            ? l10n.welcomeSlide4Title
            : l10n.welcomeSlideRequiredTitle,
        body: mobileNodeEnabled
            ? l10n.welcomeSlide4Body
            : l10n.welcomeSlideRequiredBody,
      ),
    ];

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _finishing ? null : _finish,
                child: Text(l10n.welcomeSkip),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: pages.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, i) {
                  final page = pages[i];
                  return LayoutBuilder(
                    builder: (context, constraints) {
                      return SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.xl,
                        ),
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            minHeight: constraints.maxHeight,
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (i == 0) ...[
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(
                                    AppTheme.radiusLg,
                                  ),
                                  child: Image.asset(
                                    'assets/logo.png',
                                    width: 88,
                                    height: 88,
                                    fit: BoxFit.cover,
                                    semanticLabel: l10n.appTitle,
                                  ),
                                ),
                                const SizedBox(height: AppTheme.xl),
                              ] else ...[
                                Container(
                                  width: 96,
                                  height: 96,
                                  decoration: BoxDecoration(
                                    color: scheme.primaryContainer,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    page.icon,
                                    size: 48,
                                    color: scheme.onPrimaryContainer,
                                  ),
                                ),
                                const SizedBox(height: AppTheme.xl),
                              ],
                              Text(
                                page.title,
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineSmall
                                    ?.copyWith(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: AppTheme.lg),
                              Text(
                                page.body,
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyLarge
                                    ?.copyWith(
                                      color: scheme.onSurfaceVariant,
                                      height: 1.5,
                                    ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
            Semantics(
              label: '${_index + 1} / ${pages.length}',
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(pages.length, (i) {
                  final active = i == _index;
                  return AnimatedContainer(
                    duration: AppTheme.durationFast,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: active ? 20 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: active ? scheme.primary : scheme.outlineVariant,
                      borderRadius: BorderRadius.circular(AppTheme.radiusFull),
                    ),
                  );
                }),
              ),
            ),
            const SizedBox(height: AppTheme.xl),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppTheme.xl,
                0,
                AppTheme.xl,
                AppTheme.xl,
              ),
              child: SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton(
                  onPressed: _finishing ? null : _next,
                  child: Text(
                    _index >= _pageCount - 1
                        ? l10n.welcomeContinue
                        : l10n.welcomeNext,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SlideData {
  const _SlideData({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;
}
