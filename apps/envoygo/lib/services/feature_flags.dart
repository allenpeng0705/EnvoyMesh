import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Feature flags for EnvoyGo.
///
/// Currently just the **mobile node** — the on-device phone persona (its own
/// mesh identity, LAN/WAN discovery, phone-plane direct chat). In practice it
/// only buys unpaired chatting today, so it ships **off by default** and stays
/// available for investigation:
///
/// - default comes from the build: `--dart-define=ENVOYGO_MOBILE_NODE=1`
/// - a runtime override exists (Me → Settings → Advanced) but is only shown
///   when the build flag is on, so a normal release has no user-visible switch
///
/// Nothing is deleted when the flag is off: the phone persona's identity,
/// contacts and DM history stay on disk and reappear when it is turned back on.
class FeatureFlags {
  FeatureFlags({
    bool? mobileNodeEnabled,
    this.mobileNodeOverrideAvailable = false,
  }) : mobileNodeEnabled = mobileNodeEnabled ?? compileDefaultMobileNode;

  /// Build-time default. Off unless the app is built with the dart-define.
  static const bool compileDefaultMobileNode =
      bool.fromEnvironment('ENVOYGO_MOBILE_NODE', defaultValue: false);

  /// Whether this build exposes the runtime override switch.
  ///
  /// `--dart-define=ENVOYGO_MOBILE_NODE_TOGGLE=1` (implies nothing about the
  /// default) — used for developer builds so the flag can be flipped on a real
  /// device without rebuilding.
  static const bool compileToggleVisible =
      bool.fromEnvironment('ENVOYGO_MOBILE_NODE_TOGGLE', defaultValue: false);

  static const _prefsKey = 'envoygo.flags.mobile_node_enabled';

  final bool mobileNodeEnabled;
  final bool mobileNodeOverrideAvailable;

  FeatureFlags copyWith({bool? mobileNodeEnabled}) => FeatureFlags(
        mobileNodeEnabled: mobileNodeEnabled ?? this.mobileNodeEnabled,
        mobileNodeOverrideAvailable: mobileNodeOverrideAvailable,
      );

  /// Resolve the effective flag value (pure; unit-tested).
  ///
  /// A stored override is honoured **only** in builds that expose the switch.
  /// Release builds always follow their own dart-define default, so flipping the
  /// switch in a dev build can never leave the mobile node enabled in a shipping
  /// build installed over it on the same device.
  static bool resolveMobileNodeEnabled({
    required bool? storedOverride,
    bool toggleVisible = compileToggleVisible,
    bool compileDefault = compileDefaultMobileNode,
  }) {
    if (!toggleVisible) return compileDefault;
    return storedOverride ?? compileDefault;
  }

  /// Load the persisted override (see [resolveMobileNodeEnabled]).
  ///
  /// Call this **once**, before `runApp`, and seed the provider with
  /// [FeatureFlagsNotifier.withInitial] so every reader sees the same resolved
  /// value from the first frame.
  static Future<FeatureFlags> load() async {
    final prefs = await SharedPreferences.getInstance();
    return FeatureFlags(
      mobileNodeEnabled: resolveMobileNodeEnabled(
        storedOverride: prefs.getBool(_prefsKey),
      ),
      mobileNodeOverrideAvailable: compileToggleVisible,
    );
  }

  Future<void> persist() async {
    if (!mobileNodeOverrideAvailable) return; // release builds store nothing
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefsKey, mobileNodeEnabled);
  }
}

/// Runtime feature flags (hydrated from prefs; see [FeatureFlags.load]).
final featureFlagsProvider =
    StateNotifierProvider<FeatureFlagsNotifier, FeatureFlags>((ref) {
  return FeatureFlagsNotifier();
});

/// Convenience read for widgets: `ref.watch(mobileNodeEnabledProvider)`.
final mobileNodeEnabledProvider = Provider<bool>((ref) {
  return ref.watch(featureFlagsProvider).mobileNodeEnabled;
});

class FeatureFlagsNotifier extends StateNotifier<FeatureFlags> {
  /// Prefer [FeatureFlagsNotifier.withInitial] with a value resolved before
  /// `runApp` (see `main.dart`): the flag is then correct on the very first
  /// frame instead of flipping from the build default a moment later.
  FeatureFlagsNotifier({FeatureFlags? initial}) : super(initial ?? FeatureFlags()) {
    _hydrated = initial != null;
    if (initial == null) _hydrate();
  }

  /// Seed from a value already loaded with [FeatureFlags.load].
  FeatureFlagsNotifier.withInitial(FeatureFlags initial) : this(initial: initial);

  bool _hydrated = false;
  bool get hydrated => _hydrated;

  Future<void> _hydrate() async {
    try {
      final loaded = await FeatureFlags.load();
      if (!mounted) return;
      state = loaded;
      _hydrated = true;
      debugPrint(
        '[featureFlags] mobileNode=${loaded.mobileNodeEnabled ? 'on' : 'off'} '
        '(build default=${FeatureFlags.compileDefaultMobileNode ? 'on' : 'off'})',
      );
    } catch (e) {
      debugPrint('[featureFlags] hydrate failed: $e');
      _hydrated = true;
    }
  }

  Future<void> setMobileNodeEnabled(bool enabled) async {
    state = state.copyWith(mobileNodeEnabled: enabled);
    try {
      await state.persist();
    } catch (e) {
      debugPrint('[featureFlags] persist failed: $e');
    }
  }
}
