import 'package:shared_preferences/shared_preferences.dart';

/// Phase 50 — in-app push notification toggle.
///
/// When the user turns push OFF in the app settings (not the OS system
/// settings), EnvoyGo:
///   1. Saves `pushEnabled: false` in SharedPreferences.
///   2. Calls `unregisterPushToken` on the home node (removes the token).
///   3. On reconnect, skips token re-registration.
///
/// When turned back ON:
///   1. Saves `pushEnabled: true`.
///   2. Re-registers the token (if already obtained).
///
/// This needs no server-side changes — the home node simply has no token
/// to push to when push is disabled.
class PushPreferences {
  static const _key = 'push_notifications_enabled';

  /// Returns true if push notifications are enabled (default: true).
  static Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_key) ?? true;
  }

  /// Set push notifications enabled/disabled.
  static Future<void> setEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, enabled);
  }
}
