import 'package:shared_preferences/shared_preferences.dart';

/// Locale preference for EnvoyGo UI.
///
/// `null` / empty → follow the device language (system default).
/// Otherwise a Social-compatible language id: en, zh, ko, ja, fr, de, it.
class LocalePreferences {
  static const key = 'app_locale';

  /// Supported language ids — same set as Social (`SUPPORTED_LOCALES`).
  static const supportedLanguageCodes = [
    'en',
    'zh',
    'ko',
    'ja',
    'fr',
    'de',
    'it',
  ];

  /// Native labels for the language picker (match Social `LOCALE_OPTIONS`).
  static const labels = <String, String>{
    'en': 'English',
    'zh': '中文',
    'ko': '한국어',
    'ja': '日本語',
    'fr': 'Français',
    'de': 'Deutsch',
    'it': 'Italiano',
  };

  /// Returns stored override, or `null` for system default.
  static Future<String?> getOverride() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(key)?.trim().toLowerCase();
    if (raw == null || raw.isEmpty || raw == 'system') return null;
    if (!supportedLanguageCodes.contains(raw)) return null;
    return raw;
  }

  /// Persist override. Pass `null` to clear (system default).
  static Future<void> setOverride(String? languageCode) async {
    final prefs = await SharedPreferences.getInstance();
    if (languageCode == null || languageCode.trim().isEmpty) {
      await prefs.remove(key);
      return;
    }
    final code = languageCode.trim().toLowerCase();
    if (!supportedLanguageCodes.contains(code)) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, code);
  }
}
