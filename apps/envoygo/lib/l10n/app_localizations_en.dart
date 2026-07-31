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
  String get navChats => 'Chats';

  @override
  String get navInbox => 'Inbox';

  @override
  String get navContent => 'Content';

  @override
  String get navMe => 'Me';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonSave => 'Save';

  @override
  String get commonDelete => 'Delete';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonClose => 'Close';

  @override
  String get commonLoading => 'Loading…';

  @override
  String get commonError => 'Something went wrong';

  @override
  String get commonReconnect => 'Reconnect';

  @override
  String get commonSwitch => 'Switch';

  @override
  String get commonPair => 'Pair';

  @override
  String get commonUnpair => 'Unpair';

  @override
  String get commonCreate => 'Create';

  @override
  String get commonRename => 'Rename';

  @override
  String get languageTitle => 'Language';

  @override
  String get languageSubtitle => 'App language for menus and labels';

  @override
  String get languageSystem => 'System default';

  @override
  String get languageSystemDesc => 'Follow the device language';

  @override
  String get meConnectedNode => 'Connected Node';

  @override
  String get meNotConnected => 'Not connected';

  @override
  String get meNotConnectedHint => 'Pair with a home node to get started';

  @override
  String get meReconnect => 'Reconnect';

  @override
  String get meSwitch => 'Switch';

  @override
  String get meRepair => 'Re-pair';

  @override
  String get meReconnectNow => 'Reconnect now';

  @override
  String get meUnpair => 'Unpair';

  @override
  String get meBrowser => 'Browser';

  @override
  String get meBrowserHint =>
      'Open envoy:// pages — or use the Content tab for My Site';

  @override
  String get meAiEngine => 'AI Engine';

  @override
  String get meAiEngineHint => 'Bridge + OpenClaw toggles. Tap to configure.';

  @override
  String get meRecentTeamJobs => 'Recent team jobs';

  @override
  String get meRecentTeamJobsHint => 'Browse finished multi-agent jobs';

  @override
  String get meActiveTeamJobs => 'Active team jobs';

  @override
  String get meActiveTeamJobsHint => 'Watch running team jobs';

  @override
  String get mePairNewNode => 'Pair New Node';

  @override
  String get mePairNewNodeHint => 'Add another home node';

  @override
  String get meSettings => 'Settings';

  @override
  String get meAiModel => 'AI Model';

  @override
  String get mePiAgent => 'Pi Agent';

  @override
  String get mePiAgentHint => 'Local coding agent settings';

  @override
  String get meDarkMode => 'Dark mode';

  @override
  String get meDarkModeHint => 'Follow system setting';

  @override
  String get mePushNotifications => 'Push notifications';

  @override
  String get mePushNotificationsHint =>
      'Alerts when the app is in the background';

  @override
  String get meUnpairDevice => 'Unpair This Device';

  @override
  String get meUnpairDeviceHint => 'Disconnect and remove all data';

  @override
  String get meUnpairConfirmTitle => 'Unpair?';

  @override
  String get meUnpairConfirmBody =>
      'This removes the pairing and local chats for this home node on this device.';

  @override
  String get meUnpairedSnack => 'Unpaired. Local chats and data removed.';

  @override
  String meUnpairFailed(String error) {
    return 'Unpair failed: $error';
  }

  @override
  String get meEditProfile => 'Edit profile';

  @override
  String meProfileUpdateFailed(String error) {
    return 'Could not update profile: $error';
  }

  @override
  String get mePublicAccess => 'Public Access';

  @override
  String get mePort => 'Port';

  @override
  String get mePublicAccessSaved => 'Public access saved';

  @override
  String get meFamilyProfile => 'Family profile';

  @override
  String get meFamilyProfileHint => 'You are on this home as a family member';

  @override
  String get mePreferences => 'Preferences';

  @override
  String get meViewEditProfile => 'View & edit profile';

  @override
  String get meEditNameAvatar => 'Edit name & avatar';

  @override
  String get meDisplayName => 'Display name';

  @override
  String get meAvatarColor => 'Avatar color (hex)';

  @override
  String meMorePaired(int count) {
    return '+$count more paired';
  }

  @override
  String meSessionExpired(String name) {
    return 'Session expired for $name';
  }

  @override
  String meDisconnectedFrom(String name) {
    return 'Disconnected from $name';
  }

  @override
  String meUnpairConfirmBodyNamed(String name) {
    return 'This will disconnect and remove all local chats and data for $name.';
  }

  @override
  String get meTeamJobs => 'Team jobs';

  @override
  String get meAiModelHint =>
      'Provider used for the assistant on this home node';

  @override
  String get mePiAgentHintLong =>
      'Built-in local coding agent on the home node';

  @override
  String get mePushNotificationsHintLong =>
      'Get notified about new messages, contact requests, and approvals when the app is in the background.';

  @override
  String get meRecentTeamJobsHintLong =>
      'View job reports published on the home node';

  @override
  String get meActiveTeamJobsHintLong =>
      'Monitor in-progress team jobs on the home node';

  @override
  String get inboxTitle => 'Inbox';

  @override
  String get inboxEmpty => 'No notifications yet';

  @override
  String get inboxEmptyHint =>
      'Bond requests and feed updates will show up here';

  @override
  String get contentFeed => 'Feed';

  @override
  String get contentBlog => 'Blog';

  @override
  String get contentPeople => 'People';

  @override
  String get contentMyFiles => 'My Files';

  @override
  String get contentNewPost => 'New post';

  @override
  String get chatsTitle => 'Chats';

  @override
  String get chatsEmpty => 'No conversations yet';

  @override
  String get chatsEmptyHint => 'Pair with your home node to get started.';

  @override
  String get chatsSearchHint => 'Search chats…';

  @override
  String get pairingScanTitle => 'Scan QR';

  @override
  String get pairingConfirmTitle => 'Confirm pairing';

  @override
  String get pairingFamilyInvite => 'Family invite';

  @override
  String get pairingOwnerPair => 'Owner pairing';

  @override
  String get engagementLike => 'Like';

  @override
  String get engagementUnlike => 'Unlike';

  @override
  String get engagementComment => 'Comment';

  @override
  String get engagementRemoveComment => 'Remove comment?';

  @override
  String get engagementRemove => 'Remove';

  @override
  String get feedDelete => 'Delete';

  @override
  String get blogDelete => 'Delete';

  @override
  String get blogTitle => 'Blog';

  @override
  String get blogEmpty => 'No posts yet. Write your first blog post.';

  @override
  String get blogHint => 'Longer posts you publish on the mesh.';

  @override
  String get feedTitle => 'Feed';

  @override
  String get feedComposeTitle => 'New Feed post';

  @override
  String get commonBack => 'Back';

  @override
  String get commonAccept => 'Accept';

  @override
  String get commonDecline => 'Decline';

  @override
  String get commonDismiss => 'Dismiss';

  @override
  String get commonOpen => 'Open';

  @override
  String get commonRefresh => 'Refresh';

  @override
  String get commonEdit => 'Edit';

  @override
  String get commonPost => 'Post';

  @override
  String get commonPosting => 'Posting…';

  @override
  String get commonPublish => 'Publish';

  @override
  String get commonShare => 'Share';

  @override
  String get commonSend => 'Send';

  @override
  String get commonClear => 'Clear';

  @override
  String get commonInvite => 'Invite';

  @override
  String get commonJoin => 'Join';

  @override
  String get commonYou => 'You';

  @override
  String get commonUnknown => 'Unknown';

  @override
  String get commonCopied => 'Copied to clipboard';

  @override
  String get commonNotConnectedHome => 'Not connected to home node';

  @override
  String get commonSaving => 'Saving…';

  @override
  String get commonGenerating => 'Generating…';

  @override
  String get commonHide => 'Hide';

  @override
  String get commonAdd => 'Add';

  @override
  String get commonRemove => 'Remove';

  @override
  String get commonSearch => 'Search';

  @override
  String get connOffline => 'Offline';

  @override
  String get connDirect => 'Direct';

  @override
  String get connP2p => 'P2P';

  @override
  String get connRelay => 'Relay';

  @override
  String get connLanDirect => 'LAN (Direct)';

  @override
  String get connPublicDirect => 'Public IP (Direct)';

  @override
  String get connRelayWs => 'Relay WebSocket';

  @override
  String get connTooltipDirect => 'Direct connection';

  @override
  String get connTooltipConnecting => 'Connecting…';

  @override
  String get connTooltipOffline => 'Not connected';

  @override
  String get connTooltipError => 'Connection error';

  @override
  String get chatsSectionAi => 'AI';

  @override
  String get chatsSectionFamily => 'Family';

  @override
  String get chatsSectionContacts => 'Contacts';

  @override
  String get chatsSectionGroups => 'Groups';

  @override
  String get chatsSectionTerminals => 'Terminals';

  @override
  String get chatsFabNew => 'New';

  @override
  String get chatsCreateBot => 'Create Bot';

  @override
  String get chatsCreateBotHint => 'AI character on your home node';

  @override
  String get chatsNewPi => 'New Pi';

  @override
  String get chatsNewPiHint => 'Start a Pi coding terminal';

  @override
  String get chatsNewTerminal => 'New Terminal';

  @override
  String get chatsNewTerminalHint => 'Open a shell on the home node';

  @override
  String get chatsNewGroup => 'New Group Chat';

  @override
  String get chatsNewGroupHint => 'Mesh group with bonded contacts';

  @override
  String get chatsNewFamilyGroup => 'New Family Group';

  @override
  String get chatsNewFamilyGroupHint => 'Local group with family members';

  @override
  String get chatsDeleteBotTitle => 'Delete bot?';

  @override
  String chatsDeleteBotBody(String name) {
    return 'Remove “$name” from your home node? This cannot be undone.';
  }

  @override
  String get chatsBotOptions => 'Bot options';

  @override
  String get chatsEditBot => 'Edit Bot';

  @override
  String get chatsBotNameRequired => 'Bot name is required';

  @override
  String get chatsBotPromptRequired =>
      'Personality / System prompt is required';

  @override
  String get chatsBotName => 'Bot name';

  @override
  String get chatsBotNameHint => 'e.g. Luna the Librarian';

  @override
  String get chatsBotPrompt => 'Personality / System prompt';

  @override
  String get chatsBotPromptHint =>
      'Write as the character (“You are …”). Avoid “Luna is …” or “I am an AI…”. Reshaped on save.';

  @override
  String get chatsBotDesc => 'Short description (optional)';

  @override
  String get chatsBotDescHint =>
      'One short line for the chat list. Leave blank to auto-fill from the personality.';

  @override
  String get chatsAvatarColor => 'Avatar color';

  @override
  String get chatsShellHint => 'Shell (e.g. zsh, bash)';

  @override
  String get chatsCwdHint => 'Working directory (optional)';

  @override
  String get chatsPiTitle => 'Start Pi';

  @override
  String get chatsPiBody =>
      'Choose a project folder on the home computer to open the Pi coding terminal.';

  @override
  String get chatsPiFolder => 'Project folder';

  @override
  String get chatsPiFolderHint => '/Users/you/project';

  @override
  String get chatsPiFolderRequired => 'Enter a project folder path.';

  @override
  String get chatsGroupName => 'Group name';

  @override
  String get chatsNoFamilyMembers => 'No other family members yet.';

  @override
  String get chatVoiceCall => 'Voice call';

  @override
  String get chatPublishedContent => 'Published content';

  @override
  String get chatClearThread => 'Clear thread';

  @override
  String get chatClearThreadTitle => 'Clear thread?';

  @override
  String get chatClearThreadBody =>
      'All messages in this thread will be deleted.';

  @override
  String get chatDeleteMessageTitle => 'Delete message?';

  @override
  String get chatNoMessages => 'No messages yet';

  @override
  String get chatTypeMessage => 'Type a message…';

  @override
  String get chatRecordVoice => 'Record voice note';

  @override
  String get chatStopRecording => 'Stop recording';

  @override
  String get chatInviteToGroup => 'Invite to Group';

  @override
  String get chatNoContactsInvite => 'No contacts to invite.';

  @override
  String chatInvitedSnack(String name) {
    return '$name invited';
  }

  @override
  String get chatVoiceSendFailed => 'Failed to send voice note';

  @override
  String get chatMicDenied => 'Microphone permission denied';

  @override
  String get chatRecordFailed => 'Failed to start recording';

  @override
  String get chatCallFailed => 'Failed to start call';

  @override
  String get chatAiDisabled =>
      'AI model is disabled. Enable a model provider in Settings → AI.';

  @override
  String get chatAiDisabledFamily =>
      'AI is unavailable for this family profile.';

  @override
  String get inboxPublishedUpdates => 'Published updates';

  @override
  String get inboxPublishedEmpty =>
      'No publish notifications yet. When a bonded contact publishes web content, it will show up here.';

  @override
  String get inboxPendingIntros => 'Pending intros';

  @override
  String get inboxPendingEmpty => 'No pending introductions';

  @override
  String get inboxWantsToConnect => 'Wants to connect';

  @override
  String get pairingInvalidQr => 'Invalid pairing QR code';

  @override
  String get pairingPasteUri => 'Or paste pairing URI';

  @override
  String get pairingUriHint => 'envoy://pair?… or envoy://invite?…';

  @override
  String get pairingJoinFamily => 'Join Family';

  @override
  String pairingConnectTo(String name) {
    return 'Connect to $name?';
  }

  @override
  String pairingWelcomeFamily(String name) {
    return 'Welcome to the $name family!';
  }

  @override
  String get pairingImNew => 'I\'m new';

  @override
  String get pairingImBack => 'I\'m back';

  @override
  String get pairingDisplayNameOptional => 'Display name (optional)';

  @override
  String get pairingYourName => 'Your name';

  @override
  String get pairingAvatarColor => 'Avatar color';

  @override
  String get pairingOwnerNameHint =>
      'Shown as your owner profile name on this node';

  @override
  String get pairingCopyError => 'Copy error';

  @override
  String get pairingRetryMembers => 'Retry loading members';

  @override
  String get pairingWhoAreYou => 'Who are you?';

  @override
  String get pairingAlreadyOnHome => 'Already on this home';

  @override
  String get pairingSelectProfile => 'Select your profile';

  @override
  String get pairingNoMembersFirst =>
      'No family members yet — you will be the first.';

  @override
  String get pairingNoExistingProfiles =>
      'No existing family profiles yet. Switch to \"I\'m new\" to create one.';

  @override
  String get pairingNameRequired => 'Please enter your name';

  @override
  String get pairingSelectRequired => 'Please select your profile';

  @override
  String get pairingLanAvailable => 'LAN: available';

  @override
  String get pairingRelayAvailable => 'Relay: available';

  @override
  String pairingPeer(String peer) {
    return 'Peer: $peer';
  }

  @override
  String get pairingNameHintDad => 'e.g. Dad';

  @override
  String get pairingNameHintMom => 'e.g. Mom, Alex';

  @override
  String get pairingChooseUniqueName =>
      'Choose a name that is not already used below.';

  @override
  String get pairingSameNameHint =>
      'Use the same name you created on your first phone.';

  @override
  String get pairingTapIfSecondPhone =>
      'Tap a name if this is your second phone (I\'m back).';

  @override
  String get feedEmptyTitle => 'Your circle is quiet';

  @override
  String get feedEmptyHint =>
      'No posts yet. Share an update with your bonded contacts.';

  @override
  String get feedHint => 'Updates from you and bonded contacts.';

  @override
  String get feedDeleteTitle => 'Delete post?';

  @override
  String get feedDeleteBody => 'This cannot be undone.';

  @override
  String get blogPairHint =>
      'Pair with a home node to write and manage Blog posts.';

  @override
  String get blogConnectHint => 'Connect to a home node to manage Blog.';

  @override
  String get blogDeleteTitle => 'Delete post?';

  @override
  String blogDeleteBody(String title) {
    return 'Delete “$title”? This cannot be undone.';
  }

  @override
  String get feedWhatsOnMind => 'What\'s on your mind?';

  @override
  String get feedShareHint => 'Share an update with bonded contacts…';

  @override
  String get feedPhotos => 'Photos';

  @override
  String get feedVisibility => 'Visibility';

  @override
  String get feedVisBonded => 'Bonded contacts';

  @override
  String get feedVisSelected => 'Selected contacts';

  @override
  String get feedVisOnlyMe => 'Only me';

  @override
  String get feedNeedTextOrPhoto => 'Add text or at least one photo';

  @override
  String get feedNeedContact => 'Select at least one contact';

  @override
  String get feedSelectedHint =>
      'Only these contacts can see this post. Pick at least one.';

  @override
  String get feedNoContacts =>
      'No bonded contacts yet — add a contact first, or choose Bonded / Only me.';

  @override
  String get feedAiDraft => 'AI draft';

  @override
  String get feedDiscard => 'Discard';

  @override
  String get feedInsert => 'Insert';

  @override
  String get feedReplace => 'Replace';

  @override
  String get peoplePairHint =>
      'Pair with a home node to discover people on the mesh.';

  @override
  String get peopleConnectHint => 'Connect to a home node to discover people.';

  @override
  String get peopleHint =>
      'Find people you haven\'t bonded with — open their public profile or blog, then say hello.';

  @override
  String get peopleTopic => 'Topic';

  @override
  String get peopleInterest => 'Interest';

  @override
  String get peopleTopicHint => 'music, coding, travel…';

  @override
  String get peopleInterestHint => 'photography, cooking, travel…';

  @override
  String get peopleOnMesh => 'People on the mesh';

  @override
  String get peopleResults => 'Results';

  @override
  String get peopleEmpty => 'No people to show yet.';

  @override
  String get peopleProfile => 'Profile';

  @override
  String get peopleBlog => 'Blog';

  @override
  String get peopleSayHello => 'Say Hello';

  @override
  String get peopleHelloSent => 'Hello sent';

  @override
  String get peopleEnterSearch => 'Enter a topic or interest to search.';

  @override
  String get peopleNoMatches => 'No matches for that search.';

  @override
  String get peopleNoneFound => 'No public people found on the mesh yet.';

  @override
  String get peopleHelloMessage => 'Hi — I\'d like to connect on Envoy.';

  @override
  String get peopleOpenLink => 'Open link';

  @override
  String get filesPairHint => 'Pair with a home node to manage My Files.';

  @override
  String get filesConnectHint => 'Connect to a home node to manage files.';

  @override
  String get filesSearchHint => 'Search library';

  @override
  String get filesVaultHint =>
      'Vault library — chat attachments and profile photos stay in chat / Profile';

  @override
  String get filesEmpty => 'No library files yet.';

  @override
  String filesImported(String name) {
    return 'Imported $name';
  }

  @override
  String filesImportFailed(String error) {
    return 'Import failed: $error';
  }

  @override
  String filesPreviewFailed(String error) {
    return 'Preview failed: $error';
  }

  @override
  String get filesNoContactsShare => 'No bonded contacts to share with';

  @override
  String get filesShareWith => 'Share with…';

  @override
  String get filesShareSent => 'Share sent';

  @override
  String filesShareFailed(String error) {
    return 'Share failed: $error';
  }

  @override
  String get filesImport => 'Import';

  @override
  String filesPreviewUnavailable(String mime, int bytes) {
    return 'Preview not available for $mime ($bytes bytes).';
  }

  @override
  String publishedTitle(String name) {
    return 'Published content — $name';
  }

  @override
  String get publishedPhotoWall => 'PhotoWall';

  @override
  String get engagementCommentHint => 'Write a comment…';

  @override
  String get engagementRemoveCommentTooltip => 'Remove comment';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileMyTitle => 'My profile';

  @override
  String get profileUnnamed => 'Unnamed';

  @override
  String get profileRemovePhotoTitle => 'Remove photo?';

  @override
  String get profileNameRequired => 'Display name or username is required';

  @override
  String get profileSaved => 'Profile saved';

  @override
  String get profileUsername => 'Username';

  @override
  String get profileBio => 'Bio';

  @override
  String get profileBioHint => 'Add a short bio so contacts recognize you.';

  @override
  String get profilePhotos => 'Photos';

  @override
  String get profileNoPhotosYet => 'No photos yet — add one to your wall';

  @override
  String get profileNoPhotosShared => 'No photos shared';

  @override
  String get profileLongPressRemove => 'Long-press a photo to remove it';

  @override
  String get contactsSearchHint => 'Search contacts…';

  @override
  String get contactsEmpty => 'No contacts yet';

  @override
  String get contactsEmptyHint => 'Your bonded contacts will appear here.';

  @override
  String get contactsChat => 'Chat';

  @override
  String get callIncoming => 'Incoming voice call';

  @override
  String get callConnected => 'Connected';

  @override
  String get callConnecting => 'Connecting…';

  @override
  String get callDisconnected => 'Disconnected';

  @override
  String get authorPublish => 'Publish';

  @override
  String get authorType => 'Type';

  @override
  String get authorTypeProfile => 'Profile';

  @override
  String get authorTypePhoto => 'PhotoWall photo';

  @override
  String get authorTypeBlog => 'Blog post';

  @override
  String get authorVisPublic => 'Public';

  @override
  String get authorVisBonded => 'Bonded';

  @override
  String get authorVisPrivate => 'Private';

  @override
  String get authorCaption => 'Caption';

  @override
  String get authorCaptionOptional => 'Caption (optional)';

  @override
  String get authorBody => 'Body';

  @override
  String get authorBodyMarkdown => 'Body (markdown)';

  @override
  String get authorTitle => 'Title';

  @override
  String get authorTitleRequired => 'Title is required';

  @override
  String get authorPickPhoto => 'Pick a photo first';

  @override
  String get authorChooseAvatar => 'Choose avatar';

  @override
  String get authorChoosePhoto => 'Choose photo';

  @override
  String get aiDraftButton => 'Draft with AI';

  @override
  String get aiDraftEmphasize => 'What should it emphasize? (optional)';

  @override
  String get aiDraftEmphasizeHint => 'e.g. weekend hike with friends';

  @override
  String get aiDraftMode => 'Mode';

  @override
  String get aiDraftTone => 'Tone';

  @override
  String get aiDraftRewrite => 'Rewrite';

  @override
  String get aiDraftExpand => 'Expand';

  @override
  String get aiDraftShorten => 'Shorten';

  @override
  String get aiDraftGenerate => 'Generate';

  @override
  String get aiDraftNoModel => 'No AI model configured on the home node.';

  @override
  String get aiDraftEmpty => 'Empty draft from model';

  @override
  String get aiDraftBio => 'Draft bio';

  @override
  String get aiDraftBlog => 'Draft blog post';

  @override
  String get aiDraftFeed => 'Draft Feed update';

  @override
  String get aiDraftCaption => 'Draft caption';

  @override
  String get settingsAiModelIntro =>
      'Cloud model provider for the home-node assistant. Changes apply on the next assistant turn.';

  @override
  String settingsHomeUses(String mode) {
    return 'Home uses $mode';
  }

  @override
  String get settingsEndpoint => 'Endpoint:';

  @override
  String get settingsModelLabel => 'Model:';

  @override
  String get settingsEditOnSocial =>
      'Edit this provider on the home-node Social UI for advanced options.';

  @override
  String get settingsProvider => 'Provider';

  @override
  String get settingsEndpointUrl => 'Endpoint URL';

  @override
  String get settingsModel => 'Model';

  @override
  String get settingsCustomModel => 'Custom model name';

  @override
  String get settingsApiKey => 'API key';

  @override
  String get settingsApiKeySaved => 'A key is already saved on the home node';

  @override
  String get settingsAiModelSaved => 'AI model saved';

  @override
  String settingsSaveFailed(String error) {
    return 'Save failed: $error';
  }

  @override
  String get settingsDefault => '(default)';

  @override
  String get settingsAiEngineIntro =>
      'Choose which external agent the home node forwards assistant turns to.';

  @override
  String get settingsExternalAgent => 'External agent';

  @override
  String get settingsWebhookUrl => 'Webhook URL';

  @override
  String get settingsHowToStart => 'How to start';

  @override
  String get settingsBuiltIntoHome => 'Built into the home node';

  @override
  String get settingsNoExtProcess => 'No separate Ext Agent process required.';

  @override
  String get settingsBridgePort => 'Bridge listen port';

  @override
  String get settingsBridgeEnabled => 'Bridge enabled';

  @override
  String get settingsBridgeHint =>
      'Forward assistant turns to the selected external agent.';

  @override
  String get settingsOpenClawEnabled => 'OpenClaw enabled';

  @override
  String get settingsOpenClawHint =>
      'Built-in OpenClaw gateway (EnvoyAI) on next node start.';

  @override
  String get settingsOpenClawUnavailable => 'OpenClaw status unavailable';

  @override
  String settingsOpenClawStatus(String state) {
    return 'OpenClaw $state';
  }

  @override
  String settingsExtAgentStatus(String state) {
    return 'Ext Agent $state';
  }

  @override
  String get settingsEnabled => 'enabled';

  @override
  String get settingsDisabled => 'disabled';

  @override
  String get settingsAiEngineSaved => 'AI Engine saved';

  @override
  String get settingsNotConnectedNode => 'Not connected to a home node';

  @override
  String settingsPiState(String state) {
    return 'State: $state';
  }

  @override
  String get settingsPiBuiltIn => 'Built-in local coding agent';

  @override
  String get settingsPiLocalOnly => 'Local-only coding agent (no mesh tools).';

  @override
  String get settingsPiEnabled => 'Pi enabled';

  @override
  String get settingsPiOverrideHint =>
      'Model override (optional). Clear to inherit AI Model settings.';

  @override
  String get settingsPiModelName => 'Model name';

  @override
  String get settingsPiEndpoint => 'Endpoint';

  @override
  String get settingsPiLeaveBlankKey => 'Leave blank to keep the saved key';

  @override
  String get settingsPiSaveOverride => 'Save model override';

  @override
  String get settingsPiClearOverride => 'Clear override (inherit AI Model)';

  @override
  String get settingsPiModelSaved => 'Pi model saved';

  @override
  String get settingsPiModelRequired => 'Model name is required';

  @override
  String get settingsPiInherits => 'Pi inherits EnvoyMesh model settings';

  @override
  String settingsPiFailed(String error) {
    return 'Failed: $error';
  }

  @override
  String settingsPiClearFailed(String error) {
    return 'Clear failed: $error';
  }

  @override
  String settingsPiProviderCustom(String provider) {
    return '$provider (custom)';
  }

  @override
  String get aiEngineReadonlyHint =>
      'Both blocks are read-only on mobile. Configure on the home node (Settings → AI → AI Engine).';

  @override
  String get aiEngineBuiltInOpenClaw => 'Built-in OpenClaw';

  @override
  String get aiEngineExtBridge => 'External Agent Bridge';

  @override
  String get aiEngineModeBoth => 'Built-in + Ext';

  @override
  String get aiEngineModeBuiltIn => 'Built-in only';

  @override
  String get aiEngineModeExt => 'Ext only';

  @override
  String get aiEngineModeNone => 'None';

  @override
  String get aiEngineRunning => 'Running';

  @override
  String get aiEngineConfigured => 'Configured (not running)';

  @override
  String get aiEngineDisabled => 'Disabled';

  @override
  String get browserTitle => 'Browser';

  @override
  String get browserGo => 'Go';

  @override
  String get browserBack => 'Back';

  @override
  String get browserForward => 'Forward';

  @override
  String get browserReload => 'Reload';

  @override
  String get browserPairFirst =>
      'Not connected to home node — pair and reconnect first.';

  @override
  String get browserIntegrityFailed =>
      'Content integrity check failed — refused to render';

  @override
  String browserDecodeImageFailed(String error) {
    return 'Failed to decode image: $error';
  }

  @override
  String get browserPhoto => 'Photo';

  @override
  String get browserPhotos => 'Photos';

  @override
  String get browserNoPhotos => 'No photos yet.';

  @override
  String get browserHint =>
      'Enter an envoy:// URL to browse content served by a bonded contact.';

  @override
  String get extSwitchTitle => 'Switch Ext Agent';

  @override
  String extSwitchTooltip(String name) {
    return 'Switch Ext Agent ($name)';
  }

  @override
  String extNotRunningChat(String name) {
    return '$name is not running — start it before chatting.';
  }

  @override
  String extSwitchFailed(String error) {
    return 'Switch failed: $error';
  }

  @override
  String extNotRunning(String name) {
    return '$name is not running';
  }

  @override
  String get extChecking => 'Checking…';

  @override
  String get extCheckAgain => 'Check again';

  @override
  String get audioLoading => 'Loading audio…';

  @override
  String get audioUnavailable => 'Audio unavailable';

  @override
  String get audioVoiceNote => 'Voice note';

  @override
  String meLastAttempt(String time) {
    return 'Last attempt: $time';
  }

  @override
  String get meJustNow => 'just now';

  @override
  String get mePublicIpLabel => 'Public IP or domain';

  @override
  String get mePublicIpHint => 'e.g. 1.2.3.4 or mynode.example.com';

  @override
  String get mePublicIpHelp =>
      'Set this if your home node has a public IP or domain.\nEnables direct connection without the relay on 5G/WAN.';

  @override
  String get meNetworkDebug => 'Network Debug';

  @override
  String get meRunNetworkTests => 'Run Network Tests';

  @override
  String get meTesting => 'Testing…';

  @override
  String get meNetworkTestsHint => 'Tests all paths EnvoyGo uses for pairing.';

  @override
  String get meSwitchNode => 'Switch Node';

  @override
  String get chainsRecentTitle => 'Recent team jobs';

  @override
  String get chainsActiveTitle => 'Active team jobs';

  @override
  String get chainsLoadFailed => 'Failed to load chains';

  @override
  String get chainsNoReports => 'No reports yet';

  @override
  String get chainsEmptyHint =>
      'Team jobs you run on the home node will appear here.\nAuthor team jobs from the home node Social UI.';

  @override
  String get chainsNoActive =>
      'No active chains on the home node.\nStart one from the Social UI.';

  @override
  String get chainsReportGone => 'This report is no longer available';

  @override
  String get chainsReportGoneHint =>
      'It may have been removed by the 90-day GC policy.';

  @override
  String get chainsBackToRecent => 'Back to Recent team jobs';

  @override
  String get chainsLoadReportFailed => 'Failed to load report';

  @override
  String get chainsSummary => 'Summary';

  @override
  String get chainsWorkers => 'Workers';

  @override
  String get chainsSubtasks => 'Subtasks';

  @override
  String get chainsSynthesis => 'Synthesis';

  @override
  String get chainsDuration => 'Duration';

  @override
  String get chainsManageOnSocial =>
      'Manage chains on the home node Social UI.';

  @override
  String chainsPublished(String date) {
    return 'Published $date';
  }

  @override
  String chainsChainId(String id) {
    return 'Chain $id';
  }

  @override
  String get termNone => 'No terminal sessions';

  @override
  String termAttachFailed(String error) {
    return 'Terminal attach failed: $error';
  }

  @override
  String get termCopied => 'Copied to clipboard';

  @override
  String get termReconnecting => 'Reconnecting…';

  @override
  String get termCopyAll => 'Copy all output';

  @override
  String get termPaste => 'Paste';

  @override
  String get termCloseSession => 'Close session';

  @override
  String get chatImagePlaceholder => '[image]';

  @override
  String get chatsBotSyncing => 'Updates sync…';

  @override
  String get chatsBotSavedHint => 'Saved on your home node. Chat when ready.';

  @override
  String get chatsBotNotFound => 'Bot not found on home node';

  @override
  String get chatAiDisabledAskOwner =>
      'Ask the home owner to enable an AI model for family chat.';

  @override
  String pairingLoadProfilesFailed(String error) {
    return 'Could not load existing profiles: $error';
  }

  @override
  String pairingFailed(String error) {
    return 'Pairing failed: $error';
  }

  @override
  String get feedDefaultTitle => 'Feed post';

  @override
  String get aiDraftSection => 'Draft section';

  @override
  String aiDraftFailed(String reason) {
    return 'Could not draft ($reason)';
  }

  @override
  String authorAvatarNamed(String name) {
    return 'Avatar: $name';
  }

  @override
  String authorPhotoNamed(String name) {
    return 'Photo: $name';
  }

  @override
  String get peopleEnvoyUser => 'Envoy User';

  @override
  String get commonEllipsis => '…';

  @override
  String get browserCached => 'Cached';

  @override
  String get browserLoaded => 'Loaded';

  @override
  String get browserNotPublished => 'Not published yet';

  @override
  String get browserNotFound => 'Content not found';

  @override
  String get browserAccessDenied => 'Access denied';

  @override
  String browserPdfLoaded(int chars) {
    return 'PDF loaded ($chars base64 chars)';
  }

  @override
  String browserUnsupportedType(String mime) {
    return 'Unsupported type: $mime';
  }

  @override
  String get browserInterests => 'Interests';

  @override
  String get browserKnowledge => 'Knowledge';

  @override
  String get browserCapabilities => 'Capabilities';

  @override
  String get connTooltipP2p => 'P2P connection via relay hop';

  @override
  String get connTooltipRelay => 'Relay connection — home can dial you';

  @override
  String connTooltipConnectedVia(String transport) {
    return 'Connected via $transport';
  }

  @override
  String get connBootstrap => 'Bootstrap';

  @override
  String get settingsRunning => 'running';

  @override
  String get settingsNotRunning => 'not running';

  @override
  String get settingsModelIdHint => 'model-id';

  @override
  String get chainsSections => 'Sections';

  @override
  String get chainsWorkerAllocations => 'Worker allocations';

  @override
  String chainsAwardedSummary(String status, int awarded, int total) {
    return '$status · $awarded/$total awarded';
  }

  @override
  String meAttemptN(int n) {
    return 'attempt $n';
  }

  @override
  String meSecondsAgo(int n) {
    return '${n}s ago';
  }

  @override
  String meMinutesAgo(int n) {
    return '${n}m ago';
  }

  @override
  String meHoursAgo(int n) {
    return '${n}h ago';
  }

  @override
  String meDaysAgo(int n) {
    return '${n}d ago';
  }

  @override
  String get termShowKeyboard => 'Show keyboard';

  @override
  String get termHideKeyboard => 'Hide keyboard';

  @override
  String get termCopySelection => 'Copy selection';

  @override
  String get pairingImBackHint =>
      'Tap a name if this is your second phone (I\'m back).';

  @override
  String connP2pDetail(String detail) {
    return 'P2P ($detail)';
  }

  @override
  String get meConnRefused => 'connection refused / blocked';

  @override
  String get meTimeout5s => 'timeout (5s)';

  @override
  String timeMinutesShort(int n) {
    return '${n}m';
  }

  @override
  String timeHoursShort(int n) {
    return '${n}h';
  }

  @override
  String timeDaysShort(int n) {
    return '${n}d';
  }

  @override
  String get termCtrlSticky => 'Ctrl modifier (sticky)';

  @override
  String get termCtrlLetter => 'Ctrl + letter';

  @override
  String get connStateConnected => 'Connected';

  @override
  String get connStateConnecting => 'Connecting…';

  @override
  String get connStateDisconnected => 'Disconnected';

  @override
  String get connStateError => 'Error';

  @override
  String get chatsDefaultGroup => 'Group';

  @override
  String get chatsDefaultFamilyGroup => 'Family group';

  @override
  String chatsTerminalTitle(String name) {
    return 'Terminal: $name';
  }

  @override
  String get chatsExtAgent => 'Ext Agent';

  @override
  String browserBytesCount(int count) {
    return '$count bytes';
  }

  @override
  String get commonYouName => 'You';
}
