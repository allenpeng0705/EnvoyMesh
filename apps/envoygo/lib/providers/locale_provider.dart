import 'dart:ui' show Locale;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/locale_preferences.dart';

/// App locale override. `null` means follow the device/system locale.
///
/// Prefer constructing via [LocaleOverrideNotifier.withInitial] after awaiting
/// [LocalePreferences.getOverride] in `main()` so the first frame does not
/// flash the system language when the user has a saved override.
final localeOverrideProvider =
    StateNotifierProvider<LocaleOverrideNotifier, Locale?>(
  (ref) => LocaleOverrideNotifier.withInitial(null),
);

class LocaleOverrideNotifier extends StateNotifier<Locale?> {
  LocaleOverrideNotifier.withInitial(String? languageCode)
      : super(languageCode == null ? null : Locale(languageCode));

  Future<void> setLanguageCode(String? languageCode) async {
    await LocalePreferences.setOverride(languageCode);
    state = languageCode == null ? null : Locale(languageCode);
  }
}
