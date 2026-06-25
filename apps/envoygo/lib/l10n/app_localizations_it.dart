// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Italian (`it`).
class AppLocalizationsIt extends AppLocalizations {
  AppLocalizationsIt([String locale = 'it']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get language => 'Lingua';

  @override
  String get languageSystem => 'Predefinita di sistema';

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
  String get sectionAiEngine => 'Motore IA';

  @override
  String get sectionChains => 'Catene';

  @override
  String get refresh => 'Aggiorna';

  @override
  String get save => 'Salva';

  @override
  String get saving => 'Salvataggio…';

  @override
  String get aiEngineTitle => 'Motore IA';

  @override
  String get aiEngineModeBoth => 'Integrato + Ext';

  @override
  String get aiEngineModeOpenclawOnly => 'Solo integrato';

  @override
  String get aiEngineModeExtOnly => 'Solo Ext';

  @override
  String get aiEngineModeOff => 'Nessuno';

  @override
  String get builtInOpenClaw => 'OpenClaw integrato';

  @override
  String get externalAgentBridge => 'Bridge agente esterno';

  @override
  String get statusDisabled => 'Disabilitato';

  @override
  String get statusRunning => 'In esecuzione';

  @override
  String get statusConfiguredNotRunning => 'Configurato (non in esecuzione)';

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
  String get modelProviderTitle => 'Provider del modello';

  @override
  String get modelProviderRefreshTooltip => 'Aggiorna dal nodo home';

  @override
  String get modelProviderSyncHint =>
      'Le modifiche vengono salvate sul nodo home e sincronizzate con Social su questo account.';

  @override
  String get modelProviderConnectFirst =>
      'Connettiti al nodo home per configurare il provider del modello.';

  @override
  String get providerLabel => 'Provider';

  @override
  String get modelProviderModeMock => 'Mock (test)';

  @override
  String get modelProviderModeOpenAi => 'Compatibile OpenAI';

  @override
  String get modelProviderModeAnthropic => 'Compatibile Anthropic';

  @override
  String get modelProviderModeDisabled => 'Disabilitato';

  @override
  String get endpointUrlLabel => 'URL endpoint';

  @override
  String get modelNameLabel => 'Nome modello';

  @override
  String get modelNameHint => 'gpt-4o-mini';

  @override
  String get apiKeyLabel => 'Chiave API';

  @override
  String get savedSyncedToHome => 'Salvato — sincronizzato con il nodo home';

  @override
  String get endpointHintOpenAi => 'https://api.openai.com/v1';

  @override
  String get endpointHintAnthropic => 'https://api.anthropic.com';

  @override
  String get endpointHintDefault => 'https://api.example.com/v1';
}
