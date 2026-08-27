import 'package:shared_preferences/shared_preferences.dart';

const _storageKey = 'envoymesh:eh-review-min-files';

/// Minimum changed-file count before auto-opening review (0 = always).
Future<int> getEhReviewMinFiles() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString(_storageKey);
  if (raw == null) return 1;
  final parsed = int.tryParse(raw);
  if (parsed == null || parsed < 0) return 1;
  return parsed;
}

Future<void> setEhReviewMinFiles(int value) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_storageKey, '${value < 0 ? 0 : value}');
}
