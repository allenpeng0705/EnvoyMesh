import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/screens/onboarding/setup_guide_screen.dart';
import 'package:envoygo/services/feature_flags.dart';
import 'package:envoygo/widgets/pair_required_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One panel, one explanation, one action — shared by Social, Terminal and
/// Knowledge so the unpaired state never says three different things.
void main() {
  late AppLocalizations l10n;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    l10n = await AppLocalizations.delegate.load(const Locale('en'));
  });

  Future<void> pumpPanel(WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        featureFlagsProvider.overrideWith(
          (ref) => FeatureFlagsNotifier.withInitial(FeatureFlags()),
        ),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('en'),
        home: const Scaffold(body: PairRequiredPanel(icon: Icons.terminal)),
      ),
    ));
  }

  testWidgets('shows the merged copy, the pair button and the guide link',
      (tester) async {
    await pumpPanel(tester);

    expect(find.text(l10n.setupGuidePairRequiredTitle), findsOneWidget);
    expect(find.text(l10n.pairRequiredBody), findsOneWidget);
    // The body must keep the no-install family path discoverable.
    expect(l10n.pairRequiredBody.toLowerCase(), contains('invite'));
    expect(find.widgetWithText(FilledButton, l10n.setupGuidePairCta), findsOneWidget);
    expect(find.text(l10n.setupGuideTitle), findsOneWidget);
  });

  testWidgets('"How EnvoyGo works" opens the guide without pairing',
      (tester) async {
    await pumpPanel(tester);
    await tester.tap(find.text(l10n.setupGuideTitle));
    await tester.pumpAndSettle();

    expect(find.byType(SetupGuideScreen), findsOneWidget);
    // Informational modal (its own "Got it"), not the onboarding gate.
    expect(find.text(l10n.setupGuideDoneCta), findsOneWidget);
    expect(find.text(l10n.setupGuidePairLaterCta), findsNothing);
  });
}
