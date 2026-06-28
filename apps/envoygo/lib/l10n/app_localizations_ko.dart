// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Korean (`ko`).
class AppLocalizationsKo extends AppLocalizations {
  AppLocalizationsKo([String locale = 'ko']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get language => '언어';

  @override
  String get languageSystem => '시스템 기본값';

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
  String get sectionAiEngine => 'AI 엔진';

  @override
  String get sectionChains => '체인';

  @override
  String get refresh => '새로고침';

  @override
  String get save => '저장';

  @override
  String get saving => '저장 중…';

  @override
  String get aiEngineTitle => 'AI 엔진';

  @override
  String get aiEngineModeBoth => '내장 + 외부';

  @override
  String get aiEngineModeOpenclawOnly => '내장만';

  @override
  String get aiEngineModeExtOnly => '외부만';

  @override
  String get aiEngineModeOff => '없음';

  @override
  String get builtInOpenClaw => '내장 OpenClaw';

  @override
  String get externalAgentBridge => '외부 에이전트 브리지';

  @override
  String get statusDisabled => '비활성';

  @override
  String get statusRunning => '실행 중';

  @override
  String get statusConfiguredNotRunning => '구성됨(실행 안 됨)';

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
  String get modelProviderTitle => '모델 제공자';

  @override
  String get modelProviderRefreshTooltip => '홈 노드에서 새로고침';

  @override
  String get modelProviderSyncHint =>
      '변경 사항은 홈 노드에 저장되며 같은 계정의 Social과 동기화됩니다.';

  @override
  String get modelProviderConnectFirst => '모델 제공자를 구성하려면 홈 노드에 연결하세요.';

  @override
  String get providerLabel => '제공자';

  @override
  String get modelProviderModeMock => 'Mock(테스트)';

  @override
  String get modelProviderModeOpenAi => 'OpenAI 호환';

  @override
  String get modelProviderModeAnthropic => 'Anthropic 호환';

  @override
  String get modelProviderModeDisabled => '비활성';

  @override
  String get endpointUrlLabel => '엔드포인트 URL';

  @override
  String get modelNameLabel => '모델 이름';

  @override
  String get modelNameHint => 'gpt-4o-mini';

  @override
  String get apiKeyLabel => 'API 키';

  @override
  String get savedSyncedToHome => '저장됨 — 홈 노드에 동기화됨';

  @override
  String get endpointHintOpenAi => 'https://api.openai.com/v1';

  @override
  String get endpointHintAnthropic => 'https://api.anthropic.com';

  @override
  String get endpointHintDefault => 'https://api.example.com/v1';
}
