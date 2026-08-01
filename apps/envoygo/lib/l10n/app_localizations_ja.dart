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
  String get navMe => '自分';

  @override
  String get commonCancel => 'キャンセル';

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
  String get mePiAgent => 'Pi エージェント';

  @override
  String get mePiAgentHint => 'ローカルコーディングエージェント設定';

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
  String get meAiModelHint => 'このホームノードのアシスタントが使うプロバイダー';

  @override
  String get mePiAgentHintLong => 'ホームノードの内蔵ローカルコーディングエージェント';

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
  String get chatPublishedContent => '公開コンテンツ';

  @override
  String get chatClearThread => 'スレッドをクリア';

  @override
  String get chatClearThreadTitle => 'スレッドをクリアしますか？';

  @override
  String get chatClearThreadBody => 'このスレッドのメッセージはすべて削除されます。';

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
  String get chatVoiceSendFailed => '音声メモの送信に失敗';

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
  String get blogPairHint => 'ホームノードとペアリングして Blog 投稿を書き管理します。';

  @override
  String get blogConnectHint => 'ホームノードに接続して Blog を管理します。';

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
  String get peopleBlog => 'Blog';

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
  String get publishedPhotoWall => 'PhotoWall';

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
  String get authorPublish => '公開';

  @override
  String get authorType => '種類';

  @override
  String get authorTypeProfile => 'プロフィール';

  @override
  String get authorTypePhoto => 'PhotoWall 写真';

  @override
  String get authorTypeBlog => 'Blog 投稿';

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
  String get aiDraftBlog => 'Blog 投稿を下書き';

  @override
  String get aiDraftFeed => 'Feed 更新を下書き';

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
      '詳細オプションはホームノード Social UI でこのプロバイダーを編集してください。';

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
  String get settingsPiBuiltIn => '組み込みローカルコーディングエージェント';

  @override
  String get settingsPiLocalOnly => 'ローカル専用コーディングエージェント（メッシュツールなし）。';

  @override
  String get settingsPiEnabled => 'Pi 有効';

  @override
  String get settingsPiOverrideHint => 'モデル上書き（任意）。クリアすると AI モデル設定を継承します。';

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
      'ホームノードで実行したチームジョブがここに表示されます。\nホームノード Social UI から作成してください。';

  @override
  String get chainsNoActive =>
      'ホームノードにアクティブなチェーンがありません。\nSocial UI から開始してください。';

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
  String get chainsManageOnSocial => 'ホームノード Social UI でチェーンを管理します。';

  @override
  String chainsPublished(String date) {
    return '$date に公開';
  }

  @override
  String chainsChainId(String id) {
    return 'Chain $id';
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
}
