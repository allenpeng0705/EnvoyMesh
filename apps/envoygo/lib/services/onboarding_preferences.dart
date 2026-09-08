import 'package:shared_preferences/shared_preferences.dart';

/// First-launch welcome slides + setup-guide completion flags.
class OnboardingPreferences {
  static const slidesKey = 'envoygo.onboarding.slides_completed';
  static const guideKey = 'envoygo.onboarding.guide_completed';

  static Future<bool> hasCompletedSlides() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(slidesKey) ?? false;
  }

  static Future<void> setSlidesCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(slidesKey, true);
  }

  static Future<bool> hasCompletedGuide() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(guideKey) ?? false;
  }

  static Future<void> setGuideCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(guideKey, true);
  }
}
