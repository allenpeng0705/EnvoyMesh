import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/screens/onboarding/setup_guide_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The pairing gate offers "Pair later": it must hand control back to the caller
/// (never pop the root route) so the app shell opens as it did before.
void main() {
  late AppLocalizations l10n;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    l10n = await AppLocalizations.delegate.load(const Locale('en'));
  });

  Widget wrap(Widget child) => MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('en'),
        home: child,
      );

  testWidgets('gate mode calls onPairLater instead of closing the route',
      (tester) async {
    var deferred = false;
    await tester.pumpWidget(wrap(SetupGuideScreen(
      isFirstLaunch: true,
      requirePairing: true,
      onPairLater: () => deferred = true,
    )));

    expect(find.text(l10n.setupGuidePairCta), findsOneWidget);
    expect(find.text(l10n.setupGuidePairLaterCta), findsOneWidget);

    await tester.tap(find.text(l10n.setupGuidePairLaterCta));
    await tester.pumpAndSettle();

    expect(deferred, isTrue);
    // Still mounted: the gate never dismantles the root route by itself.
    expect(find.byType(SetupGuideScreen), findsOneWidget);
  });

  testWidgets('the non-gate modal keeps its own skip affordance',
      (tester) async {
    await tester.pumpWidget(wrap(const SetupGuideScreen(isFirstLaunch: true)));

    expect(find.text(l10n.setupGuideSkipCta), findsOneWidget);
    expect(find.text(l10n.setupGuidePairLaterCta), findsNothing);
  });
}
