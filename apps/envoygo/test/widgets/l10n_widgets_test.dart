import 'package:envoygo/providers/locale_provider.dart';
import 'package:envoygo/widgets/ai_engine_section.dart';
import 'package:envoygo/widgets/language_settings_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../helpers/l10n_test_wrapper.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    await LocalDatabase().initialize();
  });

  group('localizedAiEngineMode', () {
    testWidgets('returns Chinese labels when locale is zh', (tester) async {
      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (context) => Text(
              localizedAiEngineMode(context.l10n, AiEngineMode.both),
            ),
          ),
          locale: const Locale('zh'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('内置 + 外部'), findsOneWidget);
    });
  });

  group('LanguageSettingsTile', () {
    testWidgets('shows language picker title', (tester) async {
      await pumpLocalizedWidget(
        tester,
        const LanguageSettingsTile(),
        overrides: [
          localeProvider.overrideWith(() => LocaleController()),
        ],
      );
      expect(find.text('Language'), findsOneWidget);
    });
  });
}
