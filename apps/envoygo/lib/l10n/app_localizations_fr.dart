// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get language => 'Langue';

  @override
  String get languageSystem => 'Par défaut du système';

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
  String get sectionAiEngine => 'Moteur IA';

  @override
  String get sectionChains => 'Chaînes';

  @override
  String get refresh => 'Actualiser';

  @override
  String get save => 'Enregistrer';

  @override
  String get saving => 'Enregistrement…';

  @override
  String get aiEngineTitle => 'Moteur IA';

  @override
  String get aiEngineModeBoth => 'Intégré + Ext';

  @override
  String get aiEngineModeOpenclawOnly => 'Intégré seul';

  @override
  String get aiEngineModeExtOnly => 'Ext seul';

  @override
  String get aiEngineModeOff => 'Aucun';

  @override
  String get builtInOpenClaw => 'OpenClaw intégré';

  @override
  String get externalAgentBridge => 'Pont agent externe';

  @override
  String get statusDisabled => 'Désactivé';

  @override
  String get statusRunning => 'En cours';

  @override
  String get statusConfiguredNotRunning => 'Configuré (non démarré)';

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
  String get modelProviderTitle => 'Fournisseur de modèle';

  @override
  String get modelProviderRefreshTooltip =>
      'Actualiser depuis le nœud domicile';

  @override
  String get modelProviderSyncHint =>
      'Les modifications sont enregistrées sur le nœud domicile et synchronisées avec Social sur ce compte.';

  @override
  String get modelProviderConnectFirst =>
      'Connectez-vous au nœud domicile pour configurer le fournisseur de modèle.';

  @override
  String get providerLabel => 'Fournisseur';

  @override
  String get modelProviderModeMock => 'Mock (tests)';

  @override
  String get modelProviderModeOpenAi => 'Compatible OpenAI';

  @override
  String get modelProviderModeAnthropic => 'Compatible Anthropic';

  @override
  String get modelProviderModeDisabled => 'Désactivé';

  @override
  String get endpointUrlLabel => 'URL du point de terminaison';

  @override
  String get modelNameLabel => 'Nom du modèle';

  @override
  String get modelNameHint => 'gpt-4o-mini';

  @override
  String get apiKeyLabel => 'Clé API';

  @override
  String get savedSyncedToHome =>
      'Enregistré — synchronisé avec le nœud domicile';

  @override
  String get endpointHintOpenAi => 'https://api.openai.com/v1';

  @override
  String get endpointHintAnthropic => 'https://api.anthropic.com';

  @override
  String get endpointHintDefault => 'https://api.example.com/v1';
}
