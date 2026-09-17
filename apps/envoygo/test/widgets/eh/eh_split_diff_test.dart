import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/widgets/eh/eh_split_diff.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    locale: const Locale('en'),
    home: Scaffold(body: child),
  );
}

void main() {
  testWidgets('stacked narrow layout does not throw', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SizedBox(
          width: 320,
          child: SingleChildScrollView(
            child: EhSplitDiff(
              diff: '--- a\n+++ b\n@@\n-old\n+new\n context\n',
            ),
          ),
        ),
      ),
    );
    expect(find.textContaining('old'), findsOneWidget);
    expect(find.textContaining('new'), findsOneWidget);
  });

  testWidgets('wide layout renders side-by-side without throw', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SizedBox(
          width: 800,
          child: EhSplitDiff(
            diff: '--- a\n+++ b\n@@\n-old\n+new\n',
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.textContaining('old'), findsOneWidget);
    expect(find.textContaining('new'), findsOneWidget);
  });
}
