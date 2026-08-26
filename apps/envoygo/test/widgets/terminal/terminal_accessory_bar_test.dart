import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/widgets/terminal/terminal_accessory_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Widget child) => MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(body: child),
);

void main() {
  testWidgets('coding row exposes primary commands and sends help', (
    tester,
  ) async {
    final sent = <String>[];
    await tester.pumpWidget(
      _app(
        TerminalAccessoryBar(
          mode: TerminalAccessoryMode.pi,
          onKey: sent.add,
          supportedCommands: const {'/help', '/review', '/diff', '/compact'},
        ),
      ),
    );
    expect(find.text('/review'), findsOneWidget);
    expect(find.text('/diff'), findsOneWidget);
    expect(find.text('More…'), findsOneWidget);
    await tester.tap(find.byType(ActionChip).first);
    expect(sent, ['/help\n']);
  });

  testWidgets('more sheet explains context actions', (tester) async {
    await tester.pumpWidget(
      _app(
        TerminalAccessoryBar(
          mode: TerminalAccessoryMode.envoyHarness,
          onKey: (_) {},
          supportedCommands: const {'/compact', '/plan', '/status'},
        ),
      ),
    );
    await tester.tap(find.text('More…'));
    await tester.pumpAndSettle();
    expect(find.text('Compact context'), findsOneWidget);
    expect(find.text('Show or update plan'), findsOneWidget);
    expect(find.text('Harness status'), findsOneWidget);
  });
}
