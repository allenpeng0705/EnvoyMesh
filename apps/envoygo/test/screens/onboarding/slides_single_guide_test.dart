import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/screens/onboarding/setup_guide_screen.dart';
import 'package:envoygo/screens/onboarding/welcome_slides_screen.dart';
import 'package:envoygo/services/onboarding_preferences.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Regression: the slides used to push the setup guide themselves, so finishing
/// onboarding showed the guide twice — tap "Explore first" → flash → the same
/// page again with "Pair later". Routing belongs to AppEntry alone.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('finishing the slides does not push a second guide',
      (tester) async {
    var finished = 0;
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('en'),
      home: WelcomeSlidesScreen(onFinished: () => finished++),
    ));

    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byType(FilledButton)); // Continue on the last slide
    await tester.pumpAndSettle();

    expect(finished, 1, reason: 'the slides hand control back exactly once');
    expect(find.byType(SetupGuideScreen), findsNothing,
        reason: 'AppEntry decides what comes next — never the slides');
    expect(await OnboardingPreferences.hasCompletedSlides(), isTrue);
  });
}
