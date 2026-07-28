import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

/// EnvoyGo — Flutter thin client for EnvoyMesh remote access.
class EnvoyGoApp extends StatelessWidget {
  // ignore: prefer_const_constructors_in_immutables
  EnvoyGoApp({super.key});

  /// Global navigator key used by the push-notification deep-link router
  /// to navigate from outside the widget tree (no BuildContext needed).
  /// Phase 50 — tapping a notification pushes the target screen via
  /// `navigatorKey.currentState!.push(...)`.
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>(debugLabel: 'envoygo_root');

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EnvoyGo',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF1A73E8),
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      darkTheme: ThemeData(
        colorSchemeSeed: const Color(0xFF1A73E8),
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      themeMode: ThemeMode.system,
      home: const HomeScreen(),
    );
  }
}
