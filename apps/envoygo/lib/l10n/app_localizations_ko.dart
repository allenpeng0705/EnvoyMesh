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
  String get navChats => '채팅';

  @override
  String get navInbox => '받은편지함';

  @override
  String get navContent => '콘텐츠';

  @override
  String get navMe => '나';

  @override
  String get commonCancel => '취소';

  @override
  String get commonSave => '저장';

  @override
  String get commonDelete => '삭제';

  @override
  String get commonRetry => '다시 시도';

  @override
  String get commonClose => '닫기';

  @override
  String get commonLoading => '로딩 중…';

  @override
  String get commonError => '문제가 발생했습니다';

  @override
  String get commonReconnect => '다시 연결';

  @override
  String get commonSwitch => '전환';

  @override
  String get commonPair => '페어링';

  @override
  String get commonUnpair => '페어링 해제';

  @override
  String get commonCreate => '만들기';

  @override
  String get commonRename => '이름 변경';

  @override
  String get languageTitle => '언어';

  @override
  String get languageSubtitle => '메뉴와 라벨에 사용할 언어';

  @override
  String get languageSystem => '시스템 기본값';

  @override
  String get languageSystemDesc => '기기 언어를 따릅니다';

  @override
  String get meConnectedNode => '연결된 노드';

  @override
  String get meNotConnected => '연결되지 않음';

  @override
  String get meNotConnectedHint => '홈 노드와 페어링하여 시작하세요';

  @override
  String get meReconnect => '다시 연결';

  @override
  String get meSwitch => '전환';

  @override
  String get meRepair => '다시 페어링';

  @override
  String get meReconnectNow => '지금 다시 연결';

  @override
  String get meUnpair => '페어링 해제';

  @override
  String get meBrowser => '브라우저';

  @override
  String get meBrowserHint => 'envoy:// 페이지 열기 — 또는 콘텐츠 탭에서 내 사이트';

  @override
  String get meAiEngine => 'AI 엔진';

  @override
  String get meAiEngineHint => '브리지 + OpenClaw 설정. 탭하여 구성.';

  @override
  String get meRecentTeamJobs => '최근 팀 작업';

  @override
  String get meRecentTeamJobsHint => '완료된 다중 에이전트 작업 보기';

  @override
  String get meActiveTeamJobs => '진행 중 팀 작업';

  @override
  String get meActiveTeamJobsHint => '실행 중인 팀 작업 보기';

  @override
  String get mePairNewNode => '새 노드 페어링';

  @override
  String get mePairNewNodeHint => '다른 홈 노드 추가';

  @override
  String get meSettings => '설정';

  @override
  String get meAiModel => 'AI 모델';

  @override
  String get meEnvoyLocal => 'Envoy Local';

  @override
  String get meEnvoyLocalHint => '홈 노드 로컬 모델(컴퓨터에 다운로드 및 시작)';

  @override
  String get mePiAgent => 'Pi 에이전트';

  @override
  String get mePiAgentHint => '로컬 코딩 에이전트 설정';

  @override
  String get meDarkMode => '다크 모드';

  @override
  String get meDarkModeHint => '시스템 설정 따르기';

  @override
  String get mePushNotifications => '푸시 알림';

  @override
  String get mePushNotificationsHint => '앱이 백그라운드일 때 알림';

  @override
  String get meUnpairDevice => '이 기기 페어링 해제';

  @override
  String get meUnpairDeviceHint => '연결을 끊고 모든 로컬 데이터 삭제';

  @override
  String get meUnpairConfirmTitle => '페어링을 해제할까요?';

  @override
  String get meUnpairConfirmBody => '이 기기의 해당 홈 노드 페어링과 로컬 채팅이 제거됩니다.';

  @override
  String get meUnpairedSnack => '페어링 해제됨. 로컬 채팅과 데이터가 삭제되었습니다.';

  @override
  String meUnpairFailed(String error) {
    return '페어링 해제 실패: $error';
  }

  @override
  String get meEditProfile => '프로필 수정';

  @override
  String meProfileUpdateFailed(String error) {
    return '프로필을 업데이트할 수 없음: $error';
  }

  @override
  String get mePublicAccess => '공개 액세스';

  @override
  String get mePort => '포트';

  @override
  String get mePublicAccessSaved => '공개 액세스가 저장됨';

  @override
  String get meFamilyProfile => '가족 프로필';

  @override
  String get meFamilyProfileHint => '이 홈에 가족 구성원으로 연결되어 있습니다';

  @override
  String get mePreferences => '환경설정';

  @override
  String get meViewEditProfile => '프로필 보기 및 수정';

  @override
  String get meEditNameAvatar => '이름 및 아바타 수정';

  @override
  String get meDisplayName => '표시 이름';

  @override
  String get meAvatarColor => '아바타 색상(hex)';

  @override
  String meMorePaired(int count) {
    return '+$count개 더 페어링됨';
  }

  @override
  String meSessionExpired(String name) {
    return '$name 세션이 만료됨';
  }

  @override
  String meDisconnectedFrom(String name) {
    return '$name에서 연결 끊김';
  }

  @override
  String meUnpairConfirmBodyNamed(String name) {
    return '이 기기의 $name 연결을 끊고 모든 로컬 채팅과 데이터를 삭제합니다.';
  }

  @override
  String get meTeamJobs => '팀 작업';

  @override
  String get meStartTeamJobHint => '계획을 미리 보고 홈 노드에서 시작';

  @override
  String get meAiModelHint => '이 홈 노드 어시스턴트에 사용하는 제공자';

  @override
  String get mePiAgentHintLong => '홈 노드의 내장 로컬 코딩 에이전트';

  @override
  String get mePushNotificationsHintLong =>
      '앱이 백그라운드일 때 새 메시지, 연락처 요청, 승인 알림을 받습니다.';

  @override
  String get meRecentTeamJobsHintLong => '홈 노드에 게시된 작업 보고서 보기';

  @override
  String get meActiveTeamJobsHintLong => '홈 노드에서 진행 중인 팀 작업 모니터링';

  @override
  String get inboxTitle => '받은편지함';

  @override
  String get inboxEmpty => '아직 알림이 없습니다';

  @override
  String get inboxEmptyHint => '본드 요청과 피드 업데이트가 여기에 표시됩니다';

  @override
  String get contentFeed => '피드';

  @override
  String get contentBlog => '블로그';

  @override
  String get contentPeople => '사람들';

  @override
  String get contentMyFiles => '내 파일';

  @override
  String get contentNewPost => '새 게시물';

  @override
  String get chatsTitle => '채팅';

  @override
  String get chatsEmpty => '아직 대화가 없습니다';

  @override
  String get chatsEmptyHint => '홈 노드와 페어링하여 시작하세요.';

  @override
  String get chatsSearchHint => '채팅 검색…';

  @override
  String get pairingScanTitle => 'QR 스캔';

  @override
  String get pairingConfirmTitle => '페어링 확인';

  @override
  String get pairingFamilyInvite => '가족 초대';

  @override
  String get pairingOwnerPair => '소유자 페어링';

  @override
  String get engagementLike => '좋아요';

  @override
  String get engagementUnlike => '좋아요 취소';

  @override
  String get engagementComment => '댓글';

  @override
  String get engagementRemoveComment => '댓글을 삭제할까요?';

  @override
  String get engagementRemove => '삭제';

  @override
  String get feedDelete => '삭제';

  @override
  String get blogDelete => '삭제';

  @override
  String get blogTitle => '블로그';

  @override
  String get blogEmpty => '게시물이 없습니다. 첫 블로그를 작성하세요.';

  @override
  String get blogHint => '메시에서 게시하는 긴 글.';

  @override
  String get feedTitle => '피드';

  @override
  String get feedComposeTitle => '새 피드 게시물';

  @override
  String get commonBack => '뒤로';

  @override
  String get commonAccept => '수락';

  @override
  String get commonDecline => '거절';

  @override
  String get commonDismiss => '닫기';

  @override
  String get commonOpen => '열기';

  @override
  String get commonRefresh => '새로고침';

  @override
  String get commonEdit => '수정';

  @override
  String get commonPost => '게시';

  @override
  String get commonPosting => '게시 중…';

  @override
  String get commonPublish => '발행';

  @override
  String get commonShare => '공유';

  @override
  String get commonSend => '보내기';

  @override
  String get commonClear => '지우기';

  @override
  String get commonInvite => '초대';

  @override
  String get commonJoin => '참여';

  @override
  String get commonYou => '나';

  @override
  String get commonUnknown => '알 수 없음';

  @override
  String get commonCopied => '클립보드에 복사됨';

  @override
  String get commonNotConnectedHome => '홈 노드에 연결되지 않음';

  @override
  String get commonSaving => '저장 중…';

  @override
  String get commonGenerating => '생성 중…';

  @override
  String get commonHide => '숨기기';

  @override
  String get commonAdd => '추가';

  @override
  String get commonRemove => '제거';

  @override
  String get commonSearch => '검색';

  @override
  String get connOffline => '오프라인';

  @override
  String get connDirect => '직접';

  @override
  String get connP2p => 'P2P';

  @override
  String get connRelay => '릴레이';

  @override
  String get connLanDirect => 'LAN (직접)';

  @override
  String get connPublicDirect => '공인 IP (직접)';

  @override
  String get connRelayWs => '릴레이 WebSocket';

  @override
  String get connTooltipDirect => '직접 연결';

  @override
  String get connTooltipConnecting => '연결 중…';

  @override
  String get connTooltipOffline => '연결되지 않음';

  @override
  String get connTooltipError => '연결 오류';

  @override
  String get chatsSectionAi => 'AI';

  @override
  String get chatsSectionFamily => '가족';

  @override
  String get chatsSectionContacts => '연락처';

  @override
  String get chatsSectionGroups => '그룹';

  @override
  String get chatsSectionTerminals => '터미널';

  @override
  String get chatsFabNew => '새로 만들기';

  @override
  String get chatsCreateBot => 'Bot 만들기';

  @override
  String get chatsCreateBotHint => '홈 노드의 AI 캐릭터';

  @override
  String get chatsNewPi => '새 Pi';

  @override
  String get chatsNewPiHint => 'Pi 코딩 터미널 시작';

  @override
  String get chatsNewTerminal => '새 터미널';

  @override
  String get chatsNewTerminalHint => '홈 노드에서 Shell 열기';

  @override
  String get chatsNewGroup => '새 그룹 채팅';

  @override
  String get chatsNewGroupHint => '본드된 연락처와의 메시 그룹';

  @override
  String get chatsNewFamilyGroup => '새 가족 그룹';

  @override
  String get chatsNewFamilyGroupHint => '가족 구성원과의 로컬 그룹';

  @override
  String get chatsDeleteBotTitle => 'Bot을 삭제할까요?';

  @override
  String chatsDeleteBotBody(String name) {
    return '홈 노드에서 \"$name\"을(를) 제거할까요? 되돌릴 수 없습니다.';
  }

  @override
  String get chatsBotOptions => 'Bot 옵션';

  @override
  String get chatsEditBot => 'Bot 수정';

  @override
  String get chatsBotNameRequired => 'Bot 이름이 필요합니다';

  @override
  String get chatsBotPromptRequired => '성격 / 시스템 프롬프트가 필요합니다';

  @override
  String get chatsBotName => 'Bot 이름';

  @override
  String get chatsBotNameHint => '예: 사서 Luna';

  @override
  String get chatsBotPrompt => '성격 / 시스템 프롬프트';

  @override
  String get chatsBotPromptHint =>
      '캐릭터 관점으로 작성하세요(\"당신은 …\"). \"Luna는 …\" 또는 \"나는 AI…\"는 피하세요. 저장 시 재구성됩니다.';

  @override
  String get chatsBotDesc => '짧은 설명(선택)';

  @override
  String get chatsBotDescHint => '채팅 목록용 한 줄 설명. 비우면 성격에서 자동 채웁니다.';

  @override
  String get chatsAvatarColor => '아바타 색상';

  @override
  String get chatsShellHint => 'Shell (예: zsh, bash)';

  @override
  String get chatsCwdHint => '작업 디렉터리(선택)';

  @override
  String get chatsPiTitle => 'Pi 시작';

  @override
  String get chatsPiBody => '홈 컴퓨터의 프로젝트 폴더를 선택해 Pi 코딩 터미널을 여세요.';

  @override
  String get chatsPiFolder => '프로젝트 폴더';

  @override
  String get chatsPiFolderHint => '/Users/you/project';

  @override
  String get chatsPiFolderRequired => '프로젝트 폴더 경로를 입력하세요.';

  @override
  String get chatsGroupName => '그룹 이름';

  @override
  String get chatsNoFamilyMembers => '아직 다른 가족 구성원이 없습니다.';

  @override
  String get chatVoiceCall => '음성 통화';

  @override
  String get chatVideoCall => '영상 통화';

  @override
  String get chatPublishedContent => '게시된 콘텐츠';

  @override
  String get chatClearThread => '스레드 지우기';

  @override
  String get chatClearThreadTitle => '스레드를 지울까요?';

  @override
  String get chatClearThreadBody => '이 스레드의 모든 메시지가 삭제됩니다.';

  @override
  String get chatDeleteMessageTitle => '메시지를 삭제할까요?';

  @override
  String get chatNoMessages => '아직 메시지가 없습니다';

  @override
  String get chatTypeMessage => '메시지 입력…';

  @override
  String get chatRecordVoice => '음성 녹음';

  @override
  String get chatStopRecording => '녹음 중지';

  @override
  String get chatInviteToGroup => '그룹에 초대';

  @override
  String get chatNoContactsInvite => '초대할 연락처가 없습니다.';

  @override
  String chatInvitedSnack(String name) {
    return '$name 초대됨';
  }

  @override
  String get chatVoiceSending => '음성 메모 전송 중…';

  @override
  String get chatVoiceSent => '음성 메모가 전송됨';

  @override
  String get chatVoiceRecording => '녹음 중';

  @override
  String get chatVoiceReady => '전송 준비됨';

  @override
  String get chatVoiceCancel => '취소';

  @override
  String get chatVoiceSend => '보내기';

  @override
  String get chatVoiceSendHint => '끝나면 보내기 · 취소하면 삭제';

  @override
  String get chatVoiceReadyHint => '전송 실패 · 보내기로 재시도 · 취소하면 삭제';

  @override
  String get chatVoiceSendFailed => '음성 메모 전송 실패';

  @override
  String get chatMicDenied => '마이크 권한이 거부됨';

  @override
  String get chatRecordFailed => '녹음 시작 실패';

  @override
  String get chatCallFailed => '통화 시작 실패';

  @override
  String get chatAiDisabled => 'AI 모델이 비활성화되었습니다. 설정 → AI에서 제공자를 활성화하세요.';

  @override
  String get chatAiDisabledFamily => '이 가족 프로필에서는 AI를 사용할 수 없습니다.';

  @override
  String get inboxPublishedUpdates => '게시 업데이트';

  @override
  String get inboxPublishedEmpty =>
      '아직 게시 알림이 없습니다. 본드된 연락처가 웹 콘텐츠를 게시하면 여기에 표시됩니다.';

  @override
  String get inboxPendingIntros => '대기 중인 소개';

  @override
  String get inboxPendingEmpty => '대기 중인 소개가 없습니다';

  @override
  String get inboxWantsToConnect => '연결을 원함';

  @override
  String get pairingInvalidQr => '잘못된 페어링 QR 코드';

  @override
  String get pairingPasteUri => '또는 페어링 URI 붙여넣기';

  @override
  String get pairingUriHint => 'envoy://pair?… 또는 envoy://invite?…';

  @override
  String get pairingNeedHomeHint =>
      '직접 홈을 만드시나요? 먼저 Mac/Windows PC에 EnvoyMesh를 설치한 뒤 QR을 스캔하세요. 가족에 참여하시나요? 초대 QR만 스캔하면 됩니다(PC 설치 불필요).';

  @override
  String get pairingDownloadEnvoyMesh => 'EnvoyMesh 데스크톱 다운로드';

  @override
  String get pairingJoinFamily => '가족 참여';

  @override
  String pairingConnectTo(String name) {
    return '$name에 연결할까요?';
  }

  @override
  String pairingWelcomeFamily(String name) {
    return '$name 가족에 오신 것을 환영합니다!';
  }

  @override
  String get pairingImNew => '처음입니다';

  @override
  String get pairingImBack => '돌아왔습니다';

  @override
  String get pairingDisplayNameOptional => '표시 이름(선택)';

  @override
  String get pairingYourName => '이름';

  @override
  String get pairingAvatarColor => '아바타 색상';

  @override
  String get pairingOwnerNameHint => '이 노드에서 소유자 프로필 이름으로 표시됩니다';

  @override
  String get pairingCopyError => '복사 오류';

  @override
  String get pairingRetryMembers => '멤버 다시 불러오기';

  @override
  String get pairingWhoAreYou => '누구신가요?';

  @override
  String get pairingAlreadyOnHome => '이미 이 홈에 있음';

  @override
  String get pairingSelectProfile => '프로필 선택';

  @override
  String get pairingNoMembersFirst => '아직 가족 구성원이 없습니다 — 첫 번째가 됩니다.';

  @override
  String get pairingNoExistingProfiles =>
      '기존 가족 프로필이 없습니다. \"처음입니다\"로 전환해 만드세요.';

  @override
  String get pairingNameRequired => '이름을 입력하세요';

  @override
  String get pairingSelectRequired => '프로필을 선택하세요';

  @override
  String get pairingLanAvailable => 'LAN: 사용 가능';

  @override
  String get pairingRelayAvailable => 'Relay: 사용 가능';

  @override
  String pairingPeer(String peer) {
    return 'Peer: $peer';
  }

  @override
  String get pairingNameHintDad => '예: 아빠';

  @override
  String get pairingNameHintMom => '예: 엄마, Alex';

  @override
  String get pairingChooseUniqueName => '아래에 아직 사용되지 않은 이름을 선택하세요.';

  @override
  String get pairingSameNameHint => '첫 번째 휴대폰에서 만든 것과 같은 이름을 사용하세요.';

  @override
  String get pairingTapIfSecondPhone => '두 번째 휴대폰이면(돌아왔습니다) 이름을 탭하세요.';

  @override
  String get feedEmptyTitle => '서클이 조용합니다';

  @override
  String get feedEmptyHint => '아직 게시물이 없습니다. 본드된 연락처와 업데이트를 공유하세요.';

  @override
  String get feedHint => '나와 본드된 연락처의 업데이트.';

  @override
  String get feedDeleteTitle => '게시물을 삭제할까요?';

  @override
  String get feedDeleteBody => '되돌릴 수 없습니다.';

  @override
  String get blogPairHint => '홈 노드와 페어링하여 Blog 게시물을 작성하고 관리하세요.';

  @override
  String get blogConnectHint => '홈 노드에 연결하여 Blog를 관리하세요.';

  @override
  String get blogDeleteTitle => '게시물을 삭제할까요?';

  @override
  String blogDeleteBody(String title) {
    return '\"$title\"을(를) 삭제할까요? 되돌릴 수 없습니다.';
  }

  @override
  String get feedWhatsOnMind => '무슨 생각을 하고 있나요?';

  @override
  String get feedShareHint => '본드된 연락처와 업데이트 공유…';

  @override
  String get feedPhotos => '사진';

  @override
  String get feedVisibility => '공개 범위';

  @override
  String get feedVisBonded => '본드된 연락처';

  @override
  String get feedVisSelected => '선택한 연락처';

  @override
  String get feedVisOnlyMe => '나만';

  @override
  String get feedNeedTextOrPhoto => '텍스트 또는 사진을 하나 이상 추가하세요';

  @override
  String get feedNeedContact => '연락처를 하나 이상 선택하세요';

  @override
  String get feedSelectedHint => '이 연락처만 이 게시물을 볼 수 있습니다. 최소 한 명을 선택하세요.';

  @override
  String get feedNoContacts => '본드된 연락처가 없습니다 — 먼저 연락처를 추가하거나 본드/나만을 선택하세요.';

  @override
  String get feedAiDraft => 'AI 초안';

  @override
  String get feedDiscard => '버리기';

  @override
  String get feedInsert => '삽입';

  @override
  String get feedReplace => '교체';

  @override
  String get peoplePairHint => '홈 노드와 페어링하여 메시에서 사람을 찾으세요.';

  @override
  String get peopleConnectHint => '홈 노드에 연결하여 사람을 찾으세요.';

  @override
  String get peopleHint => '아직 본드하지 않은 사람을 찾으세요 — 공개 프로필이나 블로그를 열고 인사하세요.';

  @override
  String get peopleTopic => '주제';

  @override
  String get peopleInterest => '관심사';

  @override
  String get peopleTopicHint => '음악, 코딩, 여행…';

  @override
  String get peopleInterestHint => '사진, 요리, 여행…';

  @override
  String get peopleOnMesh => '메시의 사람들';

  @override
  String get peopleResults => '결과';

  @override
  String get peopleEmpty => '표시할 사람이 없습니다.';

  @override
  String get peopleProfile => '프로필';

  @override
  String get peopleBlog => 'Blog';

  @override
  String get peopleSayHello => '인사하기';

  @override
  String get peopleHelloSent => '인사를 보냈습니다';

  @override
  String get peopleEnterSearch => '주제나 관심사를 입력해 검색하세요.';

  @override
  String get peopleNoMatches => '해당 검색과 일치하는 결과가 없습니다.';

  @override
  String get peopleNoneFound => '메시에서 공개된 사람을 아직 찾지 못했습니다.';

  @override
  String get peopleHelloMessage => '안녕하세요 — Envoy에서 연결하고 싶습니다.';

  @override
  String get peopleOpenLink => '링크 열기';

  @override
  String get filesPairHint => '홈 노드와 페어링하여 내 파일을 관리하세요.';

  @override
  String get filesConnectHint => '홈 노드에 연결하여 파일을 관리하세요.';

  @override
  String get filesSearchHint => '라이브러리 검색';

  @override
  String get filesVaultHint => 'Vault 라이브러리 — 채팅 첨부와 프로필 사진은 채팅/프로필에 유지';

  @override
  String get filesEmpty => '라이브러리에 파일이 없습니다.';

  @override
  String filesImported(String name) {
    return '$name 가져옴';
  }

  @override
  String filesImportFailed(String error) {
    return '가져오기 실패: $error';
  }

  @override
  String filesPreviewFailed(String error) {
    return '미리보기 실패: $error';
  }

  @override
  String get filesNoContactsShare => '공유할 본드된 연락처가 없습니다';

  @override
  String get filesShareWith => '공유 대상…';

  @override
  String get filesShareSent => '공유를 보냈습니다';

  @override
  String filesShareFailed(String error) {
    return '공유 실패: $error';
  }

  @override
  String get filesImport => '가져오기';

  @override
  String filesPreviewUnavailable(String mime, int bytes) {
    return '$mime($bytes바이트) 미리보기를 사용할 수 없습니다.';
  }

  @override
  String publishedTitle(String name) {
    return '게시된 콘텐츠 — $name';
  }

  @override
  String get publishedPhotoWall => 'PhotoWall';

  @override
  String get engagementCommentHint => '댓글 작성…';

  @override
  String get engagementRemoveCommentTooltip => '댓글 삭제';

  @override
  String get profileTitle => '프로필';

  @override
  String get profileMyTitle => '내 프로필';

  @override
  String get profileUnnamed => '이름 없음';

  @override
  String get profileRemovePhotoTitle => '사진을 삭제할까요?';

  @override
  String get profileNameRequired => '표시 이름 또는 사용자 이름이 필요합니다';

  @override
  String get profileSaved => '프로필이 저장됨';

  @override
  String get profileUsername => '사용자 이름';

  @override
  String get profileBio => '소개';

  @override
  String get profileBioHint => '연락처가 알아볼 수 있도록 짧은 소개를 추가하세요.';

  @override
  String get profilePhotos => '사진';

  @override
  String get profileNoPhotosYet => '아직 사진이 없습니다 — 벽에 하나 추가하세요';

  @override
  String get profileNoPhotosShared => '공유된 사진 없음';

  @override
  String get profileLongPressRemove => '사진을 길게 눌러 삭제';

  @override
  String get contactsSearchHint => '연락처 검색…';

  @override
  String get contactsEmpty => '아직 연락처가 없습니다';

  @override
  String get contactsEmptyHint => '본드된 연락처가 여기에 표시됩니다.';

  @override
  String get contactsChat => '채팅';

  @override
  String get callIncoming => '수신 음성 통화';

  @override
  String get callConnected => '연결됨';

  @override
  String get callConnecting => '연결 중…';

  @override
  String get callDisconnected => '연결 끊김';

  @override
  String get callSwitchCamera => '카메라 전환';

  @override
  String get authorPublish => '발행';

  @override
  String get authorType => '유형';

  @override
  String get authorTypeProfile => '프로필';

  @override
  String get authorTypePhoto => 'PhotoWall 사진';

  @override
  String get authorTypeBlog => 'Blog 게시물';

  @override
  String get authorVisPublic => '공개';

  @override
  String get authorVisBonded => '본드';

  @override
  String get authorVisPrivate => '비공개';

  @override
  String get authorCaption => '캡션';

  @override
  String get authorCaptionOptional => '캡션(선택)';

  @override
  String get authorBody => '본문';

  @override
  String get authorBodyMarkdown => '본문(Markdown)';

  @override
  String get authorTitle => '제목';

  @override
  String get authorTitleRequired => '제목이 필요합니다';

  @override
  String get authorPickPhoto => '먼저 사진을 선택하세요';

  @override
  String get authorChooseAvatar => '아바타 선택';

  @override
  String get authorChoosePhoto => '사진 선택';

  @override
  String get aiDraftButton => 'AI로 작성';

  @override
  String get aiDraftEmphasize => '무엇을 강조할까요?(선택)';

  @override
  String get aiDraftEmphasizeHint => '예: 친구들과 주말 하이킹';

  @override
  String get aiDraftMode => '모드';

  @override
  String get aiDraftTone => '톤';

  @override
  String get aiDraftRewrite => '다시 쓰기';

  @override
  String get aiDraftExpand => '확장';

  @override
  String get aiDraftShorten => '줄이기';

  @override
  String get aiDraftGenerate => '생성';

  @override
  String get aiDraftNoModel => '홈 노드에 AI 모델이 구성되지 않았습니다.';

  @override
  String get aiDraftEmpty => '모델에서 빈 초안 반환';

  @override
  String get aiDraftBio => '소개 작성';

  @override
  String get aiDraftBlog => 'Blog 게시물 작성';

  @override
  String get aiDraftFeed => '피드 업데이트 작성';

  @override
  String get aiDraftCaption => '캡션 작성';

  @override
  String get settingsAiModelIntro =>
      '홈 노드 어시스턴트용 클라우드 모델 제공자. 변경은 다음 어시스턴트 턴에 적용됩니다.';

  @override
  String settingsHomeUses(String mode) {
    return '홈에서 $mode 사용';
  }

  @override
  String get settingsEndpoint => 'Endpoint:';

  @override
  String get settingsModelLabel => 'Model:';

  @override
  String get settingsEditOnSocial => '고급 옵션은 홈 노드 Social UI에서 이 제공자를 편집하세요.';

  @override
  String get settingsProvider => 'Provider';

  @override
  String get settingsEndpointUrl => 'Endpoint URL';

  @override
  String get settingsModel => 'Model';

  @override
  String get settingsCustomModel => '사용자 지정 모델 이름';

  @override
  String get settingsApiKey => 'API key';

  @override
  String get settingsApiKeySaved => '홈 노드에 키가 이미 저장되어 있습니다';

  @override
  String get settingsAiModelSaved => 'AI 모델 저장됨';

  @override
  String settingsSaveFailed(String error) {
    return '저장 실패: $error';
  }

  @override
  String get settingsDefault => '(기본값)';

  @override
  String get settingsAiEngineIntro => '홈 노드가 어시스턴트 턴을 전달할 외부 에이전트를 선택하세요.';

  @override
  String get settingsExternalAgent => 'External agent';

  @override
  String get settingsWebhookUrl => 'Webhook URL';

  @override
  String get settingsHowToStart => '시작 방법';

  @override
  String get settingsBuiltIntoHome => '홈 노드에 내장';

  @override
  String get settingsNoExtProcess => '별도의 Ext Agent 프로세스가 필요하지 않습니다.';

  @override
  String get settingsBridgePort => 'Bridge 수신 포트';

  @override
  String get settingsBridgeEnabled => 'Bridge 사용';

  @override
  String get settingsBridgeHint => '어시스턴트 턴을 선택한 외부 에이전트로 전달합니다.';

  @override
  String get settingsOpenClawEnabled => 'OpenClaw 사용';

  @override
  String get settingsOpenClawHint =>
      '다음 노드 시작 시 내장 OpenClaw 게이트웨이(EnvoyAI)가 활성화됩니다.';

  @override
  String get settingsOpenClawUnavailable => 'OpenClaw 상태를 사용할 수 없음';

  @override
  String settingsOpenClawStatus(String state) {
    return 'OpenClaw $state';
  }

  @override
  String settingsExtAgentStatus(String state) {
    return 'Ext Agent $state';
  }

  @override
  String get settingsEnabled => '사용';

  @override
  String get settingsDisabled => '비활성';

  @override
  String get settingsAiEngineSaved => 'AI 엔진 저장됨';

  @override
  String get settingsNotConnectedNode => '홈 노드에 연결되지 않음';

  @override
  String settingsPiState(String state) {
    return '상태: $state';
  }

  @override
  String get settingsPiBuiltIn => '내장 로컬 코딩 에이전트';

  @override
  String get settingsPiLocalOnly => '로컬 전용 코딩 에이전트(메시 도구 없음).';

  @override
  String get settingsPiEnabled => 'Pi 사용';

  @override
  String get settingsPiOverrideHint => '모델 재정의(선택). 지우면 AI 모델 설정을 상속합니다.';

  @override
  String get settingsPiModelName => '모델 이름';

  @override
  String get settingsPiEndpoint => 'Endpoint';

  @override
  String get settingsPiLeaveBlankKey => '비워 두면 저장된 키 유지';

  @override
  String get settingsPiSaveOverride => '모델 재정의 저장';

  @override
  String get settingsPiClearOverride => '재정의 지우기(AI 모델 상속)';

  @override
  String get settingsPiModelSaved => 'Pi 모델 저장됨';

  @override
  String get settingsPiModelRequired => '모델 이름이 필요합니다';

  @override
  String get settingsPiInherits => 'Pi는 EnvoyMesh 모델 설정을 상속합니다';

  @override
  String settingsPiFailed(String error) {
    return '실패: $error';
  }

  @override
  String settingsPiClearFailed(String error) {
    return '지우기 실패: $error';
  }

  @override
  String settingsPiProviderCustom(String provider) {
    return '$provider(사용자 지정)';
  }

  @override
  String get aiEngineReadonlyHint =>
      '모바일에서는 두 블록 모두 읽기 전용입니다. 홈 노드(설정 → AI → AI 엔진)에서 구성하세요.';

  @override
  String get aiEngineBuiltInOpenClaw => '내장 OpenClaw';

  @override
  String get aiEngineExtBridge => 'External Agent Bridge';

  @override
  String get aiEngineModeBoth => '내장 + Ext';

  @override
  String get aiEngineModeBuiltIn => '내장만';

  @override
  String get aiEngineModeExt => 'Ext만';

  @override
  String get aiEngineModeNone => '없음';

  @override
  String get aiEngineRunning => '실행 중';

  @override
  String get aiEngineConfigured => '구성됨(실행 안 함)';

  @override
  String get aiEngineDisabled => '비활성';

  @override
  String get browserTitle => '브라우저';

  @override
  String get browserGo => '이동';

  @override
  String get browserBack => '뒤로';

  @override
  String get browserForward => '앞으로';

  @override
  String get browserReload => '새로고침';

  @override
  String get browserPairFirst => '홈 노드에 연결되지 않음 — 먼저 페어링하고 다시 연결하세요.';

  @override
  String get browserIntegrityFailed => '콘텐츠 무결성 검사 실패 — 렌더링 거부';

  @override
  String browserDecodeImageFailed(String error) {
    return '이미지 디코딩 실패: $error';
  }

  @override
  String get browserPhoto => '사진';

  @override
  String get browserPhotos => '사진';

  @override
  String get browserNoPhotos => '아직 사진이 없습니다.';

  @override
  String get browserHint => 'envoy:// URL을 입력해 본드된 연락처가 제공하는 콘텐츠를 탐색하세요.';

  @override
  String get extSwitchTitle => 'Ext Agent 전환';

  @override
  String extSwitchTooltip(String name) {
    return 'Ext Agent 전환 ($name)';
  }

  @override
  String extNotRunningChat(String name) {
    return '$name이(가) 실행 중이 아닙니다 — 채팅 전에 시작하세요.';
  }

  @override
  String extSwitchFailed(String error) {
    return '전환 실패: $error';
  }

  @override
  String extNotRunning(String name) {
    return '$name이(가) 실행 중이 아님';
  }

  @override
  String get extChecking => '확인 중…';

  @override
  String get extCheckAgain => '다시 확인';

  @override
  String get audioLoading => '오디오 로딩 중…';

  @override
  String get audioUnavailable => '오디오를 사용할 수 없음';

  @override
  String get audioVoiceNote => '음성 메모';

  @override
  String meLastAttempt(String time) {
    return '마지막 시도: $time';
  }

  @override
  String get meJustNow => '방금';

  @override
  String get mePublicIpLabel => '공인 IP 또는 도메인';

  @override
  String get mePublicIpHint => '예: 1.2.3.4 또는 mynode.example.com';

  @override
  String get mePublicIpHelp =>
      '홈 노드에 공인 IP 또는 도메인이 있으면 설정하세요.\n5G/WAN에서 릴레이 없이 직접 연결할 수 있습니다.';

  @override
  String get meNetworkDebug => '네트워크 디버그';

  @override
  String get meRunNetworkTests => '네트워크 테스트 실행';

  @override
  String get meTesting => '테스트 중…';

  @override
  String get meNetworkTestsHint => 'EnvoyGo가 페어링에 사용하는 모든 경로를 테스트합니다.';

  @override
  String get meSwitchNode => '노드 전환';

  @override
  String get chainsRecentTitle => '최근 팀 작업';

  @override
  String get chainsActiveTitle => '진행 중 팀 작업';

  @override
  String get chainsLoadFailed => '체인 불러오기 실패';

  @override
  String get chainsNoReports => '아직 보고서 없음';

  @override
  String get chainsEmptyHint =>
      '홈 노드에서 실행한 팀 작업이 여기에 표시됩니다.\n홈 노드 Social UI에서 팀 작업을 만드세요.';

  @override
  String get chainsNoActive => '홈 노드에 활성 체인이 없습니다.\nSocial UI에서 시작하세요.';

  @override
  String get chainsReportGone => '이 보고서를 더 이상 사용할 수 없습니다';

  @override
  String get chainsReportGoneHint => '90일 GC 정책으로 제거되었을 수 있습니다.';

  @override
  String get chainsBackToRecent => '최근 팀 작업으로 돌아가기';

  @override
  String get chainsLoadReportFailed => '보고서 불러오기 실패';

  @override
  String get chainsSummary => '요약';

  @override
  String get chainsWorkers => '워커';

  @override
  String get chainsSubtasks => '하위 작업';

  @override
  String get chainsSynthesis => '합성';

  @override
  String get chainsDuration => '소요 시간';

  @override
  String get chainsManageOnSocial => '홈 노드 Social UI에서 체인을 관리하세요.';

  @override
  String get chainsStartTitle => '팀 작업 시작';

  @override
  String get chainsStartFab => '새 팀 작업';

  @override
  String get chainsStartIntro =>
      '목표를 설명하세요. 홈 노드가 하위 작업을 계획하고 본드된 Agent Network 워커에 할당합니다.';

  @override
  String get chainsStartAssignmentMode => '할당 모드';

  @override
  String get chainsStartModeSkill => '기술 기준';

  @override
  String get chainsStartModeRole => '역할 기준';

  @override
  String get chainsStartModeSkillHint => '워커는 일치하는 기술로 순위가 매겨집니다.';

  @override
  String get chainsStartModeRoleHint => '각 단계는 역할(PM, 프로그래머 등)을 우선합니다.';

  @override
  String get chainsStartGoalLabel => '목표';

  @override
  String get chainsStartGoalHint => '팀이 무엇을 달성해야 하나요?';

  @override
  String chainsStartGoalTooShort(int min) {
    return '목표는 최소 $min자 이상이어야 합니다';
  }

  @override
  String get chainsStartPreview => '계획 미리보기';

  @override
  String get chainsStartPreviewing => '계획 중…';

  @override
  String get chainsStartPreviewFailed => '계획을 만들 수 없습니다';

  @override
  String get chainsStartNeedPreview => '시작하기 전에 계획을 미리 보세요';

  @override
  String get chainsStartPlanHeading => '계획';

  @override
  String get chainsStartNoSubtasks => '이 계획에 하위 작업이 없습니다.';

  @override
  String get chainsStartConfirm => '팀 작업 시작';

  @override
  String get chainsStartStarting => '시작 중…';

  @override
  String get chainsStartStarted => '팀 작업이 시작되었습니다';

  @override
  String get chainsStartFailed => '팀 작업을 시작할 수 없습니다';

  @override
  String get chainsStartNoWorkers =>
      '도달 가능한 Agent Network 워커가 없습니다. 먼저 홈 노드의 에이전트와 연락처를 본드하세요.';

  @override
  String get chainsStartNeedWorkers =>
      '온라인 워커를 최소 1명 선택하거나, 추천 풀을 복원하려면 다시 미리 보세요.';

  @override
  String get chainsStartWorkersHint =>
      '계획의 온라인 워커. 원하지 않는 워커의 체크를 해제하세요. 모두 해제하면 시작이 차단됩니다 — 추천 풀을 재설정하려면 다시 미리 보세요.';

  @override
  String get chainsStartWorkersHeading => '워커';

  @override
  String get chainsStartNoSuggestedWorkers =>
      '제안된 워커가 아직 없습니다 — 시작 시 홈 노드의 검색 풀을 사용합니다.';

  @override
  String chainsStartWorkerMatches(int count) {
    return '$count개 단계 일치';
  }

  @override
  String get chainsStartWorkerOnline => '온라인';

  @override
  String get chainsStartWorkerRelay => '온라인(릴레이)';

  @override
  String get chainsStartWorkerOffline => '오프라인 / 알 수 없음';

  @override
  String get chainsActiveGone => '이 팀 작업은 더 이상 활성 상태가 아닙니다';

  @override
  String chainsBudgetLine(String spent, String max) {
    return '예산 $spent / $max USD';
  }

  @override
  String get chainsBudgetWarn => '예산 경고 — 예산 추가를 고려하세요.';

  @override
  String get chainsBudgetExceeded => '예산 초과 — 재조정 전까지 작업이 멈출 수 있습니다.';

  @override
  String chainsPartialCount(int count) {
    return '$count개의 부분 결과';
  }

  @override
  String get chainsCancelTitle => '팀 작업을 취소할까요?';

  @override
  String get chainsCancelBody => '워커에게 중단을 알립니다. 이미 수집된 부분 결과는 유지됩니다.';

  @override
  String get chainsCancelConfirm => '작업 취소';

  @override
  String get chainsCancelDone => '팀 작업이 취소되었습니다';

  @override
  String get chainsCancelReason => 'EnvoyGo에서 취소됨';

  @override
  String get chainsDetailCancelled => '이 작업은 취소되었습니다.';

  @override
  String get chainsDetailPublished => '이 작업이 완료되어 보고서를 게시했습니다.';

  @override
  String get chainsRebalanceHeading => '예산 추가';

  @override
  String get chainsRebalanceHint => '비용 한도를 높이고 할당되지 않은 단계를 재시도합니다.';

  @override
  String get chainsRebalanceAmount => '추가 USD';

  @override
  String get chainsRebalanceAction => '추가 후 재시도';

  @override
  String get chainsRebalanceInvalidAmount => '양의 달러 금액을 입력하세요';

  @override
  String get chainsRebalanceDone => '예산이 업데이트되었습니다';

  @override
  String get chainsRebalanceFailed => '재조정할 수 없습니다';

  @override
  String get chainsPin => '보고서 고정';

  @override
  String get chainsUnpin => '보고서 고정 해제';

  @override
  String get chainsPinDone => '보고서가 고정되었습니다(90일 정리 후에도 유지)';

  @override
  String get chainsUnpinDone => '보고서 고정이 해제되었습니다';

  @override
  String chainsPublished(String date) {
    return '$date 게시됨';
  }

  @override
  String chainsChainId(String id) {
    return 'Chain $id';
  }

  @override
  String get termNone => '터미널 세션 없음';

  @override
  String termAttachFailed(String error) {
    return '터미널 연결 실패: $error';
  }

  @override
  String get termCopied => '클립보드에 복사됨';

  @override
  String get termReconnecting => '다시 연결 중…';

  @override
  String get termCopyAll => '전체 출력 복사';

  @override
  String get termPaste => '붙여넣기';

  @override
  String get termCloseSession => '세션 닫기';

  @override
  String get chatImagePlaceholder => '[이미지]';

  @override
  String get chatsBotSyncing => '업데이트 동기화 중…';

  @override
  String get chatsBotSavedHint => '홈 노드에 저장됨. 준비되면 채팅하세요.';

  @override
  String get chatsBotNotFound => '홈 노드에서 봇을 찾을 수 없음';

  @override
  String get chatAiDisabledAskOwner => '가족 채팅용 AI 모델을 홈 소유자에게 요청하세요.';

  @override
  String pairingLoadProfilesFailed(String error) {
    return '기존 프로필을 불러올 수 없음: $error';
  }

  @override
  String pairingFailed(String error) {
    return '페어링 실패: $error';
  }

  @override
  String get pairingInviteAlreadyUsed =>
      '이 초대 QR은 이미 사용되었습니다. 홈 소유자에게 가족 → 초대 QR 다시 표시를 요청한 뒤, 새 코드를 스캔하고 \'돌아왔어요\'에서 프로필(예: Dad)을 선택하세요.';

  @override
  String get feedDefaultTitle => '피드 게시물';

  @override
  String get aiDraftSection => '초안 섹션';

  @override
  String aiDraftFailed(String reason) {
    return '초안을 만들 수 없음 ($reason)';
  }

  @override
  String authorAvatarNamed(String name) {
    return '아바타: $name';
  }

  @override
  String authorPhotoNamed(String name) {
    return '사진: $name';
  }

  @override
  String get peopleEnvoyUser => 'Envoy 사용자';

  @override
  String get commonEllipsis => '…';

  @override
  String get browserCached => '캐시됨';

  @override
  String get browserLoaded => '로드됨';

  @override
  String get browserNotPublished => '아직 게시되지 않음';

  @override
  String get browserNotFound => '콘텐츠를 찾을 수 없음';

  @override
  String get browserAccessDenied => '액세스 거부됨';

  @override
  String browserPdfLoaded(int chars) {
    return 'PDF 로드됨 ($chars base64 문자)';
  }

  @override
  String browserUnsupportedType(String mime) {
    return '지원하지 않는 유형: $mime';
  }

  @override
  String get browserInterests => '관심사';

  @override
  String get browserKnowledge => '지식';

  @override
  String get browserCapabilities => '기능';

  @override
  String get connTooltipP2p => '릴레이 홉을 통한 P2P 연결';

  @override
  String get connTooltipRelay => '릴레이 연결 — 홈에서 전화를 걸 수 있음';

  @override
  String connTooltipConnectedVia(String transport) {
    return '$transport(으)로 연결됨';
  }

  @override
  String get connBootstrap => '부트스트랩';

  @override
  String get settingsRunning => '실행 중';

  @override
  String get settingsNotRunning => '실행 중 아님';

  @override
  String get settingsModelIdHint => 'model-id';

  @override
  String get chainsSections => '섹션';

  @override
  String get chainsWorkerAllocations => '워커 할당';

  @override
  String chainsAwardedSummary(String status, int awarded, int total) {
    return '$status · $awarded/$total 수여됨';
  }

  @override
  String meAttemptN(int n) {
    return '$n번째 시도';
  }

  @override
  String meSecondsAgo(int n) {
    return '$n초 전';
  }

  @override
  String meMinutesAgo(int n) {
    return '$n분 전';
  }

  @override
  String meHoursAgo(int n) {
    return '$n시간 전';
  }

  @override
  String meDaysAgo(int n) {
    return '$n일 전';
  }

  @override
  String get termShowKeyboard => '키보드 표시';

  @override
  String get termHideKeyboard => '키보드 숨기기';

  @override
  String get termCopySelection => '선택 항목 복사';

  @override
  String get pairingImBackHint => '두 번째 휴대폰이면 이름을 탭하세요(다시 옴).';

  @override
  String connP2pDetail(String detail) {
    return 'P2P ($detail)';
  }

  @override
  String get meConnRefused => '연결 거부 / 차단됨';

  @override
  String get meTimeout5s => '시간 초과(5초)';

  @override
  String timeMinutesShort(int n) {
    return '$n분';
  }

  @override
  String timeHoursShort(int n) {
    return '$n시간';
  }

  @override
  String timeDaysShort(int n) {
    return '$n일';
  }

  @override
  String get termCtrlSticky => 'Ctrl 수정 키(고정)';

  @override
  String get termCtrlLetter => 'Ctrl + 문자';

  @override
  String get connStateConnected => '연결됨';

  @override
  String get connStateConnecting => '연결 중…';

  @override
  String get connStateDisconnected => '연결 끊김';

  @override
  String get connStateError => '오류';

  @override
  String get chatsDefaultGroup => '그룹';

  @override
  String get chatsDefaultFamilyGroup => '가족 그룹';

  @override
  String chatsTerminalTitle(String name) {
    return '터미널: $name';
  }

  @override
  String get chatsExtAgent => '외부 에이전트';

  @override
  String browserBytesCount(int count) {
    return '$count바이트';
  }

  @override
  String get commonYouName => '나';

  @override
  String get settingsAiModelEnvoyLocalStandby =>
      'Envoy Local이 홈 노드의 활성 제공자입니다. 탭하여 Local을 관리하거나, 아래에 클라우드 제공자를 대기 상태로 저장하세요.';

  @override
  String get settingsEnvoyLocalIntro =>
      '홈 컴퓨터에서 llama.cpp를 제어합니다. 모델은 거기에서 다운로드됩니다 — 이 폰에는 절대 다운로드되지 않습니다.';

  @override
  String get settingsEnvoyLocalStatusHeading => '상태';

  @override
  String get settingsEnvoyLocalInUse => '사용 중';

  @override
  String get settingsEnvoyLocalNotInUse => '사용하지 않음';

  @override
  String get settingsEnvoyLocalStatusDownloading => '다운로드 중…';

  @override
  String get settingsEnvoyLocalStatusDetecting => '감지 중…';

  @override
  String get settingsEnvoyLocalStatusExtracting => '추출 중…';

  @override
  String get settingsEnvoyLocalStatusStarting => '시작 중…';

  @override
  String get settingsEnvoyLocalStatusReady => '준비됨';

  @override
  String get settingsEnvoyLocalStatusError => '오류';

  @override
  String get settingsEnvoyLocalStatusDisabled => '비활성';

  @override
  String get settingsEnvoyLocalIdleTimeout =>
      'Envoy Local 작업이 60분 후 시간 초과되었습니다. 다운로드가 100% 근처에서 멈추면 중국 미러 또는 VPN을 시도한 후 재시도하세요 — 부분 다운로드는 재개됩니다.';

  @override
  String settingsEnvoyLocalRuntime(String status) {
    return '런타임: $status';
  }

  @override
  String settingsEnvoyLocalRuntimeVersion(String version) {
    return '버전: $version';
  }

  @override
  String settingsEnvoyLocalAccel(String accel) {
    return '가속기: $accel';
  }

  @override
  String settingsEnvoyLocalHardware(String summary) {
    return '이 머신: $summary';
  }

  @override
  String settingsEnvoyLocalActiveModel(String model) {
    return '모델: $model';
  }

  @override
  String settingsEnvoyLocalProgressBytes(String received, String total) {
    return '$received / $total MB';
  }

  @override
  String settingsEnvoyLocalProgressReceived(String received) {
    return '$received MB 다운로드됨';
  }

  @override
  String settingsEnvoyLocalLastError(String error) {
    return '마지막 오류: $error';
  }

  @override
  String get settingsEnvoyLocalDownloadRegion => '모델 다운로드 리전';

  @override
  String get settingsEnvoyLocalDownloadRegionHint =>
      '다운로드가 실패하면 중국 미러 또는 Global용 VPN을 시도하세요.';

  @override
  String settingsEnvoyLocalDownloadRegionEffective(String region) {
    return '사용 중: $region';
  }

  @override
  String get settingsEnvoyLocalRegionAuto => '자동(시간대 / 로케일)';

  @override
  String get settingsEnvoyLocalRegionCn => '중국(ModelScope → hf-mirror)';

  @override
  String get settingsEnvoyLocalRegionGlobal => '전역(Hugging Face)';

  @override
  String get settingsEnvoyLocalEnable => '다운로드 및 활성화';

  @override
  String get settingsEnvoyLocalEnabling => '다운로드 중…';

  @override
  String get settingsEnvoyLocalStart => 'Envoy Local 시작';

  @override
  String get settingsEnvoyLocalStarting => '시작 중…';

  @override
  String get settingsEnvoyLocalStop => 'Envoy Local 중지';

  @override
  String get settingsEnvoyLocalRestart => '재시작';

  @override
  String get settingsEnvoyLocalCancelDownload => '다운로드 취소';

  @override
  String get settingsEnvoyLocalStopHint =>
      '중지하면 저장된 클라우드/Ollama 제공자로 어시스턴트가 돌아갑니다.';

  @override
  String get settingsEnvoyLocalRecommended => '추천';

  @override
  String get settingsEnvoyLocalRecommendedBadge => '추천';

  @override
  String get settingsEnvoyLocalDownload => '다운로드';

  @override
  String get settingsEnvoyLocalInstalled => '설치된 모델';

  @override
  String get settingsEnvoyLocalInstalledHint =>
      '홈 노드에 다운로드됨. 어떤 모델을 활성화할지 선택하세요.';

  @override
  String get settingsEnvoyLocalNoInstalled => '아직 설치된 모델이 없습니다.';

  @override
  String get settingsEnvoyLocalSetActive => '활성으로 설정';

  @override
  String get settingsEnvoyLocalActiveBadge => '활성';

  @override
  String get settingsEnvoyLocalInstalledBadge => '설치됨';

  @override
  String get settingsEnvoyLocalCatalog => '카탈로그';

  @override
  String settingsEnvoyLocalHfError(String error) {
    return 'Hugging Face 검색을 사용할 수 없음: $error';
  }

  @override
  String get settingsEnvoyLocalRefresh => '새로고침';

  @override
  String get settingsEnvoyLocalPhoneNote =>
      '고급 서버 매개변수(컨텍스트 크기, GPU 레이어)는 홈 노드 Social UI에 남아 있습니다.';
}
