import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persisted [ThemeMode] for EnvoyGo (light / dark / system).
class ThemePreferences {
  static const key = 'app_theme_mode';

  static Future<ThemeMode> getMode() async {
    final prefs = await SharedPreferences.getInstance();
    switch (prefs.getString(key)) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
      default:
        return ThemeMode.system;
    }
  }

  static Future<void> setMode(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    final value = switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    };
    await prefs.setString(key, value);
  }
}
