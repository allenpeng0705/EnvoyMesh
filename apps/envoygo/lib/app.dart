import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

/// EnvoyGo — Flutter thin client for EnvoyMesh remote access.
class EnvoyGoApp extends StatelessWidget {
  const EnvoyGoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EnvoyGo',
      debugShowCheckedModeBanner: false,
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
