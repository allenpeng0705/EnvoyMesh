import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:envoygo/l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Wraps a widget in [MaterialApp] with EnvoyGo localization delegates.
Widget wrapWithL10n(
  Widget child, {
  Locale locale = const Locale('en'),
  List<Override>? overrides,
}) {
  return ProviderScope(
    overrides: overrides ?? const [],
    child: MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: child),
    ),
  );
}

/// Pumps [child] after localization has loaded.
Future<void> pumpLocalizedWidget(
  WidgetTester tester,
  Widget child, {
  Locale locale = const Locale('en'),
  List<Override>? overrides,
}) async {
  await tester.pumpWidget(wrapWithL10n(child, locale: locale, overrides: overrides));
  await tester.pumpAndSettle();
}
