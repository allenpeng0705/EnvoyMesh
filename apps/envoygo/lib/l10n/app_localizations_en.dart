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
  String get navSocial => 'Social';

  @override
  String get navTerminal => 'Terminal';

  @override
  String get navKnowledge => 'Knowledge';

  @override
  String get navMe => 'Me';

  @override
  String get contentExplore => 'Explore';

  @override
  String get termEmptyHint =>
      'Start a Pi coding session or a shell terminal on your home node.';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonConfirm => 'Confirm';

  @override
  String get homeFolderDrives => 'Drives';

  @override
  String get homeFolderComputer => 'Computer';

  @override
  String get homeFolderHome => 'Home';

  @override
  String get homeFolderParent => '↑ Parent folder';

  @override
  String get homeFolderNoSubfolders => 'No subfolders';

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
  String get meEnvoyLocal => 'Envoy Local';

  @override
  String get meEnvoyLocalHint =>
      'Home-node local model (download & start on the computer)';

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
  String get meStartTeamJobHint => 'Preview a plan and launch on the home node';

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
  String get contentKnowledge => 'Knowledge';

  @override
  String get knowledgeTitle => 'Knowledge';

  @override
  String get knowledgeLede =>
      'Your vault knowledge base — notes under notes/ power EnvoyAI. Documents stay as originals.';

  @override
  String get knowledgePanelBrowse => 'Browse';

  @override
  String get knowledgePanelAsk => 'Ask';

  @override
  String get knowledgePanelPlugins => 'Plugins';

  @override
  String get knowledgePanelSetup => 'Setup';

  @override
  String get knowledgeAskHint =>
      'Answers use notes and documents on this node. Peers only see what you Publish.';

  @override
  String get knowledgeAskHeading => 'Ask your vault';

  @override
  String get knowledgeAskLabel => 'Question';

  @override
  String get knowledgeAskPlaceholder => 'What did I write about onboarding?';

  @override
  String get knowledgeAskSubmit => 'Ask';

  @override
  String get knowledgeAskBusy => 'Searching…';

  @override
  String get knowledgeAskAnswerHeading => 'Answer';

  @override
  String get knowledgeAskEmptyAnswer =>
      'No answer returned. Check Setup → enable vault knowledge and rebuild the index.';

  @override
  String get knowledgeAskContinueEnvoyAi => 'Open in EnvoyAI';

  @override
  String get knowledgeAskEnvoyAiHint =>
      'For multi-turn chat with tools, continue in EnvoyAI.';

  @override
  String get knowledgeLibraryHeading => 'Your files';

  @override
  String get knowledgeLibraryCaption =>
      'Notes, documents, and what you’ve published.';

  @override
  String get knowledgeEmbedGateTitleNeeded => 'Embedding model required';

  @override
  String get knowledgeEmbedGateTitleDownloading =>
      'Downloading embedding model…';

  @override
  String get knowledgeEmbedGateTitleError => 'Embedding setup failed';

  @override
  String get knowledgeEmbedGateBodyNeeded =>
      'Vault Ask needs a local embedding model on your home node. Browse works without it. Download starts automatically when the app launches — you can also start or retry from Setup.';

  @override
  String get knowledgeEmbedGateBodyDownloading =>
      'Download is running on your home node (started with the app). You can leave this screen; Ask unlocks when the embedder is ready.';

  @override
  String get knowledgeEmbedGateBodyError =>
      'The embedding runtime or model could not be installed on the home node. Retry the download, or fix Setup on the desktop app. Browse still works.';

  @override
  String get knowledgeEmbedGateDownload => 'Download on home';

  @override
  String get knowledgeEmbedGateDownloading => 'Downloading…';

  @override
  String get knowledgeEmbedGateRetry => 'Retry download';

  @override
  String get knowledgeEmbedGateOpenSetup => 'Open Setup';

  @override
  String get knowledgeEmbedGateBackgroundHint =>
      'Safe to keep using other parts of the app while this finishes.';

  @override
  String get knowledgeEmbedGateStripNeeded =>
      'Ask needs an embedding model on home — Browse still works';

  @override
  String get knowledgeEmbedGateStripDownloading =>
      'Embedding model downloading on home — Ask waits; Browse works';

  @override
  String get knowledgeEmbedGateStripError =>
      'Embedding setup failed on home — retry in Setup. Browse still works';

  @override
  String get knowledgeEmbedGateDownloadStarted =>
      'Embedding download started on home';

  @override
  String get knowledgeEmbedGateBlockedToast =>
      'Finish embedding setup before asking the vault.';

  @override
  String get knowledgeEmbedGatePhaseDetecting => 'Detecting platform…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingRuntime =>
      'Downloading llama.cpp runtime…';

  @override
  String get knowledgeEmbedGatePhaseExtracting => 'Extracting runtime…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingModel =>
      'Downloading embedding model…';

  @override
  String get knowledgeEmbedGatePhaseStarting => 'Starting embedder…';

  @override
  String get knowledgeEmbedGatePhaseDownloading => 'Downloading…';

  @override
  String get knowledgeEmbedGateStepsAria => 'Embedding install steps';

  @override
  String get knowledgePluginsLede =>
      'Optional connectors. Notion needs an MCP URL — not the Notion app.';

  @override
  String get knowledgePluginsObsidianTitle => 'Obsidian';

  @override
  String get knowledgePluginsObsidianDesc =>
      'Enrich vault notes. Desktop app optional.';

  @override
  String get knowledgePluginsNotionTitle => 'Notion (via MCP)';

  @override
  String get knowledgePluginsNotionDesc =>
      'Browse and search via MCP. Soft-fails without a URL.';

  @override
  String get knowledgePluginsMcpUrl => 'MCP server URL';

  @override
  String get knowledgePluginsMcpTool => 'Search tool name';

  @override
  String get knowledgePluginsSyncNow => 'Sync now';

  @override
  String get knowledgePluginsLinkedVaultLabel =>
      'Linked Obsidian vault path(s)';

  @override
  String get knowledgePluginsLinkedVaultHint => '/path/to/ObsidianVault';

  @override
  String get knowledgePluginsLinkedVaultEmpty => 'No linked vaults yet.';

  @override
  String get knowledgePluginsLinkedVaultRemove => 'Remove';

  @override
  String get knowledgePluginsLinkedVaultAdd => 'Add vault folder…';

  @override
  String get knowledgePluginsLinkedVaultPickTitle =>
      'Choose Obsidian vault folder';

  @override
  String get knowledgePluginsLinkedVaultHelper =>
      'Vaults from Obsidian on this home computer are linked automatically. Remove a row to unlink (it will not auto-link again). Add vault folder… for more.';

  @override
  String get knowledgePluginsOpenObsidian => 'Open Obsidian';

  @override
  String get knowledgePluginsOpenNotion => 'Open Notion';

  @override
  String get knowledgePluginsOpeningApp => 'Opening…';

  @override
  String get knowledgePluginsOpenAppFailed =>
      'Could not open the app on this computer.';

  @override
  String get knowledgePluginsOpenedWebsite =>
      'App not installed locally — opened the official website on the home computer.';

  @override
  String get knowledgePluginsDownloadObsidian => 'Download Obsidian';

  @override
  String get knowledgePluginsDownloadNotion => 'Download Notion';

  @override
  String get knowledgePluginsLinkedVaultAutoOne =>
      'Linked Obsidian vault found on this computer.';

  @override
  String knowledgePluginsLinkedVaultAutoMany(int count) {
    return 'Linked $count Obsidian vaults found on this computer.';
  }

  @override
  String get knowledgeHubImportObsidianAll => 'Import all linked';

  @override
  String get knowledgeHubImportNotionVisible => 'Import visible cards';

  @override
  String get knowledgeHubExportToObsidian => 'Export to Obsidian';

  @override
  String get knowledgeHubExportToNotion => 'Export to Notion/MCP';

  @override
  String knowledgeHubImportObsidianOk(int count) {
    return 'Imported $count Obsidian note(s)';
  }

  @override
  String knowledgeHubImportNotionOk(int count) {
    return 'Imported $count Notion/MCP note(s)';
  }

  @override
  String knowledgeHubExportObsidianOk(int count) {
    return 'Exported $count note(s) to Obsidian';
  }

  @override
  String knowledgeHubExportNotionOk(int count) {
    return 'Exported $count note(s) via MCP';
  }

  @override
  String get knowledgeHubImportFailed => 'Import failed';

  @override
  String get knowledgeHubExportFailed => 'Export failed';

  @override
  String get knowledgeHubImportMcpEmpty =>
      'No live MCP cards to import — refresh Browse';

  @override
  String get knowledgeHubExportEmpty => 'No vault Markdown notes to export';

  @override
  String get knowledgeHubShareVaultOnly =>
      'Share works for vault files only — import first';

  @override
  String knowledgeHubMcpListError(String error) {
    return 'MCP list: $error';
  }

  @override
  String get knowledgeSetupHint =>
      'Index status and retrieval. Chat models stay in Me → AI Model.';

  @override
  String get knowledgeSetupEmbeddingHint =>
      'Embeddings use Envoy Local on this device. For OpenAI or Ollama, open Settings → AI on your home computer.';

  @override
  String get knowledgeSetupEnabled => 'Enable vault knowledge';

  @override
  String get knowledgeSetupStatusHint =>
      'Tap Rebuild to refresh the vector index.';

  @override
  String get knowledgeSetupReindex => 'Rebuild index';

  @override
  String get knowledgeSetupReindexDone => 'Reindex started';

  @override
  String get knowledgeSetupReindexConfirm =>
      'Rebuild the vault vector index on the home node?';

  @override
  String get knowledgeSetupTestEmbedding => 'Test embedding';

  @override
  String get knowledgeSetupTestEmbeddingBusy => 'Testing…';

  @override
  String knowledgeSetupTestEmbeddingOk(int dimensions, int latencyMs) {
    return 'Embedding OK — $dimensions dims in $latencyMs ms';
  }

  @override
  String knowledgeSetupTestEmbeddingFail(String error) {
    return 'Embedding failed: $error';
  }

  @override
  String get knowledgeSetupRagMode => 'Retrieval mode';

  @override
  String get knowledgeSetupRagHybrid => 'Hybrid';

  @override
  String get knowledgeSetupRagVector => 'Vector';

  @override
  String get knowledgeSetupRagLexical => 'Lexical';

  @override
  String get knowledgeSetupSnippetLimit => 'Vault snippets per answer';

  @override
  String knowledgeBrowseIndexIndexingProgress(int processed, int total) {
    return 'Indexing $processed/$total…';
  }

  @override
  String get knowledgeHubOpenPlugins => 'Open Plugins';

  @override
  String get knowledgeNoteNewTitle => 'New note';

  @override
  String get knowledgeNoteEditTitle => 'Edit note';

  @override
  String get knowledgeNoteFilename => 'Filename';

  @override
  String get knowledgeNoteFilenameRequired => 'Enter a note filename';

  @override
  String get knowledgeNoteContent => 'Markdown';

  @override
  String get knowledgeNoteSensitivity => 'Visibility';

  @override
  String get knowledgeNotePrivate => 'Private';

  @override
  String get knowledgeNoteFriends => 'Friends';

  @override
  String get knowledgeNotePublished => 'Published';

  @override
  String get knowledgeNoteAlsoBlog => 'Also publish as blog';

  @override
  String get knowledgeFilePreview => 'Preview';

  @override
  String get knowledgeFileOpenOnHome => 'Open on home';

  @override
  String get knowledgeFileOpenedOnHome => 'Opened on the home computer';

  @override
  String get knowledgeFilePublish => 'Publish';

  @override
  String get knowledgeFileMakePrivate => 'Make private';

  @override
  String get knowledgeBrowseImportAndPublish => 'Import and publish';

  @override
  String get knowledgeBrowsePublishImportOnly =>
      'Import this note into the vault first, then you can publish it.';

  @override
  String get knowledgeBrowsePublishImportNoDoc =>
      'Imported, but could not publish yet — try Publish again from the imported note.';

  @override
  String get knowledgeBrowseImportedAndPublished => 'Imported and published';

  @override
  String get knowledgeBrowsePublishImportHint =>
      'Import into vault and publish for mesh discovery';

  @override
  String get knowledgeFileMore => 'More actions';

  @override
  String get knowledgeFileConvert => 'Convert to Markdown note';

  @override
  String knowledgeFileConvertOk(String path) {
    return 'Saved Markdown note $path';
  }

  @override
  String get knowledgeFileConvertFailed => 'Could not convert to Markdown';

  @override
  String get knowledgeFileDeleteTitle => 'Delete file?';

  @override
  String knowledgeFileDeleteBody(String title) {
    return 'Delete “$title” from the home vault?';
  }

  @override
  String get knowledgeFileDeleteConfirm => 'Delete';

  @override
  String get meKnowledge => 'Knowledge setup';

  @override
  String get meKnowledgeHint => 'Index and retrieval for vault Ask';

  @override
  String get meKnowledgePlugins => 'Knowledge plugins';

  @override
  String get meKnowledgePluginsHint => 'Obsidian link and Notion/MCP';

  @override
  String get knowledgeBrowseFilterAll => 'All';

  @override
  String get knowledgeBrowseFiltersLabel => 'SHOW';

  @override
  String get knowledgeBrowseFilterNotes => 'Notes';

  @override
  String get knowledgeBrowseFilterObsidian => 'Obsidian';

  @override
  String get knowledgeBrowseFilterNotion => 'Notion';

  @override
  String get knowledgeBrowseFilterBlog => 'Blog';

  @override
  String get knowledgeBrowseFilterDocuments => 'Documents';

  @override
  String get knowledgeBrowseFilterPublished => 'Published';

  @override
  String knowledgeBrowseIndexReady(int count) {
    return '$count indexed';
  }

  @override
  String knowledgeBrowseIndexReadyLinked(int count, int linked) {
    return '$count indexed · $linked linked Obsidian';
  }

  @override
  String get knowledgeBrowseIndexIndexing => 'Indexing…';

  @override
  String get knowledgeBrowseIndexEmpty => 'Index empty';

  @override
  String get knowledgeBrowseIndexChipHint =>
      'Open Knowledge → Setup to manage the index.';

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
  String get chatsSectionCoding => 'Coding';

  @override
  String get chatsCodingPi => 'Pi';

  @override
  String get chatsCodingPiHint => 'Coding Agent (terminal)';

  @override
  String get chatsCodingEh => 'Envoy';

  @override
  String get chatsCodingEhHint => 'Coding Agent (chat)';

  @override
  String get chatsEhNew => 'New coding chat';

  @override
  String get chatsEhRemoveTitle => 'Remove coding chat?';

  @override
  String chatsEhRemoveBody(String name) {
    return 'Remove “$name” from your Coding list? The chat history on the home node will be deleted.';
  }

  @override
  String get chatsEhThinking => 'Envoy is thinking…';

  @override
  String get chatsEhPromptHint => 'Ask Envoy to code, refactor, or explain…';

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
  String get chatsNewEnvoy => 'New Envoy';

  @override
  String get chatsNewEnvoyHint => 'Start Envoy Harness TUI';

  @override
  String get ehChooseProjectTitle => 'Choose Envoy project folder';

  @override
  String get ehChangeProjectTitle => 'Change Envoy project folder';

  @override
  String get ehChooseProjectDesc =>
      'Envoy runs in this folder (reads AGENTS.md, edits files, runs shell).';

  @override
  String get ehStartWithProject => 'Start';

  @override
  String get ehRestartWithProject => 'Restart Envoy here';

  @override
  String get ehEnsuringTerminal => 'Starting Envoy TUI…';

  @override
  String get ehPermissionTitle => 'Tool permission';

  @override
  String get ehPermissionAllow => 'Allow';

  @override
  String get ehPermissionDeny => 'Deny';

  @override
  String get ehQuestionTitle => 'Envoy needs your input';

  @override
  String get ehRecommended => 'Recommended';

  @override
  String get ehSlashWhileBusy => 'Finish or /cancel the current turn first.';

  @override
  String get ehChatReset => 'Started a new chat for this project.';

  @override
  String get ehTurnCancelled => 'Turn cancelled.';

  @override
  String get ehStatusRefreshed => 'Status refreshed.';

  @override
  String get ehNoPeers => 'No peer cluster configured.';

  @override
  String get ehSearchUsage =>
      'Usage: /search <term> — search this conversation.';

  @override
  String ehSearchNoMatches(String term) {
    return 'No matches for “$term”.';
  }

  @override
  String ehModelShow(String model) {
    return 'Active model: $model';
  }

  @override
  String get ehModelUnknown =>
      'No model configured — set one in Settings → AI.';

  @override
  String ehProjectCurrent(String path) {
    return 'Project folder: $path';
  }

  @override
  String get ehProjectUnset => 'No project folder set — use /cd <path>.';

  @override
  String ehProjectSet(String path) {
    return 'Project folder → $path';
  }

  @override
  String get ehProjectSetUnknown => 'Project folder updated.';

  @override
  String ehProjectSetFailed(String error) {
    return 'Failed to set project folder: $error';
  }

  @override
  String get ehConfigureModel => 'Configure a model in Settings → AI.';

  @override
  String get ehNotReady => 'envoy-harness is not ready.';

  @override
  String get termQuickHelp => '/help';

  @override
  String get termQuickCancel => '/cancel';

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
  String get chatVideoCall => 'Video call';

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
  String get chatAiManual => 'Manual';

  @override
  String get chatAiAssistant => 'Assistant';

  @override
  String get chatAiAuto => 'Auto';

  @override
  String get chatAiManualTooltip => 'Manual: type yourself';

  @override
  String get chatAiAssistantTooltip => 'Assistant: AI suggests drafts';

  @override
  String get chatAiAutoTooltip => 'Auto-reply: AI responds automatically';

  @override
  String get chatAgentMode => 'Agent';

  @override
  String get chatAgentModeOffTooltip =>
      'Agent Mode off — Assist uses public knowledge only';

  @override
  String get chatAgentModeOnTooltip =>
      'Agent Mode on — OpenClaw may use home files, private knowledge, and tools';

  @override
  String get chatAgentModeConfirmTitle => 'Enable Agent Mode for this chat?';

  @override
  String get chatAgentModeConfirmBody =>
      'Agent Mode uses EnvoyAI/OpenClaw and can read local files, private knowledge, and run tools on your home node. Only enable for contacts you fully trust.';

  @override
  String get chatAgentModeConfirmEnable => 'Enable Agent Mode';

  @override
  String get chatSuggestedReply => 'Suggested reply';

  @override
  String get chatSuggestedReplyUse => 'Use';

  @override
  String get chatSuggestedReplyDismiss => 'Dismiss';

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
  String get chatVoiceSending => 'Sending voice note…';

  @override
  String get chatVoiceSent => 'Voice note sent';

  @override
  String get chatVoiceRecording => 'Recording';

  @override
  String get chatVoiceReady => 'Ready to send';

  @override
  String get chatVoiceCancel => 'Cancel';

  @override
  String get chatVoiceSend => 'Send';

  @override
  String get chatVoiceSendHint => 'Tap Send when done · Cancel to discard';

  @override
  String get chatVoiceReadyHint =>
      'Send failed · Tap Send to retry · Cancel to discard';

  @override
  String get chatVoiceSendFailed => 'Failed to send voice note';

  @override
  String get chatSentFile => 'Sent a file';

  @override
  String get chatSentVoice => 'Sent a voice message';

  @override
  String get chatDeliverySent => 'Sent';

  @override
  String get chatDeliveryDelivered => 'Delivered';

  @override
  String get chatDeliveryFailed => 'Not delivered';

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
  String get pairingNeedHomeHint =>
      'Setting up your own home? Install EnvoyMesh on a Mac or Windows PC first, then scan its QR. Joining family? Scan their invite — no PC install needed.';

  @override
  String get pairingDownloadEnvoyMesh => 'EnvoyMesh desktop downloads';

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
  String get publishedPhotoWall => 'Photo';

  @override
  String get publishedFeed => 'Feed';

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
  String get callSwitchCamera => 'Switch camera';

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
  String get settingsAiModelTestChat => 'Test chat model';

  @override
  String get settingsAiModelTestChatBusy => 'Testing…';

  @override
  String settingsAiModelTestChatOk(String modelName, int latencyMs) {
    return 'Chat model OK — $modelName in $latencyMs ms';
  }

  @override
  String settingsAiModelTestChatFail(String error) {
    return 'Chat model failed: $error';
  }

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
  String get settingsPiCodingBackend => 'Coding backend';

  @override
  String get settingsPiCodingBackendPi => 'Pi (sidecar)';

  @override
  String get settingsPiCodingBackendEh => 'envoy-harness (ACP)';

  @override
  String get settingsPiCodingBackendHint =>
      'Same setting as Social. Routes sendToPi and approvals through the same Pi UI. Older EnvoyGo builds without this control still work when switched from Social.';

  @override
  String get settingsPiCodingBackendSaved => 'Coding backend updated';

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
      'Team jobs you run on the home node will appear here.\nStart one from this phone or from the home Social UI.';

  @override
  String get chainsNoActive =>
      'No active team jobs on the home node.\nStart one with the button below.';

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
      'Fleet setup, bidding, and recipes stay on the home-node Social UI. Cancel, rebalance, and pin work here too.';

  @override
  String get chainsStartTitle => 'Start team job';

  @override
  String get chainsStartFab => 'New team job';

  @override
  String get chainsStartIntro =>
      'Describe a goal. The home node plans subtasks and assigns bonded Agent Network workers.';

  @override
  String get chainsStartAssignmentMode => 'Assignment mode';

  @override
  String get chainsStartModeSkill => 'By skill';

  @override
  String get chainsStartModeRole => 'By role';

  @override
  String get chainsStartModeSkillHint =>
      'Workers are ranked by matching skills.';

  @override
  String get chainsStartModeRoleHint =>
      'Each step prefers a collaboration role (PM, programmer, …).';

  @override
  String get chainsStartGoalLabel => 'Goal';

  @override
  String get chainsStartGoalHint => 'What should the team accomplish?';

  @override
  String chainsStartGoalTooShort(int min) {
    return 'Goal must be at least $min characters';
  }

  @override
  String get chainsStartAttachmentsLabel => 'Attachments';

  @override
  String get chainsStartAttachmentsAdd => 'Add files';

  @override
  String get chainsStartAttachmentsHint =>
      'Tip: add a short label per file (e.g. brief), then mention [brief] in your goal so workers know which file to use — even when the filename is long or unclear.';

  @override
  String chainsStartAttachmentsMax(int max) {
    return 'You can attach up to $max files';
  }

  @override
  String chainsStartAttachmentTooLarge(String name, int maxMb) {
    return '$name is too large (max $maxMb MB)';
  }

  @override
  String get chainsStartAttachmentUploading => 'Uploading…';

  @override
  String get chainsStartAttachmentFailed => 'Upload failed';

  @override
  String get chainsStartAttachmentLabel => 'Label';

  @override
  String get chainsStartAttachmentLabelHint => 'e.g. brief, sales data';

  @override
  String get chainsStartAttachmentRemove => 'Remove attachment';

  @override
  String get chainsStartPreview => 'Preview plan';

  @override
  String get chainsStartPreviewing => 'Planning…';

  @override
  String get chainsStartPreviewFailed => 'Could not build a plan';

  @override
  String get chainsStartNeedPreview => 'Preview a plan before starting';

  @override
  String get chainsStartPlanHeading => 'Plan';

  @override
  String get chainsStartNoSubtasks => 'No subtasks in this plan.';

  @override
  String get chainsStartConfirm => 'Start team job';

  @override
  String get chainsStartStarting => 'Starting…';

  @override
  String get chainsStartStarted => 'Team job started';

  @override
  String get chainsStartFailed => 'Could not start the team job';

  @override
  String get chainsStartNoWorkers =>
      'No reachable Agent Network workers. Bond contacts with agents on the home node first.';

  @override
  String get chainsStartReadinessTitle => 'Get workers ready';

  @override
  String get chainsStartReadinessJoinOff =>
      'On the home computer: Team jobs → Manage workers → turn on Join Agent Network.';

  @override
  String get chainsStartReadinessBond =>
      'Bond contacts in Discover (Social or this phone), then ask them to Join Agent Network.';

  @override
  String get chainsStartReadinessRefresh =>
      'On Social Team jobs, open Manage workers and refresh cards, then preview again here.';

  @override
  String get chainsStepsTitle => 'Job steps';

  @override
  String get chainsStepsWaitingOn => 'Waiting on:';

  @override
  String get chainsAttachmentHonesty =>
      'Files you attach live on this home’s vault. When a worker is assigned, they receive a copy of those inputs under their Team job workspace — not a standing mirror of your Library.';

  @override
  String get chainsDeliveryTitle => 'Input delivery';

  @override
  String get chainsDeliveryRetry => 'Retry';

  @override
  String get chainsDeliveryRetried => 'Input delivery retried';

  @override
  String get chainsDeliveryRetryFailed => 'Could not retry input delivery';

  @override
  String get chainsDeliveryPhasePending => 'Pending';

  @override
  String get chainsDeliveryPhaseTransferring => 'Transferring';

  @override
  String get chainsDeliveryPhaseVerified => 'Delivered';

  @override
  String get chainsDeliveryPhaseFailed => 'Failed';

  @override
  String get chainsInputDeliveryScope => 'Input delivery';

  @override
  String get chainsInputDeliveryScopeReferenced => 'Referenced only';

  @override
  String get chainsInputDeliveryScopeAll => 'All attachments';

  @override
  String get chainsInputDeliveryScopeHint =>
      'Referenced (default) sends files mentioned as [label] in a step; if none match, all job attachments are sent. All sends every attachment to each awarded worker.';

  @override
  String get chainsIterationAskOwnerTitle => 'Review draft before publish';

  @override
  String get chainsIterationAskOwnerBody =>
      'Accept to publish, or continue for another refinement round.';

  @override
  String get chainsIterationAcceptDraft => 'Accept & publish';

  @override
  String get chainsIterationContinue => 'Continue refining';

  @override
  String get chainsIterationAccepted => 'Draft accepted — publishing';

  @override
  String get chainsIterationContinued => 'Starting another refinement round';

  @override
  String get chainsIterationResolveFailed => 'Could not apply your decision';

  @override
  String get chainsObservedTitle => 'Jobs you’re on';

  @override
  String get chainsObservedHint =>
      'View only — only the Assigner can manage these jobs.';

  @override
  String get chainsObservedReadOnly => 'View only';

  @override
  String get chainsStartNeedWorkers =>
      'Select at least one online worker, or preview again to restore the recommended pool.';

  @override
  String get chainsStartWorkersHint =>
      'Online workers from the plan. Uncheck any you do not want. Unchecking everyone blocks Start — preview again to reset to the recommended pool.';

  @override
  String get chainsStartWorkersHeading => 'Workers';

  @override
  String get chainsStartNoSuggestedWorkers =>
      'No suggested workers yet — Start will use the home node’s discovery pool.';

  @override
  String chainsStartWorkerMatches(int count) {
    return 'matches $count steps';
  }

  @override
  String get chainsStartWorkerOnline => 'Online';

  @override
  String get chainsStartWorkerRelay => 'Online (relay)';

  @override
  String get chainsStartWorkerOffline => 'Offline / unknown';

  @override
  String get chainsActiveGone => 'This team job is no longer active';

  @override
  String chainsBudgetLine(String spent, String max) {
    return 'Budget $spent / $max USD';
  }

  @override
  String get chainsBudgetWarn => 'Budget warning — consider adding budget.';

  @override
  String get chainsBudgetExceeded =>
      'Budget exceeded — the job may stall until rebalanced.';

  @override
  String chainsPartialCount(int count) {
    return '$count partial results';
  }

  @override
  String get chainsCancelTitle => 'Cancel team job?';

  @override
  String get chainsCancelBody =>
      'Workers will be told to stop. Partial results already collected are kept.';

  @override
  String get chainsCancelConfirm => 'Cancel job';

  @override
  String get chainsCancelDone => 'Team job cancelled';

  @override
  String get chainsCancelReason => 'Cancelled from EnvoyGo';

  @override
  String get chainsCancelStep => 'Cancel step';

  @override
  String get chainsCancelStepTitle => 'Cancel this step?';

  @override
  String get chainsCancelStepBody =>
      'This step and any steps that depend on it will stop. Partial results already collected are kept.';

  @override
  String get chainsCancelStepFailed => 'Could not cancel this step';

  @override
  String get chainsReassignStep => 'Reassign';

  @override
  String get chainsStepCancelled => 'Step cancelled';

  @override
  String get chainsStepReassigned => 'Step reassigned';

  @override
  String get chainsReassignFailed => 'Could not reassign this step';

  @override
  String get chainsCancelStepReason => 'Cancelled step from EnvoyGo';

  @override
  String get chainsDetailCancelled => 'This job was cancelled.';

  @override
  String get chainsDetailPublished =>
      'This job finished and published a report.';

  @override
  String get chainsRebalanceHeading => 'Add budget';

  @override
  String get chainsRebalanceHint =>
      'Raise the cost ceiling and retry un-awarded steps.';

  @override
  String get chainsRebalanceAmount => 'Additional USD';

  @override
  String get chainsRebalanceAction => 'Add & retry';

  @override
  String get chainsRebalanceInvalidAmount => 'Enter a positive dollar amount';

  @override
  String get chainsRebalanceDone => 'Budget updated';

  @override
  String get chainsRebalanceFailed => 'Could not rebalance';

  @override
  String get chainsPin => 'Pin report';

  @override
  String get chainsUnpin => 'Unpin report';

  @override
  String get chainsPinDone => 'Report pinned (kept past 90-day cleanup)';

  @override
  String get chainsUnpinDone => 'Report unpinned';

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
  String get pairingInviteAlreadyUsed =>
      'This invite QR was already used. Ask the home owner to open Family → Show invite QR again, then scan the new code and choose I\'m back to select your profile (e.g. Dad).';

  @override
  String get pairingInProgressTitle => 'Pairing with home';

  @override
  String pairingInProgressSubtitle(String owner) {
    return 'Connecting to $owner';
  }

  @override
  String pairingElapsed(String time) {
    return 'Elapsed: $time';
  }

  @override
  String pairingHomeNodeLabel(String peer) {
    return 'Home: $peer';
  }

  @override
  String get pairingStageInitial => 'Initializing';

  @override
  String get pairingStageInitialHint =>
      'Setting up a secure channel to the home node.';

  @override
  String get pairingStageConnecting => 'Reaching home';

  @override
  String get pairingStageConnectingHint =>
      'Looking for the home on your local network and via relay.';

  @override
  String get pairingStageHandshaking => 'Handshaking';

  @override
  String get pairingStageHandshakingHint =>
      'Exchanging keys — this step can take a moment on first connect.';

  @override
  String get pairingStageVerifying => 'Verifying';

  @override
  String get pairingStageSlowHint =>
      'Taking longer than usual. Make sure the home node is on the same Wi-Fi or has internet.';

  @override
  String get pairingStageVerySlowHint =>
      'Pairing is taking much longer than expected. Check both devices are online, then cancel and try again.';

  @override
  String get pairingCancel => 'Cancel pairing';

  @override
  String get pairingCancelConfirmTitle => 'Cancel pairing?';

  @override
  String get pairingCancelConfirmBody =>
      'The handshake will stop. You can try again from the QR code.';

  @override
  String get commonKeepWaiting => 'Keep waiting';

  @override
  String get pairingDontCloseApp =>
      'Don\'t close the app — pairing runs in the background.';

  @override
  String get pairingNowLan => 'Now trying your home node on the local network…';

  @override
  String get pairingNowP2p =>
      'Now establishing a secure peer-to-peer connection…';

  @override
  String get pairingNowRelay => 'Now connecting through a relay server…';

  @override
  String get pairingStillWorking =>
      'Still working — the first connection can take a minute or two. Please keep the app open.';

  @override
  String get pairingTroubleTitle => 'Still having trouble?';

  @override
  String get pairingTroubleBody =>
      'Make sure the home node is powered on and online, and that this device has internet access. If it keeps failing, cancel and try again.';

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

  @override
  String get settingsAiModelEnvoyLocalStandby =>
      'Envoy Local is the active provider on the home node. Tap to manage Local, or save a cloud provider below as standby.';

  @override
  String get settingsEnvoyLocalIntro =>
      'Control llama.cpp on the home computer. Models download there — never onto this phone.';

  @override
  String get settingsEnvoyLocalStatusHeading => 'Status';

  @override
  String get settingsEnvoyLocalInUse => 'In use';

  @override
  String get settingsEnvoyLocalNotInUse => 'Not in use';

  @override
  String get settingsEnvoyLocalStatusDownloading => 'Downloading…';

  @override
  String get settingsEnvoyLocalStatusDetecting => 'Detecting…';

  @override
  String get settingsEnvoyLocalStatusExtracting => 'Extracting…';

  @override
  String get settingsEnvoyLocalStatusStarting => 'Starting…';

  @override
  String get settingsEnvoyLocalStatusReady => 'Ready';

  @override
  String get settingsEnvoyLocalStatusError => 'Error';

  @override
  String get settingsEnvoyLocalStatusDisabled => 'Disabled';

  @override
  String get settingsEnvoyLocalIdleTimeout =>
      'Envoy Local operation timed out after 60 minutes. If a download is stuck near 100%, try China mirrors or a VPN, then retry — partial downloads resume.';

  @override
  String settingsEnvoyLocalRuntime(String status) {
    return 'Runtime: $status';
  }

  @override
  String settingsEnvoyLocalRuntimeVersion(String version) {
    return 'Version: $version';
  }

  @override
  String settingsEnvoyLocalAccel(String accel) {
    return 'Accelerator: $accel';
  }

  @override
  String settingsEnvoyLocalHardware(String summary) {
    return 'This machine: $summary';
  }

  @override
  String settingsEnvoyLocalActiveModel(String model) {
    return 'Model: $model';
  }

  @override
  String settingsEnvoyLocalProgressBytes(String received, String total) {
    return '$received / $total MB';
  }

  @override
  String settingsEnvoyLocalProgressReceived(String received) {
    return '$received MB downloaded';
  }

  @override
  String settingsEnvoyLocalLastError(String error) {
    return 'Last error: $error';
  }

  @override
  String get settingsEnvoyLocalDownloadRegion => 'Model download region';

  @override
  String get settingsEnvoyLocalDownloadRegionHint =>
      'If downloads fail, try China mirrors or a VPN for Global.';

  @override
  String settingsEnvoyLocalDownloadRegionEffective(String region) {
    return 'Using: $region';
  }

  @override
  String get settingsEnvoyLocalRegionAuto => 'Auto (timezone / locale)';

  @override
  String get settingsEnvoyLocalRegionCn => 'China (ModelScope → hf-mirror)';

  @override
  String get settingsEnvoyLocalRegionGlobal => 'Global (Hugging Face)';

  @override
  String get settingsEnvoyLocalEnable => 'Download & enable';

  @override
  String get settingsEnvoyLocalEnabling => 'Downloading…';

  @override
  String get settingsEnvoyLocalStart => 'Start Envoy Local';

  @override
  String get settingsEnvoyLocalStarting => 'Starting…';

  @override
  String get settingsEnvoyLocalStop => 'Stop Envoy Local';

  @override
  String get settingsEnvoyLocalRestart => 'Restart';

  @override
  String get settingsEnvoyLocalCancelDownload => 'Cancel download';

  @override
  String get settingsEnvoyLocalStopHint =>
      'Stop switches the assistant back to your cloud/Ollama provider when one is saved.';

  @override
  String get settingsEnvoyLocalRecommended => 'Recommended';

  @override
  String get settingsEnvoyLocalRecommendedBadge => 'Recommended';

  @override
  String get settingsEnvoyLocalDownload => 'Download';

  @override
  String get settingsEnvoyLocalInstalled => 'Installed models';

  @override
  String get settingsEnvoyLocalInstalledHint =>
      'Downloaded on the home node. Choose which one is active.';

  @override
  String get settingsEnvoyLocalNoInstalled => 'No models installed yet.';

  @override
  String get settingsEnvoyLocalSetActive => 'Set active';

  @override
  String get settingsEnvoyLocalActiveBadge => 'Active';

  @override
  String get settingsEnvoyLocalInstalledBadge => 'Installed';

  @override
  String get settingsEnvoyLocalCatalog => 'Catalog';

  @override
  String settingsEnvoyLocalHfError(String error) {
    return 'Hugging Face search unavailable: $error';
  }

  @override
  String get settingsEnvoyLocalRefresh => 'Refresh';

  @override
  String get settingsEnvoyLocalPhoneNote =>
      'Advanced server parameters (context size, GPU layers) remain on the home-node Social UI.';

  @override
  String get ehReviewTitle => 'Review this turn';

  @override
  String get ehReviewUnavailable =>
      'A saved review is unavailable for this older turn.';

  @override
  String get ehReviewFile => 'File';

  @override
  String get ehReviewOpenFile => 'Open file';

  @override
  String get ehReviewDiffUnavailable =>
      'A textual diff is unavailable for this file.';

  @override
  String get ehReviewOnly => 'Workspace-detected · review only';

  @override
  String get ehRevertTitle => 'Revert this turn?';

  @override
  String get ehRevertBody =>
      'Files will be restored to their pre-turn contents. Later edits are protected and will stop the revert.';

  @override
  String get ehRevertAction => 'Revert';

  @override
  String get ehRevertComplete => 'This turn’s file changes were reverted.';

  @override
  String get ehRevertUnavailable =>
      'This turn can no longer be reverted safely.';

  @override
  String ehRevertConflict(String files) {
    return 'Revert stopped because these files changed afterward: $files';
  }

  @override
  String get ehSearchTranscript => 'Search transcript';

  @override
  String get ehSearchClose => 'Close search';

  @override
  String get ehNoMatches => 'No matching turns';

  @override
  String get ehCopyTurn => 'Copy turn';

  @override
  String get ehShareTurn => 'Share turn';

  @override
  String get ehReviewDiff => 'Review diff';

  @override
  String get ehRevertThisTurn => 'Revert this turn';

  @override
  String get ehReviewChanges => 'Review changes';

  @override
  String get ehRevertAll => 'Revert all';

  @override
  String ehChangesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count files changed this turn',
      one: '1 file changed this turn',
    );
    return '$_temp0';
  }

  @override
  String get ehChangesKeepAll => 'Keep all';

  @override
  String get ehChangesRevert => 'Revert all';

  @override
  String get ehChangesHideList => 'Hide list';

  @override
  String get ehChangesShowList => 'Show list';

  @override
  String get ehReviewKeepFile => 'Keep';

  @override
  String get ehReviewRevertFile => 'Revert';

  @override
  String get ehReviewKeptAll => 'Changes kept.';

  @override
  String ehReviewRevertedFile(String path) {
    return 'Reverted $path';
  }

  @override
  String get ehReviewAutoLabel => 'Auto-review when ≥';

  @override
  String get ehReviewAutoAlways => 'Always';

  @override
  String ehQueueTitle(int count) {
    return 'Queued ($count)';
  }

  @override
  String get ehQueueClear => 'Clear';

  @override
  String get ehQueueBusyHint => 'Send queues next';

  @override
  String get ehQueueFollowUpHint => 'Queue a follow-up…';

  @override
  String get ehInjectTooltip => 'Inject (cancel + send)';

  @override
  String ehFilesChangedCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count files changed',
      one: '1 file changed',
    );
    return '$_temp0';
  }

  @override
  String get ehEmptyReply =>
      'envoy-harness finished without a visible reply. Your message is still here — try again or rephrase.';

  @override
  String get ehConfigureModelHint => 'Configure a model in Settings → AI.';

  @override
  String get ehReviewKeepFailed => 'Could not keep changes.';

  @override
  String get ehReviewOpenGitDiff => 'Open git diff';

  @override
  String get ehDiffBefore => 'Before';

  @override
  String get ehDiffAfter => 'After';

  @override
  String get ehPermsTooltip => 'Permission policy';

  @override
  String get ehPermsSafe => 'Default (safe auto-run)';

  @override
  String get ehPermsAsk => 'Always ask';

  @override
  String get ehPermsApprove => 'Always approve';

  @override
  String ehPermsSet(String mode) {
    return 'Permission policy → $mode.';
  }

  @override
  String get ehPermsNextTurn => ' Applies from the next turn.';

  @override
  String ehPermsFailed(String error) {
    return 'Failed to set permission policy: $error';
  }

  @override
  String get chainsStatusCancelled => 'Cancelled';

  @override
  String get chainsStatusPublished => 'Published';

  @override
  String get chainsStatusSynthesizing => 'Synthesizing';

  @override
  String get chainsStatusRunning => 'Running';

  @override
  String get chainsStatusWaitingWorkers => 'Waiting for workers';

  @override
  String get chainsStatusBidding => 'Bidding';

  @override
  String get chainsStatusAssigning => 'Assigning';

  @override
  String get chainsStatusPlanning => 'Planning';

  @override
  String get ehWorking => 'Working';

  @override
  String get ehCompleted => 'Completed';

  @override
  String get ehUpdate => 'Update';

  @override
  String ehToolLabel(String name) {
    return 'Tool: $name';
  }

  @override
  String ehMatchCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count matches',
      one: '1 match',
    );
    return '$_temp0';
  }

  @override
  String get termMore => 'More…';

  @override
  String get termCompactContext => 'Compact context';

  @override
  String get termUpdatePlan => 'Show or update plan';

  @override
  String get termHarnessStatus => 'Harness status';

  @override
  String get termPiActions => 'Pi actions';

  @override
  String get termHarnessActions => 'envoy-harness actions';

  @override
  String get termPreviousCommand => 'Previous command';

  @override
  String get termNextCommand => 'Next command';

  @override
  String get termCursorLeft => 'Move cursor left';

  @override
  String get termCursorRight => 'Move cursor right';

  @override
  String get termEnterKey => 'Enter key';

  @override
  String get chainsCancelFailed => 'Could not cancel this team job.';
}
