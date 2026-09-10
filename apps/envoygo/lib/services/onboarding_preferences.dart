import 'package:shared_preferences/shared_preferences.dart';

/// First-launch welcome slides + profile setup + setup-guide completion flags.
class OnboardingPreferences {
  static const slidesKey = 'envoygo.onboarding.slides_completed';
  static const profileKey = 'envoygo.onboarding.profile_completed';
  static const guideKey = 'envoygo.onboarding.guide_completed';

  static Future<bool> hasCompletedSlides() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(slidesKey) ?? false;
  }

  static Future<void> setSlidesCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(slidesKey, true);
  }

  /// True once the profile step was saved **or** explicitly skipped.
  ///
  /// Interests are what peers search for, so the step is offered up front — but
  /// it never blocks: skipping only means the phone advertises nothing but the
  /// broad `mesh.discovery` capability until it is filled in from Me.
  static Future<bool> hasCompletedProfileStep() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(profileKey) ?? false;
  }

  static Future<void> setProfileStepCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(profileKey, true);
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
