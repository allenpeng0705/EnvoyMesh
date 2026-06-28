// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get language => 'Sprache';

  @override
  String get languageSystem => 'Systemstandard';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageChinese => '中文';

  @override
  String get languageKorean => '한국어';

  @override
  String get languageJapanese => '日本語';

  @override
  String get languageFrench => 'Français';

  @override
  String get languageGerman => 'Deutsch';

  @override
  String get languageItalian => 'Italiano';

  @override
  String get sectionAiEngine => 'KI-Engine';

  @override
  String get sectionChains => 'Chains';

  @override
  String get refresh => 'Aktualisieren';

  @override
  String get save => 'Speichern';

  @override
  String get saving => 'Speichern…';

  @override
  String get aiEngineTitle => 'KI-Engine';

  @override
  String get aiEngineModeBoth => 'Integriert + Ext';

  @override
  String get aiEngineModeOpenclawOnly => 'Nur integriert';

  @override
  String get aiEngineModeExtOnly => 'Nur Ext';

  @override
  String get aiEngineModeOff => 'Keine';

  @override
  String get builtInOpenClaw => 'Integriertes OpenClaw';

  @override
  String get externalAgentBridge => 'Externe-Agenten-Bridge';

  @override
  String get statusDisabled => 'Deaktiviert';

  @override
  String get statusRunning => 'Läuft';

  @override
  String get statusConfiguredNotRunning => 'Konfiguriert (läuft nicht)';

  @override
  String get aiEngineReadOnlyHint =>
      'Built-in OpenClaw is read-only on mobile (edit node-config.json on the home node). Configure External Agent Bridge below — changes sync to the home node and Social.';

  @override
  String get extAgentTitle => 'External Agent Bridge';

  @override
  String get extAgentRefreshTooltip => 'Refresh from home node';

  @override
  String get extAgentSyncHint =>
      'Changes save to your home node and sync to Social on this account.';

  @override
  String get extAgentConnectFirst =>
      'Connect to your home node to configure the external agent bridge.';

  @override
  String get extAgentEnableLabel => 'Enable external agent bridge';

  @override
  String get extAgentActiveBackend => 'Active backend';

  @override
  String get extAgentAddCustom => 'Add custom agent…';

  @override
  String get extAgentIdLabel => 'Agent ID';

  @override
  String get extAgentIdPlaceholder => 'my-agent';

  @override
  String get extAgentIdHint => 'Short id (letters, numbers, hyphens).';

  @override
  String get extAgentNameLabel => 'Agent label';

  @override
  String get extAgentNamePlaceholder => 'e.g. HomeClaw';

  @override
  String get extAgentUrlLabel => 'Agent connection URL';

  @override
  String get extAgentSaveError =>
      'Enter an agent ID, label, and connection URL for the custom agent.';

  @override
  String get extAgentStatusStopped => 'Stopped';

  @override
  String get extAgentStatusUnknown => 'Unknown';

  @override
  String get extAgentHintHomeclaw =>
      'Start HomeClaw on the home computer (port 8010).';

  @override
  String get extAgentHintHermes =>
      'Hermes — the home node auto-starts the local helper (port 8020).';

  @override
  String get extAgentHintOpenhuman =>
      'OpenHuman — the home node auto-starts the local helper (port 8021).';

  @override
  String get extAgentHintCustom =>
      'Custom agent — start it on the home computer and set the message URL.';

  @override
  String get modelProviderTitle => 'Modellanbieter';

  @override
  String get modelProviderRefreshTooltip => 'Vom Heimknoten aktualisieren';

  @override
  String get modelProviderSyncHint =>
      'Änderungen werden auf dem Heimknoten gespeichert und mit Social auf diesem Konto synchronisiert.';

  @override
  String get modelProviderConnectFirst =>
      'Verbinden Sie sich mit dem Heimknoten, um den Modellanbieter zu konfigurieren.';

  @override
  String get providerLabel => 'Anbieter';

  @override
  String get modelProviderModeMock => 'Mock (Tests)';

  @override
  String get modelProviderModeOpenAi => 'OpenAI-kompatibel';

  @override
  String get modelProviderModeAnthropic => 'Anthropic-kompatibel';

  @override
  String get modelProviderModeDisabled => 'Deaktiviert';

  @override
  String get endpointUrlLabel => 'Endpunkt-URL';

  @override
  String get modelNameLabel => 'Modellname';

  @override
  String get modelNameHint => 'gpt-4o-mini';

  @override
  String get apiKeyLabel => 'API-Schlüssel';

  @override
  String get savedSyncedToHome => 'Gespeichert — mit Heimknoten synchronisiert';

  @override
  String get endpointHintOpenAi => 'https://api.openai.com/v1';

  @override
  String get endpointHintAnthropic => 'https://api.anthropic.com';

  @override
  String get endpointHintDefault => 'https://api.example.com/v1';
}
