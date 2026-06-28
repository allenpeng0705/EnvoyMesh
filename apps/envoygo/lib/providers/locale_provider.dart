import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/local_database.dart';

/// Supported UI locales (matches Social + ARB files).
const kSupportedLocaleCodes = ['en', 'zh', 'ko', 'ja', 'fr', 'de', 'it'];

const _prefKey = 'locale';

/// `null` = follow system locale.
class LocaleController extends Notifier<Locale?> {
  @override
  Locale? build() => null;

  Future<void> loadSaved() async {
    await LocalDatabase().initialize();
    final code = await LocalDatabase().getPreference(_prefKey);
    if (code == null || code.isEmpty || code == 'system') {
      state = null;
      return;
    }
    if (kSupportedLocaleCodes.contains(code)) {
      state = Locale(code);
    }
  }

  Future<void> setLocaleCode(String? code) async {
    await LocalDatabase().initialize();
    if (code == null || code == 'system') {
      await LocalDatabase().setPreference(_prefKey, 'system');
      state = null;
      return;
    }
    if (!kSupportedLocaleCodes.contains(code)) return;
    await LocalDatabase().setPreference(_prefKey, code);
    state = Locale(code);
  }

  String currentCodeLabel(BuildContext context) {
    final locale = state ?? Localizations.localeOf(context);
    return locale.languageCode;
  }
}

final localeProvider =
    NotifierProvider<LocaleController, Locale?>(LocaleController.new);
