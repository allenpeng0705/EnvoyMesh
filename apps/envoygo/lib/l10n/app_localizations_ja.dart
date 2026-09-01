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
  String get navChats => 'チャット';

  @override
  String get navInbox => '受信箱';

  @override
  String get navContent => 'コンテンツ';

  @override
  String get navSocial => 'ソーシャル';

  @override
  String get navTerminal => 'ターミナル';

  @override
  String get navKnowledge => 'ナレッジ';

  @override
  String get navMe => '自分';

  @override
  String get contentExplore => '探索';

  @override
  String get socialDiscover => '見つける';

  @override
  String get marketTitle => 'マーケット';

  @override
  String get marketPaneBrowse => '見る';

  @override
  String get marketPaneShop => 'マイショップ';

  @override
  String get marketBrowseEmptyTitle => 'まだ他の人の出品はありません';

  @override
  String get marketBrowseEmptyDesc => 'ボンドした友達が出品するとここに表示されます。';

  @override
  String get marketSearchPlaceholder => '本・電子機器・タグを検索…';

  @override
  String get marketSearchSubmit => '検索';

  @override
  String get marketSearchIdleHint => 'キーワードを入力するか、下の候補をタップ。';

  @override
  String marketSearchNoResults(String query) {
    return '「$query」に一致する出品はありません。';
  }

  @override
  String get marketChipBooks => '本';

  @override
  String get marketChipElectronics => '電子機器';

  @override
  String get marketChipClothing => '衣類';

  @override
  String get marketChipHome => '家庭';

  @override
  String get marketChipDigital => 'デジタル';

  @override
  String get marketClearHistory => '履歴を消去';

  @override
  String get marketHistoryCleared => '検索履歴を消去しました。';

  @override
  String get marketMessageSeller => '出品者にメッセージ';

  @override
  String get marketSellerLabel => '出品者';

  @override
  String get marketShareLink => 'リンクをコピー';

  @override
  String get marketShareCopied => '共有リンクをコピーしました。';

  @override
  String marketInquireDefault(String title) {
    return 'こんにちは。「$title」に興味があります。まだありますか？';
  }

  @override
  String get marketInquireSent => '送信しました。チャットを開きます…';

  @override
  String get marketNotConnected => 'ホーム未接続 — ペアリング後にショップを表示できます。';

  @override
  String get marketNoListings => 'まだ出品がありません。「写真から追加」をタップするか、Social で編集してください。';

  @override
  String get marketUntitled => '無題の出品';

  @override
  String get marketVisibilityPublicShort => '公開';

  @override
  String get marketVisibilityBondsShort => 'ボンドのみ';

  @override
  String get marketStatusActive => '販売中';

  @override
  String get marketStatusReserved => '取置中';

  @override
  String get marketStatusSold => '売却済み';

  @override
  String get marketStatusWithdrawn => '取り下げ';

  @override
  String get marketTagsLabel => 'タグ';

  @override
  String get marketEditOnSocialHint =>
      '出品の作成・編集は当面ホームノードの Social マーケットタブで行ってください。';

  @override
  String get marketCaptureAddFromPhoto => '写真から追加';

  @override
  String get marketCaptureCamera => '写真を撮る';

  @override
  String get marketCaptureGallery => 'ギャラリーから選ぶ';

  @override
  String get marketCaptureNotesTitle => '商品を説明する';

  @override
  String get marketCaptureNotesHint => '1行目にタイトル、続けて詳細…';

  @override
  String get marketCaptureContinue => '続ける';

  @override
  String get marketCaptureReviewTitle => '出品を確認';

  @override
  String get marketCaptureTitleLabel => 'タイトル';

  @override
  String get marketCaptureDescriptionLabel => '説明';

  @override
  String get marketCapturePriceLabel => '価格';

  @override
  String get marketCaptureCurrencyLabel => '通貨';

  @override
  String get marketCaptureVisibilityLabel => '誰が見つけられるか';

  @override
  String get marketCapturePublish => '公開';

  @override
  String get marketCapturePublished => 'ホームノードに出品を公開しました。';

  @override
  String get marketCaptureTitleRequired => '公開前にタイトルを入力してください。';

  @override
  String get marketSellerSuggestedReply => '出品からの返信案';

  @override
  String get marketMarkReserved => '取置にする';

  @override
  String get marketMarkSold => '売却済みにする';

  @override
  String get marketMarkAvailable => '販売中に戻す';

  @override
  String get marketRelist => '再出品';

  @override
  String get marketStatusUpdated => '出品ステータスを更新しました。';

  @override
  String get marketPaymentHint =>
      '支払いは EnvoyMesh の外で売り手と合意してください — Envoy はお金を預かりません。';

  @override
  String get marketBlockSeller => 'ブロック';

  @override
  String get marketReportSeller => '通報';

  @override
  String get marketConfirmBlock => 'この売り手をブロックしますか？出品は閲覧から非表示になります。';

  @override
  String get marketConfirmReport =>
      'この売り手を通報してブロックしますか？記録はあなたのノードにのみ残ります（中央審査はまだありません）。';

  @override
  String get marketFilterCategory => 'カテゴリ';

  @override
  String get marketFilterAnyCategory => 'すべてのカテゴリ';

  @override
  String get marketFilterMinPrice => '最低価格';

  @override
  String get marketFilterMaxPrice => '最高価格';

  @override
  String get marketFilterCurrency => '通貨';

  @override
  String get termEmptyHint => 'ホームノードで Pi コーディングセッションまたはシェルターミナルを開始します。';

  @override
  String get commonCancel => 'キャンセル';

  @override
  String get commonConfirm => '確認';

  @override
  String get homeFolderDrives => 'ドライブ';

  @override
  String get homeFolderComputer => 'コンピューター';

  @override
  String get homeFolderHome => 'ホーム';

  @override
  String get homeFolderParent => '↑ 親フォルダー';

  @override
  String get homeFolderNoSubfolders => 'サブフォルダーはありません';

  @override
  String get commonSave => '保存';

  @override
  String get commonDelete => '削除';

  @override
  String get commonRetry => '再試行';

  @override
  String get commonClose => '閉じる';

  @override
  String get commonLoading => '読み込み中…';

  @override
  String get commonError => '問題が発生しました';

  @override
  String get commonReconnect => '再接続';

  @override
  String get commonSwitch => '切り替え';

  @override
  String get commonPair => 'ペアリング';

  @override
  String get commonUnpair => 'ペア解除';

  @override
  String get commonCreate => '作成';

  @override
  String get commonRename => '名前を変更';

  @override
  String get languageTitle => '言語';

  @override
  String get languageSubtitle => 'メニューと表示の言語';

  @override
  String get languageSystem => 'システム既定';

  @override
  String get languageSystemDesc => '端末の言語に合わせる';

  @override
  String get meConnectedNode => '接続中のノード';

  @override
  String get meNotConnected => '未接続';

  @override
  String get meNotConnectedHint => 'ホームノードとペアリングして開始';

  @override
  String get meReconnect => '再接続';

  @override
  String get meSwitch => '切り替え';

  @override
  String get meRepair => '再ペアリング';

  @override
  String get meReconnectNow => '今すぐ再接続';

  @override
  String get meUnpair => 'ペア解除';

  @override
  String get meBrowser => 'ブラウザ';

  @override
  String get meBrowserHint => 'envoy:// ページを開く — またはコンテンツのマイサイト';

  @override
  String get meMyShop => 'マイショップ';

  @override
  String get meMyShopHint => 'ホームノードの出品を表示（編集は当面 Social）';

  @override
  String get meAiEngine => 'AI エンジン';

  @override
  String get meAiEngineHint => 'ブリッジ + OpenClaw。タップして設定。';

  @override
  String get meRecentTeamJobs => '最近のチームジョブ';

  @override
  String get meRecentTeamJobsHint => '完了したマルチエージェントジョブ';

  @override
  String get meActiveTeamJobs => '実行中のチームジョブ';

  @override
  String get meActiveTeamJobsHint => '実行中のジョブを確認';

  @override
  String get mePairNewNode => '新しいノードをペア';

  @override
  String get mePairNewNodeHint => '別のホームノードを追加';

  @override
  String get meSettings => '設定';

  @override
  String get meAiModel => 'AI モデル';

  @override
  String get meEnvoyLocal => 'Envoy Local';

  @override
  String get meEnvoyLocalHint => 'ホームノードのローカルモデル（コンピューターにダウンロードして起動）';

  @override
  String get mePiAgent => 'コーディングエージェント';

  @override
  String get mePiAgentHint => 'Pi と Envoy Harness の設定';

  @override
  String get meDarkMode => 'ダークモード';

  @override
  String get meDarkModeHint => 'システム設定に従う';

  @override
  String get mePushNotifications => 'プッシュ通知';

  @override
  String get mePushNotificationsHint => 'バックグラウンド時の通知';

  @override
  String get meUnpairDevice => 'このデバイスのペア解除';

  @override
  String get meUnpairDeviceHint => '切断してローカルデータをすべて削除';

  @override
  String get meUnpairConfirmTitle => 'ペアを解除しますか？';

  @override
  String get meUnpairConfirmBody => 'このデバイス上の当該ホームノードのペアリングとローカルチャットが削除されます。';

  @override
  String get meUnpairedSnack => 'ペア解除しました。ローカルチャットとデータを削除しました。';

  @override
  String meUnpairFailed(String error) {
    return 'ペア解除に失敗: $error';
  }

  @override
  String get meEditProfile => 'プロフィールを編集';

  @override
  String meProfileUpdateFailed(String error) {
    return 'プロフィールを更新できません: $error';
  }

  @override
  String get mePublicAccess => '公開アクセス';

  @override
  String get mePort => 'ポート';

  @override
  String get mePublicAccessSaved => '公開アクセスを保存しました';

  @override
  String get meFamilyProfile => 'ファミリープロフィール';

  @override
  String get meFamilyProfileHint => '家族メンバーとしてこのホームに接続しています';

  @override
  String get mePreferences => '設定';

  @override
  String get meViewEditProfile => 'プロフィールを表示・編集';

  @override
  String get meEditNameAvatar => '名前とアバターを編集';

  @override
  String get meDisplayName => '表示名';

  @override
  String get meAvatarColor => 'アバター色（16進）';

  @override
  String meMorePaired(int count) {
    return '+$count 件のペアリング';
  }

  @override
  String meSessionExpired(String name) {
    return '$name のセッションが期限切れ';
  }

  @override
  String meDisconnectedFrom(String name) {
    return '$name から切断されました';
  }

  @override
  String meUnpairConfirmBodyNamed(String name) {
    return 'このデバイス上の $name の接続を切断し、ローカルのチャットとデータをすべて削除します。';
  }

  @override
  String get meTeamJobs => 'チームジョブ';

  @override
  String get meStartTeamJobHint => 'プランをプレビューしてホームノードで起動';

  @override
  String get meAiModelHint => 'このホームノードのアシスタントが使うプロバイダー';

  @override
  String get mePiAgentHintLong => 'ホームノードのローカルコーディングエージェント（Pi と Envoy Harness）';

  @override
  String get mePushNotificationsHintLong =>
      'アプリがバックグラウンドのとき、新着メッセージ・連絡先リクエスト・承認の通知を受け取ります。';

  @override
  String get meRecentTeamJobsHintLong => 'ホームノードに公開されたジョブレポートを表示';

  @override
  String get meActiveTeamJobsHintLong => 'ホームノードで進行中のチームジョブを監視';

  @override
  String get inboxTitle => '受信箱';

  @override
  String get inboxEmpty => '通知はまだありません';

  @override
  String get inboxEmptyHint => 'ボンドリクエストとフィード更新がここに表示されます';

  @override
  String get contentFeed => 'フィード';

  @override
  String get contentBlog => 'ブログ';

  @override
  String get contentPeople => 'ピープル';

  @override
  String get contentMyFiles => 'マイファイル';

  @override
  String get contentKnowledge => 'ナレッジ';

  @override
  String get knowledgeTitle => 'ナレッジ';

  @override
  String get knowledgeLede =>
      'ボールト ナレッジ ベース — notes/ のノートが EnvoyAI を動かします。ドキュメントは原本のまま残ります。';

  @override
  String get knowledgePanelBrowse => '参照';

  @override
  String get knowledgePanelAsk => '質問';

  @override
  String get knowledgePanelPlugins => 'プラグイン';

  @override
  String get knowledgePanelSetup => 'セットアップ';

  @override
  String get knowledgeAskHint =>
      '回答はこのノードのノートとドキュメントを使用します。連絡先に見えるのはあなたが公開した内容だけです。';

  @override
  String get knowledgeAskHeading => 'ボールトに質問';

  @override
  String get knowledgeAskLabel => '質問';

  @override
  String get knowledgeAskPlaceholder => 'オンボーディングについて何を書いた？';

  @override
  String get knowledgeAskSubmit => '質問する';

  @override
  String get knowledgeAskBusy => '検索中…';

  @override
  String get knowledgeAskAnswerHeading => '回答';

  @override
  String get knowledgeAskEmptyAnswer =>
      '回答がありません。セットアップを確認 — ボールト ナレッジを有効化してインデックスを再構築してください。';

  @override
  String get knowledgeAskContinueEnvoyAi => 'EnvoyAIで開く';

  @override
  String get knowledgeAskEnvoyAiHint => 'ツール付きマルチターン会話はEnvoyAIで続行してください。';

  @override
  String get knowledgeLibraryHeading => 'あなたのファイル';

  @override
  String get knowledgeLibraryCaption => 'ノート、ドキュメント、公開済みコンテンツ。';

  @override
  String get knowledgeEmbedGateTitleNeeded => '埋め込みモデルが必要です';

  @override
  String get knowledgeEmbedGateTitleDownloading => '埋め込みモデルをダウンロード中…';

  @override
  String get knowledgeEmbedGateTitleError => '埋め込み設定に失敗';

  @override
  String get knowledgeEmbedGateBodyNeeded =>
      'ナレッジ検索にはホームノード上のローカル埋め込みモデルが必要です。アプリの起動時にダウンロードが自動開始されます — ダウンロード完了まで参照は利用できません。ここから開始または再試行することもできます。';

  @override
  String get knowledgeEmbedGateBodyDownloading =>
      'ホームノードでダウンロード中（アプリ起動時に開始）。この画面を離れても構いません。埋め込みモデルが用意できしだいナレッジが解放されます。';

  @override
  String get knowledgeEmbedGateBodyError =>
      'ホームノードに埋め込みランタイムまたはモデルをインストールできませんでした。ダウンロードを再試行するか、デスクトップアプリで設定を修正してください。';

  @override
  String get knowledgeEmbedGateDownload => 'ホームにダウンロード';

  @override
  String get knowledgeEmbedGateDownloading => 'ダウンロード中…';

  @override
  String get knowledgeEmbedGateRetry => 'ダウンロード再試行';

  @override
  String get knowledgeEmbedGateOpenSetup => 'セットアップを開く';

  @override
  String get knowledgeEmbedGateBackgroundHint => '完了までの間も他の機能を安心してご利用いただけます。';

  @override
  String get knowledgeEmbedGateStripNeeded => 'ナレッジ利用不可 — 埋め込みモデルがホームに未インストール';

  @override
  String get knowledgeEmbedGateStripDownloading =>
      'ナレッジ利用不可 — 埋め込みモデルをホームにダウンロード中';

  @override
  String get knowledgeEmbedGateStripError => 'ナレッジ利用不可 — ホームでの埋め込み設定に失敗';

  @override
  String get knowledgeEmbedGateDownloadStarted => 'ホームで埋め込みダウンロードを開始';

  @override
  String get knowledgeEmbedGateBlockedToast => 'ボルトに質問する前に埋め込み設定を完了してください。';

  @override
  String get knowledgeEmbedGatePhaseDetecting => 'プラットフォームを検出中…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingRuntime =>
      'llama.cpp ランタイムをダウンロード中…';

  @override
  String get knowledgeEmbedGatePhaseExtracting => 'ランタイムを展開中…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingModel => '埋め込みモデルをダウンロード中…';

  @override
  String get knowledgeEmbedGatePhaseStarting => '埋め込みサービスを起動中…';

  @override
  String get knowledgeEmbedGatePhaseDownloading => 'ダウンロード中…';

  @override
  String get knowledgeEmbedGateStepsAria => '埋め込みインストール手順';

  @override
  String get knowledgePluginsLede =>
      'オプションのコネクタ。NotionはMCP URLが必要です（Notionアプリではありません）。';

  @override
  String get knowledgePluginsObsidianTitle => 'Obsidian';

  @override
  String get knowledgePluginsObsidianDesc => 'ボールト ノートを拡充。デスクトップアプリはオプション。';

  @override
  String get knowledgePluginsNotionTitle => 'Notion (MCP経由)';

  @override
  String get knowledgePluginsNotionDesc => 'MCP経由で検索・参照。URLがない場合はソフトに失敗します。';

  @override
  String get knowledgePluginsMcpUrl => 'MCPサーバー URL';

  @override
  String get knowledgePluginsMcpTool => '検索ツール名';

  @override
  String get knowledgePluginsSyncNow => '今すぐ同期';

  @override
  String get knowledgePluginsLinkedVaultLabel => 'リンク済みObsidianボールトのパス';

  @override
  String get knowledgePluginsLinkedVaultHint => '/パス/to/ObsidianVault';

  @override
  String get knowledgePluginsLinkedVaultEmpty => 'リンク済みボールトはまだありません。';

  @override
  String get knowledgePluginsLinkedVaultRemove => '解除';

  @override
  String get knowledgePluginsLinkedVaultAdd => 'ボールトフォルダーを追加…';

  @override
  String get knowledgePluginsLinkedVaultPickTitle => 'Obsidianボールトフォルダーを選択';

  @override
  String get knowledgePluginsLinkedVaultHelper =>
      'このホームコンピューターのObsidianボールトは自動リンクされます。行を削除するとリンクが解除されます（自動再リンクされません）。さらに追加するには「ボールトフォルダーを追加…」を使用してください。';

  @override
  String get knowledgePluginsOpenObsidian => 'Obsidianを開く';

  @override
  String get knowledgePluginsOpenNotion => 'Notionを開く';

  @override
  String get knowledgePluginsOpeningApp => '起動中…';

  @override
  String get knowledgePluginsOpenAppFailed => 'このコンピューターでアプリを開けませんでした。';

  @override
  String get knowledgePluginsOpenedWebsite =>
      'ローカルに未インストール — ホームノードで公式サイトを開きました。';

  @override
  String get knowledgePluginsDownloadObsidian => 'Obsidian をダウンロード';

  @override
  String get knowledgePluginsDownloadNotion => 'Notion をダウンロード';

  @override
  String get knowledgePluginsLinkedVaultAutoOne =>
      'このコンピューターでリンク済みObsidianボールトが見つかりました。';

  @override
  String knowledgePluginsLinkedVaultAutoMany(int count) {
    return 'このコンピューターで$count個のリンク済みObsidianボールトが見つかりました。';
  }

  @override
  String get knowledgeHubImportObsidianAll => 'リンク済みすべてをインポート';

  @override
  String get knowledgeHubImportNotionVisible => '表示中のカードをインポート';

  @override
  String get knowledgeHubExportToObsidian => 'Obsidianにエクスポート';

  @override
  String get knowledgeHubExportToNotion => 'Notion/MCPにエクスポート';

  @override
  String knowledgeHubImportObsidianOk(int count) {
    return 'Obsidianノート$count件をインポートしました';
  }

  @override
  String knowledgeHubImportNotionOk(int count) {
    return 'Notion/MCPノート$count件をインポートしました';
  }

  @override
  String knowledgeHubExportObsidianOk(int count) {
    return 'ノート$count件をObsidianにエクスポートしました';
  }

  @override
  String knowledgeHubExportNotionOk(int count) {
    return 'MCP経由でノート$count件をエクスポートしました';
  }

  @override
  String get knowledgeHubImportFailed => 'インポート失敗';

  @override
  String get knowledgeHubExportFailed => 'エクスポート失敗';

  @override
  String get knowledgeHubImportMcpEmpty => 'インポートするライブMCPカードがありません — 先に参照を更新';

  @override
  String get knowledgeHubExportEmpty => 'エクスポートするボールトMarkdownノートがありません';

  @override
  String get knowledgeHubShareVaultOnly => '共有はボールトファイルのみで機能 — 先にインポート';

  @override
  String knowledgeHubMcpListError(String error) {
    return 'MCPリスト: $error';
  }

  @override
  String get knowledgeSetupHint => 'インデックス状態と取得。チャットモデルは「マイ → AIモデル」にあります。';

  @override
  String get knowledgeSetupEmbeddingHint => 'ボルト検索用の埋め込み。モデルがなくてもキーワード検索は使えます。';

  @override
  String get knowledgeSetupEnabled => 'ボールトナレッジを有効化';

  @override
  String get knowledgeSetupStatusHint => '「再構築」をタップしてベクトルインデックスを更新。';

  @override
  String get knowledgeSetupReindex => 'インデックス再構築';

  @override
  String get knowledgeSetupReindexDone => '再インデックス開始';

  @override
  String get knowledgeSetupReindexConfirm => 'ホームノードでボールトのベクトルインデックスを再構築しますか？';

  @override
  String get knowledgeSetupTestEmbedding => '埋め込みをテスト';

  @override
  String get knowledgeSetupTestEmbeddingBusy => 'テスト中…';

  @override
  String knowledgeSetupTestEmbeddingOk(int dimensions, int latencyMs) {
    return '埋め込み OK — $dimensions 次元 / $latencyMs ms';
  }

  @override
  String knowledgeSetupTestEmbeddingFail(String error) {
    return '埋め込み失敗: $error';
  }

  @override
  String get knowledgeSetupRagMode => '取得モード';

  @override
  String get knowledgeSetupRagHybrid => 'ハイブリッド';

  @override
  String get knowledgeSetupRagVector => 'ベクトル';

  @override
  String get knowledgeSetupRagLexical => 'レキシカル';

  @override
  String get knowledgeSetupSnippetLimit => '回答ごとのボールト スニペット';

  @override
  String knowledgeBrowseIndexIndexingProgress(int processed, int total) {
    return 'インデックス作成中 $processed/$total…';
  }

  @override
  String get knowledgeHubOpenPlugins => 'プラグインを開く';

  @override
  String get knowledgeNoteNewTitle => '新しいノート';

  @override
  String get knowledgeNoteEditTitle => 'ノートを編集';

  @override
  String get knowledgeNoteFilename => 'ファイル名';

  @override
  String get knowledgeNoteFilenameRequired => 'ノートファイル名を入力';

  @override
  String get knowledgeNoteContent => 'Markdown';

  @override
  String get knowledgeNoteSensitivity => '公開範囲';

  @override
  String get knowledgeNotePrivate => '非公開';

  @override
  String get knowledgeNoteFriends => '友達';

  @override
  String get knowledgeNotePublished => '公開済み';

  @override
  String get knowledgeNoteAlsoBlog => 'ブログとしても公開';

  @override
  String get knowledgeFilePreview => 'プレビュー';

  @override
  String get knowledgeFileOpenOnHome => 'ホームで開く';

  @override
  String get knowledgeFileOpenedOnHome => 'ホームコンピューターで開きました';

  @override
  String get knowledgeFilePublish => '公開';

  @override
  String get knowledgeFileMakePrivate => '非公開にする';

  @override
  String get knowledgeBrowseImportAndPublish => 'インポートして公開';

  @override
  String get knowledgeBrowsePublishImportOnly => 'インポートのみ公開';

  @override
  String get knowledgeBrowsePublishImportNoDoc =>
      'インポート済み — ドキュメント ID がないため公開をスキップしました。';

  @override
  String get knowledgeBrowseImportedAndPublished => 'インポートして公開しました。';

  @override
  String get knowledgeBrowsePublishImportHint => 'インポート後、連絡先向けに公開できます。';

  @override
  String get knowledgeFileMore => 'その他の操作';

  @override
  String get knowledgeFileConvert => 'Markdownノートに変換';

  @override
  String knowledgeFileConvertOk(String path) {
    return 'Markdownノートを保存しました: $path';
  }

  @override
  String get knowledgeFileConvertFailed => 'Markdownへの変換に失敗しました';

  @override
  String get knowledgeFileDeleteTitle => 'ファイルを削除しますか？';

  @override
  String knowledgeFileDeleteBody(String title) {
    return 'ホームボールトから「$title」を削除しますか？';
  }

  @override
  String get knowledgeFileDeleteConfirm => '削除';

  @override
  String get meKnowledge => 'ナレッジ設定';

  @override
  String get meKnowledgeHint => 'ボールト質問のインデックスと取得';

  @override
  String get meKnowledgePlugins => 'ナレッジプラグイン';

  @override
  String get meKnowledgePluginsHint => 'ObsidianリンクとNotion/MCP';

  @override
  String get knowledgeBrowseFilterAll => 'すべて';

  @override
  String get knowledgeBrowseFiltersLabel => '表示';

  @override
  String get knowledgeBrowseFilterNotes => 'ノート';

  @override
  String get knowledgeBrowseFilterObsidian => 'Obsidian';

  @override
  String get knowledgeBrowseFilterNotion => 'Notion';

  @override
  String get knowledgeBrowseFilterBlog => 'ブログ';

  @override
  String get knowledgeBrowseFilterDocuments => 'ドキュメント';

  @override
  String get knowledgeBrowseFilterPublished => '公開済み';

  @override
  String knowledgeBrowseIndexReady(int count) {
    return '$count件インデックス済み';
  }

  @override
  String knowledgeBrowseIndexReadyLinked(int count, int linked) {
    return '$count件インデックス済み · Obsidian $linked件リンク';
  }

  @override
  String get knowledgeBrowseIndexIndexing => 'インデックス作成中…';

  @override
  String get knowledgeBrowseIndexEmpty => 'インデックスが空';

  @override
  String get knowledgeBrowseIndexChipHint =>
      'インデックス管理は「ナレッジ → セットアップ」を開いてください。';

  @override
  String get contentNewPost => '新しい投稿';

  @override
  String get chatsTitle => 'チャット';

  @override
  String get chatsEmpty => '会話はまだありません';

  @override
  String get chatsEmptyHint => 'ホームノードとペアリングして開始してください。';

  @override
  String get chatsSearchHint => 'チャットを検索…';

  @override
  String get pairingScanTitle => 'QR をスキャン';

  @override
  String get pairingConfirmTitle => 'ペアリングを確認';

  @override
  String get pairingFamilyInvite => 'ファミリー招待';

  @override
  String get pairingOwnerPair => 'オーナーペアリング';

  @override
  String get engagementLike => 'いいね';

  @override
  String get engagementUnlike => 'いいね解除';

  @override
  String get engagementComment => 'コメント';

  @override
  String get engagementRemoveComment => 'コメントを削除しますか？';

  @override
  String get engagementRemove => '削除';

  @override
  String get feedDelete => '削除';

  @override
  String get blogDelete => '削除';

  @override
  String get blogTitle => 'ブログ';

  @override
  String get blogEmpty => '投稿はまだありません。最初のブログを書きましょう。';

  @override
  String get blogHint => 'メッシュに公開する長文。';

  @override
  String get feedTitle => 'フィード';

  @override
  String get feedComposeTitle => '新しいフィード投稿';

  @override
  String get commonBack => '戻る';

  @override
  String get commonAccept => '承認';

  @override
  String get commonDecline => '拒否';

  @override
  String get commonDismiss => '閉じる';

  @override
  String get commonOpen => '開く';

  @override
  String get commonRefresh => '更新';

  @override
  String get commonEdit => '編集';

  @override
  String get commonPost => '投稿';

  @override
  String get commonPosting => '投稿中…';

  @override
  String get commonPublish => '公開';

  @override
  String get commonShare => '共有';

  @override
  String get commonSend => '送信';

  @override
  String get commonClear => 'クリア';

  @override
  String get commonInvite => '招待';

  @override
  String get commonJoin => '参加';

  @override
  String get commonYou => 'あなた';

  @override
  String get commonUnknown => '不明';

  @override
  String get commonCopied => 'クリップボードにコピーしました';

  @override
  String get commonNotConnectedHome => 'ホームノードに未接続';

  @override
  String get commonSaving => '保存中…';

  @override
  String get commonGenerating => '生成中…';

  @override
  String get commonHide => '非表示';

  @override
  String get commonAdd => '追加';

  @override
  String get commonRemove => '削除';

  @override
  String get commonSearch => '検索';

  @override
  String get connOffline => 'オフライン';

  @override
  String get connDirect => '直接';

  @override
  String get connP2p => 'P2P';

  @override
  String get connRelay => 'リレー';

  @override
  String get connLanDirect => 'LAN（直接）';

  @override
  String get connPublicDirect => 'パブリック IP（直接）';

  @override
  String get connRelayWs => 'リレー WebSocket';

  @override
  String get connTooltipDirect => '直接接続';

  @override
  String get connTooltipConnecting => '接続中…';

  @override
  String get connTooltipOffline => '未接続';

  @override
  String get connTooltipError => '接続エラー';

  @override
  String get chatsSectionAi => 'AI';

  @override
  String get chatsSectionCoding => 'コーディング';

  @override
  String get chatsCodingPi => 'Pi';

  @override
  String get chatsCodingPiHint => 'コーディングエージェント（ターミナル）';

  @override
  String get chatsCodingEh => 'Envoy';

  @override
  String get chatsCodingEhHint => 'コーディングエージェント（チャット）';

  @override
  String get chatsEhNew => '新しいコーディングチャット';

  @override
  String get chatsEhRemoveTitle => 'コーディングチャットを削除しますか？';

  @override
  String chatsEhRemoveBody(String name) {
    return '「$name」をコーディング一覧から削除しますか？ホームノード上の履歴も削除されます。';
  }

  @override
  String get chatsEhThinking => 'Envoy が考えています…';

  @override
  String get chatsEhPromptHint => 'Envoy にコーディング、リファクタ、説明を依頼…';

  @override
  String get chatsSectionFamily => 'ファミリー';

  @override
  String get chatsSectionContacts => '連絡先';

  @override
  String get chatsSectionGroups => 'グループ';

  @override
  String get chatsSectionTerminals => 'ターミナル';

  @override
  String get chatsFabNew => '新規';

  @override
  String get chatsCreateBot => 'Bot を作成';

  @override
  String get chatsCreateBotHint => 'ホームノード上の AI キャラクター';

  @override
  String get chatsNewPi => '新しい Pi';

  @override
  String get chatsNewPiHint => 'Pi コーディングターミナルを開始';

  @override
  String get chatsNewEnvoy => '新しい Envoy';

  @override
  String get chatsNewEnvoyHint => 'Envoy Harness TUI を開始';

  @override
  String get ehChooseProjectTitle => 'Envoy プロジェクトフォルダを選択';

  @override
  String get ehChangeProjectTitle => 'Envoy プロジェクトフォルダを変更';

  @override
  String get ehChooseProjectDesc =>
      'Envoy はこのフォルダで動作します（AGENTS.md の読み取り、ファイル編集、シェル実行）。';

  @override
  String get ehStartWithProject => '開始';

  @override
  String get ehRestartWithProject => 'ここで Envoy を再起動';

  @override
  String get ehEnsuringTerminal => 'Envoy TUI を起動中…';

  @override
  String get ehPermissionTitle => 'ツールの許可';

  @override
  String get ehPermissionAllow => '許可';

  @override
  String get ehPermissionDeny => '拒否';

  @override
  String get ehQuestionTitle => 'Envoy が入力を必要としています';

  @override
  String get ehRecommended => 'おすすめ';

  @override
  String get ehSlashWhileBusy => '先に現在のターンを終了するか /cancel してください。';

  @override
  String get ehChatReset => 'このプロジェクトの新しいチャットを開始しました。';

  @override
  String get ehTurnCancelled => 'ターンをキャンセルしました。';

  @override
  String get ehStatusRefreshed => 'ステータスを更新しました。';

  @override
  String get ehNoPeers => 'ピアクラスタが設定されていません。';

  @override
  String get ehSearchUsage => '使い方: /search <語> — この会話を検索。';

  @override
  String ehSearchNoMatches(String term) {
    return '「$term」に一致するものはありません。';
  }

  @override
  String ehModelShow(String model) {
    return '使用中のモデル: $model';
  }

  @override
  String get ehModelUnknown => 'モデル未設定 — 設定 → AI で設定してください。';

  @override
  String ehProjectCurrent(String path) {
    return 'プロジェクトフォルダ: $path';
  }

  @override
  String get ehProjectUnset => 'プロジェクトフォルダ未設定 — /cd <パス> を使ってください。';

  @override
  String ehProjectSet(String path) {
    return 'プロジェクトフォルダ → $path';
  }

  @override
  String get ehProjectSetUnknown => 'プロジェクトフォルダを更新しました。';

  @override
  String ehProjectSetFailed(String error) {
    return 'プロジェクトフォルダの設定に失敗: $error';
  }

  @override
  String get ehConfigureModel => '設定 → AI でモデルを構成してください。';

  @override
  String get ehNotReady => 'envoy-harness の準備ができていません。';

  @override
  String get termQuickHelp => '/help';

  @override
  String get termQuickCancel => '/cancel';

  @override
  String get chatsNewTerminal => '新しいターミナル';

  @override
  String get chatsNewTerminalHint => 'ホームノードで Shell を開く';

  @override
  String get chatsNewGroup => '新しいグループチャット';

  @override
  String get chatsNewGroupHint => 'ボンド済み連絡先とのメッシュグループ';

  @override
  String get chatsNewFamilyGroup => '新しいファミリーグループ';

  @override
  String get chatsNewFamilyGroupHint => '家族メンバーとのローカルグループ';

  @override
  String get chatsDeleteBotTitle => 'Bot を削除しますか？';

  @override
  String chatsDeleteBotBody(String name) {
    return 'ホームノードから「$name」を削除しますか？元に戻せません。';
  }

  @override
  String get chatsBotOptions => 'Bot オプション';

  @override
  String get chatsEditBot => 'Bot を編集';

  @override
  String get chatsBotNameRequired => 'Bot 名は必須です';

  @override
  String get chatsBotPromptRequired => '人格 / システムプロンプトは必須です';

  @override
  String get chatsBotName => 'Bot 名';

  @override
  String get chatsBotNameHint => '例：司書 Luna';

  @override
  String get chatsBotPrompt => '人格 / システムプロンプト';

  @override
  String get chatsBotPromptHint =>
      'キャラクターとして書く（「あなたは…」）。「Luna は…」「私は AI…」は避けてください。保存時に整形されます。';

  @override
  String get chatsBotDesc => '短い説明（任意）';

  @override
  String get chatsBotDescHint => 'チャット一覧用の一行。空欄なら人格から自動入力。';

  @override
  String get chatsAvatarColor => 'アバターの色';

  @override
  String get chatsShellHint => 'Shell（例: zsh, bash）';

  @override
  String get chatsCwdHint => '作業ディレクトリ（任意）';

  @override
  String get chatsPiTitle => 'Pi を開始';

  @override
  String get chatsPiBody => 'ホーム PC のプロジェクトフォルダを選んで Pi コーディングターミナルを開きます。';

  @override
  String get chatsPiFolder => 'プロジェクトフォルダ';

  @override
  String get chatsPiFolderHint => '/Users/you/project';

  @override
  String get chatsPiFolderRequired => 'プロジェクトフォルダのパスを入力してください。';

  @override
  String get chatsGroupName => 'グループ名';

  @override
  String get chatsNoFamilyMembers => '他の家族メンバーはまだいません。';

  @override
  String get chatVoiceCall => '音声通話';

  @override
  String get chatVideoCall => 'ビデオ通話';

  @override
  String get chatPublishedContent => '公開コンテンツ';

  @override
  String get chatClearThread => 'スレッドをクリア';

  @override
  String get chatClearThreadTitle => 'スレッドをクリアしますか？';

  @override
  String get chatClearThreadBody => 'このスレッドのメッセージはすべて削除されます。';

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
  String get chatDeleteMessageTitle => 'メッセージを削除しますか？';

  @override
  String get chatNoMessages => 'まだメッセージがありません';

  @override
  String get chatTypeMessage => 'メッセージを入力…';

  @override
  String get chatRecordVoice => '音声を録音';

  @override
  String get chatStopRecording => '録音を停止';

  @override
  String get chatInviteToGroup => 'グループに招待';

  @override
  String get chatNoContactsInvite => '招待できる連絡先がありません。';

  @override
  String chatInvitedSnack(String name) {
    return '$name を招待しました';
  }

  @override
  String get chatVoiceSending => '音声メモを送信中…';

  @override
  String get chatVoiceSent => '音声メモを送信しました';

  @override
  String get chatVoiceRecording => '録音中';

  @override
  String get chatVoiceReady => '送信準備完了';

  @override
  String get chatVoiceCancel => 'キャンセル';

  @override
  String get chatVoiceSend => '送信';

  @override
  String get chatVoiceSendHint => '完了したら送信 · キャンセルで破棄';

  @override
  String get chatVoiceReadyHint => '送信失敗 · 送信で再試行 · キャンセルで破棄';

  @override
  String get chatVoiceSendFailed => '音声メモの送信に失敗';

  @override
  String get chatSentFile => 'ファイルを送信しました';

  @override
  String get chatSentVoice => '音声メッセージを送信しました';

  @override
  String get chatDeliverySent => '送信済み';

  @override
  String get chatDeliveryDelivered => '配信済み';

  @override
  String get chatDeliveryFailed => '未配信';

  @override
  String get chatMicDenied => 'マイクの権限が拒否されました';

  @override
  String get chatRecordFailed => '録音の開始に失敗';

  @override
  String get chatCallFailed => '通話の開始に失敗';

  @override
  String get chatAiDisabled => 'AI モデルが無効です。設定 → AI でプロバイダーを有効にしてください。';

  @override
  String get chatAiDisabledFamily => 'このファミリープロフィールでは AI は利用できません。';

  @override
  String get inboxPublishedUpdates => '公開の更新';

  @override
  String get inboxPublishedEmpty =>
      '公開通知はまだありません。ボンド済み連絡先が Web コンテンツを公開するとここに表示されます。';

  @override
  String get inboxPendingIntros => '保留中の紹介';

  @override
  String get inboxPendingEmpty => '保留中の紹介はありません';

  @override
  String get inboxWantsToConnect => '接続したい';

  @override
  String get pairingInvalidQr => '無効なペアリング QR コード';

  @override
  String get pairingPasteUri => 'またはペアリング URI を貼り付け';

  @override
  String get pairingUriHint => 'envoy://pair?… または envoy://invite?…';

  @override
  String get pairingNeedHomeHint =>
      '自分のホームを作る場合は、まず Mac / Windows PC に EnvoyMesh をインストールしてから QR をスキャンしてください。家族に参加する場合は招待 QR だけでOKです（PC へのインストール不要）。';

  @override
  String get pairingDownloadEnvoyMesh => 'EnvoyMesh デスクトップ版ダウンロード';

  @override
  String get pairingJoinFamily => 'ファミリーに参加';

  @override
  String pairingConnectTo(String name) {
    return '$name に接続しますか？';
  }

  @override
  String pairingWelcomeFamily(String name) {
    return '$name ファミリーへようこそ！';
  }

  @override
  String get pairingImNew => '初めてです';

  @override
  String get pairingImBack => '戻ってきました';

  @override
  String get pairingDisplayNameOptional => '表示名（任意）';

  @override
  String get pairingYourName => 'あなたの名前';

  @override
  String get pairingAvatarColor => 'アバターの色';

  @override
  String get pairingOwnerNameHint => 'このノードでオーナープロフィール名として表示';

  @override
  String get pairingCopyError => 'コピーエラー';

  @override
  String get pairingRetryMembers => 'メンバーの読み込みを再試行';

  @override
  String get pairingWhoAreYou => 'あなたは誰ですか？';

  @override
  String get pairingAlreadyOnHome => 'すでにこのホームにいます';

  @override
  String get pairingSelectProfile => 'プロフィールを選択';

  @override
  String get pairingNoMembersFirst => '家族メンバーはまだいません — 最初のメンバーになります。';

  @override
  String get pairingNoExistingProfiles =>
      '既存のファミリープロフィールがありません。「初めてです」に切り替えて作成してください。';

  @override
  String get pairingNameRequired => '名前を入力してください';

  @override
  String get pairingSelectRequired => 'プロフィールを選択してください';

  @override
  String get pairingLanAvailable => 'LAN: 利用可能';

  @override
  String get pairingRelayAvailable => 'Relay: 利用可能';

  @override
  String pairingPeer(String peer) {
    return 'Peer: $peer';
  }

  @override
  String get pairingNameHintDad => '例：お父さん';

  @override
  String get pairingNameHintMom => '例：お母さん、Alex';

  @override
  String get pairingChooseUniqueName => '下でまだ使われていない名前を選んでください。';

  @override
  String get pairingSameNameHint => '最初のスマホで作ったのと同じ名前を使ってください。';

  @override
  String get pairingTapIfSecondPhone => '2 台目のスマホなら（戻ってきました）名前をタップしてください。';

  @override
  String get feedEmptyTitle => 'サークルは静かです';

  @override
  String get feedEmptyHint => 'まだ投稿がありません。ボンド済み連絡先と更新を共有しましょう。';

  @override
  String get feedHint => 'あなたとボンド済み連絡先からの更新。';

  @override
  String get feedDeleteTitle => '投稿を削除しますか？';

  @override
  String get feedDeleteBody => '元に戻せません。';

  @override
  String get blogPairHint => 'ホームノードとペアリングしてブログ投稿を書き管理します。';

  @override
  String get blogConnectHint => 'ホームノードに接続してブログを管理します。';

  @override
  String get blogDeleteTitle => '投稿を削除しますか？';

  @override
  String blogDeleteBody(String title) {
    return '「$title」を削除しますか？元に戻せません。';
  }

  @override
  String get feedWhatsOnMind => '今何を考えていますか？';

  @override
  String get feedShareHint => 'ボンド済み連絡先と更新を共有…';

  @override
  String get feedPhotos => '写真';

  @override
  String get feedVisibility => '公開範囲';

  @override
  String get feedVisBonded => 'ボンド済み連絡先';

  @override
  String get feedVisSelected => '選択した連絡先';

  @override
  String get feedVisOnlyMe => '自分のみ';

  @override
  String get feedNeedTextOrPhoto => 'テキストまたは写真を1枚以上追加してください';

  @override
  String get feedNeedContact => '連絡先を1人以上選択してください';

  @override
  String get feedSelectedHint => 'これらの連絡先だけがこの投稿を見られます。1人以上選んでください。';

  @override
  String get feedNoContacts =>
      'ボンド済み連絡先がまだありません — 先に連絡先を追加するか、ボンド/自分のみを選んでください。';

  @override
  String get feedAiDraft => 'AI 下書き';

  @override
  String get feedDiscard => '破棄';

  @override
  String get feedInsert => '挿入';

  @override
  String get feedReplace => '置換';

  @override
  String get peoplePairHint => 'ホームノードとペアリングしてメッシュ上の人を見つけます。';

  @override
  String get peopleConnectHint => 'ホームノードに接続して人を見つけます。';

  @override
  String get peopleHint => 'まだボンドしていない人を見つけましょう — 公開プロフィールやブログを開いて挨拶します。';

  @override
  String get peopleTopic => 'トピック';

  @override
  String get peopleInterest => '興味';

  @override
  String get peopleTopicHint => '音楽、コーディング、旅行…';

  @override
  String get peopleInterestHint => '写真、料理、旅行…';

  @override
  String get peopleOnMesh => 'メッシュ上の人';

  @override
  String get peopleResults => '結果';

  @override
  String get peopleEmpty => '表示する人がまだいません。';

  @override
  String get peopleProfile => 'プロフィール';

  @override
  String get peopleBlog => 'ブログ';

  @override
  String get peopleSayHello => '挨拶する';

  @override
  String get peopleHelloSent => '挨拶を送信しました';

  @override
  String get peopleEnterSearch => 'トピックまたは興味を入力して検索してください。';

  @override
  String get peopleNoMatches => 'その検索に一致する結果はありません。';

  @override
  String get peopleNoneFound => 'メッシュ上に公開プロフィールの人はまだいません。';

  @override
  String get peopleHelloMessage => 'こんにちは — Envoy でつながりたいです。';

  @override
  String get peopleOpenLink => 'リンクを開く';

  @override
  String get filesPairHint => 'ホームノードとペアリングしてマイファイルを管理します。';

  @override
  String get filesConnectHint => 'ホームノードに接続してファイルを管理します。';

  @override
  String get filesSearchHint => 'ライブラリを検索';

  @override
  String get filesVaultHint => 'Vault ライブラリ — チャット添付とプロフィール写真はチャット/プロフィールに残ります';

  @override
  String get filesEmpty => 'ライブラリにファイルはまだありません。';

  @override
  String filesImported(String name) {
    return '$name をインポートしました';
  }

  @override
  String filesImportFailed(String error) {
    return 'インポート失敗: $error';
  }

  @override
  String filesPreviewFailed(String error) {
    return 'プレビュー失敗: $error';
  }

  @override
  String get filesNoContactsShare => '共有できるボンド済み連絡先がありません';

  @override
  String get filesShareWith => '共有先…';

  @override
  String get filesShareSent => '共有を送信しました';

  @override
  String filesShareFailed(String error) {
    return '共有失敗: $error';
  }

  @override
  String get filesImport => 'インポート';

  @override
  String filesPreviewUnavailable(String mime, int bytes) {
    return '$mime（$bytes バイト）のプレビューは利用できません。';
  }

  @override
  String publishedTitle(String name) {
    return '公開コンテンツ — $name';
  }

  @override
  String get publishedPhotoWall => 'フォトウォール';

  @override
  String get publishedFeed => 'フィード';

  @override
  String get engagementCommentHint => 'コメントを書く…';

  @override
  String get engagementRemoveCommentTooltip => 'コメントを削除';

  @override
  String get profileTitle => 'プロフィール';

  @override
  String get profileMyTitle => 'マイプロフィール';

  @override
  String get profileUnnamed => '名前なし';

  @override
  String get profileRemovePhotoTitle => '写真を削除しますか？';

  @override
  String get profileNameRequired => '表示名またはユーザー名が必要です';

  @override
  String get profileSaved => 'プロフィールを保存しました';

  @override
  String get profileUsername => 'ユーザー名';

  @override
  String get profileBio => '自己紹介';

  @override
  String get profileBioHint => '連絡先が識別できるよう短い自己紹介を追加してください。';

  @override
  String get profilePhotos => '写真';

  @override
  String get profileNoPhotosYet => 'まだ写真がありません — ウォールに追加してください';

  @override
  String get profileNoPhotosShared => '共有された写真はありません';

  @override
  String get profileLongPressRemove => '写真を長押しで削除';

  @override
  String get contactsSearchHint => '連絡先を検索…';

  @override
  String get contactsEmpty => 'まだ連絡先がありません';

  @override
  String get contactsEmptyHint => 'ボンド済み連絡先がここに表示されます。';

  @override
  String get contactsChat => 'チャット';

  @override
  String get callIncoming => '着信音声通話';

  @override
  String get callConnected => '接続済み';

  @override
  String get callConnecting => '接続中…';

  @override
  String get callDisconnected => '切断';

  @override
  String get callSwitchCamera => 'カメラ切替';

  @override
  String get authorPublish => '公開';

  @override
  String get authorType => '種類';

  @override
  String get authorTypeProfile => 'プロフィール';

  @override
  String get authorTypePhoto => 'フォトウォール写真';

  @override
  String get authorTypeBlog => 'ブログ投稿';

  @override
  String get authorVisPublic => '公開';

  @override
  String get authorVisBonded => 'ボンド';

  @override
  String get authorVisPrivate => '非公開';

  @override
  String get authorCaption => 'キャプション';

  @override
  String get authorCaptionOptional => 'キャプション（任意）';

  @override
  String get authorBody => '本文';

  @override
  String get authorBodyMarkdown => '本文（Markdown）';

  @override
  String get authorTitle => 'タイトル';

  @override
  String get authorTitleRequired => 'タイトルは必須です';

  @override
  String get authorPickPhoto => '先に写真を選んでください';

  @override
  String get authorChooseAvatar => 'アバターを選択';

  @override
  String get authorChoosePhoto => '写真を選択';

  @override
  String get aiDraftButton => 'AI で下書き';

  @override
  String get aiDraftEmphasize => '何を強調しますか？（任意）';

  @override
  String get aiDraftEmphasizeHint => '例：週末の友人とのハイキング';

  @override
  String get aiDraftMode => 'モード';

  @override
  String get aiDraftTone => 'トーン';

  @override
  String get aiDraftRewrite => '書き直し';

  @override
  String get aiDraftExpand => '拡張';

  @override
  String get aiDraftShorten => '短縮';

  @override
  String get aiDraftGenerate => '生成';

  @override
  String get aiDraftNoModel => 'ホームノードに AI モデルが設定されていません。';

  @override
  String get aiDraftEmpty => 'モデルから空の下書き';

  @override
  String get aiDraftBio => '自己紹介を下書き';

  @override
  String get aiDraftBlog => 'ブログ投稿を下書き';

  @override
  String get aiDraftFeed => 'フィード更新を下書き';

  @override
  String get aiDraftCaption => 'キャプションを下書き';

  @override
  String get settingsAiModelIntro =>
      'ホームノードアシスタント用のクラウドモデルプロバイダー。変更は次のアシスタントターンで反映されます。';

  @override
  String settingsHomeUses(String mode) {
    return 'ホームは $mode を使用';
  }

  @override
  String get settingsEndpoint => 'Endpoint:';

  @override
  String get settingsModelLabel => 'Model:';

  @override
  String get settingsEditOnSocial =>
      '詳細オプションはホームノードのソーシャル画面でこのプロバイダーを編集してください。';

  @override
  String get settingsProvider => 'Provider';

  @override
  String get settingsEndpointUrl => 'Endpoint URL';

  @override
  String get settingsModel => 'Model';

  @override
  String get settingsCustomModel => 'カスタムモデル名';

  @override
  String get settingsApiKey => 'API key';

  @override
  String get settingsApiKeySaved => 'ホームノードにキーが保存済みです';

  @override
  String get settingsAiModelSaved => 'AI モデルを保存しました';

  @override
  String get settingsAiModelTestChat => 'チャットモデルをテスト';

  @override
  String get settingsAiModelTestChatBusy => 'テスト中…';

  @override
  String settingsAiModelTestChatOk(String modelName, int latencyMs) {
    return 'チャットモデル OK — $modelName / $latencyMs ms';
  }

  @override
  String settingsAiModelTestChatFail(String error) {
    return 'チャットモデル失敗: $error';
  }

  @override
  String settingsSaveFailed(String error) {
    return '保存失敗: $error';
  }

  @override
  String get settingsDefault => '（既定）';

  @override
  String get settingsAiEngineIntro => 'ホームノードがアシスタントターンを転送する外部エージェントを選びます。';

  @override
  String get settingsExternalAgent => 'External agent';

  @override
  String get settingsWebhookUrl => 'Webhook URL';

  @override
  String get settingsHowToStart => '起動方法';

  @override
  String get settingsBuiltIntoHome => 'ホームノードに内蔵';

  @override
  String get settingsNoExtProcess => '別の Ext Agent プロセスは不要です。';

  @override
  String get settingsBridgePort => 'Bridge 待受ポート';

  @override
  String get settingsBridgeEnabled => 'Bridge 有効';

  @override
  String get settingsBridgeHint => 'アシスタントターンを選択した外部エージェントに転送します。';

  @override
  String get settingsOpenClawEnabled => 'OpenClaw 有効';

  @override
  String get settingsOpenClawHint =>
      '次回ノード起動時に組み込み OpenClaw ゲートウェイ（EnvoyAI）が有効になります。';

  @override
  String get settingsOpenClawUnavailable => 'OpenClaw ステータス利用不可';

  @override
  String settingsOpenClawStatus(String state) {
    return 'OpenClaw $state';
  }

  @override
  String settingsExtAgentStatus(String state) {
    return 'Ext Agent $state';
  }

  @override
  String get settingsEnabled => '有効';

  @override
  String get settingsDisabled => '無効';

  @override
  String get settingsAiEngineSaved => 'AI エンジンを保存しました';

  @override
  String get settingsNotConnectedNode => 'ホームノードに未接続';

  @override
  String settingsPiState(String state) {
    return '状態: $state';
  }

  @override
  String get settingsPiBuiltIn => 'ローカルコーディングエージェント';

  @override
  String get settingsPiLocalOnly =>
      'Pi は Terminal と Ext Agent 向け。Envoy Harness はコーディングチャットを担当し、Terminal でも常に使えます。';

  @override
  String get settingsPiEnabled => 'Pi を有効化';

  @override
  String get settingsPiCodingBackend => '使用中のエンジン';

  @override
  String get settingsPiCodingBackendPi => 'Pi（サイドカー）';

  @override
  String get settingsPiCodingBackendEh => 'envoy-harness (ACP)';

  @override
  String get settingsPiCodingBackendHint =>
      'コーディングチャットと承認を受け取るエンジン。他方の設定は消えません。';

  @override
  String get settingsPiCodingBackendSaved => '使用中エンジンを更新しました';

  @override
  String get settingsPiSectionTitle => 'Pi';

  @override
  String get settingsPiSectionHint =>
      'Terminal と Ext Agent 向けサイドカー — 有効化とモデル上書き';

  @override
  String get settingsEhSectionTitle => 'Envoy Harness';

  @override
  String get settingsEhSectionHint =>
      'コーディングチャットを担当し Terminal でも常に使用可 — 自動実行（プロジェクトは Envoy チャット）';

  @override
  String get settingsEhAutoRunPolicy => 'Envoy Harness 自動実行';

  @override
  String get settingsEhAutoRunAlways => '常に確認';

  @override
  String get settingsEhAutoRunSafe => '破壊的操作のみ確認';

  @override
  String get settingsEhAutoRunOff => 'オフ — 常にプレビュー';

  @override
  String get settingsEhAutoRunNever => '確認しない（すべて自動許可）';

  @override
  String get settingsEhAutoRunSaved => 'Envoy Harness 自動実行を更新しました';

  @override
  String get settingsEhActiveBadge => '使用中';

  @override
  String get settingsPiOverrideHint => 'Pi モデル上書き（任意）。クリアすると AI モデル設定を継承。';

  @override
  String get settingsPiModelName => 'モデル名';

  @override
  String get settingsPiEndpoint => 'Endpoint';

  @override
  String get settingsPiLeaveBlankKey => '空欄のまま保存済みキーを維持';

  @override
  String get settingsPiSaveOverride => 'モデル上書きを保存';

  @override
  String get settingsPiClearOverride => '上書きをクリア（AI モデルを継承）';

  @override
  String get settingsPiModelSaved => 'Pi モデルを保存しました';

  @override
  String get settingsPiModelRequired => 'モデル名は必須です';

  @override
  String get settingsPiInherits => 'Pi は EnvoyMesh モデル設定を継承します';

  @override
  String settingsPiFailed(String error) {
    return '失敗: $error';
  }

  @override
  String settingsPiClearFailed(String error) {
    return 'クリア失敗: $error';
  }

  @override
  String settingsPiProviderCustom(String provider) {
    return '$provider（カスタム）';
  }

  @override
  String get aiEngineReadonlyHint =>
      'モバイルでは両方のブロックは読み取り専用です。ホームノード（設定 → AI → AI エンジン）で設定してください。';

  @override
  String get aiEngineBuiltInOpenClaw => '組み込み OpenClaw';

  @override
  String get aiEngineExtBridge => 'External Agent Bridge';

  @override
  String get aiEngineModeBoth => '組み込み + Ext';

  @override
  String get aiEngineModeBuiltIn => '組み込みのみ';

  @override
  String get aiEngineModeExt => 'Ext のみ';

  @override
  String get aiEngineModeNone => 'なし';

  @override
  String get aiEngineRunning => '実行中';

  @override
  String get aiEngineConfigured => '設定済み（未実行）';

  @override
  String get aiEngineDisabled => '無効';

  @override
  String get browserTitle => 'ブラウザ';

  @override
  String get browserGo => '移動';

  @override
  String get browserBack => '戻る';

  @override
  String get browserForward => '進む';

  @override
  String get browserReload => '再読み込み';

  @override
  String get browserPairFirst => 'ホームノードに未接続 — 先にペアリングして再接続してください。';

  @override
  String get browserIntegrityFailed => 'コンテンツ整合性チェック失敗 — 描画を拒否';

  @override
  String browserDecodeImageFailed(String error) {
    return '画像のデコード失敗: $error';
  }

  @override
  String get browserPhoto => '写真';

  @override
  String get browserPhotos => '写真';

  @override
  String get browserNoPhotos => 'まだ写真がありません。';

  @override
  String get browserHint => 'envoy:// URL を入力してボンド済み連絡先のコンテンツを閲覧します。';

  @override
  String get extSwitchTitle => 'Ext Agent を切り替え';

  @override
  String extSwitchTooltip(String name) {
    return 'Ext Agent を切り替え（$name）';
  }

  @override
  String extNotRunningChat(String name) {
    return '$name は実行されていません — チャット前に起動してください。';
  }

  @override
  String extSwitchFailed(String error) {
    return '切り替え失敗: $error';
  }

  @override
  String extNotRunning(String name) {
    return '$name は実行されていません';
  }

  @override
  String get extChecking => '確認中…';

  @override
  String get extCheckAgain => '再確認';

  @override
  String get audioLoading => '音声を読み込み中…';

  @override
  String get audioUnavailable => '音声を利用できません';

  @override
  String get audioVoiceNote => '音声メモ';

  @override
  String meLastAttempt(String time) {
    return '最終試行: $time';
  }

  @override
  String get meJustNow => 'たった今';

  @override
  String get mePublicIpLabel => 'パブリック IP またはドメイン';

  @override
  String get mePublicIpHint => '例: 1.2.3.4 または mynode.example.com';

  @override
  String get mePublicIpHelp =>
      'ホームノードにパブリック IP またはドメインがある場合に設定します。\n5G/WAN でリレーなしの直接接続が可能になります。';

  @override
  String get meNetworkDebug => 'ネットワークデバッグ';

  @override
  String get meRunNetworkTests => 'ネットワークテストを実行';

  @override
  String get meTesting => 'テスト中…';

  @override
  String get meNetworkTestsHint => 'EnvoyGo がペアリングに使うすべての経路をテストします。';

  @override
  String get meSwitchNode => 'ノードを切り替え';

  @override
  String get chainsRecentTitle => '最近のチームジョブ';

  @override
  String get chainsActiveTitle => '実行中のチームジョブ';

  @override
  String get chainsLoadFailed => 'チェーンの読み込みに失敗';

  @override
  String get chainsNoReports => 'まだレポートがありません';

  @override
  String get chainsEmptyHint =>
      'ホームノードで実行したチームジョブがここに表示されます。\nホームノードのソーシャル画面から作成してください。';

  @override
  String get chainsNoActive => 'ホームノードにアクティブなチェーンがありません。\nソーシャル画面から開始してください。';

  @override
  String get chainsReportGone => 'このレポートは利用できません';

  @override
  String get chainsReportGoneHint => '90 日 GC ポリシーで削除された可能性があります。';

  @override
  String get chainsBackToRecent => '最近のチームジョブに戻る';

  @override
  String get chainsLoadReportFailed => 'レポートの読み込みに失敗';

  @override
  String get chainsSummary => '概要';

  @override
  String get chainsWorkers => 'ワーカー';

  @override
  String get chainsSubtasks => 'サブタスク';

  @override
  String get chainsSynthesis => '合成';

  @override
  String get chainsDuration => '所要時間';

  @override
  String get chainsManageOnSocial =>
      'フリート設定・入札・レシピはホームの Social UI のままです。キャンセル・再バランス・ピン留めはこちらでもできます。';

  @override
  String get chainsStartTitle => 'チームジョブを開始';

  @override
  String get chainsStartFab => '新しいチームジョブ';

  @override
  String get chainsStartIntro =>
      '目標を記述してください。ホームノードがサブタスクを計画し、ボンド済みの Agent Network ワーカーを割り当てます。';

  @override
  String get chainsStartAssignmentMode => '割り当てモード';

  @override
  String get chainsStartModeSkill => 'スキル順';

  @override
  String get chainsStartModeRole => 'ロール順';

  @override
  String get chainsStartModeSkillHint => 'ワーカーは一致するスキルでランク付けされます。';

  @override
  String get chainsStartModeRoleHint => '各ステップは役割（PM、プログラマーなど）を優先します。';

  @override
  String get chainsStartTeamStrategy => 'チーム戦略';

  @override
  String get chainsStartTeamStrategyHint => 'このタスクのワーカー選定方法。';

  @override
  String get chainsStrategyBalanced => 'バランス';

  @override
  String get chainsStrategyFastest => '最速';

  @override
  String get chainsStrategyCheapest => '最安';

  @override
  String get chainsStrategyHighestConfidence => '最高信頼度';

  @override
  String get chainsStrategyPrivacyLocal => 'プライバシー（ローカル）';

  @override
  String get chainsStrategyDiverseModel => 'モデル多様性';

  @override
  String get chainsStartAvailLease => 'リース準備完了';

  @override
  String get chainsStartAvailLegacy => 'レガシー準備完了';

  @override
  String chainsStartReliabilityPct(int pct) {
    return '信頼度 $pct%';
  }

  @override
  String chainsStartReliabilitySparse(String level, int samples) {
    return '$level · $samples 件のサンプル';
  }

  @override
  String get chainsStartReliabilityFallbackExact => 'このワーカーの履歴';

  @override
  String get chainsStartReliabilityFallbackPeerRuntimeSkill => 'このワーカーの類似タスク';

  @override
  String get chainsStartReliabilityFallbackPeerRuntime => 'このワーのランタイム';

  @override
  String get chainsStartReliabilityFallbackRuntimeSkill => 'このスキルを持つワーカー';

  @override
  String get chainsStartReliabilityFallbackPrior => '汎用事前分布（履歴なし）';

  @override
  String get chainsStartGoalLabel => '目標';

  @override
  String get chainsStartGoalHint => 'チームは何を達成すべきですか？';

  @override
  String chainsStartGoalTooShort(int min) {
    return '目標は $min 文字以上で入力してください';
  }

  @override
  String get chainsStartAttachmentsLabel => '添付ファイル';

  @override
  String get chainsStartAttachmentsAdd => 'ファイルを追加';

  @override
  String get chainsStartAttachmentsHint =>
      'ヒント: ファイルごとに短いラベル（例: brief）を付け、目標に [brief] と書くと、ファイル名が長くてもどれを使うか伝わります。';

  @override
  String chainsStartAttachmentsMax(int max) {
    return '添付できるファイルは最大 $max 個です';
  }

  @override
  String chainsStartAttachmentTooLarge(String name, int maxMb) {
    return '$name が大きすぎます（上限 $maxMb MB）';
  }

  @override
  String get chainsStartAttachmentUploading => 'アップロード中…';

  @override
  String get chainsStartAttachmentFailed => 'アップロードに失敗しました';

  @override
  String get chainsStartAttachmentLabel => 'ラベル';

  @override
  String get chainsStartAttachmentLabelHint => '例: brief、売上データ';

  @override
  String get chainsStartAttachmentRemove => '添付を削除';

  @override
  String get chainsStartPreview => 'プランをプレビュー';

  @override
  String get chainsStartPreviewing => '計画中…';

  @override
  String get chainsStartPreviewFailed => 'プランを作成できませんでした';

  @override
  String get chainsStartNeedPreview => '開始前にプランをプレビューしてください';

  @override
  String get chainsStartPlanHeading => 'プラン';

  @override
  String get chainsStartNoSubtasks => 'このプランにはサブタスクがありません。';

  @override
  String get chainsStartConfirm => 'チームジョブを開始';

  @override
  String get chainsStartStarting => '開始中…';

  @override
  String get chainsStartStarted => 'チームジョブを開始しました';

  @override
  String get chainsStartFailed => 'チームジョブを開始できませんでした';

  @override
  String get chainsStartNoWorkers =>
      '到達可能な Agent Network ワーカーがありません。先にホームノードのエージェントと連絡先をボンドしてください。';

  @override
  String get chainsTestNetworkTitle => 'エージェントネットをテスト';

  @override
  String get chainsTestNetworkHint => 'このノード上のエージェントネット経路の短いラボテスト。';

  @override
  String get chainsTestNetworkRun => 'テスト開始';

  @override
  String get chainsTestNetworkRunning => 'テスト実行中…';

  @override
  String get chainsTestNetworkFailed => 'ネットワークテストに失敗しました。';

  @override
  String get chainsSpeculationReviewTitle => '結果が一致しません';

  @override
  String get chainsSpeculationReviewBody =>
      '2 人のチームメンバーがこのステップで異なる結果を出しました。下で結果を選ぶか、ステップを再割当するか、自動で続けてください。';

  @override
  String get chainsSpeculationReviewNonePass =>
      'どちらの結果も確認に通りませんでした。最良の試行を選ぶか、ステップを再割当するか、自動で続けてください。';

  @override
  String get chainsSpeculationReviewDisagree =>
      '2 つの結果が一致しません。結果を選ぶか、ステップを再割当するか、自動で続けてください。';

  @override
  String get chainsSpeculationReviewPick => 'この結果を使う';

  @override
  String get chainsSpeculationReviewReassign => 'ステップを再割当';

  @override
  String get chainsSpeculationReviewAutoResolve => '自動で続ける';

  @override
  String get chainsSpeculationReviewResolved => '選択を保存しました — ジョブを続けます。';

  @override
  String get chainsSpeculationReviewFailed => 'このステップを解決できませんでした';

  @override
  String get chainsSpeculationRolePrimary => 'プライマリ';

  @override
  String get chainsSpeculationRoleSpeculative => 'バックアップ実行';

  @override
  String get chainsSpeculationRoleReplacement => '差し替え';

  @override
  String get chainsStepStatePending => '保留';

  @override
  String get chainsStepStateOffered => 'オファー済み';

  @override
  String get chainsStepStateAwarded => '割当済み';

  @override
  String get chainsStepStateRunning => '実行中';

  @override
  String get chainsStepStateDone => '完了';

  @override
  String get chainsStepStateFailed => '失敗';

  @override
  String get chainsStepStateCancelled => 'キャンセル';

  @override
  String get chainsWorkerEngineFailed =>
      'ワーカーの AI エンジンがこのステップを完了できませんでした。しばらくしてから再試行してください。';

  @override
  String get chainsReassignUnavailable => 'このホームノードでは再割当できません';

  @override
  String get chainsAssignerAutoLabel => '最も能力の高い Assigner を選ぶ';

  @override
  String get chainsAssignerAutoHint =>
      'オンにすると、ホームノードが最も強いボンド済みピアを選び、このジョブを計画・管理します。';

  @override
  String get chainsSuggestedAssigner => '推奨 Assigner';

  @override
  String get chainsAssignerPeerLabel => 'Assigner';

  @override
  String get chainsAssignerPeerThisNode => 'このホーム（既定）';

  @override
  String get chainsAssignerPeerHint =>
      '任意 — このホームではなく、ボンド済みピアで Assigner を実行します。';

  @override
  String get chainsIterationPreviewOwner => '複数ラウンド — 公開前に各ドラフトを確認します。';

  @override
  String get chainsIterationPreviewAuto => '複数ラウンド — Assigner が停止タイミングを決めます。';

  @override
  String get chainsSpeculationDualWorkersLabel => '重要ステップで 2 ワーカー実行';

  @override
  String get chainsSpeculationDualWorkersHint =>
      '2 ワーカーの結果が異なる場合、ホームが自動選択するか、先にあなたに確認します（ホームの既定設定を参照）。';

  @override
  String get chainsStartReadinessTitle => 'ワーカーを準備する';

  @override
  String get chainsStartReadinessJoinOff =>
      'ホームPCで：チームジョブ → ワーカー管理 → 「エージェントネットワークに参加」をオン。';

  @override
  String get chainsStartReadinessBond =>
      '発見（Social またはこの端末）で連絡先をボンディングし、相手にもエージェントネットワークへの参加を依頼してください。';

  @override
  String get chainsStartReadinessRefresh =>
      'Social のチームジョブでワーカー管理を開きカードを更新してから、ここで再度プレビューしてください。';

  @override
  String get chainsStepsTitle => 'ジョブのステップ';

  @override
  String get chainsStepsWaitingOn => '待機中：';

  @override
  String get chainsAttachmentHonesty =>
      '添付ファイルはこのホームのボルトに保存されます。ワーカーが割り当てられると、それらの入力のコピーがチームジョブ作業領域に届きます — ライブラリの常時ミラーではありません。';

  @override
  String get chainsDeliveryTitle => '入力の配信';

  @override
  String get chainsDeliveryRetry => '再試行';

  @override
  String get chainsDeliveryRetried => '入力配信を再試行しました';

  @override
  String get chainsDeliveryRetryFailed => '入力配信を再試行できませんでした';

  @override
  String get chainsDeliveryPhasePending => '保留中';

  @override
  String get chainsDeliveryPhaseTransferring => '転送中';

  @override
  String get chainsDeliveryPhaseVerified => '配信済み';

  @override
  String get chainsDeliveryPhaseFailed => '失敗';

  @override
  String get chainsInputDeliveryScope => '入力の配信';

  @override
  String get chainsInputDeliveryScopeReferenced => '参照のみ';

  @override
  String get chainsInputDeliveryScopeAll => 'すべての添付';

  @override
  String get chainsInputDeliveryScopeHint =>
      '「参照のみ」（既定）はステップ内で [label] として言及されたファイルを送ります。一致がなければ全添付を送ります。「すべて」は各割り当てワーカーに全添付を送ります。';

  @override
  String get chainsIterationAskOwnerTitle => '公開前に下書きを確認';

  @override
  String get chainsIterationAskOwnerBody => '公開するには承認するか、さらに洗練ラウンドを続けてください。';

  @override
  String get chainsIterationAcceptDraft => '承認して公開';

  @override
  String get chainsIterationContinue => '洗練を続ける';

  @override
  String get chainsIterationAccepted => '下書きを承認 — 公開中';

  @override
  String get chainsIterationContinued => '別の洗練ラウンドを開始';

  @override
  String get chainsIterationResolveFailed => '決定を適用できませんでした';

  @override
  String get chainsObservedTitle => '参加中のジョブ';

  @override
  String get chainsObservedHint => '閲覧のみ — これらのジョブを管理できるのは依頼者だけです。';

  @override
  String get chainsObservedReadOnly => '閲覧のみ';

  @override
  String get chainsStartNeedWorkers =>
      'オンライン ワーカーを少なくとも 1 人選択するか、推奨プールを復元するために再度プレビューしてください。';

  @override
  String get chainsStartWorkersHint =>
      'プランからのオンライン ワーカー。必要のないワーカーのチェックを外してください。すべて外すと開始できません — 再度プレビューして推奨プールをリセットしてください。';

  @override
  String get chainsStartWorkersHeading => 'ワーカー';

  @override
  String get chainsStartNoSuggestedWorkers =>
      '提案されたワーカーはまだありません — 開始時にホームノードの発見プールを使用します。';

  @override
  String chainsStartWorkerMatches(int count) {
    return '$count ステップに一致';
  }

  @override
  String get chainsStartWorkerOnline => 'オンライン';

  @override
  String get chainsStartWorkerRelay => 'オンライン（リレー）';

  @override
  String get chainsStartWorkerOffline => 'オフライン / 不明';

  @override
  String get chainsActiveGone => 'このチームジョブはもうアクティブではありません';

  @override
  String chainsBudgetLine(String spent, String max) {
    return '予算 $spent / $max USD';
  }

  @override
  String get chainsBudgetWarn => '予算警告 — 予算の追加を検討してください。';

  @override
  String get chainsBudgetExceeded => '予算超過 — 再バランスするまでジョブが停止する可能性があります。';

  @override
  String chainsPartialCount(int count) {
    return '$count 件の中間結果';
  }

  @override
  String get chainsCancelTitle => 'チームジョブを中止しますか？';

  @override
  String get chainsCancelBody => 'ワーカーに停止を通知します。すで収集された中間結果は保持されます。';

  @override
  String get chainsCancelConfirm => 'ジョブを中止';

  @override
  String get chainsCancelDone => 'チームジョブを中止しました';

  @override
  String get chainsCancelReason => 'EnvoyGo からキャンセル';

  @override
  String get chainsCancelStep => 'ステップをキャンセル';

  @override
  String get chainsCancelStepTitle => 'このステップをキャンセルしますか？';

  @override
  String get chainsCancelStepBody =>
      'このステップと依存するステップが停止します。既に収集された部分結果は保持されます。';

  @override
  String get chainsCancelStepFailed => 'このステップをキャンセルできませんでした';

  @override
  String get chainsReassignStep => '再割り当て';

  @override
  String get chainsStepCancelled => 'ステップをキャンセルしました';

  @override
  String get chainsStepReassigned => 'ステップを再割り当てしました';

  @override
  String get chainsReassignFailed => 'このステップを再割り当てできませんでした';

  @override
  String get chainsCancelStepReason => 'EnvoyGo からステップをキャンセル';

  @override
  String get chainsDetailCancelled => 'このジョブはキャンセルされました。';

  @override
  String get chainsDetailPublished => 'このジョブは完了し、レポートを公開しました。';

  @override
  String get chainsDetailRecovering => '復旧中';

  @override
  String chainsAttemptCount(int count) {
    return '試行回数: $count';
  }

  @override
  String get chainsExecutionDetails => '実行の詳細';

  @override
  String chainsProvenanceSummaryLine(
    int attempts,
    String worker,
    String state,
  ) {
    return '$attempts 回 · $worker · $state';
  }

  @override
  String chainsLastReason(String reason) {
    return '直近の理由: $reason';
  }

  @override
  String get chainsTechnicalDetails => '技術詳細';

  @override
  String get chainsProvenanceEmpty => '由来データがありません。';

  @override
  String get chainsProvenanceFailed => '由来を読み込めませんでした。';

  @override
  String get chainsRebalanceHeading => '予算を追加';

  @override
  String get chainsRebalanceHint => 'コスト上限を引き上げ、未割り当てのステップを再試行します。';

  @override
  String get chainsRebalanceAmount => '追加 USD';

  @override
  String get chainsRebalanceAction => '追加して再試行';

  @override
  String get chainsRebalanceInvalidAmount => '正のドル額を入力してください';

  @override
  String get chainsRebalanceDone => '予算を更新しました';

  @override
  String get chainsRebalanceFailed => '再バランスできません';

  @override
  String get chainsPin => 'レポートをピン留め';

  @override
  String get chainsUnpin => 'レポートのピン留めを解除';

  @override
  String get chainsPinDone => 'レポートをピン留めしました（90日のクリーンアップ後も保持）';

  @override
  String get chainsUnpinDone => 'レポートのピン留めを解除しました';

  @override
  String chainsPublished(String date) {
    return '$date に公開';
  }

  @override
  String chainsChainId(String id) {
    return 'チェーン $id';
  }

  @override
  String get termNone => 'ターミナルセッションがありません';

  @override
  String termAttachFailed(String error) {
    return 'ターミナル接続失敗: $error';
  }

  @override
  String get termCopied => 'クリップボードにコピーしました';

  @override
  String get termReconnecting => '再接続中…';

  @override
  String get termCopyAll => 'すべての出力をコピー';

  @override
  String get termPaste => '貼り付け';

  @override
  String get termCloseSession => 'セッションを閉じる';

  @override
  String get chatImagePlaceholder => '[画像]';

  @override
  String get chatsBotSyncing => '更新を同期中…';

  @override
  String get chatsBotSavedHint => 'ホームノードに保存しました。準備ができたらチャットできます。';

  @override
  String get chatsBotNotFound => 'ホームノードにボットが見つかりません';

  @override
  String get chatAiDisabledAskOwner =>
      'ファミリーチャット用の AI モデルをホーム所有者に有効にしてもらってください。';

  @override
  String pairingLoadProfilesFailed(String error) {
    return '既存のプロフィールを読み込めません: $error';
  }

  @override
  String pairingFailed(String error) {
    return 'ペアリングに失敗: $error';
  }

  @override
  String get pairingInviteAlreadyUsed =>
      'この招待QRは既に使用済みです。ホーム所有者に「家族 → 招待QRを表示」で新しいコードを出してもらい、スキャン後「戻ってきました」でプロフィール（例: Dad）を選んでください。';

  @override
  String get pairingInProgressTitle => 'ホームノードとペアリング中';

  @override
  String pairingInProgressSubtitle(String owner) {
    return '$owner に接続しています';
  }

  @override
  String pairingElapsed(String time) {
    return '経過時間：$time';
  }

  @override
  String pairingHomeNodeLabel(String peer) {
    return 'ホーム：$peer';
  }

  @override
  String get pairingStageInitial => '初期化中';

  @override
  String get pairingStageInitialHint => 'ホームノードとの安全なチャネルを準備しています。';

  @override
  String get pairingStageConnecting => 'ホームに接続中';

  @override
  String get pairingStageConnectingHint => 'ローカルネットワークとリレー経由でホームを探しています。';

  @override
  String get pairingStageHandshaking => 'ハンドシェイク中';

  @override
  String get pairingStageHandshakingHint => '鍵を交換しています。初回接続ではしばらくかかることがあります。';

  @override
  String get pairingStageVerifying => '確認中';

  @override
  String get pairingStageSlowHint =>
      '通常より時間がかかっています。ホームノードが同じ Wi-Fi にいるか、インターネットに接続しているか確認してください。';

  @override
  String get pairingStageVerySlowHint =>
      '予想より大幅に時間がかかっています。両デバイスがオンラインか確認し、キャンセルして再試行してください。';

  @override
  String get pairingCancel => 'ペアリングをキャンセル';

  @override
  String get pairingCancelConfirmTitle => 'ペアリングをキャンセルしますか？';

  @override
  String get pairingCancelConfirmBody => 'ハンドシェイクを停止します。QRコードから再試行できます。';

  @override
  String get commonKeepWaiting => 'そのまま待つ';

  @override
  String get pairingDontCloseApp => 'アプリを閉じないでください — ペアリングはバックグラウンドで続行中です。';

  @override
  String get pairingNowLan => 'ローカルネットワーク上のホームノードに接続しています…';

  @override
  String get pairingNowP2p => '安全なピアツーピア接続を確立しています…';

  @override
  String get pairingNowRelay => 'リレーサーバー経由で接続しています…';

  @override
  String get pairingStillWorking =>
      '引き続き処理中です — 初回の接続には1〜2分かかることがあります。アプリを開いたままにしてください。';

  @override
  String get pairingTroubleTitle => 'それでも接続できませんか？';

  @override
  String get pairingTroubleBody =>
      'ホームノードの電源が入っていてオンラインであること、このデバイスがインターネットに接続されていることを確認してください。それでも失敗する場合はキャンセルしてやり直してください。';

  @override
  String get feedDefaultTitle => 'フィード投稿';

  @override
  String get aiDraftSection => '下書きセクション';

  @override
  String aiDraftFailed(String reason) {
    return '下書きできません ($reason)';
  }

  @override
  String authorAvatarNamed(String name) {
    return 'アバター: $name';
  }

  @override
  String authorPhotoNamed(String name) {
    return '写真: $name';
  }

  @override
  String get peopleEnvoyUser => 'Envoy ユーザー';

  @override
  String get commonEllipsis => '…';

  @override
  String get browserCached => 'キャッシュ済み';

  @override
  String get browserLoaded => '読み込み済み';

  @override
  String get browserNotPublished => 'まだ公開されていません';

  @override
  String get browserNotFound => 'コンテンツが見つかりません';

  @override
  String get browserAccessDenied => 'アクセス拒否';

  @override
  String browserPdfLoaded(int chars) {
    return 'PDF を読み込みました（$chars base64 文字）';
  }

  @override
  String browserUnsupportedType(String mime) {
    return '未対応の種類: $mime';
  }

  @override
  String get browserInterests => '興味';

  @override
  String get browserKnowledge => '知識';

  @override
  String get browserCapabilities => '能力';

  @override
  String get connTooltipP2p => 'リレー経由の P2P 接続';

  @override
  String get connTooltipRelay => 'リレー接続 — ホームからダイヤル可能';

  @override
  String connTooltipConnectedVia(String transport) {
    return '$transport 経由で接続';
  }

  @override
  String get connBootstrap => 'ブートストラップ';

  @override
  String get settingsRunning => '実行中';

  @override
  String get settingsNotRunning => '未実行';

  @override
  String get settingsModelIdHint => 'model-id';

  @override
  String get chainsSections => 'セクション';

  @override
  String get chainsWorkerAllocations => 'ワーカー割り当て';

  @override
  String chainsAwardedSummary(String status, int awarded, int total) {
    return '$status · $awarded/$total 授与';
  }

  @override
  String meAttemptN(int n) {
    return '$n 回目の試行';
  }

  @override
  String meSecondsAgo(int n) {
    return '$n 秒前';
  }

  @override
  String meMinutesAgo(int n) {
    return '$n 分前';
  }

  @override
  String meHoursAgo(int n) {
    return '$n 時間前';
  }

  @override
  String meDaysAgo(int n) {
    return '$n 日前';
  }

  @override
  String get termShowKeyboard => 'キーボードを表示';

  @override
  String get termHideKeyboard => 'キーボードを隠す';

  @override
  String get termCopySelection => '選択をコピー';

  @override
  String get pairingImBackHint => '2 台目の電話なら名前をタップ（戻ってきました）。';

  @override
  String connP2pDetail(String detail) {
    return 'P2P（$detail）';
  }

  @override
  String get meConnRefused => '接続拒否 / ブロック';

  @override
  String get meTimeout5s => 'タイムアウト（5秒）';

  @override
  String timeMinutesShort(int n) {
    return '$n分';
  }

  @override
  String timeHoursShort(int n) {
    return '$n時間';
  }

  @override
  String timeDaysShort(int n) {
    return '$n日';
  }

  @override
  String get termCtrlSticky => 'Ctrl 修飾キー（スティッキー）';

  @override
  String get termCtrlLetter => 'Ctrl + 文字';

  @override
  String get connStateConnected => '接続済み';

  @override
  String get connStateConnecting => '接続中…';

  @override
  String get connStateDisconnected => '切断';

  @override
  String get connStateError => 'エラー';

  @override
  String get chatsDefaultGroup => 'グループ';

  @override
  String get chatsDefaultFamilyGroup => 'ファミリーグループ';

  @override
  String chatsTerminalTitle(String name) {
    return 'ターミナル: $name';
  }

  @override
  String get chatsExtAgent => '外部エージェント';

  @override
  String browserBytesCount(int count) {
    return '$count バイト';
  }

  @override
  String get commonYouName => 'あなた';

  @override
  String get settingsAiModelEnvoyLocalStandby =>
      'Envoy Local はホームノードのアクティブなプロバイダーです。タップして Local を管理するか、下にクラウド プロバイダーをスタンバイとして保存してください。';

  @override
  String get settingsEnvoyLocalIntro =>
      'ホームコンピューターの llama.cpp を制御します。モデルのダウンロードはそちらで行われます — このスマホには決してダウンロードされません。';

  @override
  String get settingsEnvoyLocalStatusHeading => '状態';

  @override
  String get settingsEnvoyLocalInUse => '使用中';

  @override
  String get settingsEnvoyLocalNotInUse => '未使用';

  @override
  String get settingsEnvoyLocalStatusDownloading => 'ダウンロード中…';

  @override
  String get settingsEnvoyLocalStatusDetecting => '検出中…';

  @override
  String get settingsEnvoyLocalStatusExtracting => '展開中…';

  @override
  String get settingsEnvoyLocalStatusStarting => '起動中…';

  @override
  String get settingsEnvoyLocalStatusReady => '準備完了';

  @override
  String get settingsEnvoyLocalStatusError => 'エラー';

  @override
  String get settingsEnvoyLocalStatusDisabled => '無効';

  @override
  String get settingsEnvoyLocalIdleTimeout =>
      'Envoy Local の操作が 60 分のタイムアウトを超えました。ダウンロードが 100% 付近で止まる場合は、中国のミラーまたは VPN を試してから再試行してください — 部分ダウンロードは再開されます。';

  @override
  String settingsEnvoyLocalRuntime(String status) {
    return 'ランタイム: $status';
  }

  @override
  String settingsEnvoyLocalRuntimeVersion(String version) {
    return 'バージョン: $version';
  }

  @override
  String settingsEnvoyLocalAccel(String accel) {
    return 'アクセラレータ: $accel';
  }

  @override
  String settingsEnvoyLocalHardware(String summary) {
    return 'このマシン: $summary';
  }

  @override
  String settingsEnvoyLocalActiveModel(String model) {
    return 'モデル: $model';
  }

  @override
  String settingsEnvoyLocalProgressBytes(String received, String total) {
    return '$received / $total MB';
  }

  @override
  String settingsEnvoyLocalProgressReceived(String received) {
    return '$received MB ダウンロード済み';
  }

  @override
  String settingsEnvoyLocalLastError(String error) {
    return '直近のエラー: $error';
  }

  @override
  String get settingsEnvoyLocalDownloadRegion => 'モデル ダウンロード リージョン';

  @override
  String get settingsEnvoyLocalDownloadRegionHint =>
      'ダウンロードが失敗する場合は、中国のミラーまたは Global 用に VPN をお試しください。';

  @override
  String settingsEnvoyLocalDownloadRegionEffective(String region) {
    return '使用中: $region';
  }

  @override
  String get settingsEnvoyLocalRegionAuto => '自動（タイムゾーン / ロケール）';

  @override
  String get settingsEnvoyLocalRegionCn => '中国（ModelScope → hf-mirror）';

  @override
  String get settingsEnvoyLocalRegionGlobal => 'グローバル（Hugging Face）';

  @override
  String get settingsEnvoyLocalEnable => 'ダウンロードして有効化';

  @override
  String get settingsEnvoyLocalEnabling => 'ダウンロード中…';

  @override
  String get settingsEnvoyLocalStart => 'Envoy Local を起動';

  @override
  String get settingsEnvoyLocalStarting => '起動中…';

  @override
  String get settingsEnvoyLocalStop => 'Envoy Local を停止';

  @override
  String get settingsEnvoyLocalRestart => '再起動';

  @override
  String get settingsEnvoyLocalCancelDownload => 'ダウンロードをキャンセル';

  @override
  String get settingsEnvoyLocalStopHint =>
      '停止すると、保存済みのクラウド / Ollama プロバイダーにアシスタントが戻ります。';

  @override
  String get settingsEnvoyLocalRecommended => '推奨';

  @override
  String get settingsEnvoyLocalRecommendedBadge => '推奨';

  @override
  String get settingsEnvoyLocalDownload => 'ダウンロード';

  @override
  String get settingsEnvoyLocalInstalled => 'インストール済みモデル';

  @override
  String get settingsEnvoyLocalInstalledHint =>
      'ホームノードにダウンロード済み。アクティブにするものを選択してください。';

  @override
  String get settingsEnvoyLocalNoInstalled => 'まだモデルがインストールされていません。';

  @override
  String get settingsEnvoyLocalSetActive => 'アクティブに設定';

  @override
  String get settingsEnvoyLocalActiveBadge => 'アクティブ';

  @override
  String get settingsEnvoyLocalInstalledBadge => 'インストール済み';

  @override
  String get settingsEnvoyLocalCatalog => 'カタログ';

  @override
  String settingsEnvoyLocalHfError(String error) {
    return 'Hugging Face 検索を利用できません: $error';
  }

  @override
  String get settingsEnvoyLocalRefresh => '更新';

  @override
  String get settingsEnvoyLocalPhoneNote =>
      '詳細なサーバー パラメータ（コンテキスト サイズ、GPU レイヤー）はホームノードのソーシャル画面にあります。';

  @override
  String get ehReviewTitle => 'このターンを確認';

  @override
  String get ehReviewUnavailable => 'この古いターンの保存済みレビューはありません。';

  @override
  String get ehReviewFile => 'ファイル';

  @override
  String get ehReviewOpenFile => 'ファイルを開く';

  @override
  String get ehReviewDiffUnavailable => 'このファイルのテキスト差分は利用できません。';

  @override
  String get ehReviewOnly => 'ワークスペース検出 · 確認のみ';

  @override
  String get ehRevertTitle => 'このターンを元に戻しますか？';

  @override
  String get ehRevertBody => 'ファイルはターン前の内容に戻されます。その後の編集は保護され、復元が停止します。';

  @override
  String get ehRevertAction => '元に戻す';

  @override
  String get ehRevertComplete => 'このターンのファイル変更を元に戻しました。';

  @override
  String get ehRevertUnavailable => 'このターンは安全に元に戻せません。';

  @override
  String ehRevertConflict(String files) {
    return 'その後変更されたため復元を停止しました: $files';
  }

  @override
  String get ehSearchTranscript => 'トランスクリプトを検索';

  @override
  String get ehSearchClose => '検索を閉じる';

  @override
  String get ehNoMatches => '一致するターンがありません';

  @override
  String get ehCopyTurn => 'ターンをコピー';

  @override
  String get ehShareTurn => 'ターンを共有';

  @override
  String get ehReviewDiff => '差分を確認';

  @override
  String get ehRevertThisTurn => 'このターンを元に戻す';

  @override
  String get ehReviewChanges => '変更を確認';

  @override
  String get ehRevertAll => 'すべて元に戻す';

  @override
  String ehChangesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'このターンで $count ファイル変更',
      one: 'このターンで 1 ファイル変更',
    );
    return '$_temp0';
  }

  @override
  String get ehChangesKeepAll => 'すべて保持';

  @override
  String get ehChangesRevert => 'すべて元に戻す';

  @override
  String get ehChangesHideList => '一覧を隠す';

  @override
  String get ehChangesShowList => '一覧を表示';

  @override
  String get ehReviewKeepFile => '保持';

  @override
  String get ehReviewRevertFile => '元に戻す';

  @override
  String get ehReviewKeptAll => '変更を保持しました。';

  @override
  String ehReviewRevertedFile(String path) {
    return '$path を元に戻しました';
  }

  @override
  String get ehReviewAutoLabel => '自動レビュー（≥）';

  @override
  String get ehReviewAutoAlways => '常に';

  @override
  String ehQueueTitle(int count) {
    return 'キュー ($count)';
  }

  @override
  String get ehQueueClear => 'クリア';

  @override
  String get ehQueueBusyHint => '送信は次にキューへ';

  @override
  String get ehQueueFollowUpHint => 'フォローアップをキューへ…';

  @override
  String get ehInjectTooltip => '割り込み（キャンセルして送信）';

  @override
  String ehFilesChangedCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ファイル変更',
      one: '1 ファイル変更',
    );
    return '$_temp0';
  }

  @override
  String get ehEmptyReply =>
      'envoy-harness は見える返信を返しませんでした。メッセージは残っています — 再試行するか言い換えてください。';

  @override
  String get ehConfigureModelHint => '設定 → AI でモデルを構成してください。';

  @override
  String get ehReviewKeepFailed => '変更を保持できませんでした。';

  @override
  String get ehReviewOpenGitDiff => 'Git diff を開く';

  @override
  String get ehDiffBefore => '変更前';

  @override
  String get ehDiffAfter => '変更後';

  @override
  String get ehPermsTooltip => '権限ポリシー';

  @override
  String get ehPermsSafe => 'デフォルト（安全な自動実行）';

  @override
  String get ehPermsAsk => '常に確認';

  @override
  String get ehPermsApprove => '常に承認';

  @override
  String ehPermsSet(String mode) {
    return '権限ポリシー → $mode。';
  }

  @override
  String get ehPermsNextTurn => ' 次のターンから適用。';

  @override
  String ehPermsFailed(String error) {
    return '権限ポリシーを設定できませんでした: $error';
  }

  @override
  String get chainsStatusCancelled => 'キャンセル';

  @override
  String get chainsStatusPublished => '公開済み';

  @override
  String get chainsStatusRecovering => '復旧中…';

  @override
  String get chainsStatusSynthesizing => '統合中';

  @override
  String get chainsStatusRunning => '実行中';

  @override
  String get chainsStatusWaitingWorkers => 'ワーカー待ち';

  @override
  String get chainsStatusBidding => '入札中';

  @override
  String get chainsStatusAssigning => '割当中';

  @override
  String get chainsStatusPlanning => '計画中';

  @override
  String get ehWorking => '作業中';

  @override
  String get ehCompleted => '完了';

  @override
  String get ehUpdate => '更新';

  @override
  String ehToolLabel(String name) {
    return 'ツール: $name';
  }

  @override
  String ehMatchCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 件一致',
      one: '1 件一致',
    );
    return '$_temp0';
  }

  @override
  String get termMore => 'その他…';

  @override
  String get termCompactContext => 'コンテキストを圧縮';

  @override
  String get termUpdatePlan => 'プランを表示または更新';

  @override
  String get termHarnessStatus => 'Harness ステータス';

  @override
  String get termPiActions => 'Pi アクション';

  @override
  String get termHarnessActions => 'envoy-harness アクション';

  @override
  String get termPreviousCommand => '前のコマンド';

  @override
  String get termNextCommand => '次のコマンド';

  @override
  String get termCursorLeft => 'カーソルを左へ';

  @override
  String get termCursorRight => 'カーソルを右へ';

  @override
  String get termEnterKey => 'Enter キー';

  @override
  String get chainsCancelFailed => 'チームジョブをキャンセルできませんでした。';

  @override
  String get settingsUseForCodingChat => 'コーディングチャットに使用';

  @override
  String get settingsUseForCodingChatHint =>
      '非推奨 — コーディングチャットは常に Envoy Harness を使用します。';
}
