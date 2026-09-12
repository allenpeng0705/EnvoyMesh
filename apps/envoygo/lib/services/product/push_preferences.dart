import 'package:shared_preferences/shared_preferences.dart';

/// Phase 50 / 51E — in-app push notification toggle.
///
/// When the user turns push OFF in the app settings (not the OS system
/// settings), EnvoyGo:
///   1. Saves `pushEnabled: false` in SharedPreferences (keyed by profileId).
///   2. On reconnect, `registerPushToken()` checks `isEnabled()` and skips
///      registration entirely. The home node has no token → no push.
///   3. Any previously-registered token naturally expires via APNs/FCM 410
///      token cleanup (`sendAndCleanup` on the home node).
///
/// When turned back ON:
///   1. Saves `pushEnabled: true`.
///   2. Calls `registerPushToken()` to re-register the token.
///
/// Phase 51E — keys are scoped by family `profileId` so Dad and Mom on
/// different devices (or re-pair) keep independent toggles.
class PushPreferences {
  static const _legacyKey = 'push_notifications_enabled';

  static String _key(String? profileId) {
    final id = (profileId ?? 'owner').trim();
    return 'push_notifications_enabled_${id.isEmpty ? 'owner' : id}';
  }

  /// Returns true if push notifications are enabled (default: true).
  static Future<bool> isEnabled({String? profileId}) async {
    final prefs = await SharedPreferences.getInstance();
    final scoped = prefs.getBool(_key(profileId));
    if (scoped != null) return scoped;
    // Migrate pre-51E single toggle once.
    return prefs.getBool(_legacyKey) ?? true;
  }

  /// Set push notifications enabled/disabled for [profileId].
  static Future<void> setEnabled(bool enabled, {String? profileId}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key(profileId), enabled);
  }
}
