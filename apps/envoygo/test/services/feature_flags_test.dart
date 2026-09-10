import 'package:envoygo/services/feature_flags.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The mobile node (phone persona + on-device mesh) ships off by default: it
/// only buys unpaired chatting today, so it stays behind a flag until it earns
/// its place — but it must be trivially turnable-on for investigation.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('defaults to off without any stored preference', () async {
    final flags = await FeatureFlags.load();
    expect(flags.mobileNodeEnabled, isFalse);
    expect(
      flags.mobileNodeEnabled,
      FeatureFlags.compileDefaultMobileNode,
      reason: 'a debug/test build follows the dart-define default',
    );
  });

  test('a release build ignores a stored override', () async {
    // A dev build may have flipped the switch on this device; a shipping build
    // must still start with the mobile node off.
    expect(
      FeatureFlags.resolveMobileNodeEnabled(
        storedOverride: true,
        toggleVisible: false,
        compileDefault: false,
      ),
      isFalse,
    );
  });

  test('a build with the switch honours the stored value', () {
    expect(
      FeatureFlags.resolveMobileNodeEnabled(
        storedOverride: true,
        toggleVisible: true,
        compileDefault: false,
      ),
      isTrue,
    );
    expect(
      FeatureFlags.resolveMobileNodeEnabled(
        storedOverride: false,
        toggleVisible: true,
        compileDefault: true,
      ),
      isFalse,
    );
    expect(
      FeatureFlags.resolveMobileNodeEnabled(
        storedOverride: null,
        toggleVisible: true,
        compileDefault: false,
      ),
      isFalse,
    );
  });

  test('a stored override is ignored without the toggle dart-define', () async {
    SharedPreferences.setMockInitialValues({
      'envoygo.flags.mobile_node_enabled': true,
    });
    final flags = await FeatureFlags.load();
    expect(flags.mobileNodeEnabled, isFalse);
  });

  test('the runtime toggle updates state and persists in dev builds', () async {
    final notifier = FeatureFlagsNotifier();
    await notifier.setMobileNodeEnabled(true);
    expect(notifier.state.mobileNodeEnabled, isTrue);

    // Persisting is skipped without the toggle dart-define, so a test build
    // never leaves the flag on for the next one.
    final reloaded = await FeatureFlags.load();
    expect(reloaded.mobileNodeEnabled, isFalse);
  });

  test('a seeded notifier is correct on the first frame (no flip)', () {
    // main.dart resolves the flag before runApp and seeds the provider, so a dev
    // build with the switch on must not briefly report "off".
    final container = ProviderContainer(overrides: [
      featureFlagsProvider.overrideWith(
        (ref) => FeatureFlagsNotifier.withInitial(
          FeatureFlags(
            mobileNodeEnabled: true,
            mobileNodeOverrideAvailable: true,
          ),
        ),
      ),
    ]);
    addTearDown(container.dispose);

    expect(container.read(mobileNodeEnabledProvider), isTrue);
    expect(container.read(featureFlagsProvider).mobileNodeEnabled, isTrue);
    expect(container.read(featureFlagsProvider.notifier).hydrated, isTrue);
  });

  test('without seeding, hydration is flagged and lands on prefs', () async {
    SharedPreferences.setMockInitialValues({});
    final container = ProviderContainer();
    addTearDown(container.dispose);

    // Fallback path (tests / other entry points): starts from the build default.
    expect(container.read(featureFlagsProvider.notifier).hydrated, isFalse);
    expect(container.read(mobileNodeEnabledProvider), isFalse);

    await Future<void>.delayed(Duration.zero);
    expect(container.read(featureFlagsProvider.notifier).hydrated, isTrue);
    expect(container.read(mobileNodeEnabledProvider), isFalse);
  });

  test('the provider exposes the flag to widgets', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    // Synchronous first frame: the build default applies until prefs hydrate.
    expect(container.read(mobileNodeEnabledProvider), isFalse);
    await container.read(featureFlagsProvider.notifier).setMobileNodeEnabled(true);
    expect(container.read(mobileNodeEnabledProvider), isTrue);
  });
}
