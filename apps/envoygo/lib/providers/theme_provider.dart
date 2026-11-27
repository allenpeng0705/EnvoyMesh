import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/theme_preferences.dart';

/// App theme mode. Prefer [ThemeModeNotifier.withInitial] after awaiting
/// [ThemePreferences.getMode] in `main()` so the first frame matches prefs.
final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>(
  (ref) => ThemeModeNotifier.withInitial(ThemeMode.system),
);

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier.withInitial(ThemeMode initial) : super(initial);

  Future<void> setMode(ThemeMode mode) async {
    await ThemePreferences.setMode(mode);
    state = mode;
  }

  Future<void> cycle() async {
    final next = switch (state) {
      ThemeMode.system => ThemeMode.light,
      ThemeMode.light => ThemeMode.dark,
      ThemeMode.dark => ThemeMode.system,
    };
    await setMode(next);
  }
}
