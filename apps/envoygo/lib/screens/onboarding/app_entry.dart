import 'package:flutter/material.dart';

import '../../services/onboarding_preferences.dart';
import '../home_screen.dart';
import 'setup_guide_screen.dart';
import 'welcome_slides_screen.dart';

/// Root home widget: welcome slides → auto setup guide → [HomeScreen].
class AppEntry extends StatefulWidget {
  const AppEntry({super.key});

  @override
  State<AppEntry> createState() => _AppEntryState();
}

class _AppEntryState extends State<AppEntry> {
  bool _loading = true;
  bool _showSlides = false;
  bool _pendingGuide = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final slidesDone = await OnboardingPreferences.hasCompletedSlides();
    final guideDone = await OnboardingPreferences.hasCompletedGuide();
    if (!mounted) return;
    setState(() {
      _loading = false;
      _showSlides = !slidesDone;
      _pendingGuide = slidesDone && !guideDone;
    });
    if (slidesDone && !guideDone) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openPendingGuide());
    }
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
    return const HomeScreen();
  }
}
