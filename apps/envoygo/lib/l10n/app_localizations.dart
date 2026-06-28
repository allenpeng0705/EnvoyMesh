import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_it.dart';
import 'app_localizations_ja.dart';
import 'app_localizations_ko.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('de'),
    Locale('en'),
    Locale('fr'),
    Locale('it'),
    Locale('ja'),
    Locale('ko'),
    Locale('zh'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'EnvoyGo'**
  String get appTitle;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @languageSystem.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get languageSystem;

  /// No description provided for @languageEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get languageEnglish;

  /// No description provided for @languageChinese.
  ///
  /// In en, this message translates to:
  /// **'中文'**
  String get languageChinese;

  /// No description provided for @languageKorean.
  ///
  /// In en, this message translates to:
  /// **'한국어'**
  String get languageKorean;

  /// No description provided for @languageJapanese.
  ///
  /// In en, this message translates to:
  /// **'日本語'**
  String get languageJapanese;

  /// No description provided for @languageFrench.
  ///
  /// In en, this message translates to:
  /// **'Français'**
  String get languageFrench;

  /// No description provided for @languageGerman.
  ///
  /// In en, this message translates to:
  /// **'Deutsch'**
  String get languageGerman;

  /// No description provided for @languageItalian.
  ///
  /// In en, this message translates to:
  /// **'Italiano'**
  String get languageItalian;

  /// No description provided for @sectionAiEngine.
  ///
  /// In en, this message translates to:
  /// **'AI Engine'**
  String get sectionAiEngine;

  /// No description provided for @sectionChains.
  ///
  /// In en, this message translates to:
  /// **'Chains'**
  String get sectionChains;

  /// No description provided for @refresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @saving.
  ///
  /// In en, this message translates to:
  /// **'Saving…'**
  String get saving;

  /// No description provided for @aiEngineTitle.
  ///
  /// In en, this message translates to:
  /// **'AI Engine'**
  String get aiEngineTitle;

  /// No description provided for @aiEngineModeBoth.
  ///
  /// In en, this message translates to:
  /// **'Built-in + Ext'**
  String get aiEngineModeBoth;

  /// No description provided for @aiEngineModeOpenclawOnly.
  ///
  /// In en, this message translates to:
  /// **'Built-in only'**
  String get aiEngineModeOpenclawOnly;

  /// No description provided for @aiEngineModeExtOnly.
  ///
  /// In en, this message translates to:
  /// **'Ext only'**
  String get aiEngineModeExtOnly;

  /// No description provided for @aiEngineModeOff.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get aiEngineModeOff;

  /// No description provided for @builtInOpenClaw.
  ///
  /// In en, this message translates to:
  /// **'Built-in OpenClaw'**
  String get builtInOpenClaw;

  /// No description provided for @externalAgentBridge.
  ///
  /// In en, this message translates to:
  /// **'External Agent Bridge'**
  String get externalAgentBridge;

  /// No description provided for @statusDisabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get statusDisabled;

  /// No description provided for @statusRunning.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get statusRunning;

  /// No description provided for @statusConfiguredNotRunning.
  ///
  /// In en, this message translates to:
  /// **'Configured (not running)'**
  String get statusConfiguredNotRunning;

  /// No description provided for @aiEngineReadOnlyHint.
  ///
  /// In en, this message translates to:
  /// **'Built-in OpenClaw is read-only on mobile (edit node-config.json on the home node). Configure External Agent Bridge below — changes sync to the home node and Social.'**
  String get aiEngineReadOnlyHint;

  /// No description provided for @extAgentTitle.
  ///
  /// In en, this message translates to:
  /// **'External Agent Bridge'**
  String get extAgentTitle;

  /// No description provided for @extAgentRefreshTooltip.
  ///
  /// In en, this message translates to:
  /// **'Refresh from home node'**
  String get extAgentRefreshTooltip;

  /// No description provided for @extAgentSyncHint.
  ///
  /// In en, this message translates to:
  /// **'Changes save to your home node and sync to Social on this account.'**
  String get extAgentSyncHint;

  /// No description provided for @extAgentConnectFirst.
  ///
  /// In en, this message translates to:
  /// **'Connect to your home node to configure the external agent bridge.'**
  String get extAgentConnectFirst;

  /// No description provided for @extAgentEnableLabel.
  ///
  /// In en, this message translates to:
  /// **'Enable external agent bridge'**
  String get extAgentEnableLabel;

  /// No description provided for @extAgentActiveBackend.
  ///
  /// In en, this message translates to:
  /// **'Active backend'**
  String get extAgentActiveBackend;

  /// No description provided for @extAgentAddCustom.
  ///
  /// In en, this message translates to:
  /// **'Add custom agent…'**
  String get extAgentAddCustom;

  /// No description provided for @extAgentIdLabel.
  ///
  /// In en, this message translates to:
  /// **'Agent ID'**
  String get extAgentIdLabel;

  /// No description provided for @extAgentIdPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'my-agent'**
  String get extAgentIdPlaceholder;

  /// No description provided for @extAgentIdHint.
  ///
  /// In en, this message translates to:
  /// **'Short id (letters, numbers, hyphens).'**
  String get extAgentIdHint;

  /// No description provided for @extAgentNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Agent label'**
  String get extAgentNameLabel;

  /// No description provided for @extAgentNamePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'e.g. HomeClaw'**
  String get extAgentNamePlaceholder;

  /// No description provided for @extAgentUrlLabel.
  ///
  /// In en, this message translates to:
  /// **'Agent connection URL'**
  String get extAgentUrlLabel;

  /// No description provided for @extAgentSaveError.
  ///
  /// In en, this message translates to:
  /// **'Enter an agent ID, label, and connection URL for the custom agent.'**
  String get extAgentSaveError;

  /// No description provided for @extAgentStatusStopped.
  ///
  /// In en, this message translates to:
  /// **'Stopped'**
  String get extAgentStatusStopped;

  /// No description provided for @extAgentStatusUnknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get extAgentStatusUnknown;

  /// No description provided for @extAgentHintHomeclaw.
  ///
  /// In en, this message translates to:
  /// **'Start HomeClaw on the home computer (port 8010).'**
  String get extAgentHintHomeclaw;

  /// No description provided for @extAgentHintHermes.
  ///
  /// In en, this message translates to:
  /// **'Hermes — the home node auto-starts the local helper (port 8020).'**
  String get extAgentHintHermes;

  /// No description provided for @extAgentHintOpenhuman.
  ///
  /// In en, this message translates to:
  /// **'OpenHuman — the home node auto-starts the local helper (port 8021).'**
  String get extAgentHintOpenhuman;

  /// No description provided for @extAgentHintCustom.
  ///
  /// In en, this message translates to:
  /// **'Custom agent — start it on the home computer and set the message URL.'**
  String get extAgentHintCustom;

  /// No description provided for @modelProviderTitle.
  ///
  /// In en, this message translates to:
  /// **'Model provider'**
  String get modelProviderTitle;

  /// No description provided for @modelProviderRefreshTooltip.
  ///
  /// In en, this message translates to:
  /// **'Refresh from home node'**
  String get modelProviderRefreshTooltip;

  /// No description provided for @modelProviderSyncHint.
  ///
  /// In en, this message translates to:
  /// **'Changes save to your home node and sync to Social on this account.'**
  String get modelProviderSyncHint;

  /// No description provided for @modelProviderConnectFirst.
  ///
  /// In en, this message translates to:
  /// **'Connect to your home node to configure the model provider.'**
  String get modelProviderConnectFirst;

  /// No description provided for @providerLabel.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get providerLabel;

  /// No description provided for @modelProviderModeMock.
  ///
  /// In en, this message translates to:
  /// **'Mock (testing)'**
  String get modelProviderModeMock;

  /// No description provided for @modelProviderModeOpenAi.
  ///
  /// In en, this message translates to:
  /// **'OpenAI-compatible'**
  String get modelProviderModeOpenAi;

  /// No description provided for @modelProviderModeAnthropic.
  ///
  /// In en, this message translates to:
  /// **'Anthropic-compatible'**
  String get modelProviderModeAnthropic;

  /// No description provided for @modelProviderModeDisabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get modelProviderModeDisabled;

  /// No description provided for @endpointUrlLabel.
  ///
  /// In en, this message translates to:
  /// **'Endpoint URL'**
  String get endpointUrlLabel;

  /// No description provided for @modelNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Model name'**
  String get modelNameLabel;

  /// No description provided for @modelNameHint.
  ///
  /// In en, this message translates to:
  /// **'gpt-4o-mini'**
  String get modelNameHint;

  /// No description provided for @apiKeyLabel.
  ///
  /// In en, this message translates to:
  /// **'API key'**
  String get apiKeyLabel;

  /// No description provided for @savedSyncedToHome.
  ///
  /// In en, this message translates to:
  /// **'Saved — synced to home node'**
  String get savedSyncedToHome;

  /// No description provided for @endpointHintOpenAi.
  ///
  /// In en, this message translates to:
  /// **'https://api.openai.com/v1'**
  String get endpointHintOpenAi;

  /// No description provided for @endpointHintAnthropic.
  ///
  /// In en, this message translates to:
  /// **'https://api.anthropic.com'**
  String get endpointHintAnthropic;

  /// No description provided for @endpointHintDefault.
  ///
  /// In en, this message translates to:
  /// **'https://api.example.com/v1'**
  String get endpointHintDefault;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'de',
    'en',
    'fr',
    'it',
    'ja',
    'ko',
    'zh',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
    case 'it':
      return AppLocalizationsIt();
    case 'ja':
      return AppLocalizationsJa();
    case 'ko':
      return AppLocalizationsKo();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
