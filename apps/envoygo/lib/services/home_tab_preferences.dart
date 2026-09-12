import 'package:shared_preferences/shared_preferences.dart';

/// Persists the last [HomeScreen] bottom-nav tab **id** (not index).
class HomeTabPreferences {
  static const _key = 'envoygo.home_selected_tab_id';

  static Future<String?> getSelectedTabId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_key);
  }

  static Future<void> setSelectedTabId(String tabId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, tabId);
  }
}
