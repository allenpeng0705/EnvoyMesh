// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get language => 'Language';

  @override
  String get languageSystem => 'System default';

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
  String get sectionAiEngine => 'AI Engine';

  @override
  String get sectionChains => 'Chains';

  @override
  String get refresh => 'Refresh';

  @override
  String get save => 'Save';

  @override
  String get saving => 'Saving…';

  @override
  String get aiEngineTitle => 'AI Engine';

  @override
  String get aiEngineModeBoth => 'Built-in + Ext';

  @override
  String get aiEngineModeOpenclawOnly => 'Built-in only';

  @override
  String get aiEngineModeExtOnly => 'Ext only';

  @override
  String get aiEngineModeOff => 'None';

  @override
  String get builtInOpenClaw => 'Built-in OpenClaw';

  @override
  String get externalAgentBridge => 'External Agent Bridge';

  @override
  String get statusDisabled => 'Disabled';

  @override
  String get statusRunning => 'Running';

  @override
  String get statusConfiguredNotRunning => 'Configured (not running)';

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
  String get modelProviderTitle => 'Model provider';

  @override
  String get modelProviderRefreshTooltip => 'Refresh from home node';

  @override
  String get modelProviderSyncHint =>
      'Changes save to your home node and sync to Social on this account.';

  @override
  String get modelProviderConnectFirst =>
      'Connect to your home node to configure the model provider.';

  @override
  String get providerLabel => 'Provider';

  @override
  String get modelProviderModeMock => 'Mock (testing)';

  @override
  String get modelProviderModeOpenAi => 'OpenAI-compatible';

  @override
  String get modelProviderModeAnthropic => 'Anthropic-compatible';

  @override
  String get modelProviderModeDisabled => 'Disabled';

  @override
  String get endpointUrlLabel => 'Endpoint URL';

  @override
  String get modelNameLabel => 'Model name';

  @override
  String get modelNameHint => 'gpt-4o-mini';

  @override
  String get apiKeyLabel => 'API key';

  @override
  String get savedSyncedToHome => 'Saved — synced to home node';

  @override
  String get endpointHintOpenAi => 'https://api.openai.com/v1';

  @override
  String get endpointHintAnthropic => 'https://api.anthropic.com';

  @override
  String get endpointHintDefault => 'https://api.example.com/v1';
}
