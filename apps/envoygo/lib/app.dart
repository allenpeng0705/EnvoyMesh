import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'l10n/app_localizations.dart';
import 'providers/locale_provider.dart';
import 'screens/home_screen.dart';
import 'theme/app_theme.dart';

/// EnvoyGo — Flutter thin client for EnvoyMesh remote access.
class EnvoyGoApp extends ConsumerWidget {
  // ignore: prefer_const_constructors_in_immutables
  EnvoyGoApp({super.key});

  /// Global navigator key used by the push-notification deep-link router
  /// to navigate from outside the widget tree (no BuildContext needed).
  /// Phase 50 — tapping a notification pushes the target screen via
  /// `navigatorKey.currentState!.push(...)`.
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>(debugLabel: 'envoygo_root');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final localeOverride = ref.watch(localeOverrideProvider);

    return MaterialApp(
      title: 'EnvoyGo',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: ThemeMode.system,
      locale: localeOverride,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      localeResolutionCallback: (deviceLocale, supported) {
        if (localeOverride != null) return localeOverride;
        if (deviceLocale == null) return const Locale('en');
        for (final locale in supported) {
          if (locale.languageCode == deviceLocale.languageCode) {
            return locale;
          }
        }
        return const Locale('en');
      },
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      home: const HomeScreen(),
    );
  }
}
