import 'package:shared_preferences/shared_preferences.dart';

/// One-time tip: Coding left the bottom bar and lives under Me.
class CodingMovedTip {
  static const key = 'coding_moved_to_me_tip_dismissed';

  static Future<bool> isDismissed() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(key) ?? false;
  }

  static Future<void> dismiss() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, true);
  }
}
