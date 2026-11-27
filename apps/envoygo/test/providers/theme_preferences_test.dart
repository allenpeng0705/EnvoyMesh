import 'package:envoygo/services/theme_preferences.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('ThemePreferences round-trips light/dark/system', () async {
    expect(await ThemePreferences.getMode(), ThemeMode.system);
    await ThemePreferences.setMode(ThemeMode.dark);
    expect(await ThemePreferences.getMode(), ThemeMode.dark);
    await ThemePreferences.setMode(ThemeMode.light);
    expect(await ThemePreferences.getMode(), ThemeMode.light);
    await ThemePreferences.setMode(ThemeMode.system);
    expect(await ThemePreferences.getMode(), ThemeMode.system);
  });
}
