// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Japanese (`ja`).
class AppLocalizationsJa extends AppLocalizations {
  AppLocalizationsJa([String locale = 'ja']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get language => '言語';

  @override
  String get languageSystem => 'システムに従う';

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
  String get sectionAiEngine => 'AI エンジン';

  @override
  String get sectionChains => 'チェーン';

  @override
  String get refresh => '更新';

  @override
  String get save => '保存';

  @override
  String get saving => '保存中…';

  @override
  String get aiEngineTitle => 'AI エンジン';

  @override
  String get aiEngineModeBoth => '組み込み + 外部';

  @override
  String get aiEngineModeOpenclawOnly => '組み込みのみ';

  @override
  String get aiEngineModeExtOnly => '外部のみ';

  @override
  String get aiEngineModeOff => 'なし';

  @override
  String get builtInOpenClaw => '組み込み OpenClaw';

  @override
  String get externalAgentBridge => '外部エージェントブリッジ';

  @override
  String get statusDisabled => '無効';

  @override
  String get statusRunning => '実行中';

  @override
  String get statusConfiguredNotRunning => '設定済み（未実行）';

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
  String get modelProviderTitle => 'モデルプロバイダー';

  @override
  String get modelProviderRefreshTooltip => 'ホームノードから更新';

  @override
  String get modelProviderSyncHint => '変更はホームノードに保存され、同じアカウントの Social と同期されます。';

  @override
  String get modelProviderConnectFirst => 'モデルプロバイダーを設定するにはホームノードに接続してください。';

  @override
  String get providerLabel => 'プロバイダー';

  @override
  String get modelProviderModeMock => 'Mock（テスト）';

  @override
  String get modelProviderModeOpenAi => 'OpenAI 互換';

  @override
  String get modelProviderModeAnthropic => 'Anthropic 互換';

  @override
  String get modelProviderModeDisabled => '無効';

  @override
  String get endpointUrlLabel => 'エンドポイント URL';

  @override
  String get modelNameLabel => 'モデル名';

  @override
  String get modelNameHint => 'gpt-4o-mini';

  @override
  String get apiKeyLabel => 'API キー';

  @override
  String get savedSyncedToHome => '保存しました — ホームノードに同期済み';

  @override
  String get endpointHintOpenAi => 'https://api.openai.com/v1';

  @override
  String get endpointHintAnthropic => 'https://api.anthropic.com';

  @override
  String get endpointHintDefault => 'https://api.example.com/v1';
}
