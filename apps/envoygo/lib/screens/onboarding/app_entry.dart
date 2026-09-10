import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/onboarding_preferences.dart';
import '../home_screen.dart';
import 'profile_setup_screen.dart';
import 'setup_guide_screen.dart';
import 'welcome_slides_screen.dart';

/// Root home widget: welcome slides → profile setup → auto setup guide →
/// [HomeScreen].
///
/// The profile step runs *before* the pairing guide on purpose: it must work
/// with no home node (phone mesh is a first-class mode), and interests are what
/// make this phone discoverable by topic. It is skippable — first launch is
/// never blocked — and repeatable from Me → Edit profile.
class AppEntry extends StatefulWidget {
  const AppEntry({super.key});

  @override
  State<AppEntry> createState() => _AppEntryState();
}

class _AppEntryState extends State<AppEntry> {
  bool _loading = true;
  bool _showSlides = false;
  bool _showProfileSetup = false;
  bool _pendingGuide = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final slidesDone = await OnboardingPreferences.hasCompletedSlides();
    final profileDone = await OnboardingPreferences.hasCompletedProfileStep();
    final guideDone = await OnboardingPreferences.hasCompletedGuide();
    if (!mounted) return;
    setState(() {
      _loading = false;
      _showSlides = !slidesDone;
      _showProfileSetup = slidesDone && !profileDone;
      _pendingGuide = slidesDone && profileDone && !guideDone;
    });
    if (slidesDone && profileDone && !guideDone) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openPendingGuide());
    }
  }

  void _onProfileFinished() {
    if (!mounted) return;
    setState(() => _showProfileSetup = false);
    // Continue straight into the pairing guide when it is still pending.
    unawaited(_openPendingGuideIfNeeded());
  }

  Future<void> _openPendingGuideIfNeeded() async {
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
    if (!profileDone) {
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
    if (_showSlides) {
      return WelcomeSlidesScreen(onFinished: _onSlidesFinished);
    }
    if (_showProfileSetup) {
      return ProfileSetupScreen(onDone: _onProfileFinished);
    }
    return const HomeScreen();
  }
}
