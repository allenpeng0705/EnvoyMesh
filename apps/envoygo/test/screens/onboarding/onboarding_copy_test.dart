import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/screens/onboarding/setup_guide_screen.dart';
import 'package:envoygo/screens/onboarding/welcome_slides_screen.dart';
import 'package:envoygo/services/feature_flags.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Onboarding must never promise unpaired use while the mobile node is off: no
/// "you can still Discover / chat on this phone's mesh" copy anywhere.
void main() {
  late AppLocalizations l10n;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    l10n = await AppLocalizations.delegate.load(const Locale('en'));
  });

  Widget wrap(Widget child, {bool mobileNodeEnabled = false}) => ProviderScope(
        overrides: [
          featureFlagsProvider.overrideWith(
            (ref) => FeatureFlagsNotifier.withInitial(
              FeatureFlags(mobileNodeEnabled: mobileNodeEnabled),
            ),
          ),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          locale: const Locale('en'),
          home: child,
        ),
      );

  group('welcome slides', () {
    /// Advance to the last slide via the primary button (one tap = one page).
    Future<void> advanceToLastSlide(WidgetTester tester) async {
      for (var i = 0; i < 3; i++) {
        await tester.tap(find.byType(FilledButton));
        await tester.pumpAndSettle();
      }
    }

    testWidgets('unpaired + mobile node off → no unpaired-use promise',
        (tester) async {
      await tester.pumpWidget(
        wrap(WelcomeSlidesScreen(onFinished: () {}, requirePairing: true)),
      );
      await advanceToLastSlide(tester);

      expect(find.text(l10n.welcomeSlideRequiredTitle), findsOneWidget);
      expect(find.text(l10n.welcomeSlide4Title), findsNothing);
      expect(find.textContaining('this phone\u2019s mesh'), findsNothing);
    });

    testWidgets('mobile node on → the mesh slide is allowed', (tester) async {
      await tester.pumpWidget(
        wrap(
          WelcomeSlidesScreen(onFinished: () {}, requirePairing: false),
          mobileNodeEnabled: true,
        ),
      );
      await advanceToLastSlide(tester);

      expect(find.text(l10n.welcomeSlide4Title), findsOneWidget);
    });
  });

  group('setup guide bottom card', () {
    /// The card is the last child of a lazy ListView: scroll it into view.
    /// Target a specific string — the gate also renders a banner container, so
    /// scrolling to "the last DecoratedBox" is not deterministic.
    Future<void> scrollTo(WidgetTester tester, Finder target) async {
      await tester.scrollUntilVisible(
        target,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
    }

    testWidgets('mobile node off → offers "pair later", not phone chats',
        (tester) async {
      await tester.pumpWidget(wrap(const SetupGuideScreen(requirePairing: true)));
      await scrollTo(tester, find.text(l10n.setupGuideNoHomeBody));

      expect(find.text(l10n.setupGuideNoHomeTitle), findsOneWidget);
      expect(find.text(l10n.setupGuidePhoneOnlyTitle), findsNothing);
      expect(find.text(l10n.setupGuidePhoneOnlyBody), findsNothing);
      expect(find.textContaining('Discover'), findsNothing);
    });

    testWidgets('mobile node on → keeps the phone-only card', (tester) async {
      await tester.pumpWidget(
        wrap(const SetupGuideScreen(), mobileNodeEnabled: true),
      );
      await scrollTo(tester, find.text(l10n.setupGuidePhoneOnlyBody));

      expect(find.text(l10n.setupGuidePhoneOnlyTitle), findsOneWidget);
      expect(find.text(l10n.setupGuideNoHomeTitle), findsNothing);
    });
  });
}
