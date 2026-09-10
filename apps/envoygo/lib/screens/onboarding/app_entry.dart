import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/node_provider.dart';
import '../../services/feature_flags.dart';
import '../../services/onboarding_gate.dart';
import '../../services/onboarding_preferences.dart';
import '../home_screen.dart';
import 'profile_setup_screen.dart';
import 'setup_guide_screen.dart';
import 'welcome_slides_screen.dart';

/// Root home widget: welcome slides → pairing gate → profile setup → [HomeScreen].
///
/// Order and gating:
/// 1. slides once (the last one says pairing is required unless the mobile node
///    feature is on);
/// 2. **pairing gate** — with the mobile node off, everything runs on the home
///    node, so an unpaired app has nothing to show and the setup guide *is* the
///    entry until a computer is paired ([needsPairingGate]);
/// 3. profile setup — only when the mobile node is on (it configures the phone
///    persona's interests for mesh advertisement);
/// 4. [HomeScreen] once paired.
class AppEntry extends ConsumerStatefulWidget {
  const AppEntry({super.key});

  @override
  ConsumerState<AppEntry> createState() => _AppEntryState();
}

class _AppEntryState extends ConsumerState<AppEntry> {
  bool _loading = true;
  bool _showSlides = false;
  bool _showProfileSetup = false;
  bool _pendingGuide = false;

  /// User chose "Pair later" on the gate (or already saw the guide): the app
  /// opens the shell as before, with per-feature pairing CTAs.
  bool _pairingDeferred = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final slidesDone = await OnboardingPreferences.hasCompletedSlides();
    final profileDone = await OnboardingPreferences.hasCompletedProfileStep();
    final guideDone = await OnboardingPreferences.hasCompletedGuide();
    // The profile step configures the phone persona (mesh advertisement), so it
    // is skipped entirely while the mobile node feature is off. The flag is
    // already resolved before the first frame (see main.dart).
    final profileStepNeeded =
        ref.read(mobileNodeEnabledProvider) && !profileDone;
    if (!mounted) return;
    setState(() {
      _loading = false;
      _showSlides = !slidesDone;
      _showProfileSetup = slidesDone && profileStepNeeded;
      _pendingGuide = slidesDone && !profileStepNeeded && !guideDone;
      // Seeing (or skipping) the guide once is the same as deferring pairing.
      _pairingDeferred = guideDone;
    });
    if (slidesDone && !profileStepNeeded) {
      // Harmless when the gate already shows the guide: the helper marks it seen
      // instead of stacking a second copy on top.
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => unawaited(_openPendingGuideIfNeeded()),
      );
    }
  }

  void _onProfileFinished() {
    if (!mounted) return;
    setState(() => _showProfileSetup = false);
    // Continue straight into the pairing guide when it is still pending.
    unawaited(_openPendingGuideIfNeeded());
  }

  Future<void> _openPendingGuideIfNeeded() async {
    // The pairing gate renders this same guide as the app entry, so showing it
    // again as a modal would stack two copies. Mark it seen instead.
    if (needsPairingGate(
      mobileNodeEnabled: ref.read(mobileNodeEnabledProvider),
      hasActiveNode: ref.read(nodeProvider).activeNode != null,
      pairingDeferred: false,
    )) {
      await OnboardingPreferences.setGuideCompleted();
      return;
    }
    final guideDone = await OnboardingPreferences.hasCompletedGuide();
    if (!mounted || guideDone) return;
    setState(() => _pendingGuide = true);
    await _openPendingGuide();
  }

  Future<void> _openPendingGuide() async {
    if (!mounted || !_pendingGuide) return;
    await showSetupGuide(context, isFirstLaunch: true);
    if (!mounted) return;
    setState(() => _pendingGuide = false);
  }

  void _onSlidesFinished() {
    if (!mounted) return;
    setState(() {
      _showSlides = false;
      _pendingGuide = false;
    });
    unawaited(_advanceAfterSlides());
  }

  Future<void> _advanceAfterSlides() async {
    final profileDone = await OnboardingPreferences.hasCompletedProfileStep();
    if (!mounted) return;
    if (ref.read(mobileNodeEnabledProvider) && !profileDone) {
      setState(() => _showProfileSetup = true);
      return;
    }
    await _openPendingGuideIfNeeded();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final mobileNodeEnabled = ref.watch(mobileNodeEnabledProvider);
    final hasActiveNode = ref.watch(nodeProvider).activeNode != null;
    // Slides always tell the truth about the current state (even if the user
    // later chooses to explore unpaired).
    final sayPairingRequired = shouldSayPairingRequired(
      mobileNodeEnabled: mobileNodeEnabled,
      hasActiveNode: hasActiveNode,
    );
    final gate = needsPairingGate(
      mobileNodeEnabled: mobileNodeEnabled,
      hasActiveNode: hasActiveNode,
      pairingDeferred: _pairingDeferred,
    );
    if (_showSlides) {
      return WelcomeSlidesScreen(
        onFinished: _onSlidesFinished,
        requirePairing: sayPairingRequired,
      );
    }
    // Pairing first, but never a block: "Pair later" opens the shell, where each
    // feature shows its own pairing CTA (the pre-gate behaviour).
    if (gate) {
      return SetupGuideScreen(
        isFirstLaunch: true,
        requirePairing: true,
        onPairLater: () {
          if (!mounted) return;
          setState(() => _pairingDeferred = true);
        },
      );
    }
    if (_showProfileSetup) {
      return ProfileSetupScreen(onDone: _onProfileFinished);
    }
    return const HomeScreen();
  }
}
