// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get language => '语言';

  @override
  String get languageSystem => '跟随系统';

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
  String get sectionAiEngine => 'AI 引擎';

  @override
  String get sectionChains => '任务链';

  @override
  String get refresh => '刷新';

  @override
  String get save => '保存';

  @override
  String get saving => '保存中…';

  @override
  String get aiEngineTitle => 'AI 引擎';

  @override
  String get aiEngineModeBoth => '内置 + 外部';

  @override
  String get aiEngineModeOpenclawOnly => '仅内置';

  @override
  String get aiEngineModeExtOnly => '仅外部';

  @override
  String get aiEngineModeOff => '无';

  @override
  String get builtInOpenClaw => '内置 OpenClaw';

  @override
  String get externalAgentBridge => '外部智能体桥接';

  @override
  String get statusDisabled => '已禁用';

  @override
  String get statusRunning => '运行中';

  @override
  String get statusConfiguredNotRunning => '已配置（未运行）';

  @override
  String get aiEngineReadOnlyHint =>
      '内置 OpenClaw 在移动端为只读（请在家庭节点编辑 node-config.json）。可在下方配置外部智能体桥接 — 更改会同步到家庭节点和 Social。';

  @override
  String get extAgentTitle => '外部智能体桥接';

  @override
  String get extAgentRefreshTooltip => '从家庭节点刷新';

  @override
  String get extAgentSyncHint => '更改会保存到家庭节点，并同步到同一账户的 Social。';

  @override
  String get extAgentConnectFirst => '请先连接家庭节点以配置外部智能体桥接。';

  @override
  String get extAgentEnableLabel => '启用外部智能体桥接';

  @override
  String get extAgentActiveBackend => '当前后端';

  @override
  String get extAgentAddCustom => '添加自定义智能体…';

  @override
  String get extAgentIdLabel => '智能体 ID';

  @override
  String get extAgentIdPlaceholder => 'my-agent';

  @override
  String get extAgentIdHint => '简短 id（字母、数字、连字符）。';

  @override
  String get extAgentNameLabel => '智能体名称';

  @override
  String get extAgentNamePlaceholder => '例如 HomeClaw';

  @override
  String get extAgentUrlLabel => '智能体连接 URL';

  @override
  String get extAgentSaveError => '请填写自定义智能体的 ID、名称和连接 URL。';

  @override
  String get extAgentStatusStopped => '已停止';

  @override
  String get extAgentStatusUnknown => '未知';

  @override
  String get extAgentHintHomeclaw => '在家庭节点电脑上启动 HomeClaw（端口 8010）。';

  @override
  String get extAgentHintHermes => 'Hermes — 家庭节点会自动启动本地辅助程序（端口 8020）。';

  @override
  String get extAgentHintOpenhuman => 'OpenHuman — 家庭节点会自动启动本地辅助程序（端口 8021）。';

  @override
  String get extAgentHintCustom => '自定义智能体 — 在家庭节点电脑上启动并设置 message URL。';

  @override
  String get modelProviderTitle => '模型提供商';

  @override
  String get modelProviderRefreshTooltip => '从家庭节点刷新';

  @override
  String get modelProviderSyncHint => '更改会保存到家庭节点，并同步到同一账户的 Social。';

  @override
  String get modelProviderConnectFirst => '请先连接家庭节点以配置模型提供商。';

  @override
  String get providerLabel => '提供商';

  @override
  String get modelProviderModeMock => 'Mock（测试）';

  @override
  String get modelProviderModeOpenAi => 'OpenAI 兼容';

  @override
  String get modelProviderModeAnthropic => 'Anthropic 兼容';

  @override
  String get modelProviderModeDisabled => '已禁用';

  @override
  String get endpointUrlLabel => '端点 URL';

  @override
  String get modelNameLabel => '模型名称';

  @override
  String get modelNameHint => 'gpt-4o-mini';

  @override
  String get apiKeyLabel => 'API 密钥';

  @override
  String get savedSyncedToHome => '已保存 — 已同步到家庭节点';

  @override
  String get endpointHintOpenAi => 'https://api.openai.com/v1';

  @override
  String get endpointHintAnthropic => 'https://api.anthropic.com';

  @override
  String get endpointHintDefault => 'https://api.example.com/v1';
}
