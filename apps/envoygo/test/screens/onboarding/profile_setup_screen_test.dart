import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/providers/social_context_provider.dart';
import 'package:envoygo/screens/onboarding/profile_setup_screen.dart';
import 'package:envoygo/services/onboarding_preferences.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Onboarding profile step: it must work with **no home node**, save interests
/// (the discovery vocabulary), be skippable without blocking first launch, and
/// remember the outcome.
void main() {
  late PhoneSocialBackend backend;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    backend = PhoneSocialBackend(
      persona: await PhoneIdentityStore.memory().create(),
      transport: FakeMeshEnvelopeTransport(),
    );
  });

  tearDown(() async {
    await backend.dispose();
  });

  Future<void> pumpStep(WidgetTester tester, {required VoidCallback onDone}) {
    return tester.pumpWidget(
      ProviderScope(
        overrides: [
          phoneSocialBackendProvider.overrideWithValue(backend),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          locale: const Locale('en'),
          home: ProfileSetupScreen(onDone: onDone),
        ),
      ),
    );
  }

  testWidgets('saves name + interests and marks the step done', (tester) async {
    var done = 0;
    await pumpStep(tester, onDone: () => done++);

    await tester.enterText(find.byType(TextField).first, 'Alice Phone');
    await tester.enterText(find.byType(TextField).last, 'home networking');
    await tester.tap(find.text('Add'));
    await tester.pump();

    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(backend.store.profile['displayName'], 'Alice Phone');
    expect(backend.store.profile['hobbies'], ['home networking']);
    // Interests are searchable, so the step opts into public visibility.
    expect(backend.store.profile['profileVisibility'], 'public');
    expect(backend.hasProfile, isTrue);
    expect(await OnboardingPreferences.hasCompletedProfileStep(), isTrue);
    expect(done, 1);
  });

  testWidgets('skip records the step without writing a profile', (tester) async {
    var done = 0;
    await pumpStep(tester, onDone: () => done++);

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(backend.hasProfile, isFalse);
    expect(await OnboardingPreferences.hasCompletedProfileStep(), isTrue);
    expect(done, 1);
  });

  testWidgets('a name is required to save, but skipping still works', (tester) async {
    var done = 0;
    await pumpStep(tester, onDone: () => done++);

    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.textContaining('display name'), findsWidgets);
    expect(backend.hasProfile, isFalse);
    expect(done, 0, reason: 'still on the step');

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    expect(done, 1);
    expect(await OnboardingPreferences.hasCompletedProfileStep(), isTrue);
  });
}
