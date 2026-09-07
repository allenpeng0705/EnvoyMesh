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
  String get navChats => '聊天';

  @override
  String get navInbox => '收件箱';

  @override
  String get navContent => '内容';

  @override
  String get navSocial => '社交';

  @override
  String get navTerminal => '终端';

  @override
  String get navKnowledge => '知识库';

  @override
  String get navMe => '我';

  @override
  String get contentExplore => '探索';

  @override
  String get socialDiscover => '发现';

  @override
  String get marketTitle => '市集';

  @override
  String get marketPaneBrowse => '浏览';

  @override
  String get marketPaneShop => '我的小店';

  @override
  String get marketBrowseEmptyTitle => '还没有他人的商品';

  @override
  String get marketBrowseEmptyDesc => '好友发布商品后会出现在这里。可以请联系人上架，或打开「我的小店」。';

  @override
  String get marketSearchPlaceholder => '搜索图书、电子产品、标签…';

  @override
  String get marketSearchSubmit => '搜索';

  @override
  String get marketSearchIdleHint => '输入关键词，或点下方建议。';

  @override
  String marketSearchNoResults(String query) {
    return '没有匹配「$query」的商品。';
  }

  @override
  String get marketChipBooks => '图书';

  @override
  String get marketChipElectronics => '电子产品';

  @override
  String get marketChipClothing => '服饰';

  @override
  String get marketChipHome => '家居';

  @override
  String get marketChipDigital => '数字商品';

  @override
  String get marketClearHistory => '清除历史';

  @override
  String get marketHistoryCleared => '搜索历史已清除。';

  @override
  String get marketMessageSeller => '联系卖家';

  @override
  String get marketSellerLabel => '卖家';

  @override
  String get marketShareLink => '复制链接';

  @override
  String get marketShareCopied => '分享链接已复制。';

  @override
  String marketInquireDefault(String title) {
    return '你好，想了解「$title」还在吗？';
  }

  @override
  String get marketInquireSent => '消息已发送，正在打开聊天…';

  @override
  String get marketNotConnected => '未连接家庭节点 — 配对后可查看小店。';

  @override
  String get marketNoListings => '还没有商品。点「从照片添加」创建，或在家庭节点的社交市集中编辑。';

  @override
  String get marketUntitled => '未命名商品';

  @override
  String get marketVisibilityPublicShort => '公开';

  @override
  String get marketVisibilityBondsShort => '仅好友';

  @override
  String get marketStatusActive => '在售';

  @override
  String get marketStatusReserved => '已预留';

  @override
  String get marketStatusSold => '已售出';

  @override
  String get marketStatusWithdrawn => '已下架';

  @override
  String get marketTagsLabel => '标签';

  @override
  String get marketEditOnSocialHint => '目前请在家庭节点的社交市集标签页创建和编辑商品。';

  @override
  String get marketCaptureAddFromPhoto => '从照片添加';

  @override
  String get marketCaptureCamera => '拍照';

  @override
  String get marketCaptureGallery => '从相册选择';

  @override
  String get marketCaptureNotesTitle => '描述商品';

  @override
  String get marketCaptureNotesHint => '第一行写标题，然后写详情…';

  @override
  String get marketCaptureContinue => '继续';

  @override
  String get marketCaptureReviewTitle => '核对商品';

  @override
  String get marketCaptureTitleLabel => '标题';

  @override
  String get marketCaptureDescriptionLabel => '描述';

  @override
  String get marketCapturePriceLabel => '价格';

  @override
  String get marketCaptureCurrencyLabel => '货币';

  @override
  String get marketCaptureVisibilityLabel => '谁可以看到';

  @override
  String get marketCapturePublish => '发布';

  @override
  String get marketCapturePublished => '商品已发布到家庭节点。';

  @override
  String get marketCaptureTitleRequired => '发布前请填写标题。';

  @override
  String get marketSellerSuggestedReply => '根据商品生成的建议回复';

  @override
  String get marketMarkReserved => '标记预留';

  @override
  String get marketMarkSold => '标记已售';

  @override
  String get marketMarkAvailable => '标记可售';

  @override
  String get marketRelist => '重新上架';

  @override
  String get marketStatusUpdated => '商品状态已更新。';

  @override
  String get marketPaymentHint => '请与卖家在 EnvoyMesh 外自行约定付款 — Envoy 不经手资金。';

  @override
  String get marketBlockSeller => '屏蔽';

  @override
  String get marketReportSeller => '举报';

  @override
  String get marketConfirmBlock => '屏蔽此卖家？其商品将从浏览中隐藏。';

  @override
  String get marketConfirmReport => '举报并屏蔽此卖家？记录仅保存在你的节点（尚无中央审核）。';

  @override
  String get marketFilterCategory => '分类';

  @override
  String get marketFilterAnyCategory => '全部分类';

  @override
  String get marketFilterMinPrice => '最低价';

  @override
  String get marketFilterMaxPrice => '最高价';

  @override
  String get marketFilterCurrency => '货币';

  @override
  String get termEmptyHint => '在家庭节点上启动 Pi 编程会话或 Shell 终端。';

  @override
  String get commonCancel => '取消';

  @override
  String get commonConfirm => '确认';

  @override
  String get homeFolderDrives => '磁盘';

  @override
  String get homeFolderComputer => '此电脑';

  @override
  String get homeFolderHome => '主目录';

  @override
  String get homeFolderParent => '↑ 上级文件夹';

  @override
  String get homeFolderNoSubfolders => '没有子文件夹';

  @override
  String get commonSave => '保存';

  @override
  String get commonDelete => '删除';

  @override
  String get commonRetry => '重试';

  @override
  String get commonClose => '关闭';

  @override
  String get commonLoading => '加载中…';

  @override
  String get commonError => '出错了';

  @override
  String get commonReconnect => '重新连接';

  @override
  String get commonSwitch => '切换';

  @override
  String get commonPair => '配对';

  @override
  String get commonUnpair => '取消配对';

  @override
  String get commonCreate => '创建';

  @override
  String get commonRename => '重命名';

  @override
  String get languageTitle => '语言';

  @override
  String get languageSubtitle => '菜单与界面文案的语言';

  @override
  String get languageSystem => '跟随系统';

  @override
  String get languageSystemDesc => '使用设备语言设置';

  @override
  String get meConnectedNode => '已连接节点';

  @override
  String get meNotConnected => '未连接';

  @override
  String get meNotConnectedHint => '与家庭节点配对以开始使用';

  @override
  String get meReconnect => '重新连接';

  @override
  String get meSwitch => '切换';

  @override
  String get meRepair => '重新配对';

  @override
  String get meReconnectNow => '立即重连';

  @override
  String get meUnpair => '取消配对';

  @override
  String get meBrowser => '浏览器';

  @override
  String get meBrowserHint => '打开 envoy:// 页面 — 或在内容页查看我的站点';

  @override
  String get meMyShop => '我的小店';

  @override
  String get meMyShopHint => '查看家庭节点上的商品（编辑暂在社交市集）';

  @override
  String get meAiEngine => 'AI 引擎';

  @override
  String get meAiEngineHint => '桥接与 OpenClaw 开关。点按进行配置。';

  @override
  String get meRecentTeamJobs => '最近团队任务';

  @override
  String get meRecentTeamJobsHint => '浏览已完成的多智能体任务';

  @override
  String get meActiveTeamJobs => '进行中的团队任务';

  @override
  String get meActiveTeamJobsHint => '查看正在运行的团队任务';

  @override
  String get mePairNewNode => '配对新节点';

  @override
  String get mePairNewNodeHint => '添加另一个家庭节点';

  @override
  String get meSettings => '设置';

  @override
  String get meAiModel => 'AI 模型';

  @override
  String get meEnvoyLocal => 'Envoy Local';

  @override
  String get meEnvoyLocalHint => '家庭节点本地模型（在电脑上下载并启动）';

  @override
  String get mePiAgent => '编码助手';

  @override
  String get mePiAgentHint => 'Pi 与 Envoy Harness 设置';

  @override
  String get meDarkMode => '深色模式';

  @override
  String get meDarkModeHint => '跟随系统设置';

  @override
  String get mePushNotifications => '推送通知';

  @override
  String get mePushNotificationsHint => '应用在后台时接收提醒';

  @override
  String get meUnpairDevice => '取消配对此设备';

  @override
  String get meUnpairDeviceHint => '断开连接并删除所有本地数据';

  @override
  String get meUnpairConfirmTitle => '取消配对？';

  @override
  String get meUnpairConfirmBody => '将移除此设备上该家庭节点的配对与本地聊天。';

  @override
  String get meUnpairedSnack => '已取消配对。本地聊天与数据已删除。';

  @override
  String meUnpairFailed(String error) {
    return '取消配对失败：$error';
  }

  @override
  String get meEditProfile => '编辑资料';

  @override
  String meProfileUpdateFailed(String error) {
    return '无法更新资料：$error';
  }

  @override
  String get mePublicAccess => '公网访问';

  @override
  String get mePort => '端口';

  @override
  String get mePublicAccessSaved => '公网访问已保存';

  @override
  String get meFamilyProfile => '家庭档案';

  @override
  String get meFamilyProfileHint => '你以家庭成员身份连接此家庭节点';

  @override
  String get mePreferences => '偏好设置';

  @override
  String get meViewEditProfile => '查看并编辑资料';

  @override
  String get meEditNameAvatar => '编辑名称与头像';

  @override
  String get meDisplayName => '显示名称';

  @override
  String get meAvatarColor => '头像颜色（十六进制）';

  @override
  String meMorePaired(int count) {
    return '+$count 个已配对';
  }

  @override
  String meSessionExpired(String name) {
    return '$name 的会话已过期';
  }

  @override
  String meDisconnectedFrom(String name) {
    return '已断开与 $name 的连接';
  }

  @override
  String meUnpairConfirmBodyNamed(String name) {
    return '将断开连接并删除此设备上 $name 的所有本地聊天与数据。';
  }

  @override
  String get meTeamJobs => '团队任务';

  @override
  String get meStartTeamJobHint => '预览计划并在家庭节点上启动';

  @override
  String get meAiModelHint => '此家庭节点助手使用的模型提供方';

  @override
  String get mePiAgentHintLong => '家庭节点上的本地编码助手（Pi 与 Envoy Harness）';

  @override
  String get mePushNotificationsHintLong => '应用在后台时接收新消息、联系人请求与审批提醒。';

  @override
  String get meRecentTeamJobsHintLong => '查看家庭节点上发布的任务报告';

  @override
  String get meActiveTeamJobsHintLong => '监视家庭节点上进行中的团队任务';

  @override
  String get inboxTitle => '收件箱';

  @override
  String get inboxEmpty => '暂无通知';

  @override
  String get inboxEmptyHint => '好友请求与动态更新会显示在这里';

  @override
  String get contentFeed => '动态';

  @override
  String get contentBlog => '博客';

  @override
  String get contentPeople => '发现';

  @override
  String get contentMyFiles => '我的文件';

  @override
  String get contentKnowledge => '知识库';

  @override
  String get knowledgeTitle => '知识库';

  @override
  String get knowledgeLede => '本地知识库 — notes/ 下的笔记供 EnvoyAI 使用。文档原件保留。';

  @override
  String get knowledgePanelBrowse => '浏览';

  @override
  String get knowledgePanelAsk => '提问';

  @override
  String get knowledgePanelPlugins => '插件';

  @override
  String get knowledgePanelSetup => '设置';

  @override
  String get knowledgeAskHint => '基于本节点的笔记与文档作答。联系人只能看到你已发布的内容。';

  @override
  String get knowledgeAskHeading => '向知识库提问';

  @override
  String get knowledgeAskLabel => '问题';

  @override
  String get knowledgeAskPlaceholder => '我关于入职流程写了什么？';

  @override
  String get knowledgeAskSubmit => '提问';

  @override
  String get knowledgeAskBusy => '搜索中…';

  @override
  String get knowledgeAskAnswerHeading => '回答';

  @override
  String get knowledgeAskEmptyAnswer => '没有返回答案。请到「设置」启用知识库并重建索引。';

  @override
  String get knowledgeAskContinueEnvoyAi => '在 EnvoyAI 中打开';

  @override
  String get knowledgeAskEnvoyAiHint => '需要多轮对话或工具时，请到 EnvoyAI 继续。';

  @override
  String get knowledgeLibraryHeading => '你的文件';

  @override
  String get knowledgeLibraryCaption => '笔记、文档，以及已发布的内容。';

  @override
  String get knowledgeEmbedGateTitleNeeded => '需要嵌入模型';

  @override
  String get knowledgeEmbedGateTitleDownloading => '正在下载嵌入模型…';

  @override
  String get knowledgeEmbedGateTitleError => '嵌入安装失败';

  @override
  String get knowledgeEmbedGateBodyNeeded =>
      '「提问」需要家节点上的本地嵌入模型；「浏览」不依赖它。应用启动时会自动在后台下载，也可在设置中手动启动或重试。';

  @override
  String get knowledgeEmbedGateBodyDownloading =>
      '下载正在家节点后台进行（随应用启动）。你可以离开本页；嵌入就绪后「提问」会自动可用。';

  @override
  String get knowledgeEmbedGateBodyError =>
      '家节点无法安装嵌入运行时或模型。请重试下载，或在桌面端「设置」中排查。「浏览」仍可用。';

  @override
  String get knowledgeEmbedGateDownload => '在家节点下载';

  @override
  String get knowledgeEmbedGateDownloading => '下载中…';

  @override
  String get knowledgeEmbedGateRetry => '重试下载';

  @override
  String get knowledgeEmbedGateOpenSetup => '打开设置';

  @override
  String get knowledgeEmbedGateBackgroundHint => '下载期间可继续使用应用的其他功能。';

  @override
  String get knowledgeEmbedGateStripNeeded => '「提问」需要家节点嵌入模型 —「浏览」仍可用';

  @override
  String get knowledgeEmbedGateStripDownloading =>
      '家节点正在下载嵌入模型 —「提问」暂不可用，「浏览」可用';

  @override
  String get knowledgeEmbedGateStripError => '家节点嵌入安装失败 — 请在设置中重试。「浏览」仍可用';

  @override
  String get knowledgeEmbedGateDownloadStarted => '已开始在家节点下载嵌入模型';

  @override
  String get knowledgeEmbedGateBlockedToast => '请先完成嵌入设置再提问。';

  @override
  String get knowledgeEmbedGatePhaseDetecting => '正在检测平台…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingRuntime => '正在下载 llama.cpp 运行时…';

  @override
  String get knowledgeEmbedGatePhaseExtracting => '正在解压运行时…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingModel => '正在下载嵌入模型…';

  @override
  String get knowledgeEmbedGatePhaseStarting => '正在启动嵌入服务…';

  @override
  String get knowledgeEmbedGatePhaseDownloading => '下载中…';

  @override
  String get knowledgeEmbedGateStepsAria => '嵌入安装步骤';

  @override
  String get knowledgePluginsLede => '可选连接器。Notion 需要 MCP URL，不需要 Notion 应用。';

  @override
  String get knowledgePluginsObsidianTitle => 'Obsidian';

  @override
  String get knowledgePluginsObsidianDesc => '增强 vault 笔记。桌面应用可选。';

  @override
  String get knowledgePluginsNotionTitle => 'Notion（经 MCP）';

  @override
  String get knowledgePluginsNotionDesc => '经 MCP 浏览与搜索。无 URL 时软失败。';

  @override
  String get knowledgePluginsMcpUrl => 'MCP 服务 URL';

  @override
  String get knowledgePluginsMcpTool => '搜索工具名';

  @override
  String get knowledgePluginsSyncNow => '立即同步';

  @override
  String get knowledgePluginsLinkedVaultLabel => '关联的 Obsidian 库路径';

  @override
  String get knowledgePluginsLinkedVaultHint => '/path/to/ObsidianVault';

  @override
  String get knowledgePluginsLinkedVaultEmpty => '尚未关联库。';

  @override
  String get knowledgePluginsLinkedVaultRemove => '移除';

  @override
  String get knowledgePluginsLinkedVaultAdd => '添加库文件夹…';

  @override
  String get knowledgePluginsLinkedVaultPickTitle => '选择 Obsidian 库文件夹';

  @override
  String get knowledgePluginsLinkedVaultHelper =>
      '会自动关联本机 Obsidian 已登记的库。移除一行即可取消关联（不会再自动加回）。也可用「添加库文件夹…」添加更多。';

  @override
  String get knowledgePluginsOpenObsidian => '打开 Obsidian';

  @override
  String get knowledgePluginsOpenNotion => '打开 Notion';

  @override
  String get knowledgePluginsOpeningApp => '正在打开…';

  @override
  String get knowledgePluginsOpenAppFailed => '无法在本机打开该应用。';

  @override
  String get knowledgePluginsOpenedWebsite => '本机未安装应用 — 已在家节点打开官网。';

  @override
  String get knowledgePluginsDownloadObsidian => '下载 Obsidian';

  @override
  String get knowledgePluginsDownloadNotion => '下载 Notion';

  @override
  String get knowledgePluginsLinkedVaultAutoOne => '已自动关联本机上的 Obsidian 库。';

  @override
  String knowledgePluginsLinkedVaultAutoMany(int count) {
    return '已自动关联本机上的 $count 个 Obsidian 库。';
  }

  @override
  String get knowledgeHubImportObsidianAll => '导入全部关联笔记';

  @override
  String get knowledgeHubImportNotionVisible => '导入可见卡片';

  @override
  String get knowledgeHubExportToObsidian => '导出到 Obsidian';

  @override
  String get knowledgeHubExportToNotion => '导出到 Notion/MCP';

  @override
  String knowledgeHubImportObsidianOk(int count) {
    return '已导入 $count 条 Obsidian 笔记';
  }

  @override
  String knowledgeHubImportNotionOk(int count) {
    return '已导入 $count 条 Notion/MCP 笔记';
  }

  @override
  String knowledgeHubExportObsidianOk(int count) {
    return '已导出 $count 条笔记到 Obsidian';
  }

  @override
  String knowledgeHubExportNotionOk(int count) {
    return '已通过 MCP 导出 $count 条笔记';
  }

  @override
  String get knowledgeHubImportFailed => '导入失败';

  @override
  String get knowledgeHubExportFailed => '导出失败';

  @override
  String get knowledgeHubImportMcpEmpty => '没有可导入的 MCP 卡片 — 请先刷新浏览';

  @override
  String get knowledgeHubExportEmpty => '没有可导出的 vault Markdown 笔记';

  @override
  String get knowledgeHubShareVaultOnly => '仅 vault 文件可分享 — 请先导入';

  @override
  String knowledgeHubMcpListError(String error) {
    return 'MCP 列表：$error';
  }

  @override
  String get knowledgeSetupHint => '索引状态与检索。聊天模型在「我 → AI 模型」。';

  @override
  String get knowledgeSetupEmbeddingHint =>
      '本设备使用 Envoy Local 嵌入。如需 OpenAI 或 Ollama，请在 home 电脑上打开「设置 → AI」。';

  @override
  String get knowledgeSetupEnabled => '启用资料库知识';

  @override
  String get knowledgeSetupStatusHint => '点「重建索引」刷新向量索引。';

  @override
  String get knowledgeSetupReindex => '重建索引';

  @override
  String get knowledgeSetupReindexDone => '已开始重建';

  @override
  String get knowledgeSetupReindexConfirm => '在家节点上重建资料库向量索引？';

  @override
  String get knowledgeSetupTestEmbedding => '测试嵌入';

  @override
  String get knowledgeSetupTestEmbeddingBusy => '测试中…';

  @override
  String knowledgeSetupTestEmbeddingOk(int dimensions, int latencyMs) {
    return '嵌入正常 — $dimensions 维，$latencyMs ms';
  }

  @override
  String knowledgeSetupTestEmbeddingFail(String error) {
    return '嵌入失败：$error';
  }

  @override
  String get knowledgeSetupRagMode => '检索模式';

  @override
  String get knowledgeSetupRagHybrid => '混合';

  @override
  String get knowledgeSetupRagVector => '向量';

  @override
  String get knowledgeSetupRagLexical => '关键词';

  @override
  String get knowledgeSetupSnippetLimit => '每次回答引用片段数';

  @override
  String knowledgeBrowseIndexIndexingProgress(int processed, int total) {
    return '索引中 $processed/$total…';
  }

  @override
  String get knowledgeHubOpenPlugins => '打开插件';

  @override
  String get knowledgeNoteNewTitle => '新建笔记';

  @override
  String get knowledgeNoteEditTitle => '编辑笔记';

  @override
  String get knowledgeNoteFilename => '文件名';

  @override
  String get knowledgeNoteFilenameRequired => '请输入笔记文件名';

  @override
  String get knowledgeNoteContent => 'Markdown';

  @override
  String get knowledgeNoteSensitivity => '可见性';

  @override
  String get knowledgeNotePrivate => '私密';

  @override
  String get knowledgeNoteFriends => '好友';

  @override
  String get knowledgeNotePublished => '已发布';

  @override
  String get knowledgeNoteAlsoBlog => '同时发布为博客';

  @override
  String get knowledgeFilePreview => '预览';

  @override
  String get knowledgeFileOpenOnHome => '在家节点打开';

  @override
  String get knowledgeFileOpenedOnHome => '已在家电脑打开';

  @override
  String get knowledgeFilePublish => '发布';

  @override
  String get knowledgeFileMakePrivate => '改为私密';

  @override
  String get knowledgeBrowseImportAndPublish => '导入并发布';

  @override
  String get knowledgeBrowsePublishImportOnly => '请先将此笔记导入保险库，然后再发布。';

  @override
  String get knowledgeBrowsePublishImportNoDoc =>
      '已导入，但暂时无法发布 — 请从导入后的笔记再次点发布。';

  @override
  String get knowledgeBrowseImportedAndPublished => '已导入并发布';

  @override
  String get knowledgeBrowsePublishImportHint => '导入到保险库并发布，供网格发现';

  @override
  String get knowledgeFileMore => '更多操作';

  @override
  String get knowledgeFileConvert => '转为 Markdown 笔记';

  @override
  String knowledgeFileConvertOk(String path) {
    return '已保存 Markdown 笔记 $path';
  }

  @override
  String get knowledgeFileConvertFailed => '无法转换为 Markdown';

  @override
  String get knowledgeFileDeleteTitle => '删除文件？';

  @override
  String knowledgeFileDeleteBody(String title) {
    return '从家节点资料库删除「$title」？';
  }

  @override
  String get knowledgeFileDeleteConfirm => '删除';

  @override
  String get meKnowledge => '知识库设置';

  @override
  String get meKnowledgeHint => '资料库提问的索引与检索';

  @override
  String get meKnowledgePlugins => '知识库插件';

  @override
  String get meKnowledgePluginsHint => 'Obsidian 关联与 Notion/MCP';

  @override
  String get knowledgeBrowseFilterAll => '全部';

  @override
  String get knowledgeBrowseFiltersLabel => '显示';

  @override
  String get knowledgeBrowseFilterNotes => '笔记';

  @override
  String get knowledgeBrowseFilterObsidian => 'Obsidian';

  @override
  String get knowledgeBrowseFilterNotion => 'Notion';

  @override
  String get knowledgeBrowseFilterBlog => '博客';

  @override
  String get knowledgeBrowseFilterDocuments => '文档';

  @override
  String get knowledgeBrowseFilterPublished => '已发布';

  @override
  String knowledgeBrowseIndexReady(int count) {
    return '已索引 $count';
  }

  @override
  String knowledgeBrowseIndexReadyLinked(int count, int linked) {
    return '已索引 $count · 关联 Obsidian $linked';
  }

  @override
  String get knowledgeBrowseIndexIndexing => '索引中…';

  @override
  String get knowledgeBrowseIndexEmpty => '索引为空';

  @override
  String get knowledgeBrowseIndexChipHint => '打开「知识库 → 设置」管理索引。';

  @override
  String get contentNewPost => '新帖子';

  @override
  String get chatsTitle => '聊天';

  @override
  String get chatsEmpty => '还没有会话';

  @override
  String get chatsEmptyHint => '与家庭节点配对以开始使用。';

  @override
  String get chatsSearchHint => '搜索聊天…';

  @override
  String get pairingScanTitle => '扫描二维码';

  @override
  String get pairingConfirmTitle => '确认配对';

  @override
  String get pairingFamilyInvite => '家庭邀请';

  @override
  String get pairingOwnerPair => '机主配对';

  @override
  String get engagementLike => '赞';

  @override
  String get engagementUnlike => '取消赞';

  @override
  String get engagementComment => '评论';

  @override
  String get engagementRemoveComment => '删除评论？';

  @override
  String get engagementRemove => '删除';

  @override
  String get feedDelete => '删除';

  @override
  String get blogDelete => '删除';

  @override
  String get blogTitle => '博客';

  @override
  String get blogEmpty => '还没有文章。写第一篇博客吧。';

  @override
  String get blogHint => '你在网络上发布的长文。';

  @override
  String get feedTitle => '动态';

  @override
  String get feedComposeTitle => '新动态';

  @override
  String get commonBack => '返回';

  @override
  String get commonAccept => '接受';

  @override
  String get commonDecline => '拒绝';

  @override
  String get commonDismiss => '忽略';

  @override
  String get commonOpen => '打开';

  @override
  String get commonRefresh => '刷新';

  @override
  String get commonEdit => '编辑';

  @override
  String get commonPost => '发布';

  @override
  String get commonPosting => '发布中…';

  @override
  String get commonPublish => '发布';

  @override
  String get commonShare => '分享';

  @override
  String get commonSend => '发送';

  @override
  String get commonClear => '清除';

  @override
  String get commonInvite => '邀请';

  @override
  String get commonJoin => '加入';

  @override
  String get commonYou => '你';

  @override
  String get commonUnknown => '未知';

  @override
  String get commonCopied => '已复制到剪贴板';

  @override
  String get commonNotConnectedHome => '未连接到家庭节点';

  @override
  String get commonSaving => '保存中…';

  @override
  String get commonGenerating => '生成中…';

  @override
  String get commonHide => '隐藏';

  @override
  String get commonAdd => '添加';

  @override
  String get commonRemove => '移除';

  @override
  String get commonSearch => '搜索';

  @override
  String get connOffline => '离线';

  @override
  String get connDirect => '直连';

  @override
  String get connP2p => 'P2P';

  @override
  String get connRelay => '中继';

  @override
  String get connLanDirect => 'LAN（直连）';

  @override
  String get connPublicDirect => '公网 IP（直连）';

  @override
  String get connRelayWs => '中继 WebSocket';

  @override
  String get connTooltipDirect => '直连';

  @override
  String get connTooltipConnecting => '连接中…';

  @override
  String get connTooltipOffline => '未连接';

  @override
  String get connTooltipError => '连接错误';

  @override
  String get chatsSectionAi => 'AI';

  @override
  String get chatsSectionCoding => '编程';

  @override
  String get chatsCodingPi => 'Pi';

  @override
  String get chatsCodingPiHint => '编程助手（终端）';

  @override
  String get chatsCodingEh => 'Envoy';

  @override
  String get chatsCodingEhHint => '编程助手（聊天）';

  @override
  String get chatsEhNew => '新建编程对话';

  @override
  String get chatsEhRemoveTitle => '移除编程对话？';

  @override
  String chatsEhRemoveBody(String name) {
    return '从编程列表中移除“$name”？家庭节点上的对话记录将被删除。';
  }

  @override
  String get chatsEhThinking => 'Envoy 正在思考…';

  @override
  String get chatsEhPromptHint => '让 Envoy 写代码、重构或解释…';

  @override
  String get chatsSectionFamily => '家庭';

  @override
  String get chatsSectionContacts => '联系人';

  @override
  String get chatsSectionGroups => '群组';

  @override
  String get chatsSectionTerminals => '终端';

  @override
  String get chatsFabNew => '新建';

  @override
  String get chatsCreateBot => '创建 Bot';

  @override
  String get chatsCreateBotHint => '家庭节点上的 AI 角色';

  @override
  String get chatsNewPi => '新建 Pi';

  @override
  String get chatsNewPiHint => '启动 Pi 编程终端';

  @override
  String get chatsNewEnvoy => '新建 Envoy';

  @override
  String get chatsNewEnvoyHint => '启动 Envoy Harness TUI';

  @override
  String get ehChooseProjectTitle => '选择 Envoy 项目文件夹';

  @override
  String get ehChangeProjectTitle => '更改 Envoy 项目文件夹';

  @override
  String get ehChooseProjectDesc =>
      'Envoy 在此文件夹中运行（读取 AGENTS.md、编辑文件、执行 shell）。';

  @override
  String get ehStartWithProject => '开始';

  @override
  String get ehRestartWithProject => '在此重启 Envoy';

  @override
  String get ehEnsuringTerminal => '正在启动 Envoy TUI…';

  @override
  String get ehPermissionTitle => '工具权限';

  @override
  String get ehPermissionAllow => '允许';

  @override
  String get ehPermissionDeny => '拒绝';

  @override
  String get ehQuestionTitle => 'Envoy 需要你的输入';

  @override
  String get ehRecommended => '推荐';

  @override
  String get ehSlashWhileBusy => '请先结束当前回合或使用 /cancel。';

  @override
  String get ehChatReset => '已为此项目开始新对话。';

  @override
  String get ehTurnCancelled => '回合已取消。';

  @override
  String get ehStatusRefreshed => '状态已刷新。';

  @override
  String get ehNoPeers => '未配置对等集群。';

  @override
  String get ehSearchUsage => '用法：/search <关键词> — 搜索本对话。';

  @override
  String ehSearchNoMatches(String term) {
    return '没有与“$term”匹配的结果。';
  }

  @override
  String ehModelShow(String model) {
    return '当前模型：$model';
  }

  @override
  String get ehModelUnknown => '未配置模型 — 请在 设置 → AI 中设置。';

  @override
  String ehProjectCurrent(String path) {
    return '项目文件夹：$path';
  }

  @override
  String get ehProjectUnset => '未设置项目文件夹 — 请使用 /cd <路径>。';

  @override
  String ehProjectSet(String path) {
    return '项目文件夹 → $path';
  }

  @override
  String get ehProjectSetUnknown => '项目文件夹已更新。';

  @override
  String ehProjectSetFailed(String error) {
    return '设置项目文件夹失败：$error';
  }

  @override
  String get ehConfigureModel => '请在 设置 → AI 中配置模型。';

  @override
  String get ehNotReady => 'envoy-harness 尚未就绪。';

  @override
  String get termQuickHelp => '/help';

  @override
  String get termQuickCancel => '/cancel';

  @override
  String get chatsNewTerminal => '新建终端';

  @override
  String get chatsNewTerminalHint => '在家庭节点上打开 Shell';

  @override
  String get chatsNewGroup => '新建群聊';

  @override
  String get chatsNewGroupHint => '与已绑定联系人的网格群组';

  @override
  String get chatsNewFamilyGroup => '新建家庭群';

  @override
  String get chatsNewFamilyGroupHint => '与家庭成员的本地群组';

  @override
  String get chatsDeleteBotTitle => '删除 Bot？';

  @override
  String chatsDeleteBotBody(String name) {
    return '从家庭节点移除「$name」？此操作无法撤销。';
  }

  @override
  String get chatsBotOptions => 'Bot 选项';

  @override
  String get chatsEditBot => '编辑 Bot';

  @override
  String get chatsBotNameRequired => 'Bot 名称必填';

  @override
  String get chatsBotPromptRequired => '人格 / 系统提示词必填';

  @override
  String get chatsBotName => 'Bot 名称';

  @override
  String get chatsBotNameHint => '例如：图书管理员 Luna';

  @override
  String get chatsBotPrompt => '人格 / 系统提示词';

  @override
  String get chatsBotPromptHint =>
      '以角色口吻撰写（「你是…」）。避免「Luna 是…」或「我是 AI…」。保存时会重塑。';

  @override
  String get chatsBotDesc => '简短描述（可选）';

  @override
  String get chatsBotDescHint => '聊天列表中的一行简介。留空则根据人格自动填充。';

  @override
  String get chatsAvatarColor => '头像颜色';

  @override
  String get chatsShellHint => 'Shell（如 zsh、bash）';

  @override
  String get chatsCwdHint => '工作目录（可选）';

  @override
  String get chatsPiTitle => '启动 Pi';

  @override
  String get chatsPiBody => '选择家庭电脑上的项目文件夹以打开 Pi 编程终端。';

  @override
  String get chatsPiFolder => '项目文件夹';

  @override
  String get chatsPiFolderHint => '/Users/you/project';

  @override
  String get chatsPiFolderRequired => '请输入项目文件夹路径。';

  @override
  String get chatsGroupName => '群组名称';

  @override
  String get chatsNoFamilyMembers => '还没有其他家庭成员。';

  @override
  String get chatVoiceCall => '语音通话';

  @override
  String get chatVideoCall => '视频通话';

  @override
  String get chatPublishedContent => '已发布内容';

  @override
  String get chatClearThread => '清空会话';

  @override
  String get chatClearThreadTitle => '清空会话？';

  @override
  String get chatClearThreadBody => '此会话中的所有消息将被删除。';

  @override
  String get chatAiManual => '手動';

  @override
  String get chatAiAssistant => 'アシスタント';

  @override
  String get chatAiAuto => '自動';

  @override
  String get chatAiManualTooltip => '手動：自分で入力';

  @override
  String get chatAiAssistantTooltip => 'アシスタント：AIが下書きを提案';

  @override
  String get chatAiAutoTooltip => '自動返信：AIが自動的に応答';

  @override
  String get chatAgentMode => 'エージェント';

  @override
  String get chatAgentModeOffTooltip => 'エージェントモードオフ — アシスタントは公開ナレッジのみ使用';

  @override
  String get chatAgentModeOnTooltip =>
      'エージェントモードオン — OpenClawがホームファイル・非公開ナレッジ・ツールを利用可能';

  @override
  String get chatAgentModeConfirmTitle => 'このチャットのエージェントモードを有効にしますか？';

  @override
  String get chatAgentModeConfirmBody =>
      'エージェントモードはEnvoyAI/OpenClawを使用し、ローカルファイル・非公開ナレッジの読み取り、ホームノードでのツール実行が可能です。完全に信頼できる相手にのみ有効化してください。';

  @override
  String get chatAgentModeConfirmEnable => 'エージェントモードを有効化';

  @override
  String get chatSuggestedReply => '提案された返信';

  @override
  String get chatSuggestedReplyUse => '使用';

  @override
  String get chatSuggestedReplyDismiss => '却下';

  @override
  String get chatDeleteMessageTitle => '删除消息？';

  @override
  String get chatNoMessages => '还没有消息';

  @override
  String get chatTypeMessage => '输入消息…';

  @override
  String get chatRecordVoice => '录制语音';

  @override
  String get chatStopRecording => '停止录制';

  @override
  String get chatInviteToGroup => '邀请到群组';

  @override
  String get chatNoContactsInvite => '没有可邀请的联系人。';

  @override
  String chatInvitedSnack(String name) {
    return '已邀请 $name';
  }

  @override
  String get chatVoiceSending => '正在发送语音…';

  @override
  String get chatVoiceSent => '语音已发送';

  @override
  String get chatVoiceRecording => '正在录音';

  @override
  String get chatVoiceReady => '待发送';

  @override
  String get chatVoiceCancel => '取消';

  @override
  String get chatVoiceSend => '发送';

  @override
  String get chatVoiceSendHint => '完成后点发送 · 取消则丢弃';

  @override
  String get chatVoiceReadyHint => '发送失败 · 点发送重试 · 取消则丢弃';

  @override
  String get chatVoiceSendFailed => '发送语音失败';

  @override
  String get chatSentFile => '发送了一个文件';

  @override
  String get chatSentVoice => '发送了一条语音';

  @override
  String get chatDeliverySent => '已发送';

  @override
  String get chatDeliveryDelivered => '已送达';

  @override
  String get chatDeliveryFailed => '未送达';

  @override
  String get chatMicDenied => '麦克风权限被拒绝';

  @override
  String get chatRecordFailed => '开始录制失败';

  @override
  String get chatCallFailed => '发起通话失败';

  @override
  String get chatAiDisabled => 'AI 模型已禁用。请在设置 → AI 中启用模型提供方。';

  @override
  String get chatAiDisabledFamily => '此家庭档案无法使用 AI。';

  @override
  String get inboxPublishedUpdates => '发布更新';

  @override
  String get inboxPublishedEmpty => '还没有发布通知。已绑定联系人发布网页内容时会显示在这里。';

  @override
  String get inboxPendingIntros => '待处理介绍';

  @override
  String get inboxPendingEmpty => '没有待处理的介绍';

  @override
  String get inboxWantsToConnect => '想要连接';

  @override
  String get pairingInvalidQr => '无效的配对二维码';

  @override
  String get pairingPasteUri => '或粘贴配对 URI';

  @override
  String get pairingUriHint => 'envoy://pair?… 或 envoy://invite?…';

  @override
  String get pairingNeedHomeHint =>
      '要建立自己的家庭节点？请先在 Mac 或 Windows 电脑上下载安装 EnvoyMesh，再扫描其二维码。加入家人？直接扫描他们的邀请码即可，手机无需安装电脑版。';

  @override
  String get pairingDownloadEnvoyMesh => 'EnvoyMesh 电脑版下载';

  @override
  String get pairingJoinFamily => '加入家庭';

  @override
  String pairingConnectTo(String name) {
    return '连接到 $name？';
  }

  @override
  String pairingWelcomeFamily(String name) {
    return '欢迎加入 $name 家庭！';
  }

  @override
  String get pairingImNew => '我是新成员';

  @override
  String get pairingImBack => '我回来了';

  @override
  String get pairingDisplayNameOptional => '显示名称（可选）';

  @override
  String get pairingYourName => '你的名称';

  @override
  String get pairingAvatarColor => '头像颜色';

  @override
  String get pairingOwnerNameHint => '在此节点上显示为你的机主资料名称';

  @override
  String get pairingCopyError => '复制错误';

  @override
  String get pairingRetryMembers => '重试加载成员';

  @override
  String get pairingWhoAreYou => '你是谁？';

  @override
  String get pairingAlreadyOnHome => '已在此家庭';

  @override
  String get pairingSelectProfile => '选择你的档案';

  @override
  String get pairingNoMembersFirst => '还没有家庭成员 — 你将是第一个。';

  @override
  String get pairingNoExistingProfiles => '还没有现有家庭档案。切换到「我是新成员」创建一个。';

  @override
  String get pairingNameRequired => '请输入你的名称';

  @override
  String get pairingSelectRequired => '请选择你的档案';

  @override
  String get pairingLanAvailable => 'LAN：可用';

  @override
  String get pairingRelayAvailable => 'Relay：可用';

  @override
  String pairingPeer(String peer) {
    return 'Peer: $peer';
  }

  @override
  String get pairingNameHintDad => '例如：爸爸';

  @override
  String get pairingNameHintMom => '例如：妈妈、Alex';

  @override
  String get pairingChooseUniqueName => '选择一个下方尚未使用的名称。';

  @override
  String get pairingSameNameHint => '使用你在第一部手机上创建的同一名称。';

  @override
  String get pairingTapIfSecondPhone => '如果这是第二部手机（我回来了），请点按名称。';

  @override
  String get feedEmptyTitle => '你的圈子很安静';

  @override
  String get feedEmptyHint => '还没有帖子。与已绑定联系人分享一条动态吧。';

  @override
  String get feedHint => '来自你和已绑定联系人的动态。';

  @override
  String get feedDeleteTitle => '删除帖子？';

  @override
  String get feedDeleteBody => '此操作无法撤销。';

  @override
  String get blogPairHint => '与家庭节点配对以撰写和管理博客文章。';

  @override
  String get blogConnectHint => '连接到家庭节点以管理博客。';

  @override
  String get blogDeleteTitle => '删除帖子？';

  @override
  String blogDeleteBody(String title) {
    return '删除「$title」？此操作无法撤销。';
  }

  @override
  String get feedWhatsOnMind => '在想什么？';

  @override
  String get feedShareHint => '与已绑定联系人分享动态…';

  @override
  String get feedPhotos => '照片';

  @override
  String get feedVisibility => '可见范围';

  @override
  String get feedVisBonded => '已绑定联系人';

  @override
  String get feedVisSelected => '选定联系人';

  @override
  String get feedVisOnlyMe => '仅自己';

  @override
  String get feedNeedTextOrPhoto => '添加文字或至少一张照片';

  @override
  String get feedNeedContact => '请至少选择一位联系人';

  @override
  String get feedSelectedHint => '只有这些联系人能看到此帖。请至少选择一位。';

  @override
  String get feedNoContacts => '还没有已绑定联系人 — 请先添加联系人，或选择「已绑定联系人 / 仅自己」。';

  @override
  String get feedAiDraft => 'AI 草稿';

  @override
  String get feedDiscard => '丢弃';

  @override
  String get feedInsert => '插入';

  @override
  String get feedReplace => '替换';

  @override
  String get peoplePairHint => '与家庭节点配对以在网络上发现用户。';

  @override
  String get peopleConnectHint => '连接到家庭节点以发现用户。';

  @override
  String get peopleHint => '寻找尚未绑定的人 — 打开其公开资料或博客，然后打个招呼。';

  @override
  String get peopleTopic => '话题';

  @override
  String get peopleInterest => '兴趣';

  @override
  String get peopleTopicHint => '音乐、编程、旅行…';

  @override
  String get peopleInterestHint => '摄影、烹饪、旅行…';

  @override
  String get peopleOnMesh => '网络上的人';

  @override
  String get peopleResults => '结果';

  @override
  String get peopleEmpty => '暂无可显示的用户。';

  @override
  String get peopleProfile => '资料';

  @override
  String get peopleBlog => '博客';

  @override
  String get peopleSayHello => '打招呼';

  @override
  String get peopleHelloSent => '已发送打招呼';

  @override
  String get peopleEnterSearch => '输入话题或兴趣进行搜索。';

  @override
  String get peopleNoMatches => '没有匹配的搜索结果。';

  @override
  String get peopleNoneFound => '网络上还没有公开的用户。';

  @override
  String get peopleHelloMessage => '你好 — 我想在 Envoy 上建立联系。';

  @override
  String get peopleOpenLink => '打开链接';

  @override
  String get filesPairHint => '与家庭节点配对以管理我的文件。';

  @override
  String get filesConnectHint => '连接到家庭节点以管理文件。';

  @override
  String get filesSearchHint => '搜索资料库';

  @override
  String get filesVaultHint => 'Vault 资料库 — 聊天附件与个人资料照片保留在聊天 / 资料中';

  @override
  String get filesEmpty => '资料库中还没有文件。';

  @override
  String filesImported(String name) {
    return '已导入 $name';
  }

  @override
  String filesImportFailed(String error) {
    return '导入失败：$error';
  }

  @override
  String filesPreviewFailed(String error) {
    return '预览失败：$error';
  }

  @override
  String get filesNoContactsShare => '没有可分享的已绑定联系人';

  @override
  String get filesShareWith => '分享给…';

  @override
  String get filesShareSent => '分享已发送';

  @override
  String filesShareFailed(String error) {
    return '分享失败：$error';
  }

  @override
  String get filesImport => '导入';

  @override
  String filesPreviewUnavailable(String mime, int bytes) {
    return '无法预览 $mime（$bytes 字节）。';
  }

  @override
  String publishedTitle(String name) {
    return '已发布内容 — $name';
  }

  @override
  String get publishedPhotoWall => '相册';

  @override
  String get publishedFeed => '动态';

  @override
  String get engagementCommentHint => '写评论…';

  @override
  String get engagementRemoveCommentTooltip => '删除评论';

  @override
  String get profileTitle => '资料';

  @override
  String get profileMyTitle => '我的资料';

  @override
  String get profileUnnamed => '未命名';

  @override
  String get profileRemovePhotoTitle => '删除照片？';

  @override
  String get profileNameRequired => '显示名称或用户名必填';

  @override
  String get profileSaved => '资料已保存';

  @override
  String get profileUsername => '用户名';

  @override
  String get profileBio => '简介';

  @override
  String get profileBioHint => '添加简短简介，方便联系人认出你。';

  @override
  String get profilePhotos => '照片';

  @override
  String get profileNoPhotosYet => '还没有照片 — 添加一张到照片墙';

  @override
  String get profileNoPhotosShared => '未分享照片';

  @override
  String get profileLongPressRemove => '长按照片可删除';

  @override
  String get contactsSearchHint => '搜索联系人…';

  @override
  String get contactsEmpty => '还没有联系人';

  @override
  String get contactsEmptyHint => '已绑定的联系人会显示在这里。';

  @override
  String get contactsChat => '聊天';

  @override
  String get callIncoming => '来电';

  @override
  String get callConnected => '已连接';

  @override
  String get callConnecting => '连接中…';

  @override
  String get callDisconnected => '已断开';

  @override
  String get callSwitchCamera => '切换摄像头';

  @override
  String get authorPublish => '发布';

  @override
  String get authorType => '类型';

  @override
  String get authorTypeProfile => '资料';

  @override
  String get authorTypePhoto => '照片墙照片';

  @override
  String get authorTypeBlog => '博文';

  @override
  String get authorVisPublic => '公开';

  @override
  String get authorVisBonded => '已绑定';

  @override
  String get authorVisPrivate => '私密';

  @override
  String get authorCaption => '说明';

  @override
  String get authorCaptionOptional => '说明（可选）';

  @override
  String get authorBody => '正文';

  @override
  String get authorBodyMarkdown => '正文（Markdown）';

  @override
  String get authorTitle => '标题';

  @override
  String get authorTitleRequired => '标题必填';

  @override
  String get authorPickPhoto => '请先选择照片';

  @override
  String get authorChooseAvatar => '选择头像';

  @override
  String get authorChoosePhoto => '选择照片';

  @override
  String get aiDraftButton => 'AI 起草';

  @override
  String get aiDraftEmphasize => '应强调什么？（可选）';

  @override
  String get aiDraftEmphasizeHint => '例如：周末与好友徒步';

  @override
  String get aiDraftMode => '模式';

  @override
  String get aiDraftTone => '语气';

  @override
  String get aiDraftRewrite => '改写';

  @override
  String get aiDraftExpand => '扩写';

  @override
  String get aiDraftShorten => '缩短';

  @override
  String get aiDraftGenerate => '生成';

  @override
  String get aiDraftNoModel => '家庭节点上未配置 AI 模型。';

  @override
  String get aiDraftEmpty => '模型返回空草稿';

  @override
  String get aiDraftBio => '起草简介';

  @override
  String get aiDraftBlog => '起草博文';

  @override
  String get aiDraftFeed => '起草动态';

  @override
  String get aiDraftCaption => '起草说明';

  @override
  String get settingsAiModelIntro => '家庭节点助手的云端模型提供方。更改将在下次助手回合生效。';

  @override
  String settingsHomeUses(String mode) {
    return '家庭节点使用 $mode';
  }

  @override
  String get settingsEndpoint => 'Endpoint:';

  @override
  String get settingsModelLabel => 'Model:';

  @override
  String get settingsEditOnSocial => '请在家庭节点的社交界面中编辑此提供方以进行高级设置。';

  @override
  String get settingsProvider => 'Provider';

  @override
  String get settingsEndpointUrl => 'Endpoint URL';

  @override
  String get settingsModel => 'Model';

  @override
  String get settingsCustomModel => '自定义模型名称';

  @override
  String get settingsApiKey => 'API key';

  @override
  String get settingsApiKeySaved => '家庭节点上已保存密钥';

  @override
  String get settingsAiModelSaved => 'AI 模型已保存';

  @override
  String get settingsAiModelTestChat => '测试聊天模型';

  @override
  String get settingsAiModelTestChatBusy => '测试中…';

  @override
  String settingsAiModelTestChatOk(String modelName, int latencyMs) {
    return '聊天模型正常 — $modelName，$latencyMs ms';
  }

  @override
  String settingsAiModelTestChatFail(String error) {
    return '聊天模型失败：$error';
  }

  @override
  String settingsSaveFailed(String error) {
    return '保存失败：$error';
  }

  @override
  String get settingsDefault => '（默认）';

  @override
  String get settingsAiEngineIntro => '选择家庭节点将助手回合转发到哪个外部智能体。';

  @override
  String get settingsExternalAgent => 'External agent';

  @override
  String get settingsWebhookUrl => 'Webhook URL';

  @override
  String get settingsHowToStart => '如何启动';

  @override
  String get settingsBuiltIntoHome => '内置于家庭节点';

  @override
  String get settingsNoExtProcess => '无需单独的 Ext Agent 进程。';

  @override
  String get settingsBridgePort => 'Bridge 监听端口';

  @override
  String get settingsBridgeEnabled => 'Bridge 已启用';

  @override
  String get settingsBridgeHint => '将助手回合转发到选定的外部智能体。';

  @override
  String get settingsOpenClawEnabled => 'OpenClaw 已启用';

  @override
  String get settingsOpenClawHint => '下次节点启动时启用内置 OpenClaw 网关（EnvoyAI）。';

  @override
  String get settingsOpenClawUnavailable => 'OpenClaw 状态不可用';

  @override
  String settingsOpenClawStatus(String state) {
    return 'OpenClaw $state';
  }

  @override
  String settingsExtAgentStatus(String state) {
    return 'Ext Agent $state';
  }

  @override
  String get settingsEnabled => '已启用';

  @override
  String get settingsDisabled => '已禁用';

  @override
  String get settingsAiEngineSaved => 'AI 引擎已保存';

  @override
  String get settingsNotConnectedNode => '未连接到家庭节点';

  @override
  String settingsPiState(String state) {
    return '状态：$state';
  }

  @override
  String get settingsPiBuiltIn => '本地编码助手';

  @override
  String get settingsPiLocalOnly =>
      'Pi 用于终端与 Ext Agent。Envoy Harness 负责编码聊天，并始终可在终端中使用。';

  @override
  String get settingsPiEnabled => '启用 Pi';

  @override
  String get settingsPiCodingBackend => '当前引擎';

  @override
  String get settingsPiCodingBackendPi => 'Pi（侧车）';

  @override
  String get settingsPiCodingBackendEh => 'envoy-harness（ACP）';

  @override
  String get settingsPiCodingBackendHint => '哪个引擎接收编码聊天与审批。不会清除另一引擎的设置。';

  @override
  String get settingsPiCodingBackendSaved => '当前引擎已更新';

  @override
  String get settingsPiSectionTitle => 'Pi';

  @override
  String get settingsPiSectionHint =>
      '用于终端与 Ext Agent 的 Sidecar 编码助手 — 启用与模型覆盖';

  @override
  String get settingsEhSectionTitle => 'Envoy Harness';

  @override
  String get settingsEhSectionHint =>
      '负责编码聊天，并始终可在终端中使用 — 自动执行策略（项目文件夹在 Envoy 聊天中）';

  @override
  String get settingsEhAutoRunPolicy => 'Envoy Harness 自动执行';

  @override
  String get settingsEhAutoRunAlways => '始终确认';

  @override
  String get settingsEhAutoRunSafe => '仅确认危险操作';

  @override
  String get settingsEhAutoRunOff => '关闭 — 始终显示预览';

  @override
  String get settingsEhAutoRunNever => '从不询问（全部自动允许）';

  @override
  String get settingsEhAutoRunSaved => 'Envoy Harness 自动执行已更新';

  @override
  String get settingsEhActiveBadge => '使用中';

  @override
  String get settingsPiOverrideHint => 'Pi 模型覆盖（可选）。清除以继承 AI 模型设置。';

  @override
  String get settingsPiModelName => 'Model 名称';

  @override
  String get settingsPiEndpoint => 'Endpoint';

  @override
  String get settingsPiLeaveBlankKey => '留空以保留已保存的密钥';

  @override
  String get settingsPiSaveOverride => '保存模型覆盖';

  @override
  String get settingsPiClearOverride => '清除覆盖（继承 AI 模型）';

  @override
  String get settingsPiModelSaved => 'Pi 模型已保存';

  @override
  String get settingsPiModelRequired => 'Model 名称必填';

  @override
  String get settingsPiInherits => 'Pi 继承 EnvoyMesh 模型设置';

  @override
  String settingsPiFailed(String error) {
    return '失败：$error';
  }

  @override
  String settingsPiClearFailed(String error) {
    return '清除失败：$error';
  }

  @override
  String settingsPiProviderCustom(String provider) {
    return '$provider（自定义）';
  }

  @override
  String get aiEngineReadonlyHint => '移动端两个区块均为只读。请在家庭节点上配置（设置 → AI → AI 引擎）。';

  @override
  String get aiEngineBuiltInOpenClaw => '内置 OpenClaw';

  @override
  String get aiEngineExtBridge => 'External Agent Bridge';

  @override
  String get aiEngineModeBoth => '内置 + Ext';

  @override
  String get aiEngineModeBuiltIn => '仅内置';

  @override
  String get aiEngineModeExt => '仅 Ext';

  @override
  String get aiEngineModeNone => '无';

  @override
  String get aiEngineRunning => '运行中';

  @override
  String get aiEngineConfigured => '已配置（未运行）';

  @override
  String get aiEngineDisabled => '已禁用';

  @override
  String get browserTitle => '浏览器';

  @override
  String get browserGo => '前往';

  @override
  String get browserBack => '后退';

  @override
  String get browserForward => '前进';

  @override
  String get browserReload => '重新加载';

  @override
  String get browserPairFirst => '未连接到家庭节点 — 请先配对并重连。';

  @override
  String get browserIntegrityFailed => '内容完整性检查失败 — 拒绝渲染';

  @override
  String browserDecodeImageFailed(String error) {
    return '解码图片失败：$error';
  }

  @override
  String get browserPhoto => '照片';

  @override
  String get browserPhotos => '照片';

  @override
  String get browserNoPhotos => '还没有照片。';

  @override
  String get browserHint => '输入 envoy:// URL 以浏览已绑定联系人提供的内容。';

  @override
  String get extSwitchTitle => '切换 Ext Agent';

  @override
  String extSwitchTooltip(String name) {
    return '切换 Ext Agent（$name）';
  }

  @override
  String extNotRunningChat(String name) {
    return '$name 未运行 — 聊天前请先启动。';
  }

  @override
  String extSwitchFailed(String error) {
    return '切换失败：$error';
  }

  @override
  String extNotRunning(String name) {
    return '$name 未运行';
  }

  @override
  String get extChecking => '检查中…';

  @override
  String get extCheckAgain => '再次检查';

  @override
  String get audioLoading => '加载音频…';

  @override
  String get audioUnavailable => '音频不可用';

  @override
  String get audioVoiceNote => '语音消息';

  @override
  String meLastAttempt(String time) {
    return '上次尝试：$time';
  }

  @override
  String get meJustNow => '刚刚';

  @override
  String get mePublicIpLabel => '公网 IP 或域名';

  @override
  String get mePublicIpHint => '例如 1.2.3.4 或 mynode.example.com';

  @override
  String get mePublicIpHelp => '若家庭节点有公网 IP 或域名，请设置此项。\n可在 5G/WAN 上不经中继直连。';

  @override
  String get meNetworkDebug => '网络调试';

  @override
  String get meRunNetworkTests => '运行网络测试';

  @override
  String get meTesting => '测试中…';

  @override
  String get meNetworkTestsHint => '测试 EnvoyGo 用于配对的所有路径。';

  @override
  String get meSwitchNode => '切换节点';

  @override
  String get chainsRecentTitle => '最近团队任务';

  @override
  String get chainsActiveTitle => '进行中的团队任务';

  @override
  String get chainsLoadFailed => '加载协作任务失败';

  @override
  String get chainsNoReports => '还没有报告';

  @override
  String get chainsEmptyHint => '在家庭节点上运行的团队任务会显示在这里。\n可从本手机或家庭节点的社交界面启动。';

  @override
  String get chainsNoActive => '家庭节点上没有进行中的团队任务。\n请用下方按钮启动一个。';

  @override
  String get chainsReportGone => '此报告已不可用';

  @override
  String get chainsReportGoneHint => '可能已被 90 天 GC 策略移除。';

  @override
  String get chainsBackToRecent => '返回最近团队任务';

  @override
  String get chainsLoadReportFailed => '加载报告失败';

  @override
  String get chainsSummary => '摘要';

  @override
  String get chainsWorkers => '工作代理';

  @override
  String get chainsSubtasks => '子任务';

  @override
  String get chainsSynthesis => '汇总';

  @override
  String get chainsDuration => '耗时';

  @override
  String get chainsManageOnSocial => '机群设置、竞标与配方仍在家庭节点的社交界面。取消、再平衡与置顶也可在此操作。';

  @override
  String get chainsStartTemplatesSaved => '已保存的模板';

  @override
  String get chainsStartTemplatesBuiltin => '快速开始';

  @override
  String get chainsStartTitle => '启动团队任务';

  @override
  String get chainsStartFab => '新建团队任务';

  @override
  String get chainsStartIntro => '描述目标。家庭节点会规划子任务，并分配已绑定的 Agent Network 工作代理。';

  @override
  String get chainsStartAssignmentMode => '分配模式';

  @override
  String get chainsStartModeSkill => '按技能';

  @override
  String get chainsStartModeRole => '按角色';

  @override
  String get chainsStartModeSkillHint => '按匹配技能为工作代理排序。';

  @override
  String get chainsStartModeRoleHint => '每个步骤优先匹配协作角色（产品经理、程序员等）。';

  @override
  String get chainsStartTeamStrategy => '团队策略';

  @override
  String get chainsStartTeamStrategyHint =>
      '本任务如何为工作节点排序。对冲 / 仅核验是策略标签 — 链路上仅在即时双派门控通过时才会启动第二名工作节点。';

  @override
  String get chainsStrategyBalanced => '均衡';

  @override
  String get chainsStrategyFastest => '最快';

  @override
  String get chainsStrategyCheapest => '最省';

  @override
  String get chainsStrategyHighestConfidence => '最高置信度';

  @override
  String get chainsStrategyPrivacyLocal => '隐私（本地）';

  @override
  String get chainsStrategyDiverseModel => '多样模型';

  @override
  String get chainsStartAvailLease => '租约';

  @override
  String get chainsStartAvailLegacy => '旧版';

  @override
  String chainsStartReliabilityPct(int pct) {
    return '可信度 $pct%';
  }

  @override
  String chainsStartReliabilitySparse(String level, int samples) {
    return '$level · $samples 次样本';
  }

  @override
  String get chainsStartReliabilityFallbackExact => '该工作节点历史';

  @override
  String get chainsStartReliabilityFallbackPeerRuntimeSkill => '该工作节点类似任务';

  @override
  String get chainsStartReliabilityFallbackPeerRuntime => '该工作节点运行时';

  @override
  String get chainsStartReliabilityFallbackRuntimeSkill => '具备此技能的工作节点';

  @override
  String get chainsStartReliabilityFallbackPrior => '通用先验（尚无历史）';

  @override
  String get chainsStartGoalLabel => '目标';

  @override
  String get chainsStartGoalHint => '团队应完成什么？';

  @override
  String chainsStartGoalTooShort(int min) {
    return '目标至少需要 $min 个字符';
  }

  @override
  String get chainsStartAttachmentsLabel => '附件';

  @override
  String get chainsStartAttachmentsAdd => '添加文件';

  @override
  String get chainsStartAttachmentsHint =>
      '提示：为每个文件加短标签（如 brief），并在目标里写 [brief]，方便工作节点识别要用哪个文件——即使文件名很长或看不懂。';

  @override
  String chainsStartAttachmentsMax(int max) {
    return '最多可添加 $max 个附件';
  }

  @override
  String chainsStartAttachmentTooLarge(String name, int maxMb) {
    return '$name 过大（上限 $maxMb MB）';
  }

  @override
  String get chainsStartAttachmentUploading => '上传中…';

  @override
  String get chainsStartAttachmentFailed => '上传失败';

  @override
  String get chainsStartAttachmentLabel => '标签';

  @override
  String get chainsStartAttachmentLabelHint => '例如：brief、销售数据';

  @override
  String get chainsStartAttachmentRemove => '移除附件';

  @override
  String get chainsStartPreview => '预览计划';

  @override
  String get chainsStartPreviewing => '规划中…';

  @override
  String get chainsStartPreviewFailed => '无法生成计划';

  @override
  String get chainsStartNeedPreview => '请先预览计划再启动';

  @override
  String get chainsStartPlanHeading => '计划';

  @override
  String get chainsStartNoSubtasks => '此计划没有子任务。';

  @override
  String get chainsStartConfirm => '启动团队任务';

  @override
  String get chainsStartStarting => '启动中…';

  @override
  String get chainsStartStarted => '团队任务已启动';

  @override
  String get chainsStartFailed => '无法启动团队任务';

  @override
  String get chainsStartNoWorkers =>
      '没有可到达的 Agent Network 工作代理。请先在家庭节点上绑定带智能体的联系人。';

  @override
  String get chainsTestNetworkTitle => '测试智能体网络';

  @override
  String get chainsTestNetworkHint =>
      '模拟 — 不发送任务、不调用模型、不改声誉。干跑规划会真实排序；故障转移与恢复仅为标签预览。';

  @override
  String get chainsTestNetworkRun => '检查就绪';

  @override
  String get chainsTestNetworkRunning => '检查中…';

  @override
  String get chainsTestNetworkFailed => '无法运行诊断';

  @override
  String get chainsSpeculationReviewTitle => '工作节点结果不一致';

  @override
  String get chainsSpeculationReviewBody =>
      '两个工作节点完成了此步骤但结果不同。请在下方选择一个结果、重新分配该步骤，或自动继续。';

  @override
  String get chainsSpeculationReviewNonePass =>
      '此步骤没有通过核验的结果。请选择最佳尝试、重新分配该步骤，或自动继续。';

  @override
  String get chainsSpeculationReviewDisagree =>
      '两个结果不一致。请选择一个结果、重新分配该步骤，或自动继续。';

  @override
  String get chainsSpeculationReviewPick => '使用此结果';

  @override
  String get chainsSpeculationReviewReassign => '重新分配步骤';

  @override
  String get chainsSpeculationReviewAutoResolve => '自动继续';

  @override
  String get chainsSpeculationReviewResolved => '已保存选择 — 任务继续。';

  @override
  String get chainsSpeculationReviewFailed => '无法处理此步骤';

  @override
  String get chainsAssignerStrandedTitle => '编排机已离线';

  @override
  String get chainsAssignerStrandedBody =>
      '正在运行此团队任务的电脑没有响应。你可以取消任务，或在本家庭节点继续（会用同一目标重新开始一次）。';

  @override
  String get chainsAssignerStrandedReclaim => '在本机继续';

  @override
  String get chainsAssignerStrandedCancel => '取消任务';

  @override
  String get chainsAssignerStrandedReclaimed => '已在本家庭节点恢复任务。';

  @override
  String get chainsAssignerStrandedRestarted => '没有可恢复的进度快照 — 已在本家庭节点重新开始。';

  @override
  String get chainsAssignerStrandedCancelled => '团队任务已取消。';

  @override
  String get chainsAssignerStrandedFailed => '无法更新此任务';

  @override
  String get chainsSpeculationRolePrimary => '主运行';

  @override
  String get chainsSpeculationRoleSpeculative => '备用运行';

  @override
  String get chainsSpeculationRoleReplacement => '替换运行';

  @override
  String get chainsStepStatePending => '等待中';

  @override
  String get chainsStepStateOffered => '已发出';

  @override
  String get chainsStepStateAwarded => '已分配';

  @override
  String get chainsStepStateRunning => '运行中';

  @override
  String get chainsStepStateDone => '完成';

  @override
  String get chainsStepStateFailed => '失败';

  @override
  String get chainsStepStateCancelled => '已取消';

  @override
  String get chainsWorkerEngineFailed => '工作节点的 AI 引擎未能完成此步骤。请稍后再试。';

  @override
  String get chainsReassignUnavailable => '此家庭节点不支持重新分配';

  @override
  String get chainsAssignerAutoLabel => '选择最强发起方';

  @override
  String get chainsAssignerAutoHint => '开启后，家庭节点会选择最强的已绑定节点来规划并管理此任务。';

  @override
  String get chainsSuggestedAssigner => '建议发起方';

  @override
  String get chainsAssignerPeerLabel => '发起方';

  @override
  String get chainsAssignerPeerThisNode => '本家庭节点（默认）';

  @override
  String get chainsAssignerPeerHint => '可选 — 在已绑定的节点上运行发起方，而不是本家庭节点。';

  @override
  String get chainsIterationPreviewOwner => '多轮 refinement — 发布前您将审阅每份草稿。';

  @override
  String get chainsIterationPreviewAuto => '多轮 refinement — 发起方决定何时停止。';

  @override
  String get chainsSpeculationDualWorkersLabel => '关键步骤运行两个工作节点';

  @override
  String get chainsSpeculationDualWorkersHint =>
      '当两个工作节点结果不一致时，家庭节点可自动选择，或先询问您（见家庭节点默认设置）。';

  @override
  String get chainsStartReadinessTitle => '先准备好工作节点';

  @override
  String get chainsStartReadinessJoinOff => '在家庭电脑上：团队任务 → 管理工作节点 → 开启加入智能体网络。';

  @override
  String get chainsStartReadinessBond => '在发现中绑定联系人，并请对方开启加入智能体网络。';

  @override
  String get chainsStartReadinessRefresh =>
      '在 Social 的团队任务中打开管理工作节点并刷新代理卡，然后在此重新预览。';

  @override
  String get chainsStepsTitle => '任务步骤';

  @override
  String get chainsStepsWaitingOn => '等待：';

  @override
  String get chainsAttachmentHonesty =>
      '你附加的文件保存在本机保险库。工作节点获派后会收到这些输入的一份副本，放在其协作任务工作区 — 不会形成对你资料库的长期镜像。';

  @override
  String get chainsDeliveryTitle => '输入送达';

  @override
  String get chainsDeliveryRetry => '重试';

  @override
  String get chainsDeliveryRetried => '已重试输入送达';

  @override
  String get chainsDeliveryRetryFailed => '无法重试输入送达';

  @override
  String get chainsDeliveryPhasePending => '等待中';

  @override
  String get chainsDeliveryPhaseTransferring => '传输中';

  @override
  String get chainsDeliveryPhaseVerified => '已送达';

  @override
  String get chainsDeliveryPhaseFailed => '失败';

  @override
  String get chainsInputDeliveryScope => '输入送达范围';

  @override
  String get chainsInputDeliveryScopeReferenced => '仅引用附件';

  @override
  String get chainsInputDeliveryScopeAll => '全部附件';

  @override
  String get chainsInputDeliveryScopeHint =>
      '「仅引用」默认只发送步骤中以 [标签] 提到的附件；若无匹配则回退为全部任务附件。「全部」会把每个附件发给每位获派工作节点。';

  @override
  String get chainsIterationAskOwnerTitle => '发布前审阅草稿';

  @override
  String get chainsIterationAskOwnerBody => '接受即可发布，或继续再精炼一轮。';

  @override
  String get chainsIterationAcceptDraft => '接受并发布';

  @override
  String get chainsIterationContinue => '继续精炼';

  @override
  String get chainsIterationAccepted => '已接受草稿 — 正在发布';

  @override
  String get chainsIterationContinued => '开始新一轮精炼';

  @override
  String get chainsIterationResolveFailed => '无法应用您的决定';

  @override
  String get chainsObservedTitle => '你参与的任务';

  @override
  String get chainsObservedHint => '只读 — 只有发起方可以管理这些任务。';

  @override
  String get chainsObservedReadOnly => '只读';

  @override
  String get chainsStartNeedWorkers => '请至少选择一个在线工作代理，或重新预览以恢复推荐池。';

  @override
  String get chainsStartWorkersHint =>
      '以下为计划中的在线工作代理。取消勾选不需要的。全部取消会阻止启动 — 重新预览可恢复推荐池。';

  @override
  String get chainsStartWorkersHeading => '工作代理';

  @override
  String get chainsStartNoSuggestedWorkers => '暂无建议工作代理 — 启动时将使用家庭节点的发现池。';

  @override
  String chainsStartWorkerMatches(int count) {
    return '匹配 $count 个步骤';
  }

  @override
  String get chainsStartWorkerOnline => '在线';

  @override
  String get chainsStartWorkerRelay => '在线（中继）';

  @override
  String get chainsStartWorkerOffline => '离线 / 未知';

  @override
  String get chainsActiveGone => '此团队任务已不在进行中';

  @override
  String chainsBudgetLine(String spent, String max) {
    return '预算 $spent / $max 美元';
  }

  @override
  String get chainsBudgetWarn => '预算告警 — 可考虑追加预算。';

  @override
  String get chainsBudgetExceeded => '预算已超 — 任务可能卡住，直到重新平衡。';

  @override
  String chainsPartialCount(int count) {
    return '$count 个部分结果';
  }

  @override
  String get chainsCancelTitle => '取消团队任务？';

  @override
  String get chainsCancelBody => '将通知工作代理停止。已收集的部分结果会保留。';

  @override
  String get chainsCancelConfirm => '取消任务';

  @override
  String get chainsCancelDone => '团队任务已取消';

  @override
  String get chainsCancelReason => '已从 EnvoyGo 取消';

  @override
  String get chainsCancelStep => '取消此步骤';

  @override
  String get chainsCancelStepTitle => '取消此步骤？';

  @override
  String get chainsCancelStepBody => '将停止此步骤及其依赖步骤。已收集的部分结果会保留。';

  @override
  String get chainsCancelStepFailed => '无法取消此步骤';

  @override
  String get chainsReassignStep => '重新分配';

  @override
  String get chainsStepCancelled => '步骤已取消';

  @override
  String get chainsStepReassigned => '步骤已重新分配';

  @override
  String get chainsReassignFailed => '无法重新分配此步骤';

  @override
  String get chainsCancelStepReason => '已从 EnvoyGo 取消步骤';

  @override
  String get chainsDetailCancelled => '此任务已取消。';

  @override
  String get chainsDetailPublished => '此任务已完成并发布报告。';

  @override
  String get chainsDetailRecovering => '重启后恢复中 — 正在确认工作节点进度';

  @override
  String chainsAttemptCount(int count) {
    return '$count 次尝试';
  }

  @override
  String get chainsExecutionDetails => '执行详情';

  @override
  String chainsProvenanceSummaryLine(
    int attempts,
    String worker,
    String state,
  ) {
    return '$attempts 次尝试 · $worker · $state';
  }

  @override
  String chainsLastReason(String reason) {
    return '最近原因：$reason';
  }

  @override
  String get chainsTechnicalDetails => '技术细节';

  @override
  String get chainsProvenanceEmpty => '此步骤尚无日志事件。';

  @override
  String get chainsProvenanceFailed => '无法加载执行历史。';

  @override
  String get chainsArtifactGraphTitle => '产物交接';

  @override
  String get chainsArtifactGraphEmpty => '此步骤尚无中间产物。';

  @override
  String get chainsHomesTitle => '此任务涉及的节点';

  @override
  String get chainsHomesAssigner => '编排机';

  @override
  String get chainsHomesWorkers => '工作机';

  @override
  String get chainsHomesWatchingRemote => '任务在另一台电脑上运行 — 进度会显示在这里。';

  @override
  String get chainsHomesThisHomeAssigner => '家庭节点是编排机。';

  @override
  String get chainsRebalanceHeading => '追加预算';

  @override
  String get chainsRebalanceHint => '提高成本上限并重试尚未分配的步骤。';

  @override
  String get chainsRebalanceAmount => '追加金额（美元）';

  @override
  String get chainsRebalanceAction => '追加并重试';

  @override
  String get chainsRebalanceInvalidAmount => '请输入大于 0 的金额';

  @override
  String get chainsRebalanceDone => '预算已更新';

  @override
  String get chainsRebalanceFailed => '无法重新平衡';

  @override
  String get chainsPin => '置顶报告';

  @override
  String get chainsUnpin => '取消置顶';

  @override
  String get chainsPinDone => '报告已置顶（保留超过 90 天清理）';

  @override
  String get chainsUnpinDone => '已取消置顶';

  @override
  String chainsPublished(String date) {
    return '发布于 $date';
  }

  @override
  String chainsChainId(String id) {
    return '链 $id';
  }

  @override
  String get termNone => '没有终端会话';

  @override
  String termAttachFailed(String error) {
    return '终端连接失败：$error';
  }

  @override
  String get termCopied => '已复制到剪贴板';

  @override
  String get termReconnecting => '重新连接中…';

  @override
  String get termCopyAll => '复制全部输出';

  @override
  String get termPaste => '粘贴';

  @override
  String get termCloseSession => '关闭会话';

  @override
  String get chatImagePlaceholder => '[图片]';

  @override
  String get chatsBotSyncing => '同步更新中…';

  @override
  String get chatsBotSavedHint => '已保存在家庭节点。准备好后即可聊天。';

  @override
  String get chatsBotNotFound => '家庭节点上未找到该机器人';

  @override
  String get chatAiDisabledAskOwner => '请让家庭机主为家庭聊天启用 AI 模型。';

  @override
  String get chatFamilyAttachNoThread => '无法在此添加附件 — 没有家庭会话';

  @override
  String chatPhotoSendFailed(String error) {
    return '发送照片失败：$error';
  }

  @override
  String get chatMoreAttach => '添加附件';

  @override
  String get chatAttachPhoto => '照片';

  @override
  String get chatAttachFile => '文件';

  @override
  String get chatShareFromVault => '从资料库分享';

  @override
  String get chatNoVaultFilesToShare => '没有可分享的资料库文件';

  @override
  String get chatAttachFilesAgent => '附加文件';

  @override
  String get chatUploading => '正在上传…';

  @override
  String get chatSending => '正在发送…';

  @override
  String chatFileTooLarge(String name, String maxMb) {
    return '$name：文件过大（最大 $maxMb MiB）';
  }

  @override
  String get chatAgentAttachOwnerOnly => '只有节点所有者能为代理聊天附加文件。';

  @override
  String get chatAttachHomeFile => '家庭电脑文件';

  @override
  String get chatAttachPhoneFile => '手机文件';

  @override
  String pairingLoadProfilesFailed(String error) {
    return '无法加载已有档案：$error';
  }

  @override
  String pairingFailed(String error) {
    return '配对失败：$error';
  }

  @override
  String get pairingFailedHomeTimeout =>
      '配对未能完成 — 家庭电脑没有及时响应。请保持电脑上的 EnvoyAI 已打开且在线，然后重新扫描新的二维码。';

  @override
  String get pairingFailedHomeUnreachable =>
      '无法连接到家庭电脑。请让手机与家庭电脑在同一 Wi‑Fi，或等电脑显示已连上中继后再扫描新的二维码。';

  @override
  String get pairingFailedTokenExpired => '此二维码已过期或无效。请让家庭节点所有者重新显示配对二维码后再扫。';

  @override
  String get pairingInviteAlreadyUsed =>
      '此邀请二维码已被使用。请让家庭节点所有者重新打开「家庭 → 显示邀请二维码」，扫描新码后选择「我回来了」并选中你的档案（例如 Dad）。';

  @override
  String get pairingInProgressTitle => '正在与家庭节点配对';

  @override
  String pairingInProgressSubtitle(String owner) {
    return '正在连接 $owner';
  }

  @override
  String pairingElapsed(String time) {
    return '已用时：$time';
  }

  @override
  String pairingHomeNodeLabel(String peer) {
    return '家庭节点：$peer';
  }

  @override
  String get pairingStageInitial => '正在初始化';

  @override
  String get pairingStageInitialHint => '正在建立到家庭节点的安全通道。';

  @override
  String get pairingStageConnecting => '正在联络家庭节点';

  @override
  String get pairingStageConnectingHint => '正在本地网络和中继上寻找家庭节点。';

  @override
  String get pairingStageHandshaking => '正在握手';

  @override
  String get pairingStageHandshakingHint => '正在交换密钥 — 首次连接这一步可能需要一会儿。';

  @override
  String get pairingStageVerifying => '正在校验';

  @override
  String get pairingStageSlowHint => '比平时更久。请确认家庭节点在同一个 Wi‑Fi，或能访问互联网。';

  @override
  String get pairingStageVerySlowHint => '配对耗时明显超过预期。请确认两台设备都在线，然后取消并重试。';

  @override
  String get pairingCancel => '取消配对';

  @override
  String get pairingCancelConfirmTitle => '要取消配对吗？';

  @override
  String get pairingCancelConfirmBody => '握手会停止。可以重新扫描二维码再试。';

  @override
  String get commonKeepWaiting => '继续等待';

  @override
  String get pairingDontCloseApp => '请勿关闭应用 — 配对在后台继续进行。';

  @override
  String get pairingNowLan => '正在通过本地网络连接你的家庭节点…';

  @override
  String get pairingNowP2p => '正在建立安全的点对点连接…';

  @override
  String get pairingNowRelay => '正在通过中继服务器连接…';

  @override
  String get pairingStillWorking => '仍在进行中 — 首次连接可能需要一两分钟，请保持应用打开。';

  @override
  String get pairingTroubleTitle => '仍然无法连接？';

  @override
  String get pairingTroubleBody => '请确认家庭节点已开机且在线，并确认此设备可访问互联网。若仍然失败，请取消后重试。';

  @override
  String get feedDefaultTitle => '动态帖子';

  @override
  String get aiDraftSection => '草稿段落';

  @override
  String aiDraftFailed(String reason) {
    return '无法生成草稿（$reason）';
  }

  @override
  String authorAvatarNamed(String name) {
    return '头像：$name';
  }

  @override
  String authorPhotoNamed(String name) {
    return '照片：$name';
  }

  @override
  String get peopleEnvoyUser => 'Envoy 用户';

  @override
  String get commonEllipsis => '…';

  @override
  String get browserCached => '已缓存';

  @override
  String get browserLoaded => '已加载';

  @override
  String get browserNotPublished => '尚未发布';

  @override
  String get browserNotFound => '未找到内容';

  @override
  String get browserAccessDenied => '拒绝访问';

  @override
  String browserPdfLoaded(int chars) {
    return 'PDF 已加载（$chars 个 base64 字符）';
  }

  @override
  String browserUnsupportedType(String mime) {
    return '不支持的类型：$mime';
  }

  @override
  String get browserInterests => '兴趣';

  @override
  String get browserKnowledge => '知识';

  @override
  String get browserCapabilities => '能力';

  @override
  String get connTooltipP2p => '经中继跳点的 P2P 连接';

  @override
  String get connTooltipRelay => '中继连接 — 家庭节点可拨号联系你';

  @override
  String connTooltipConnectedVia(String transport) {
    return '通过 $transport 连接';
  }

  @override
  String get connBootstrap => '引导节点';

  @override
  String get settingsRunning => '运行中';

  @override
  String get settingsNotRunning => '未运行';

  @override
  String get settingsModelIdHint => 'model-id';

  @override
  String get chainsSections => '章节';

  @override
  String get chainsWorkerAllocations => '工作者分配';

  @override
  String chainsAwardedSummary(String status, int awarded, int total) {
    return '$status · 已授予 $awarded/$total';
  }

  @override
  String meAttemptN(int n) {
    return '第 $n 次尝试';
  }

  @override
  String meSecondsAgo(int n) {
    return '$n 秒前';
  }

  @override
  String meMinutesAgo(int n) {
    return '$n 分钟前';
  }

  @override
  String meHoursAgo(int n) {
    return '$n 小时前';
  }

  @override
  String meDaysAgo(int n) {
    return '$n 天前';
  }

  @override
  String get termShowKeyboard => '显示键盘';

  @override
  String get termHideKeyboard => '隐藏键盘';

  @override
  String get termCopySelection => '复制选中内容';

  @override
  String get pairingImBackHint => '如果这是你的第二部手机，点选姓名（我回来了）。';

  @override
  String connP2pDetail(String detail) {
    return 'P2P（$detail）';
  }

  @override
  String get meConnRefused => '连接被拒绝 / 已拦截';

  @override
  String get meTimeout5s => '超时（5 秒）';

  @override
  String timeMinutesShort(int n) {
    return '$n 分钟';
  }

  @override
  String timeHoursShort(int n) {
    return '$n 小时';
  }

  @override
  String timeDaysShort(int n) {
    return '$n 天';
  }

  @override
  String get termCtrlSticky => 'Ctrl 修饰键（粘滞）';

  @override
  String get termCtrlLetter => 'Ctrl + 字母';

  @override
  String get connStateConnected => '已连接';

  @override
  String get connStateConnecting => '连接中…';

  @override
  String get connStateDisconnected => '已断开';

  @override
  String get connStateError => '错误';

  @override
  String get chatsDefaultGroup => '群组';

  @override
  String get chatsDefaultFamilyGroup => '家庭群组';

  @override
  String chatsTerminalTitle(String name) {
    return '终端：$name';
  }

  @override
  String get chatsExtAgent => '外部智能体';

  @override
  String browserBytesCount(int count) {
    return '$count 字节';
  }

  @override
  String get commonYouName => '你';

  @override
  String get settingsAiModelEnvoyLocalStandby =>
      '家庭节点当前使用 Envoy Local。点按可管理本地模型，或在下方保存云端提供方作为备用。';

  @override
  String get settingsEnvoyLocalIntro =>
      '在家庭电脑上控制 llama.cpp。模型下载发生在电脑上，不会下载到本手机。';

  @override
  String get settingsEnvoyLocalStatusHeading => '状态';

  @override
  String get settingsEnvoyLocalInUse => '使用中';

  @override
  String get settingsEnvoyLocalNotInUse => '未使用';

  @override
  String get settingsEnvoyLocalStatusDownloading => '下载中…';

  @override
  String get settingsEnvoyLocalStatusDetecting => '检测中…';

  @override
  String get settingsEnvoyLocalStatusExtracting => '解压中…';

  @override
  String get settingsEnvoyLocalStatusStarting => '启动中…';

  @override
  String get settingsEnvoyLocalStatusReady => '就绪';

  @override
  String get settingsEnvoyLocalStatusError => '错误';

  @override
  String get settingsEnvoyLocalStatusDisabled => '已禁用';

  @override
  String get settingsEnvoyLocalIdleTimeout =>
      'Envoy Local 操作已超时（60 分钟）。若下载卡在接近 100%，请改用中国镜像或 VPN 后重试 — 未完成的下载会续传。';

  @override
  String settingsEnvoyLocalRuntime(String status) {
    return '运行时：$status';
  }

  @override
  String settingsEnvoyLocalRuntimeVersion(String version) {
    return '版本：$version';
  }

  @override
  String settingsEnvoyLocalAccel(String accel) {
    return '加速：$accel';
  }

  @override
  String settingsEnvoyLocalHardware(String summary) {
    return '本机：$summary';
  }

  @override
  String settingsEnvoyLocalActiveModel(String model) {
    return '模型：$model';
  }

  @override
  String settingsEnvoyLocalProgressBytes(String received, String total) {
    return '$received / $total MB';
  }

  @override
  String settingsEnvoyLocalProgressReceived(String received) {
    return '已下载 $received MB';
  }

  @override
  String settingsEnvoyLocalLastError(String error) {
    return '最近错误：$error';
  }

  @override
  String get settingsEnvoyLocalDownloadRegion => '模型下载区域';

  @override
  String get settingsEnvoyLocalDownloadRegionHint =>
      '若下载失败，可改用中国镜像，或为全球源开启 VPN。';

  @override
  String settingsEnvoyLocalDownloadRegionEffective(String region) {
    return '当前：$region';
  }

  @override
  String get settingsEnvoyLocalRegionAuto => '自动（时区 / 语言）';

  @override
  String get settingsEnvoyLocalRegionCn => '中国（ModelScope → hf-mirror）';

  @override
  String get settingsEnvoyLocalRegionGlobal => '全球（Hugging Face）';

  @override
  String get settingsEnvoyLocalEnable => '下载并启用';

  @override
  String get settingsEnvoyLocalEnabling => '下载中…';

  @override
  String get settingsEnvoyLocalStart => '启动 Envoy Local';

  @override
  String get settingsEnvoyLocalStarting => '启动中…';

  @override
  String get settingsEnvoyLocalStop => '停止 Envoy Local';

  @override
  String get settingsEnvoyLocalRestart => '重启';

  @override
  String get settingsEnvoyLocalCancelDownload => '取消下载';

  @override
  String get settingsEnvoyLocalStopHint => '停止后，助手将切回已保存的云端 / Ollama 提供方。';

  @override
  String get settingsEnvoyLocalRecommended => '推荐';

  @override
  String get settingsEnvoyLocalRecommendedBadge => '推荐';

  @override
  String get settingsEnvoyLocalDownload => '下载';

  @override
  String get settingsEnvoyLocalInstalled => '已安装模型';

  @override
  String get settingsEnvoyLocalInstalledHint => '下载保存在家庭节点。选择当前使用的模型。';

  @override
  String get settingsEnvoyLocalNoInstalled => '尚未安装模型。';

  @override
  String get settingsEnvoyLocalSetActive => '设为当前';

  @override
  String get settingsEnvoyLocalActiveBadge => '当前';

  @override
  String get settingsEnvoyLocalInstalledBadge => '已安装';

  @override
  String get settingsEnvoyLocalCatalog => '目录';

  @override
  String settingsEnvoyLocalHfError(String error) {
    return 'Hugging Face 搜索不可用：$error';
  }

  @override
  String get settingsEnvoyLocalRefresh => '刷新';

  @override
  String get settingsEnvoyLocalPhoneNote =>
      '高级服务参数（上下文大小、GPU 层数等）请在家庭节点的社交界面中调整。';

  @override
  String get ehReviewTitle => '审查此回合';

  @override
  String get ehReviewUnavailable => '此较早回合没有可用的已保存审查。';

  @override
  String get ehReviewFile => '文件';

  @override
  String get ehReviewOpenFile => '打开文件';

  @override
  String get ehReviewDiffUnavailable => '此文件没有可用的文本差异。';

  @override
  String get ehReviewOnly => '工作区检测到 · 仅可审查';

  @override
  String get ehRevertTitle => '还原此回合？';

  @override
  String get ehRevertBody => '文件将恢复为此回合之前的内容。之后的编辑受保护，会阻止还原。';

  @override
  String get ehRevertAction => '还原';

  @override
  String get ehRevertComplete => '此回合的文件更改已还原。';

  @override
  String get ehRevertUnavailable => '此回合已无法安全还原。';

  @override
  String ehRevertConflict(String files) {
    return '还原已停止，因为这些文件之后又被修改：$files';
  }

  @override
  String get ehSearchTranscript => '搜索对话记录';

  @override
  String get ehSearchClose => '关闭搜索';

  @override
  String get ehNoMatches => '没有匹配的回合';

  @override
  String get ehCopyTurn => '复制回合';

  @override
  String get ehShareTurn => '分享回合';

  @override
  String get ehReviewDiff => '查看差异';

  @override
  String get ehRevertThisTurn => '还原此回合';

  @override
  String get ehReviewChanges => '审查更改';

  @override
  String get ehRevertAll => '全部还原';

  @override
  String ehChangesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '本回合更改了 $count 个文件',
      one: '本回合更改了 1 个文件',
    );
    return '$_temp0';
  }

  @override
  String get ehChangesKeepAll => '全部保留';

  @override
  String get ehChangesRevert => '全部还原';

  @override
  String get ehChangesHideList => '隐藏列表';

  @override
  String get ehChangesShowList => '显示列表';

  @override
  String get ehReviewKeepFile => '保留';

  @override
  String get ehReviewRevertFile => '还原';

  @override
  String get ehReviewKeptAll => '已保留更改。';

  @override
  String ehReviewRevertedFile(String path) {
    return '已还原 $path';
  }

  @override
  String get ehReviewAutoLabel => '自动审查当 ≥';

  @override
  String get ehReviewAutoAlways => '始终';

  @override
  String ehQueueTitle(int count) {
    return '已排队 ($count)';
  }

  @override
  String get ehQueueClear => '清空';

  @override
  String get ehQueueBusyHint => '发送将排入下一则';

  @override
  String get ehQueueFollowUpHint => '排队后续消息…';

  @override
  String get ehInjectTooltip => '插入（取消并发送）';

  @override
  String ehFilesChangedCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '更改了 $count 个文件',
      one: '更改了 1 个文件',
    );
    return '$_temp0';
  }

  @override
  String get ehEmptyReply => 'envoy-harness 没有给出可见回复。你的消息仍在 — 请重试或换个说法。';

  @override
  String get ehConfigureModelHint => '请在 设置 → AI 中配置模型。';

  @override
  String get ehReviewKeepFailed => '无法保留更改。';

  @override
  String get ehReviewOpenGitDiff => '打开 Git 差异';

  @override
  String get ehDiffBefore => '更改前';

  @override
  String get ehDiffAfter => '更改后';

  @override
  String get ehPermsTooltip => '权限策略';

  @override
  String get ehPermsSafe => '默认（安全自动运行）';

  @override
  String get ehPermsAsk => '始终询问';

  @override
  String get ehPermsApprove => '始终批准';

  @override
  String ehPermsSet(String mode) {
    return '权限策略 → $mode。';
  }

  @override
  String get ehPermsNextTurn => ' 从下一轮起生效。';

  @override
  String ehPermsFailed(String error) {
    return '无法设置权限策略：$error';
  }

  @override
  String get chainsStatusCancelled => '已取消';

  @override
  String get chainsStatusPublished => '已发布';

  @override
  String get chainsStatusRecovering => '恢复中';

  @override
  String get chainsStatusSynthesizing => '汇总中';

  @override
  String get chainsStatusRunning => '运行中';

  @override
  String get chainsStatusWaitingWorkers => '等待工作节点';

  @override
  String get chainsStatusBidding => '竞标中';

  @override
  String get chainsStatusAssigning => '分配中';

  @override
  String get chainsStatusPlanning => '规划中';

  @override
  String get ehWorking => '进行中';

  @override
  String get ehCompleted => '已完成';

  @override
  String get ehUpdate => '更新';

  @override
  String ehToolLabel(String name) {
    return '工具：$name';
  }

  @override
  String ehMatchCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 处匹配',
      one: '1 处匹配',
    );
    return '$_temp0';
  }

  @override
  String get termMore => '更多…';

  @override
  String get termCompactContext => '压缩上下文';

  @override
  String get termUpdatePlan => '显示或更新计划';

  @override
  String get termHarnessStatus => 'Harness 状态';

  @override
  String get termPiActions => 'Pi 操作';

  @override
  String get termHarnessActions => 'envoy-harness 操作';

  @override
  String get termPreviousCommand => '上一条命令';

  @override
  String get termNextCommand => '下一条命令';

  @override
  String get termCursorLeft => '光标左移';

  @override
  String get termCursorRight => '光标右移';

  @override
  String get termEnterKey => '回车键';

  @override
  String get chainsCancelFailed => '无法取消此团队任务。';

  @override
  String get settingsUseForCodingChat => '用于编码聊天';

  @override
  String get settingsUseForCodingChatHint => '已弃用 — 编码聊天始终使用 Envoy Harness。';
}
