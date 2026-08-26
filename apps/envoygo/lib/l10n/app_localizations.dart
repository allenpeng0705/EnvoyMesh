import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_it.dart';
import 'app_localizations_ja.dart';
import 'app_localizations_ko.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('de'),
    Locale('fr'),
    Locale('it'),
    Locale('ja'),
    Locale('ko'),
    Locale('zh'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'EnvoyGo'**
  String get appTitle;

  /// No description provided for @navChats.
  ///
  /// In en, this message translates to:
  /// **'Chats'**
  String get navChats;

  /// No description provided for @navInbox.
  ///
  /// In en, this message translates to:
  /// **'Inbox'**
  String get navInbox;

  /// No description provided for @navContent.
  ///
  /// In en, this message translates to:
  /// **'Content'**
  String get navContent;

  /// No description provided for @navSocial.
  ///
  /// In en, this message translates to:
  /// **'Social'**
  String get navSocial;

  /// No description provided for @navTerminal.
  ///
  /// In en, this message translates to:
  /// **'Terminal'**
  String get navTerminal;

  /// No description provided for @navKnowledge.
  ///
  /// In en, this message translates to:
  /// **'Knowledge'**
  String get navKnowledge;

  /// No description provided for @navMe.
  ///
  /// In en, this message translates to:
  /// **'Me'**
  String get navMe;

  /// No description provided for @contentExplore.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get contentExplore;

  /// No description provided for @termEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Start a Pi coding session or a shell terminal on your home node.'**
  String get termEmptyHint;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get commonConfirm;

  /// No description provided for @homeFolderDrives.
  ///
  /// In en, this message translates to:
  /// **'Drives'**
  String get homeFolderDrives;

  /// No description provided for @homeFolderComputer.
  ///
  /// In en, this message translates to:
  /// **'Computer'**
  String get homeFolderComputer;

  /// No description provided for @homeFolderHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get homeFolderHome;

  /// No description provided for @homeFolderParent.
  ///
  /// In en, this message translates to:
  /// **'↑ Parent folder'**
  String get homeFolderParent;

  /// No description provided for @homeFolderNoSubfolders.
  ///
  /// In en, this message translates to:
  /// **'No subfolders'**
  String get homeFolderNoSubfolders;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @commonDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// No description provided for @commonClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get commonClose;

  /// No description provided for @commonLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading…'**
  String get commonLoading;

  /// No description provided for @commonError.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get commonError;

  /// No description provided for @commonReconnect.
  ///
  /// In en, this message translates to:
  /// **'Reconnect'**
  String get commonReconnect;

  /// No description provided for @commonSwitch.
  ///
  /// In en, this message translates to:
  /// **'Switch'**
  String get commonSwitch;

  /// No description provided for @commonPair.
  ///
  /// In en, this message translates to:
  /// **'Pair'**
  String get commonPair;

  /// No description provided for @commonUnpair.
  ///
  /// In en, this message translates to:
  /// **'Unpair'**
  String get commonUnpair;

  /// No description provided for @commonCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get commonCreate;

  /// No description provided for @commonRename.
  ///
  /// In en, this message translates to:
  /// **'Rename'**
  String get commonRename;

  /// No description provided for @languageTitle.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageTitle;

  /// No description provided for @languageSubtitle.
  ///
  /// In en, this message translates to:
  /// **'App language for menus and labels'**
  String get languageSubtitle;

  /// No description provided for @languageSystem.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get languageSystem;

  /// No description provided for @languageSystemDesc.
  ///
  /// In en, this message translates to:
  /// **'Follow the device language'**
  String get languageSystemDesc;

  /// No description provided for @meConnectedNode.
  ///
  /// In en, this message translates to:
  /// **'Connected Node'**
  String get meConnectedNode;

  /// No description provided for @meNotConnected.
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get meNotConnected;

  /// No description provided for @meNotConnectedHint.
  ///
  /// In en, this message translates to:
  /// **'Pair with a home node to get started'**
  String get meNotConnectedHint;

  /// No description provided for @meReconnect.
  ///
  /// In en, this message translates to:
  /// **'Reconnect'**
  String get meReconnect;

  /// No description provided for @meSwitch.
  ///
  /// In en, this message translates to:
  /// **'Switch'**
  String get meSwitch;

  /// No description provided for @meRepair.
  ///
  /// In en, this message translates to:
  /// **'Re-pair'**
  String get meRepair;

  /// No description provided for @meReconnectNow.
  ///
  /// In en, this message translates to:
  /// **'Reconnect now'**
  String get meReconnectNow;

  /// No description provided for @meUnpair.
  ///
  /// In en, this message translates to:
  /// **'Unpair'**
  String get meUnpair;

  /// No description provided for @meBrowser.
  ///
  /// In en, this message translates to:
  /// **'Browser'**
  String get meBrowser;

  /// No description provided for @meBrowserHint.
  ///
  /// In en, this message translates to:
  /// **'Open envoy:// pages — or use the Content tab for My Site'**
  String get meBrowserHint;

  /// No description provided for @meAiEngine.
  ///
  /// In en, this message translates to:
  /// **'AI Engine'**
  String get meAiEngine;

  /// No description provided for @meAiEngineHint.
  ///
  /// In en, this message translates to:
  /// **'Bridge + OpenClaw toggles. Tap to configure.'**
  String get meAiEngineHint;

  /// No description provided for @meRecentTeamJobs.
  ///
  /// In en, this message translates to:
  /// **'Recent team jobs'**
  String get meRecentTeamJobs;

  /// No description provided for @meRecentTeamJobsHint.
  ///
  /// In en, this message translates to:
  /// **'Browse finished multi-agent jobs'**
  String get meRecentTeamJobsHint;

  /// No description provided for @meActiveTeamJobs.
  ///
  /// In en, this message translates to:
  /// **'Active team jobs'**
  String get meActiveTeamJobs;

  /// No description provided for @meActiveTeamJobsHint.
  ///
  /// In en, this message translates to:
  /// **'Watch running team jobs'**
  String get meActiveTeamJobsHint;

  /// No description provided for @mePairNewNode.
  ///
  /// In en, this message translates to:
  /// **'Pair New Node'**
  String get mePairNewNode;

  /// No description provided for @mePairNewNodeHint.
  ///
  /// In en, this message translates to:
  /// **'Add another home node'**
  String get mePairNewNodeHint;

  /// No description provided for @meSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get meSettings;

  /// No description provided for @meAiModel.
  ///
  /// In en, this message translates to:
  /// **'AI Model'**
  String get meAiModel;

  /// No description provided for @meEnvoyLocal.
  ///
  /// In en, this message translates to:
  /// **'Envoy Local'**
  String get meEnvoyLocal;

  /// No description provided for @meEnvoyLocalHint.
  ///
  /// In en, this message translates to:
  /// **'Home-node local model (download & start on the computer)'**
  String get meEnvoyLocalHint;

  /// No description provided for @mePiAgent.
  ///
  /// In en, this message translates to:
  /// **'Pi Agent'**
  String get mePiAgent;

  /// No description provided for @mePiAgentHint.
  ///
  /// In en, this message translates to:
  /// **'Local coding agent settings'**
  String get mePiAgentHint;

  /// No description provided for @meDarkMode.
  ///
  /// In en, this message translates to:
  /// **'Dark mode'**
  String get meDarkMode;

  /// No description provided for @meDarkModeHint.
  ///
  /// In en, this message translates to:
  /// **'Follow system setting'**
  String get meDarkModeHint;

  /// No description provided for @mePushNotifications.
  ///
  /// In en, this message translates to:
  /// **'Push notifications'**
  String get mePushNotifications;

  /// No description provided for @mePushNotificationsHint.
  ///
  /// In en, this message translates to:
  /// **'Alerts when the app is in the background'**
  String get mePushNotificationsHint;

  /// No description provided for @meUnpairDevice.
  ///
  /// In en, this message translates to:
  /// **'Unpair This Device'**
  String get meUnpairDevice;

  /// No description provided for @meUnpairDeviceHint.
  ///
  /// In en, this message translates to:
  /// **'Disconnect and remove all data'**
  String get meUnpairDeviceHint;

  /// No description provided for @meUnpairConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Unpair?'**
  String get meUnpairConfirmTitle;

  /// No description provided for @meUnpairConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'This removes the pairing and local chats for this home node on this device.'**
  String get meUnpairConfirmBody;

  /// No description provided for @meUnpairedSnack.
  ///
  /// In en, this message translates to:
  /// **'Unpaired. Local chats and data removed.'**
  String get meUnpairedSnack;

  /// No description provided for @meUnpairFailed.
  ///
  /// In en, this message translates to:
  /// **'Unpair failed: {error}'**
  String meUnpairFailed(String error);

  /// No description provided for @meEditProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get meEditProfile;

  /// No description provided for @meProfileUpdateFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not update profile: {error}'**
  String meProfileUpdateFailed(String error);

  /// No description provided for @mePublicAccess.
  ///
  /// In en, this message translates to:
  /// **'Public Access'**
  String get mePublicAccess;

  /// No description provided for @mePort.
  ///
  /// In en, this message translates to:
  /// **'Port'**
  String get mePort;

  /// No description provided for @mePublicAccessSaved.
  ///
  /// In en, this message translates to:
  /// **'Public access saved'**
  String get mePublicAccessSaved;

  /// No description provided for @meFamilyProfile.
  ///
  /// In en, this message translates to:
  /// **'Family profile'**
  String get meFamilyProfile;

  /// No description provided for @meFamilyProfileHint.
  ///
  /// In en, this message translates to:
  /// **'You are on this home as a family member'**
  String get meFamilyProfileHint;

  /// No description provided for @mePreferences.
  ///
  /// In en, this message translates to:
  /// **'Preferences'**
  String get mePreferences;

  /// No description provided for @meViewEditProfile.
  ///
  /// In en, this message translates to:
  /// **'View & edit profile'**
  String get meViewEditProfile;

  /// No description provided for @meEditNameAvatar.
  ///
  /// In en, this message translates to:
  /// **'Edit name & avatar'**
  String get meEditNameAvatar;

  /// No description provided for @meDisplayName.
  ///
  /// In en, this message translates to:
  /// **'Display name'**
  String get meDisplayName;

  /// No description provided for @meAvatarColor.
  ///
  /// In en, this message translates to:
  /// **'Avatar color (hex)'**
  String get meAvatarColor;

  /// No description provided for @meMorePaired.
  ///
  /// In en, this message translates to:
  /// **'+{count} more paired'**
  String meMorePaired(int count);

  /// No description provided for @meSessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Session expired for {name}'**
  String meSessionExpired(String name);

  /// No description provided for @meDisconnectedFrom.
  ///
  /// In en, this message translates to:
  /// **'Disconnected from {name}'**
  String meDisconnectedFrom(String name);

  /// No description provided for @meUnpairConfirmBodyNamed.
  ///
  /// In en, this message translates to:
  /// **'This will disconnect and remove all local chats and data for {name}.'**
  String meUnpairConfirmBodyNamed(String name);

  /// No description provided for @meTeamJobs.
  ///
  /// In en, this message translates to:
  /// **'Team jobs'**
  String get meTeamJobs;

  /// No description provided for @meStartTeamJobHint.
  ///
  /// In en, this message translates to:
  /// **'Preview a plan and launch on the home node'**
  String get meStartTeamJobHint;

  /// No description provided for @meAiModelHint.
  ///
  /// In en, this message translates to:
  /// **'Provider used for the assistant on this home node'**
  String get meAiModelHint;

  /// No description provided for @mePiAgentHintLong.
  ///
  /// In en, this message translates to:
  /// **'Built-in local coding agent on the home node'**
  String get mePiAgentHintLong;

  /// No description provided for @mePushNotificationsHintLong.
  ///
  /// In en, this message translates to:
  /// **'Get notified about new messages, contact requests, and approvals when the app is in the background.'**
  String get mePushNotificationsHintLong;

  /// No description provided for @meRecentTeamJobsHintLong.
  ///
  /// In en, this message translates to:
  /// **'View job reports published on the home node'**
  String get meRecentTeamJobsHintLong;

  /// No description provided for @meActiveTeamJobsHintLong.
  ///
  /// In en, this message translates to:
  /// **'Monitor in-progress team jobs on the home node'**
  String get meActiveTeamJobsHintLong;

  /// No description provided for @inboxTitle.
  ///
  /// In en, this message translates to:
  /// **'Inbox'**
  String get inboxTitle;

  /// No description provided for @inboxEmpty.
  ///
  /// In en, this message translates to:
  /// **'No notifications yet'**
  String get inboxEmpty;

  /// No description provided for @inboxEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Bond requests and feed updates will show up here'**
  String get inboxEmptyHint;

  /// No description provided for @contentFeed.
  ///
  /// In en, this message translates to:
  /// **'Feed'**
  String get contentFeed;

  /// No description provided for @contentBlog.
  ///
  /// In en, this message translates to:
  /// **'Blog'**
  String get contentBlog;

  /// No description provided for @contentPeople.
  ///
  /// In en, this message translates to:
  /// **'People'**
  String get contentPeople;

  /// No description provided for @contentMyFiles.
  ///
  /// In en, this message translates to:
  /// **'My Files'**
  String get contentMyFiles;

  /// No description provided for @contentKnowledge.
  ///
  /// In en, this message translates to:
  /// **'Knowledge'**
  String get contentKnowledge;

  /// No description provided for @knowledgeTitle.
  ///
  /// In en, this message translates to:
  /// **'Knowledge'**
  String get knowledgeTitle;

  /// No description provided for @knowledgeLede.
  ///
  /// In en, this message translates to:
  /// **'Your vault knowledge base — notes under notes/ power EnvoyAI. Documents stay as originals.'**
  String get knowledgeLede;

  /// No description provided for @knowledgePanelBrowse.
  ///
  /// In en, this message translates to:
  /// **'Browse'**
  String get knowledgePanelBrowse;

  /// No description provided for @knowledgePanelAsk.
  ///
  /// In en, this message translates to:
  /// **'Ask'**
  String get knowledgePanelAsk;

  /// No description provided for @knowledgePanelPlugins.
  ///
  /// In en, this message translates to:
  /// **'Plugins'**
  String get knowledgePanelPlugins;

  /// No description provided for @knowledgePanelSetup.
  ///
  /// In en, this message translates to:
  /// **'Setup'**
  String get knowledgePanelSetup;

  /// No description provided for @knowledgeAskHint.
  ///
  /// In en, this message translates to:
  /// **'Answers use notes and documents on this node. Peers only see what you Publish.'**
  String get knowledgeAskHint;

  /// No description provided for @knowledgeAskHeading.
  ///
  /// In en, this message translates to:
  /// **'Ask your vault'**
  String get knowledgeAskHeading;

  /// No description provided for @knowledgeAskLabel.
  ///
  /// In en, this message translates to:
  /// **'Question'**
  String get knowledgeAskLabel;

  /// No description provided for @knowledgeAskPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'What did I write about onboarding?'**
  String get knowledgeAskPlaceholder;

  /// No description provided for @knowledgeAskSubmit.
  ///
  /// In en, this message translates to:
  /// **'Ask'**
  String get knowledgeAskSubmit;

  /// No description provided for @knowledgeAskBusy.
  ///
  /// In en, this message translates to:
  /// **'Searching…'**
  String get knowledgeAskBusy;

  /// No description provided for @knowledgeAskAnswerHeading.
  ///
  /// In en, this message translates to:
  /// **'Answer'**
  String get knowledgeAskAnswerHeading;

  /// No description provided for @knowledgeAskEmptyAnswer.
  ///
  /// In en, this message translates to:
  /// **'No answer returned. Check Setup → enable vault knowledge and rebuild the index.'**
  String get knowledgeAskEmptyAnswer;

  /// No description provided for @knowledgeAskContinueEnvoyAi.
  ///
  /// In en, this message translates to:
  /// **'Open in EnvoyAI'**
  String get knowledgeAskContinueEnvoyAi;

  /// No description provided for @knowledgeAskEnvoyAiHint.
  ///
  /// In en, this message translates to:
  /// **'For multi-turn chat with tools, continue in EnvoyAI.'**
  String get knowledgeAskEnvoyAiHint;

  /// No description provided for @knowledgeLibraryHeading.
  ///
  /// In en, this message translates to:
  /// **'Your files'**
  String get knowledgeLibraryHeading;

  /// No description provided for @knowledgeLibraryCaption.
  ///
  /// In en, this message translates to:
  /// **'Notes, documents, and what you’ve published.'**
  String get knowledgeLibraryCaption;

  /// No description provided for @knowledgeEmbedGateTitleNeeded.
  ///
  /// In en, this message translates to:
  /// **'Embedding model required'**
  String get knowledgeEmbedGateTitleNeeded;

  /// No description provided for @knowledgeEmbedGateTitleDownloading.
  ///
  /// In en, this message translates to:
  /// **'Downloading embedding model…'**
  String get knowledgeEmbedGateTitleDownloading;

  /// No description provided for @knowledgeEmbedGateTitleError.
  ///
  /// In en, this message translates to:
  /// **'Embedding setup failed'**
  String get knowledgeEmbedGateTitleError;

  /// No description provided for @knowledgeEmbedGateBodyNeeded.
  ///
  /// In en, this message translates to:
  /// **'Vault Ask needs a local embedding model on your home node. Browse works without it. Download starts automatically when the app launches — you can also start or retry from Setup.'**
  String get knowledgeEmbedGateBodyNeeded;

  /// No description provided for @knowledgeEmbedGateBodyDownloading.
  ///
  /// In en, this message translates to:
  /// **'Download is running on your home node (started with the app). You can leave this screen; Ask unlocks when the embedder is ready.'**
  String get knowledgeEmbedGateBodyDownloading;

  /// No description provided for @knowledgeEmbedGateBodyError.
  ///
  /// In en, this message translates to:
  /// **'The embedding runtime or model could not be installed on the home node. Retry the download, or fix Setup on the desktop app. Browse still works.'**
  String get knowledgeEmbedGateBodyError;

  /// No description provided for @knowledgeEmbedGateDownload.
  ///
  /// In en, this message translates to:
  /// **'Download on home'**
  String get knowledgeEmbedGateDownload;

  /// No description provided for @knowledgeEmbedGateDownloading.
  ///
  /// In en, this message translates to:
  /// **'Downloading…'**
  String get knowledgeEmbedGateDownloading;

  /// No description provided for @knowledgeEmbedGateRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry download'**
  String get knowledgeEmbedGateRetry;

  /// No description provided for @knowledgeEmbedGateOpenSetup.
  ///
  /// In en, this message translates to:
  /// **'Open Setup'**
  String get knowledgeEmbedGateOpenSetup;

  /// No description provided for @knowledgeEmbedGateBackgroundHint.
  ///
  /// In en, this message translates to:
  /// **'Safe to keep using other parts of the app while this finishes.'**
  String get knowledgeEmbedGateBackgroundHint;

  /// No description provided for @knowledgeEmbedGateStripNeeded.
  ///
  /// In en, this message translates to:
  /// **'Ask needs an embedding model on home — Browse still works'**
  String get knowledgeEmbedGateStripNeeded;

  /// No description provided for @knowledgeEmbedGateStripDownloading.
  ///
  /// In en, this message translates to:
  /// **'Embedding model downloading on home — Ask waits; Browse works'**
  String get knowledgeEmbedGateStripDownloading;

  /// No description provided for @knowledgeEmbedGateStripError.
  ///
  /// In en, this message translates to:
  /// **'Embedding setup failed on home — retry in Setup. Browse still works'**
  String get knowledgeEmbedGateStripError;

  /// No description provided for @knowledgeEmbedGateDownloadStarted.
  ///
  /// In en, this message translates to:
  /// **'Embedding download started on home'**
  String get knowledgeEmbedGateDownloadStarted;

  /// No description provided for @knowledgeEmbedGateBlockedToast.
  ///
  /// In en, this message translates to:
  /// **'Finish embedding setup before asking the vault.'**
  String get knowledgeEmbedGateBlockedToast;

  /// No description provided for @knowledgeEmbedGatePhaseDetecting.
  ///
  /// In en, this message translates to:
  /// **'Detecting platform…'**
  String get knowledgeEmbedGatePhaseDetecting;

  /// No description provided for @knowledgeEmbedGatePhaseDownloadingRuntime.
  ///
  /// In en, this message translates to:
  /// **'Downloading llama.cpp runtime…'**
  String get knowledgeEmbedGatePhaseDownloadingRuntime;

  /// No description provided for @knowledgeEmbedGatePhaseExtracting.
  ///
  /// In en, this message translates to:
  /// **'Extracting runtime…'**
  String get knowledgeEmbedGatePhaseExtracting;

  /// No description provided for @knowledgeEmbedGatePhaseDownloadingModel.
  ///
  /// In en, this message translates to:
  /// **'Downloading embedding model…'**
  String get knowledgeEmbedGatePhaseDownloadingModel;

  /// No description provided for @knowledgeEmbedGatePhaseStarting.
  ///
  /// In en, this message translates to:
  /// **'Starting embedder…'**
  String get knowledgeEmbedGatePhaseStarting;

  /// No description provided for @knowledgeEmbedGatePhaseDownloading.
  ///
  /// In en, this message translates to:
  /// **'Downloading…'**
  String get knowledgeEmbedGatePhaseDownloading;

  /// No description provided for @knowledgeEmbedGateStepsAria.
  ///
  /// In en, this message translates to:
  /// **'Embedding install steps'**
  String get knowledgeEmbedGateStepsAria;

  /// No description provided for @knowledgePluginsLede.
  ///
  /// In en, this message translates to:
  /// **'Optional connectors. Notion needs an MCP URL — not the Notion app.'**
  String get knowledgePluginsLede;

  /// No description provided for @knowledgePluginsObsidianTitle.
  ///
  /// In en, this message translates to:
  /// **'Obsidian'**
  String get knowledgePluginsObsidianTitle;

  /// No description provided for @knowledgePluginsObsidianDesc.
  ///
  /// In en, this message translates to:
  /// **'Enrich vault notes. Desktop app optional.'**
  String get knowledgePluginsObsidianDesc;

  /// No description provided for @knowledgePluginsNotionTitle.
  ///
  /// In en, this message translates to:
  /// **'Notion (via MCP)'**
  String get knowledgePluginsNotionTitle;

  /// No description provided for @knowledgePluginsNotionDesc.
  ///
  /// In en, this message translates to:
  /// **'Browse and search via MCP. Soft-fails without a URL.'**
  String get knowledgePluginsNotionDesc;

  /// No description provided for @knowledgePluginsMcpUrl.
  ///
  /// In en, this message translates to:
  /// **'MCP server URL'**
  String get knowledgePluginsMcpUrl;

  /// No description provided for @knowledgePluginsMcpTool.
  ///
  /// In en, this message translates to:
  /// **'Search tool name'**
  String get knowledgePluginsMcpTool;

  /// No description provided for @knowledgePluginsSyncNow.
  ///
  /// In en, this message translates to:
  /// **'Sync now'**
  String get knowledgePluginsSyncNow;

  /// No description provided for @knowledgePluginsLinkedVaultLabel.
  ///
  /// In en, this message translates to:
  /// **'Linked Obsidian vault path(s)'**
  String get knowledgePluginsLinkedVaultLabel;

  /// No description provided for @knowledgePluginsLinkedVaultHint.
  ///
  /// In en, this message translates to:
  /// **'/path/to/ObsidianVault'**
  String get knowledgePluginsLinkedVaultHint;

  /// No description provided for @knowledgePluginsLinkedVaultEmpty.
  ///
  /// In en, this message translates to:
  /// **'No linked vaults yet.'**
  String get knowledgePluginsLinkedVaultEmpty;

  /// No description provided for @knowledgePluginsLinkedVaultRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get knowledgePluginsLinkedVaultRemove;

  /// No description provided for @knowledgePluginsLinkedVaultAdd.
  ///
  /// In en, this message translates to:
  /// **'Add vault folder…'**
  String get knowledgePluginsLinkedVaultAdd;

  /// No description provided for @knowledgePluginsLinkedVaultPickTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose Obsidian vault folder'**
  String get knowledgePluginsLinkedVaultPickTitle;

  /// No description provided for @knowledgePluginsLinkedVaultHelper.
  ///
  /// In en, this message translates to:
  /// **'Vaults from Obsidian on this home computer are linked automatically. Remove a row to unlink (it will not auto-link again). Add vault folder… for more.'**
  String get knowledgePluginsLinkedVaultHelper;

  /// No description provided for @knowledgePluginsOpenObsidian.
  ///
  /// In en, this message translates to:
  /// **'Open Obsidian'**
  String get knowledgePluginsOpenObsidian;

  /// No description provided for @knowledgePluginsOpenNotion.
  ///
  /// In en, this message translates to:
  /// **'Open Notion'**
  String get knowledgePluginsOpenNotion;

  /// No description provided for @knowledgePluginsOpeningApp.
  ///
  /// In en, this message translates to:
  /// **'Opening…'**
  String get knowledgePluginsOpeningApp;

  /// No description provided for @knowledgePluginsOpenAppFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open the app on this computer.'**
  String get knowledgePluginsOpenAppFailed;

  /// No description provided for @knowledgePluginsOpenedWebsite.
  ///
  /// In en, this message translates to:
  /// **'App not installed locally — opened the official website on the home computer.'**
  String get knowledgePluginsOpenedWebsite;

  /// No description provided for @knowledgePluginsDownloadObsidian.
  ///
  /// In en, this message translates to:
  /// **'Download Obsidian'**
  String get knowledgePluginsDownloadObsidian;

  /// No description provided for @knowledgePluginsDownloadNotion.
  ///
  /// In en, this message translates to:
  /// **'Download Notion'**
  String get knowledgePluginsDownloadNotion;

  /// No description provided for @knowledgePluginsLinkedVaultAutoOne.
  ///
  /// In en, this message translates to:
  /// **'Linked Obsidian vault found on this computer.'**
  String get knowledgePluginsLinkedVaultAutoOne;

  /// No description provided for @knowledgePluginsLinkedVaultAutoMany.
  ///
  /// In en, this message translates to:
  /// **'Linked {count} Obsidian vaults found on this computer.'**
  String knowledgePluginsLinkedVaultAutoMany(int count);

  /// No description provided for @knowledgeHubImportObsidianAll.
  ///
  /// In en, this message translates to:
  /// **'Import all linked'**
  String get knowledgeHubImportObsidianAll;

  /// No description provided for @knowledgeHubImportNotionVisible.
  ///
  /// In en, this message translates to:
  /// **'Import visible cards'**
  String get knowledgeHubImportNotionVisible;

  /// No description provided for @knowledgeHubExportToObsidian.
  ///
  /// In en, this message translates to:
  /// **'Export to Obsidian'**
  String get knowledgeHubExportToObsidian;

  /// No description provided for @knowledgeHubExportToNotion.
  ///
  /// In en, this message translates to:
  /// **'Export to Notion/MCP'**
  String get knowledgeHubExportToNotion;

  /// No description provided for @knowledgeHubImportObsidianOk.
  ///
  /// In en, this message translates to:
  /// **'Imported {count} Obsidian note(s)'**
  String knowledgeHubImportObsidianOk(int count);

  /// No description provided for @knowledgeHubImportNotionOk.
  ///
  /// In en, this message translates to:
  /// **'Imported {count} Notion/MCP note(s)'**
  String knowledgeHubImportNotionOk(int count);

  /// No description provided for @knowledgeHubExportObsidianOk.
  ///
  /// In en, this message translates to:
  /// **'Exported {count} note(s) to Obsidian'**
  String knowledgeHubExportObsidianOk(int count);

  /// No description provided for @knowledgeHubExportNotionOk.
  ///
  /// In en, this message translates to:
  /// **'Exported {count} note(s) via MCP'**
  String knowledgeHubExportNotionOk(int count);

  /// No description provided for @knowledgeHubImportFailed.
  ///
  /// In en, this message translates to:
  /// **'Import failed'**
  String get knowledgeHubImportFailed;

  /// No description provided for @knowledgeHubExportFailed.
  ///
  /// In en, this message translates to:
  /// **'Export failed'**
  String get knowledgeHubExportFailed;

  /// No description provided for @knowledgeHubImportMcpEmpty.
  ///
  /// In en, this message translates to:
  /// **'No live MCP cards to import — refresh Browse'**
  String get knowledgeHubImportMcpEmpty;

  /// No description provided for @knowledgeHubExportEmpty.
  ///
  /// In en, this message translates to:
  /// **'No vault Markdown notes to export'**
  String get knowledgeHubExportEmpty;

  /// No description provided for @knowledgeHubShareVaultOnly.
  ///
  /// In en, this message translates to:
  /// **'Share works for vault files only — import first'**
  String get knowledgeHubShareVaultOnly;

  /// No description provided for @knowledgeHubMcpListError.
  ///
  /// In en, this message translates to:
  /// **'MCP list: {error}'**
  String knowledgeHubMcpListError(String error);

  /// No description provided for @knowledgeSetupHint.
  ///
  /// In en, this message translates to:
  /// **'Index status and retrieval. Chat models stay in Me → AI Model.'**
  String get knowledgeSetupHint;

  /// No description provided for @knowledgeSetupEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enable vault knowledge'**
  String get knowledgeSetupEnabled;

  /// No description provided for @knowledgeSetupStatusHint.
  ///
  /// In en, this message translates to:
  /// **'Tap Rebuild to refresh the vector index.'**
  String get knowledgeSetupStatusHint;

  /// No description provided for @knowledgeSetupReindex.
  ///
  /// In en, this message translates to:
  /// **'Rebuild index'**
  String get knowledgeSetupReindex;

  /// No description provided for @knowledgeSetupReindexDone.
  ///
  /// In en, this message translates to:
  /// **'Reindex started'**
  String get knowledgeSetupReindexDone;

  /// No description provided for @knowledgeSetupReindexConfirm.
  ///
  /// In en, this message translates to:
  /// **'Rebuild the vault vector index on the home node?'**
  String get knowledgeSetupReindexConfirm;

  /// No description provided for @knowledgeSetupTestEmbedding.
  ///
  /// In en, this message translates to:
  /// **'Test embedding'**
  String get knowledgeSetupTestEmbedding;

  /// No description provided for @knowledgeSetupTestEmbeddingBusy.
  ///
  /// In en, this message translates to:
  /// **'Testing…'**
  String get knowledgeSetupTestEmbeddingBusy;

  /// No description provided for @knowledgeSetupTestEmbeddingOk.
  ///
  /// In en, this message translates to:
  /// **'Embedding OK — {dimensions} dims in {latencyMs} ms'**
  String knowledgeSetupTestEmbeddingOk(int dimensions, int latencyMs);

  /// No description provided for @knowledgeSetupTestEmbeddingFail.
  ///
  /// In en, this message translates to:
  /// **'Embedding failed: {error}'**
  String knowledgeSetupTestEmbeddingFail(String error);

  /// No description provided for @knowledgeSetupRagMode.
  ///
  /// In en, this message translates to:
  /// **'Retrieval mode'**
  String get knowledgeSetupRagMode;

  /// No description provided for @knowledgeSetupRagHybrid.
  ///
  /// In en, this message translates to:
  /// **'Hybrid'**
  String get knowledgeSetupRagHybrid;

  /// No description provided for @knowledgeSetupRagVector.
  ///
  /// In en, this message translates to:
  /// **'Vector'**
  String get knowledgeSetupRagVector;

  /// No description provided for @knowledgeSetupRagLexical.
  ///
  /// In en, this message translates to:
  /// **'Lexical'**
  String get knowledgeSetupRagLexical;

  /// No description provided for @knowledgeSetupSnippetLimit.
  ///
  /// In en, this message translates to:
  /// **'Vault snippets per answer'**
  String get knowledgeSetupSnippetLimit;

  /// No description provided for @knowledgeBrowseIndexIndexingProgress.
  ///
  /// In en, this message translates to:
  /// **'Indexing {processed}/{total}…'**
  String knowledgeBrowseIndexIndexingProgress(int processed, int total);

  /// No description provided for @knowledgeHubOpenPlugins.
  ///
  /// In en, this message translates to:
  /// **'Open Plugins'**
  String get knowledgeHubOpenPlugins;

  /// No description provided for @knowledgeNoteNewTitle.
  ///
  /// In en, this message translates to:
  /// **'New note'**
  String get knowledgeNoteNewTitle;

  /// No description provided for @knowledgeNoteEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit note'**
  String get knowledgeNoteEditTitle;

  /// No description provided for @knowledgeNoteFilename.
  ///
  /// In en, this message translates to:
  /// **'Filename'**
  String get knowledgeNoteFilename;

  /// No description provided for @knowledgeNoteFilenameRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a note filename'**
  String get knowledgeNoteFilenameRequired;

  /// No description provided for @knowledgeNoteContent.
  ///
  /// In en, this message translates to:
  /// **'Markdown'**
  String get knowledgeNoteContent;

  /// No description provided for @knowledgeNoteSensitivity.
  ///
  /// In en, this message translates to:
  /// **'Visibility'**
  String get knowledgeNoteSensitivity;

  /// No description provided for @knowledgeNotePrivate.
  ///
  /// In en, this message translates to:
  /// **'Private'**
  String get knowledgeNotePrivate;

  /// No description provided for @knowledgeNoteFriends.
  ///
  /// In en, this message translates to:
  /// **'Friends'**
  String get knowledgeNoteFriends;

  /// No description provided for @knowledgeNotePublished.
  ///
  /// In en, this message translates to:
  /// **'Published'**
  String get knowledgeNotePublished;

  /// No description provided for @knowledgeNoteAlsoBlog.
  ///
  /// In en, this message translates to:
  /// **'Also publish as blog'**
  String get knowledgeNoteAlsoBlog;

  /// No description provided for @knowledgeFilePreview.
  ///
  /// In en, this message translates to:
  /// **'Preview'**
  String get knowledgeFilePreview;

  /// No description provided for @knowledgeFileOpenOnHome.
  ///
  /// In en, this message translates to:
  /// **'Open on home'**
  String get knowledgeFileOpenOnHome;

  /// No description provided for @knowledgeFileOpenedOnHome.
  ///
  /// In en, this message translates to:
  /// **'Opened on the home computer'**
  String get knowledgeFileOpenedOnHome;

  /// No description provided for @knowledgeFilePublish.
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get knowledgeFilePublish;

  /// No description provided for @knowledgeFileMakePrivate.
  ///
  /// In en, this message translates to:
  /// **'Make private'**
  String get knowledgeFileMakePrivate;

  /// No description provided for @knowledgeFileMore.
  ///
  /// In en, this message translates to:
  /// **'More actions'**
  String get knowledgeFileMore;

  /// No description provided for @knowledgeFileConvert.
  ///
  /// In en, this message translates to:
  /// **'Convert to Markdown note'**
  String get knowledgeFileConvert;

  /// No description provided for @knowledgeFileConvertOk.
  ///
  /// In en, this message translates to:
  /// **'Saved Markdown note {path}'**
  String knowledgeFileConvertOk(String path);

  /// No description provided for @knowledgeFileConvertFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not convert to Markdown'**
  String get knowledgeFileConvertFailed;

  /// No description provided for @knowledgeFileDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete file?'**
  String get knowledgeFileDeleteTitle;

  /// No description provided for @knowledgeFileDeleteBody.
  ///
  /// In en, this message translates to:
  /// **'Delete “{title}” from the home vault?'**
  String knowledgeFileDeleteBody(String title);

  /// No description provided for @knowledgeFileDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get knowledgeFileDeleteConfirm;

  /// No description provided for @meKnowledge.
  ///
  /// In en, this message translates to:
  /// **'Knowledge setup'**
  String get meKnowledge;

  /// No description provided for @meKnowledgeHint.
  ///
  /// In en, this message translates to:
  /// **'Index and retrieval for vault Ask'**
  String get meKnowledgeHint;

  /// No description provided for @meKnowledgePlugins.
  ///
  /// In en, this message translates to:
  /// **'Knowledge plugins'**
  String get meKnowledgePlugins;

  /// No description provided for @meKnowledgePluginsHint.
  ///
  /// In en, this message translates to:
  /// **'Obsidian link and Notion/MCP'**
  String get meKnowledgePluginsHint;

  /// No description provided for @knowledgeBrowseFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get knowledgeBrowseFilterAll;

  /// No description provided for @knowledgeBrowseFiltersLabel.
  ///
  /// In en, this message translates to:
  /// **'SHOW'**
  String get knowledgeBrowseFiltersLabel;

  /// No description provided for @knowledgeBrowseFilterNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get knowledgeBrowseFilterNotes;

  /// No description provided for @knowledgeBrowseFilterObsidian.
  ///
  /// In en, this message translates to:
  /// **'Obsidian'**
  String get knowledgeBrowseFilterObsidian;

  /// No description provided for @knowledgeBrowseFilterNotion.
  ///
  /// In en, this message translates to:
  /// **'Notion'**
  String get knowledgeBrowseFilterNotion;

  /// No description provided for @knowledgeBrowseFilterBlog.
  ///
  /// In en, this message translates to:
  /// **'Blog'**
  String get knowledgeBrowseFilterBlog;

  /// No description provided for @knowledgeBrowseFilterDocuments.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get knowledgeBrowseFilterDocuments;

  /// No description provided for @knowledgeBrowseFilterPublished.
  ///
  /// In en, this message translates to:
  /// **'Published'**
  String get knowledgeBrowseFilterPublished;

  /// No description provided for @knowledgeBrowseIndexReady.
  ///
  /// In en, this message translates to:
  /// **'{count} indexed'**
  String knowledgeBrowseIndexReady(int count);

  /// No description provided for @knowledgeBrowseIndexReadyLinked.
  ///
  /// In en, this message translates to:
  /// **'{count} indexed · {linked} linked Obsidian'**
  String knowledgeBrowseIndexReadyLinked(int count, int linked);

  /// No description provided for @knowledgeBrowseIndexIndexing.
  ///
  /// In en, this message translates to:
  /// **'Indexing…'**
  String get knowledgeBrowseIndexIndexing;

  /// No description provided for @knowledgeBrowseIndexEmpty.
  ///
  /// In en, this message translates to:
  /// **'Index empty'**
  String get knowledgeBrowseIndexEmpty;

  /// No description provided for @knowledgeBrowseIndexChipHint.
  ///
  /// In en, this message translates to:
  /// **'Open Knowledge → Setup to manage the index.'**
  String get knowledgeBrowseIndexChipHint;

  /// No description provided for @contentNewPost.
  ///
  /// In en, this message translates to:
  /// **'New post'**
  String get contentNewPost;

  /// No description provided for @chatsTitle.
  ///
  /// In en, this message translates to:
  /// **'Chats'**
  String get chatsTitle;

  /// No description provided for @chatsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No conversations yet'**
  String get chatsEmpty;

  /// No description provided for @chatsEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Pair with your home node to get started.'**
  String get chatsEmptyHint;

  /// No description provided for @chatsSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search chats…'**
  String get chatsSearchHint;

  /// No description provided for @pairingScanTitle.
  ///
  /// In en, this message translates to:
  /// **'Scan QR'**
  String get pairingScanTitle;

  /// No description provided for @pairingConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm pairing'**
  String get pairingConfirmTitle;

  /// No description provided for @pairingFamilyInvite.
  ///
  /// In en, this message translates to:
  /// **'Family invite'**
  String get pairingFamilyInvite;

  /// No description provided for @pairingOwnerPair.
  ///
  /// In en, this message translates to:
  /// **'Owner pairing'**
  String get pairingOwnerPair;

  /// No description provided for @engagementLike.
  ///
  /// In en, this message translates to:
  /// **'Like'**
  String get engagementLike;

  /// No description provided for @engagementUnlike.
  ///
  /// In en, this message translates to:
  /// **'Unlike'**
  String get engagementUnlike;

  /// No description provided for @engagementComment.
  ///
  /// In en, this message translates to:
  /// **'Comment'**
  String get engagementComment;

  /// No description provided for @engagementRemoveComment.
  ///
  /// In en, this message translates to:
  /// **'Remove comment?'**
  String get engagementRemoveComment;

  /// No description provided for @engagementRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get engagementRemove;

  /// No description provided for @feedDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get feedDelete;

  /// No description provided for @blogDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get blogDelete;

  /// No description provided for @blogTitle.
  ///
  /// In en, this message translates to:
  /// **'Blog'**
  String get blogTitle;

  /// No description provided for @blogEmpty.
  ///
  /// In en, this message translates to:
  /// **'No posts yet. Write your first blog post.'**
  String get blogEmpty;

  /// No description provided for @blogHint.
  ///
  /// In en, this message translates to:
  /// **'Longer posts you publish on the mesh.'**
  String get blogHint;

  /// No description provided for @feedTitle.
  ///
  /// In en, this message translates to:
  /// **'Feed'**
  String get feedTitle;

  /// No description provided for @feedComposeTitle.
  ///
  /// In en, this message translates to:
  /// **'New Feed post'**
  String get feedComposeTitle;

  /// No description provided for @commonBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonBack;

  /// No description provided for @commonAccept.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get commonAccept;

  /// No description provided for @commonDecline.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get commonDecline;

  /// No description provided for @commonDismiss.
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get commonDismiss;

  /// No description provided for @commonOpen.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get commonOpen;

  /// No description provided for @commonRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get commonRefresh;

  /// No description provided for @commonEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get commonEdit;

  /// No description provided for @commonPost.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get commonPost;

  /// No description provided for @commonPosting.
  ///
  /// In en, this message translates to:
  /// **'Posting…'**
  String get commonPosting;

  /// No description provided for @commonPublish.
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get commonPublish;

  /// No description provided for @commonShare.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get commonShare;

  /// No description provided for @commonSend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get commonSend;

  /// No description provided for @commonClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get commonClear;

  /// No description provided for @commonInvite.
  ///
  /// In en, this message translates to:
  /// **'Invite'**
  String get commonInvite;

  /// No description provided for @commonJoin.
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get commonJoin;

  /// No description provided for @commonYou.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get commonYou;

  /// No description provided for @commonUnknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get commonUnknown;

  /// No description provided for @commonCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied to clipboard'**
  String get commonCopied;

  /// No description provided for @commonNotConnectedHome.
  ///
  /// In en, this message translates to:
  /// **'Not connected to home node'**
  String get commonNotConnectedHome;

  /// No description provided for @commonSaving.
  ///
  /// In en, this message translates to:
  /// **'Saving…'**
  String get commonSaving;

  /// No description provided for @commonGenerating.
  ///
  /// In en, this message translates to:
  /// **'Generating…'**
  String get commonGenerating;

  /// No description provided for @commonHide.
  ///
  /// In en, this message translates to:
  /// **'Hide'**
  String get commonHide;

  /// No description provided for @commonAdd.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get commonAdd;

  /// No description provided for @commonRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get commonRemove;

  /// No description provided for @commonSearch.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get commonSearch;

  /// No description provided for @connOffline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get connOffline;

  /// No description provided for @connDirect.
  ///
  /// In en, this message translates to:
  /// **'Direct'**
  String get connDirect;

  /// No description provided for @connP2p.
  ///
  /// In en, this message translates to:
  /// **'P2P'**
  String get connP2p;

  /// No description provided for @connRelay.
  ///
  /// In en, this message translates to:
  /// **'Relay'**
  String get connRelay;

  /// No description provided for @connLanDirect.
  ///
  /// In en, this message translates to:
  /// **'LAN (Direct)'**
  String get connLanDirect;

  /// No description provided for @connPublicDirect.
  ///
  /// In en, this message translates to:
  /// **'Public IP (Direct)'**
  String get connPublicDirect;

  /// No description provided for @connRelayWs.
  ///
  /// In en, this message translates to:
  /// **'Relay WebSocket'**
  String get connRelayWs;

  /// No description provided for @connTooltipDirect.
  ///
  /// In en, this message translates to:
  /// **'Direct connection'**
  String get connTooltipDirect;

  /// No description provided for @connTooltipConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get connTooltipConnecting;

  /// No description provided for @connTooltipOffline.
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get connTooltipOffline;

  /// No description provided for @connTooltipError.
  ///
  /// In en, this message translates to:
  /// **'Connection error'**
  String get connTooltipError;

  /// No description provided for @chatsSectionAi.
  ///
  /// In en, this message translates to:
  /// **'AI'**
  String get chatsSectionAi;

  /// No description provided for @chatsSectionCoding.
  ///
  /// In en, this message translates to:
  /// **'Coding'**
  String get chatsSectionCoding;

  /// No description provided for @chatsCodingPi.
  ///
  /// In en, this message translates to:
  /// **'Pi'**
  String get chatsCodingPi;

  /// No description provided for @chatsCodingPiHint.
  ///
  /// In en, this message translates to:
  /// **'Coding Agent (terminal)'**
  String get chatsCodingPiHint;

  /// No description provided for @chatsCodingEh.
  ///
  /// In en, this message translates to:
  /// **'Envoy'**
  String get chatsCodingEh;

  /// No description provided for @chatsCodingEhHint.
  ///
  /// In en, this message translates to:
  /// **'Coding Agent (chat)'**
  String get chatsCodingEhHint;

  /// No description provided for @chatsEhNew.
  ///
  /// In en, this message translates to:
  /// **'New coding chat'**
  String get chatsEhNew;

  /// No description provided for @chatsEhRemoveTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove coding chat?'**
  String get chatsEhRemoveTitle;

  /// No description provided for @chatsEhRemoveBody.
  ///
  /// In en, this message translates to:
  /// **'Remove “{name}” from your Coding list? The chat history on the home node will be deleted.'**
  String chatsEhRemoveBody(String name);

  /// No description provided for @chatsEhThinking.
  ///
  /// In en, this message translates to:
  /// **'Envoy is thinking…'**
  String get chatsEhThinking;

  /// No description provided for @chatsEhPromptHint.
  ///
  /// In en, this message translates to:
  /// **'Ask Envoy to code, refactor, or explain…'**
  String get chatsEhPromptHint;

  /// No description provided for @chatsSectionFamily.
  ///
  /// In en, this message translates to:
  /// **'Family'**
  String get chatsSectionFamily;

  /// No description provided for @chatsSectionContacts.
  ///
  /// In en, this message translates to:
  /// **'Contacts'**
  String get chatsSectionContacts;

  /// No description provided for @chatsSectionGroups.
  ///
  /// In en, this message translates to:
  /// **'Groups'**
  String get chatsSectionGroups;

  /// No description provided for @chatsSectionTerminals.
  ///
  /// In en, this message translates to:
  /// **'Terminals'**
  String get chatsSectionTerminals;

  /// No description provided for @chatsFabNew.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get chatsFabNew;

  /// No description provided for @chatsCreateBot.
  ///
  /// In en, this message translates to:
  /// **'Create Bot'**
  String get chatsCreateBot;

  /// No description provided for @chatsCreateBotHint.
  ///
  /// In en, this message translates to:
  /// **'AI character on your home node'**
  String get chatsCreateBotHint;

  /// No description provided for @chatsNewPi.
  ///
  /// In en, this message translates to:
  /// **'New Pi'**
  String get chatsNewPi;

  /// No description provided for @chatsNewPiHint.
  ///
  /// In en, this message translates to:
  /// **'Start a Pi coding terminal'**
  String get chatsNewPiHint;

  /// No description provided for @chatsNewEnvoy.
  ///
  /// In en, this message translates to:
  /// **'New Envoy'**
  String get chatsNewEnvoy;

  /// No description provided for @chatsNewEnvoyHint.
  ///
  /// In en, this message translates to:
  /// **'Start Envoy Harness TUI'**
  String get chatsNewEnvoyHint;

  /// No description provided for @ehChooseProjectTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose Envoy project folder'**
  String get ehChooseProjectTitle;

  /// No description provided for @ehChangeProjectTitle.
  ///
  /// In en, this message translates to:
  /// **'Change Envoy project folder'**
  String get ehChangeProjectTitle;

  /// No description provided for @ehChooseProjectDesc.
  ///
  /// In en, this message translates to:
  /// **'Envoy runs in this folder (reads AGENTS.md, edits files, runs shell).'**
  String get ehChooseProjectDesc;

  /// No description provided for @ehStartWithProject.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get ehStartWithProject;

  /// No description provided for @ehRestartWithProject.
  ///
  /// In en, this message translates to:
  /// **'Restart Envoy here'**
  String get ehRestartWithProject;

  /// No description provided for @ehEnsuringTerminal.
  ///
  /// In en, this message translates to:
  /// **'Starting Envoy TUI…'**
  String get ehEnsuringTerminal;

  /// No description provided for @ehPermissionTitle.
  ///
  /// In en, this message translates to:
  /// **'Tool permission'**
  String get ehPermissionTitle;

  /// No description provided for @ehPermissionAllow.
  ///
  /// In en, this message translates to:
  /// **'Allow'**
  String get ehPermissionAllow;

  /// No description provided for @ehPermissionDeny.
  ///
  /// In en, this message translates to:
  /// **'Deny'**
  String get ehPermissionDeny;

  /// No description provided for @ehQuestionTitle.
  ///
  /// In en, this message translates to:
  /// **'Envoy needs your input'**
  String get ehQuestionTitle;

  /// No description provided for @ehRecommended.
  ///
  /// In en, this message translates to:
  /// **'Recommended'**
  String get ehRecommended;

  /// No description provided for @ehSlashWhileBusy.
  ///
  /// In en, this message translates to:
  /// **'Finish or /cancel the current turn first.'**
  String get ehSlashWhileBusy;

  /// No description provided for @ehChatReset.
  ///
  /// In en, this message translates to:
  /// **'Started a new chat for this project.'**
  String get ehChatReset;

  /// No description provided for @ehTurnCancelled.
  ///
  /// In en, this message translates to:
  /// **'Turn cancelled.'**
  String get ehTurnCancelled;

  /// No description provided for @ehStatusRefreshed.
  ///
  /// In en, this message translates to:
  /// **'Status refreshed.'**
  String get ehStatusRefreshed;

  /// No description provided for @ehNoPeers.
  ///
  /// In en, this message translates to:
  /// **'No peer cluster configured.'**
  String get ehNoPeers;

  /// No description provided for @ehSearchUsage.
  ///
  /// In en, this message translates to:
  /// **'Usage: /search <term> — search this conversation.'**
  String get ehSearchUsage;

  /// No description provided for @ehSearchNoMatches.
  ///
  /// In en, this message translates to:
  /// **'No matches for “{term}”.'**
  String ehSearchNoMatches(String term);

  /// No description provided for @ehModelShow.
  ///
  /// In en, this message translates to:
  /// **'Active model: {model}'**
  String ehModelShow(String model);

  /// No description provided for @ehModelUnknown.
  ///
  /// In en, this message translates to:
  /// **'No model configured — set one in Settings → AI.'**
  String get ehModelUnknown;

  /// No description provided for @ehProjectCurrent.
  ///
  /// In en, this message translates to:
  /// **'Project folder: {path}'**
  String ehProjectCurrent(String path);

  /// No description provided for @ehProjectUnset.
  ///
  /// In en, this message translates to:
  /// **'No project folder set — use /cd <path>.'**
  String get ehProjectUnset;

  /// No description provided for @ehProjectSet.
  ///
  /// In en, this message translates to:
  /// **'Project folder → {path}'**
  String ehProjectSet(String path);

  /// No description provided for @ehProjectSetUnknown.
  ///
  /// In en, this message translates to:
  /// **'Project folder updated.'**
  String get ehProjectSetUnknown;

  /// No description provided for @ehProjectSetFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to set project folder: {error}'**
  String ehProjectSetFailed(String error);

  /// No description provided for @ehConfigureModel.
  ///
  /// In en, this message translates to:
  /// **'Configure a model in Settings → AI.'**
  String get ehConfigureModel;

  /// No description provided for @ehNotReady.
  ///
  /// In en, this message translates to:
  /// **'envoy-harness is not ready.'**
  String get ehNotReady;

  /// No description provided for @termQuickHelp.
  ///
  /// In en, this message translates to:
  /// **'/help'**
  String get termQuickHelp;

  /// No description provided for @termQuickCancel.
  ///
  /// In en, this message translates to:
  /// **'/cancel'**
  String get termQuickCancel;

  /// No description provided for @chatsNewTerminal.
  ///
  /// In en, this message translates to:
  /// **'New Terminal'**
  String get chatsNewTerminal;

  /// No description provided for @chatsNewTerminalHint.
  ///
  /// In en, this message translates to:
  /// **'Open a shell on the home node'**
  String get chatsNewTerminalHint;

  /// No description provided for @chatsNewGroup.
  ///
  /// In en, this message translates to:
  /// **'New Group Chat'**
  String get chatsNewGroup;

  /// No description provided for @chatsNewGroupHint.
  ///
  /// In en, this message translates to:
  /// **'Mesh group with bonded contacts'**
  String get chatsNewGroupHint;

  /// No description provided for @chatsNewFamilyGroup.
  ///
  /// In en, this message translates to:
  /// **'New Family Group'**
  String get chatsNewFamilyGroup;

  /// No description provided for @chatsNewFamilyGroupHint.
  ///
  /// In en, this message translates to:
  /// **'Local group with family members'**
  String get chatsNewFamilyGroupHint;

  /// No description provided for @chatsDeleteBotTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete bot?'**
  String get chatsDeleteBotTitle;

  /// No description provided for @chatsDeleteBotBody.
  ///
  /// In en, this message translates to:
  /// **'Remove “{name}” from your home node? This cannot be undone.'**
  String chatsDeleteBotBody(String name);

  /// No description provided for @chatsBotOptions.
  ///
  /// In en, this message translates to:
  /// **'Bot options'**
  String get chatsBotOptions;

  /// No description provided for @chatsEditBot.
  ///
  /// In en, this message translates to:
  /// **'Edit Bot'**
  String get chatsEditBot;

  /// No description provided for @chatsBotNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Bot name is required'**
  String get chatsBotNameRequired;

  /// No description provided for @chatsBotPromptRequired.
  ///
  /// In en, this message translates to:
  /// **'Personality / System prompt is required'**
  String get chatsBotPromptRequired;

  /// No description provided for @chatsBotName.
  ///
  /// In en, this message translates to:
  /// **'Bot name'**
  String get chatsBotName;

  /// No description provided for @chatsBotNameHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Luna the Librarian'**
  String get chatsBotNameHint;

  /// No description provided for @chatsBotPrompt.
  ///
  /// In en, this message translates to:
  /// **'Personality / System prompt'**
  String get chatsBotPrompt;

  /// No description provided for @chatsBotPromptHint.
  ///
  /// In en, this message translates to:
  /// **'Write as the character (“You are …”). Avoid “Luna is …” or “I am an AI…”. Reshaped on save.'**
  String get chatsBotPromptHint;

  /// No description provided for @chatsBotDesc.
  ///
  /// In en, this message translates to:
  /// **'Short description (optional)'**
  String get chatsBotDesc;

  /// No description provided for @chatsBotDescHint.
  ///
  /// In en, this message translates to:
  /// **'One short line for the chat list. Leave blank to auto-fill from the personality.'**
  String get chatsBotDescHint;

  /// No description provided for @chatsAvatarColor.
  ///
  /// In en, this message translates to:
  /// **'Avatar color'**
  String get chatsAvatarColor;

  /// No description provided for @chatsShellHint.
  ///
  /// In en, this message translates to:
  /// **'Shell (e.g. zsh, bash)'**
  String get chatsShellHint;

  /// No description provided for @chatsCwdHint.
  ///
  /// In en, this message translates to:
  /// **'Working directory (optional)'**
  String get chatsCwdHint;

  /// No description provided for @chatsPiTitle.
  ///
  /// In en, this message translates to:
  /// **'Start Pi'**
  String get chatsPiTitle;

  /// No description provided for @chatsPiBody.
  ///
  /// In en, this message translates to:
  /// **'Choose a project folder on the home computer to open the Pi coding terminal.'**
  String get chatsPiBody;

  /// No description provided for @chatsPiFolder.
  ///
  /// In en, this message translates to:
  /// **'Project folder'**
  String get chatsPiFolder;

  /// No description provided for @chatsPiFolderHint.
  ///
  /// In en, this message translates to:
  /// **'/Users/you/project'**
  String get chatsPiFolderHint;

  /// No description provided for @chatsPiFolderRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a project folder path.'**
  String get chatsPiFolderRequired;

  /// No description provided for @chatsGroupName.
  ///
  /// In en, this message translates to:
  /// **'Group name'**
  String get chatsGroupName;

  /// No description provided for @chatsNoFamilyMembers.
  ///
  /// In en, this message translates to:
  /// **'No other family members yet.'**
  String get chatsNoFamilyMembers;

  /// No description provided for @chatVoiceCall.
  ///
  /// In en, this message translates to:
  /// **'Voice call'**
  String get chatVoiceCall;

  /// No description provided for @chatVideoCall.
  ///
  /// In en, this message translates to:
  /// **'Video call'**
  String get chatVideoCall;

  /// No description provided for @chatPublishedContent.
  ///
  /// In en, this message translates to:
  /// **'Published content'**
  String get chatPublishedContent;

  /// No description provided for @chatClearThread.
  ///
  /// In en, this message translates to:
  /// **'Clear thread'**
  String get chatClearThread;

  /// No description provided for @chatClearThreadTitle.
  ///
  /// In en, this message translates to:
  /// **'Clear thread?'**
  String get chatClearThreadTitle;

  /// No description provided for @chatClearThreadBody.
  ///
  /// In en, this message translates to:
  /// **'All messages in this thread will be deleted.'**
  String get chatClearThreadBody;

  /// No description provided for @chatAiManual.
  ///
  /// In en, this message translates to:
  /// **'Manual'**
  String get chatAiManual;

  /// No description provided for @chatAiAssistant.
  ///
  /// In en, this message translates to:
  /// **'Assistant'**
  String get chatAiAssistant;

  /// No description provided for @chatAiAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get chatAiAuto;

  /// No description provided for @chatAiManualTooltip.
  ///
  /// In en, this message translates to:
  /// **'Manual: type yourself'**
  String get chatAiManualTooltip;

  /// No description provided for @chatAiAssistantTooltip.
  ///
  /// In en, this message translates to:
  /// **'Assistant: AI suggests drafts'**
  String get chatAiAssistantTooltip;

  /// No description provided for @chatAiAutoTooltip.
  ///
  /// In en, this message translates to:
  /// **'Auto-reply: AI responds automatically'**
  String get chatAiAutoTooltip;

  /// No description provided for @chatAgentMode.
  ///
  /// In en, this message translates to:
  /// **'Agent'**
  String get chatAgentMode;

  /// No description provided for @chatAgentModeOffTooltip.
  ///
  /// In en, this message translates to:
  /// **'Agent Mode off — Assist uses public knowledge only'**
  String get chatAgentModeOffTooltip;

  /// No description provided for @chatAgentModeOnTooltip.
  ///
  /// In en, this message translates to:
  /// **'Agent Mode on — OpenClaw may use home files, private knowledge, and tools'**
  String get chatAgentModeOnTooltip;

  /// No description provided for @chatAgentModeConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Enable Agent Mode for this chat?'**
  String get chatAgentModeConfirmTitle;

  /// No description provided for @chatAgentModeConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Agent Mode uses EnvoyAI/OpenClaw and can read local files, private knowledge, and run tools on your home node. Only enable for contacts you fully trust.'**
  String get chatAgentModeConfirmBody;

  /// No description provided for @chatAgentModeConfirmEnable.
  ///
  /// In en, this message translates to:
  /// **'Enable Agent Mode'**
  String get chatAgentModeConfirmEnable;

  /// No description provided for @chatSuggestedReply.
  ///
  /// In en, this message translates to:
  /// **'Suggested reply'**
  String get chatSuggestedReply;

  /// No description provided for @chatSuggestedReplyUse.
  ///
  /// In en, this message translates to:
  /// **'Use'**
  String get chatSuggestedReplyUse;

  /// No description provided for @chatSuggestedReplyDismiss.
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get chatSuggestedReplyDismiss;

  /// No description provided for @chatDeleteMessageTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete message?'**
  String get chatDeleteMessageTitle;

  /// No description provided for @chatNoMessages.
  ///
  /// In en, this message translates to:
  /// **'No messages yet'**
  String get chatNoMessages;

  /// No description provided for @chatTypeMessage.
  ///
  /// In en, this message translates to:
  /// **'Type a message…'**
  String get chatTypeMessage;

  /// No description provided for @chatRecordVoice.
  ///
  /// In en, this message translates to:
  /// **'Record voice note'**
  String get chatRecordVoice;

  /// No description provided for @chatStopRecording.
  ///
  /// In en, this message translates to:
  /// **'Stop recording'**
  String get chatStopRecording;

  /// No description provided for @chatInviteToGroup.
  ///
  /// In en, this message translates to:
  /// **'Invite to Group'**
  String get chatInviteToGroup;

  /// No description provided for @chatNoContactsInvite.
  ///
  /// In en, this message translates to:
  /// **'No contacts to invite.'**
  String get chatNoContactsInvite;

  /// No description provided for @chatInvitedSnack.
  ///
  /// In en, this message translates to:
  /// **'{name} invited'**
  String chatInvitedSnack(String name);

  /// No description provided for @chatVoiceSending.
  ///
  /// In en, this message translates to:
  /// **'Sending voice note…'**
  String get chatVoiceSending;

  /// No description provided for @chatVoiceSent.
  ///
  /// In en, this message translates to:
  /// **'Voice note sent'**
  String get chatVoiceSent;

  /// No description provided for @chatVoiceRecording.
  ///
  /// In en, this message translates to:
  /// **'Recording'**
  String get chatVoiceRecording;

  /// No description provided for @chatVoiceReady.
  ///
  /// In en, this message translates to:
  /// **'Ready to send'**
  String get chatVoiceReady;

  /// No description provided for @chatVoiceCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get chatVoiceCancel;

  /// No description provided for @chatVoiceSend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get chatVoiceSend;

  /// No description provided for @chatVoiceSendHint.
  ///
  /// In en, this message translates to:
  /// **'Tap Send when done · Cancel to discard'**
  String get chatVoiceSendHint;

  /// No description provided for @chatVoiceReadyHint.
  ///
  /// In en, this message translates to:
  /// **'Send failed · Tap Send to retry · Cancel to discard'**
  String get chatVoiceReadyHint;

  /// No description provided for @chatVoiceSendFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to send voice note'**
  String get chatVoiceSendFailed;

  /// No description provided for @chatMicDenied.
  ///
  /// In en, this message translates to:
  /// **'Microphone permission denied'**
  String get chatMicDenied;

  /// No description provided for @chatRecordFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to start recording'**
  String get chatRecordFailed;

  /// No description provided for @chatCallFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to start call'**
  String get chatCallFailed;

  /// No description provided for @chatAiDisabled.
  ///
  /// In en, this message translates to:
  /// **'AI model is disabled. Enable a model provider in Settings → AI.'**
  String get chatAiDisabled;

  /// No description provided for @chatAiDisabledFamily.
  ///
  /// In en, this message translates to:
  /// **'AI is unavailable for this family profile.'**
  String get chatAiDisabledFamily;

  /// No description provided for @inboxPublishedUpdates.
  ///
  /// In en, this message translates to:
  /// **'Published updates'**
  String get inboxPublishedUpdates;

  /// No description provided for @inboxPublishedEmpty.
  ///
  /// In en, this message translates to:
  /// **'No publish notifications yet. When a bonded contact publishes web content, it will show up here.'**
  String get inboxPublishedEmpty;

  /// No description provided for @inboxPendingIntros.
  ///
  /// In en, this message translates to:
  /// **'Pending intros'**
  String get inboxPendingIntros;

  /// No description provided for @inboxPendingEmpty.
  ///
  /// In en, this message translates to:
  /// **'No pending introductions'**
  String get inboxPendingEmpty;

  /// No description provided for @inboxWantsToConnect.
  ///
  /// In en, this message translates to:
  /// **'Wants to connect'**
  String get inboxWantsToConnect;

  /// No description provided for @pairingInvalidQr.
  ///
  /// In en, this message translates to:
  /// **'Invalid pairing QR code'**
  String get pairingInvalidQr;

  /// No description provided for @pairingPasteUri.
  ///
  /// In en, this message translates to:
  /// **'Or paste pairing URI'**
  String get pairingPasteUri;

  /// No description provided for @pairingUriHint.
  ///
  /// In en, this message translates to:
  /// **'envoy://pair?… or envoy://invite?…'**
  String get pairingUriHint;

  /// No description provided for @pairingNeedHomeHint.
  ///
  /// In en, this message translates to:
  /// **'Setting up your own home? Install EnvoyMesh on a Mac or Windows PC first, then scan its QR. Joining family? Scan their invite — no PC install needed.'**
  String get pairingNeedHomeHint;

  /// No description provided for @pairingDownloadEnvoyMesh.
  ///
  /// In en, this message translates to:
  /// **'EnvoyMesh desktop downloads'**
  String get pairingDownloadEnvoyMesh;

  /// No description provided for @pairingJoinFamily.
  ///
  /// In en, this message translates to:
  /// **'Join Family'**
  String get pairingJoinFamily;

  /// No description provided for @pairingConnectTo.
  ///
  /// In en, this message translates to:
  /// **'Connect to {name}?'**
  String pairingConnectTo(String name);

  /// No description provided for @pairingWelcomeFamily.
  ///
  /// In en, this message translates to:
  /// **'Welcome to the {name} family!'**
  String pairingWelcomeFamily(String name);

  /// No description provided for @pairingImNew.
  ///
  /// In en, this message translates to:
  /// **'I\'m new'**
  String get pairingImNew;

  /// No description provided for @pairingImBack.
  ///
  /// In en, this message translates to:
  /// **'I\'m back'**
  String get pairingImBack;

  /// No description provided for @pairingDisplayNameOptional.
  ///
  /// In en, this message translates to:
  /// **'Display name (optional)'**
  String get pairingDisplayNameOptional;

  /// No description provided for @pairingYourName.
  ///
  /// In en, this message translates to:
  /// **'Your name'**
  String get pairingYourName;

  /// No description provided for @pairingAvatarColor.
  ///
  /// In en, this message translates to:
  /// **'Avatar color'**
  String get pairingAvatarColor;

  /// No description provided for @pairingOwnerNameHint.
  ///
  /// In en, this message translates to:
  /// **'Shown as your owner profile name on this node'**
  String get pairingOwnerNameHint;

  /// No description provided for @pairingCopyError.
  ///
  /// In en, this message translates to:
  /// **'Copy error'**
  String get pairingCopyError;

  /// No description provided for @pairingRetryMembers.
  ///
  /// In en, this message translates to:
  /// **'Retry loading members'**
  String get pairingRetryMembers;

  /// No description provided for @pairingWhoAreYou.
  ///
  /// In en, this message translates to:
  /// **'Who are you?'**
  String get pairingWhoAreYou;

  /// No description provided for @pairingAlreadyOnHome.
  ///
  /// In en, this message translates to:
  /// **'Already on this home'**
  String get pairingAlreadyOnHome;

  /// No description provided for @pairingSelectProfile.
  ///
  /// In en, this message translates to:
  /// **'Select your profile'**
  String get pairingSelectProfile;

  /// No description provided for @pairingNoMembersFirst.
  ///
  /// In en, this message translates to:
  /// **'No family members yet — you will be the first.'**
  String get pairingNoMembersFirst;

  /// No description provided for @pairingNoExistingProfiles.
  ///
  /// In en, this message translates to:
  /// **'No existing family profiles yet. Switch to \"I\'m new\" to create one.'**
  String get pairingNoExistingProfiles;

  /// No description provided for @pairingNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter your name'**
  String get pairingNameRequired;

  /// No description provided for @pairingSelectRequired.
  ///
  /// In en, this message translates to:
  /// **'Please select your profile'**
  String get pairingSelectRequired;

  /// No description provided for @pairingLanAvailable.
  ///
  /// In en, this message translates to:
  /// **'LAN: available'**
  String get pairingLanAvailable;

  /// No description provided for @pairingRelayAvailable.
  ///
  /// In en, this message translates to:
  /// **'Relay: available'**
  String get pairingRelayAvailable;

  /// No description provided for @pairingPeer.
  ///
  /// In en, this message translates to:
  /// **'Peer: {peer}'**
  String pairingPeer(String peer);

  /// No description provided for @pairingNameHintDad.
  ///
  /// In en, this message translates to:
  /// **'e.g. Dad'**
  String get pairingNameHintDad;

  /// No description provided for @pairingNameHintMom.
  ///
  /// In en, this message translates to:
  /// **'e.g. Mom, Alex'**
  String get pairingNameHintMom;

  /// No description provided for @pairingChooseUniqueName.
  ///
  /// In en, this message translates to:
  /// **'Choose a name that is not already used below.'**
  String get pairingChooseUniqueName;

  /// No description provided for @pairingSameNameHint.
  ///
  /// In en, this message translates to:
  /// **'Use the same name you created on your first phone.'**
  String get pairingSameNameHint;

  /// No description provided for @pairingTapIfSecondPhone.
  ///
  /// In en, this message translates to:
  /// **'Tap a name if this is your second phone (I\'m back).'**
  String get pairingTapIfSecondPhone;

  /// No description provided for @feedEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Your circle is quiet'**
  String get feedEmptyTitle;

  /// No description provided for @feedEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'No posts yet. Share an update with your bonded contacts.'**
  String get feedEmptyHint;

  /// No description provided for @feedHint.
  ///
  /// In en, this message translates to:
  /// **'Updates from you and bonded contacts.'**
  String get feedHint;

  /// No description provided for @feedDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete post?'**
  String get feedDeleteTitle;

  /// No description provided for @feedDeleteBody.
  ///
  /// In en, this message translates to:
  /// **'This cannot be undone.'**
  String get feedDeleteBody;

  /// No description provided for @blogPairHint.
  ///
  /// In en, this message translates to:
  /// **'Pair with a home node to write and manage Blog posts.'**
  String get blogPairHint;

  /// No description provided for @blogConnectHint.
  ///
  /// In en, this message translates to:
  /// **'Connect to a home node to manage Blog.'**
  String get blogConnectHint;

  /// No description provided for @blogDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete post?'**
  String get blogDeleteTitle;

  /// No description provided for @blogDeleteBody.
  ///
  /// In en, this message translates to:
  /// **'Delete “{title}”? This cannot be undone.'**
  String blogDeleteBody(String title);

  /// No description provided for @feedWhatsOnMind.
  ///
  /// In en, this message translates to:
  /// **'What\'s on your mind?'**
  String get feedWhatsOnMind;

  /// No description provided for @feedShareHint.
  ///
  /// In en, this message translates to:
  /// **'Share an update with bonded contacts…'**
  String get feedShareHint;

  /// No description provided for @feedPhotos.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get feedPhotos;

  /// No description provided for @feedVisibility.
  ///
  /// In en, this message translates to:
  /// **'Visibility'**
  String get feedVisibility;

  /// No description provided for @feedVisBonded.
  ///
  /// In en, this message translates to:
  /// **'Bonded contacts'**
  String get feedVisBonded;

  /// No description provided for @feedVisSelected.
  ///
  /// In en, this message translates to:
  /// **'Selected contacts'**
  String get feedVisSelected;

  /// No description provided for @feedVisOnlyMe.
  ///
  /// In en, this message translates to:
  /// **'Only me'**
  String get feedVisOnlyMe;

  /// No description provided for @feedNeedTextOrPhoto.
  ///
  /// In en, this message translates to:
  /// **'Add text or at least one photo'**
  String get feedNeedTextOrPhoto;

  /// No description provided for @feedNeedContact.
  ///
  /// In en, this message translates to:
  /// **'Select at least one contact'**
  String get feedNeedContact;

  /// No description provided for @feedSelectedHint.
  ///
  /// In en, this message translates to:
  /// **'Only these contacts can see this post. Pick at least one.'**
  String get feedSelectedHint;

  /// No description provided for @feedNoContacts.
  ///
  /// In en, this message translates to:
  /// **'No bonded contacts yet — add a contact first, or choose Bonded / Only me.'**
  String get feedNoContacts;

  /// No description provided for @feedAiDraft.
  ///
  /// In en, this message translates to:
  /// **'AI draft'**
  String get feedAiDraft;

  /// No description provided for @feedDiscard.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get feedDiscard;

  /// No description provided for @feedInsert.
  ///
  /// In en, this message translates to:
  /// **'Insert'**
  String get feedInsert;

  /// No description provided for @feedReplace.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get feedReplace;

  /// No description provided for @peoplePairHint.
  ///
  /// In en, this message translates to:
  /// **'Pair with a home node to discover people on the mesh.'**
  String get peoplePairHint;

  /// No description provided for @peopleConnectHint.
  ///
  /// In en, this message translates to:
  /// **'Connect to a home node to discover people.'**
  String get peopleConnectHint;

  /// No description provided for @peopleHint.
  ///
  /// In en, this message translates to:
  /// **'Find people you haven\'t bonded with — open their public profile or blog, then say hello.'**
  String get peopleHint;

  /// No description provided for @peopleTopic.
  ///
  /// In en, this message translates to:
  /// **'Topic'**
  String get peopleTopic;

  /// No description provided for @peopleInterest.
  ///
  /// In en, this message translates to:
  /// **'Interest'**
  String get peopleInterest;

  /// No description provided for @peopleTopicHint.
  ///
  /// In en, this message translates to:
  /// **'music, coding, travel…'**
  String get peopleTopicHint;

  /// No description provided for @peopleInterestHint.
  ///
  /// In en, this message translates to:
  /// **'photography, cooking, travel…'**
  String get peopleInterestHint;

  /// No description provided for @peopleOnMesh.
  ///
  /// In en, this message translates to:
  /// **'People on the mesh'**
  String get peopleOnMesh;

  /// No description provided for @peopleResults.
  ///
  /// In en, this message translates to:
  /// **'Results'**
  String get peopleResults;

  /// No description provided for @peopleEmpty.
  ///
  /// In en, this message translates to:
  /// **'No people to show yet.'**
  String get peopleEmpty;

  /// No description provided for @peopleProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get peopleProfile;

  /// No description provided for @peopleBlog.
  ///
  /// In en, this message translates to:
  /// **'Blog'**
  String get peopleBlog;

  /// No description provided for @peopleSayHello.
  ///
  /// In en, this message translates to:
  /// **'Say Hello'**
  String get peopleSayHello;

  /// No description provided for @peopleHelloSent.
  ///
  /// In en, this message translates to:
  /// **'Hello sent'**
  String get peopleHelloSent;

  /// No description provided for @peopleEnterSearch.
  ///
  /// In en, this message translates to:
  /// **'Enter a topic or interest to search.'**
  String get peopleEnterSearch;

  /// No description provided for @peopleNoMatches.
  ///
  /// In en, this message translates to:
  /// **'No matches for that search.'**
  String get peopleNoMatches;

  /// No description provided for @peopleNoneFound.
  ///
  /// In en, this message translates to:
  /// **'No public people found on the mesh yet.'**
  String get peopleNoneFound;

  /// No description provided for @peopleHelloMessage.
  ///
  /// In en, this message translates to:
  /// **'Hi — I\'d like to connect on Envoy.'**
  String get peopleHelloMessage;

  /// No description provided for @peopleOpenLink.
  ///
  /// In en, this message translates to:
  /// **'Open link'**
  String get peopleOpenLink;

  /// No description provided for @filesPairHint.
  ///
  /// In en, this message translates to:
  /// **'Pair with a home node to manage My Files.'**
  String get filesPairHint;

  /// No description provided for @filesConnectHint.
  ///
  /// In en, this message translates to:
  /// **'Connect to a home node to manage files.'**
  String get filesConnectHint;

  /// No description provided for @filesSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search library'**
  String get filesSearchHint;

  /// No description provided for @filesVaultHint.
  ///
  /// In en, this message translates to:
  /// **'Vault library — chat attachments and profile photos stay in chat / Profile'**
  String get filesVaultHint;

  /// No description provided for @filesEmpty.
  ///
  /// In en, this message translates to:
  /// **'No library files yet.'**
  String get filesEmpty;

  /// No description provided for @filesImported.
  ///
  /// In en, this message translates to:
  /// **'Imported {name}'**
  String filesImported(String name);

  /// No description provided for @filesImportFailed.
  ///
  /// In en, this message translates to:
  /// **'Import failed: {error}'**
  String filesImportFailed(String error);

  /// No description provided for @filesPreviewFailed.
  ///
  /// In en, this message translates to:
  /// **'Preview failed: {error}'**
  String filesPreviewFailed(String error);

  /// No description provided for @filesNoContactsShare.
  ///
  /// In en, this message translates to:
  /// **'No bonded contacts to share with'**
  String get filesNoContactsShare;

  /// No description provided for @filesShareWith.
  ///
  /// In en, this message translates to:
  /// **'Share with…'**
  String get filesShareWith;

  /// No description provided for @filesShareSent.
  ///
  /// In en, this message translates to:
  /// **'Share sent'**
  String get filesShareSent;

  /// No description provided for @filesShareFailed.
  ///
  /// In en, this message translates to:
  /// **'Share failed: {error}'**
  String filesShareFailed(String error);

  /// No description provided for @filesImport.
  ///
  /// In en, this message translates to:
  /// **'Import'**
  String get filesImport;

  /// No description provided for @filesPreviewUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Preview not available for {mime} ({bytes} bytes).'**
  String filesPreviewUnavailable(String mime, int bytes);

  /// No description provided for @publishedTitle.
  ///
  /// In en, this message translates to:
  /// **'Published content — {name}'**
  String publishedTitle(String name);

  /// No description provided for @publishedPhotoWall.
  ///
  /// In en, this message translates to:
  /// **'Photo'**
  String get publishedPhotoWall;

  /// No description provided for @publishedFeed.
  ///
  /// In en, this message translates to:
  /// **'Feed'**
  String get publishedFeed;

  /// No description provided for @engagementCommentHint.
  ///
  /// In en, this message translates to:
  /// **'Write a comment…'**
  String get engagementCommentHint;

  /// No description provided for @engagementRemoveCommentTooltip.
  ///
  /// In en, this message translates to:
  /// **'Remove comment'**
  String get engagementRemoveCommentTooltip;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @profileMyTitle.
  ///
  /// In en, this message translates to:
  /// **'My profile'**
  String get profileMyTitle;

  /// No description provided for @profileUnnamed.
  ///
  /// In en, this message translates to:
  /// **'Unnamed'**
  String get profileUnnamed;

  /// No description provided for @profileRemovePhotoTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove photo?'**
  String get profileRemovePhotoTitle;

  /// No description provided for @profileNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Display name or username is required'**
  String get profileNameRequired;

  /// No description provided for @profileSaved.
  ///
  /// In en, this message translates to:
  /// **'Profile saved'**
  String get profileSaved;

  /// No description provided for @profileUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get profileUsername;

  /// No description provided for @profileBio.
  ///
  /// In en, this message translates to:
  /// **'Bio'**
  String get profileBio;

  /// No description provided for @profileBioHint.
  ///
  /// In en, this message translates to:
  /// **'Add a short bio so contacts recognize you.'**
  String get profileBioHint;

  /// No description provided for @profilePhotos.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get profilePhotos;

  /// No description provided for @profileNoPhotosYet.
  ///
  /// In en, this message translates to:
  /// **'No photos yet — add one to your wall'**
  String get profileNoPhotosYet;

  /// No description provided for @profileNoPhotosShared.
  ///
  /// In en, this message translates to:
  /// **'No photos shared'**
  String get profileNoPhotosShared;

  /// No description provided for @profileLongPressRemove.
  ///
  /// In en, this message translates to:
  /// **'Long-press a photo to remove it'**
  String get profileLongPressRemove;

  /// No description provided for @contactsSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search contacts…'**
  String get contactsSearchHint;

  /// No description provided for @contactsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No contacts yet'**
  String get contactsEmpty;

  /// No description provided for @contactsEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Your bonded contacts will appear here.'**
  String get contactsEmptyHint;

  /// No description provided for @contactsChat.
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get contactsChat;

  /// No description provided for @callIncoming.
  ///
  /// In en, this message translates to:
  /// **'Incoming voice call'**
  String get callIncoming;

  /// No description provided for @callConnected.
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get callConnected;

  /// No description provided for @callConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get callConnecting;

  /// No description provided for @callDisconnected.
  ///
  /// In en, this message translates to:
  /// **'Disconnected'**
  String get callDisconnected;

  /// No description provided for @callSwitchCamera.
  ///
  /// In en, this message translates to:
  /// **'Switch camera'**
  String get callSwitchCamera;

  /// No description provided for @authorPublish.
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get authorPublish;

  /// No description provided for @authorType.
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get authorType;

  /// No description provided for @authorTypeProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get authorTypeProfile;

  /// No description provided for @authorTypePhoto.
  ///
  /// In en, this message translates to:
  /// **'PhotoWall photo'**
  String get authorTypePhoto;

  /// No description provided for @authorTypeBlog.
  ///
  /// In en, this message translates to:
  /// **'Blog post'**
  String get authorTypeBlog;

  /// No description provided for @authorVisPublic.
  ///
  /// In en, this message translates to:
  /// **'Public'**
  String get authorVisPublic;

  /// No description provided for @authorVisBonded.
  ///
  /// In en, this message translates to:
  /// **'Bonded'**
  String get authorVisBonded;

  /// No description provided for @authorVisPrivate.
  ///
  /// In en, this message translates to:
  /// **'Private'**
  String get authorVisPrivate;

  /// No description provided for @authorCaption.
  ///
  /// In en, this message translates to:
  /// **'Caption'**
  String get authorCaption;

  /// No description provided for @authorCaptionOptional.
  ///
  /// In en, this message translates to:
  /// **'Caption (optional)'**
  String get authorCaptionOptional;

  /// No description provided for @authorBody.
  ///
  /// In en, this message translates to:
  /// **'Body'**
  String get authorBody;

  /// No description provided for @authorBodyMarkdown.
  ///
  /// In en, this message translates to:
  /// **'Body (markdown)'**
  String get authorBodyMarkdown;

  /// No description provided for @authorTitle.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get authorTitle;

  /// No description provided for @authorTitleRequired.
  ///
  /// In en, this message translates to:
  /// **'Title is required'**
  String get authorTitleRequired;

  /// No description provided for @authorPickPhoto.
  ///
  /// In en, this message translates to:
  /// **'Pick a photo first'**
  String get authorPickPhoto;

  /// No description provided for @authorChooseAvatar.
  ///
  /// In en, this message translates to:
  /// **'Choose avatar'**
  String get authorChooseAvatar;

  /// No description provided for @authorChoosePhoto.
  ///
  /// In en, this message translates to:
  /// **'Choose photo'**
  String get authorChoosePhoto;

  /// No description provided for @aiDraftButton.
  ///
  /// In en, this message translates to:
  /// **'Draft with AI'**
  String get aiDraftButton;

  /// No description provided for @aiDraftEmphasize.
  ///
  /// In en, this message translates to:
  /// **'What should it emphasize? (optional)'**
  String get aiDraftEmphasize;

  /// No description provided for @aiDraftEmphasizeHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. weekend hike with friends'**
  String get aiDraftEmphasizeHint;

  /// No description provided for @aiDraftMode.
  ///
  /// In en, this message translates to:
  /// **'Mode'**
  String get aiDraftMode;

  /// No description provided for @aiDraftTone.
  ///
  /// In en, this message translates to:
  /// **'Tone'**
  String get aiDraftTone;

  /// No description provided for @aiDraftRewrite.
  ///
  /// In en, this message translates to:
  /// **'Rewrite'**
  String get aiDraftRewrite;

  /// No description provided for @aiDraftExpand.
  ///
  /// In en, this message translates to:
  /// **'Expand'**
  String get aiDraftExpand;

  /// No description provided for @aiDraftShorten.
  ///
  /// In en, this message translates to:
  /// **'Shorten'**
  String get aiDraftShorten;

  /// No description provided for @aiDraftGenerate.
  ///
  /// In en, this message translates to:
  /// **'Generate'**
  String get aiDraftGenerate;

  /// No description provided for @aiDraftNoModel.
  ///
  /// In en, this message translates to:
  /// **'No AI model configured on the home node.'**
  String get aiDraftNoModel;

  /// No description provided for @aiDraftEmpty.
  ///
  /// In en, this message translates to:
  /// **'Empty draft from model'**
  String get aiDraftEmpty;

  /// No description provided for @aiDraftBio.
  ///
  /// In en, this message translates to:
  /// **'Draft bio'**
  String get aiDraftBio;

  /// No description provided for @aiDraftBlog.
  ///
  /// In en, this message translates to:
  /// **'Draft blog post'**
  String get aiDraftBlog;

  /// No description provided for @aiDraftFeed.
  ///
  /// In en, this message translates to:
  /// **'Draft Feed update'**
  String get aiDraftFeed;

  /// No description provided for @aiDraftCaption.
  ///
  /// In en, this message translates to:
  /// **'Draft caption'**
  String get aiDraftCaption;

  /// No description provided for @settingsAiModelIntro.
  ///
  /// In en, this message translates to:
  /// **'Cloud model provider for the home-node assistant. Changes apply on the next assistant turn.'**
  String get settingsAiModelIntro;

  /// No description provided for @settingsHomeUses.
  ///
  /// In en, this message translates to:
  /// **'Home uses {mode}'**
  String settingsHomeUses(String mode);

  /// No description provided for @settingsEndpoint.
  ///
  /// In en, this message translates to:
  /// **'Endpoint:'**
  String get settingsEndpoint;

  /// No description provided for @settingsModelLabel.
  ///
  /// In en, this message translates to:
  /// **'Model:'**
  String get settingsModelLabel;

  /// No description provided for @settingsEditOnSocial.
  ///
  /// In en, this message translates to:
  /// **'Edit this provider on the home-node Social UI for advanced options.'**
  String get settingsEditOnSocial;

  /// No description provided for @settingsProvider.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get settingsProvider;

  /// No description provided for @settingsEndpointUrl.
  ///
  /// In en, this message translates to:
  /// **'Endpoint URL'**
  String get settingsEndpointUrl;

  /// No description provided for @settingsModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get settingsModel;

  /// No description provided for @settingsCustomModel.
  ///
  /// In en, this message translates to:
  /// **'Custom model name'**
  String get settingsCustomModel;

  /// No description provided for @settingsApiKey.
  ///
  /// In en, this message translates to:
  /// **'API key'**
  String get settingsApiKey;

  /// No description provided for @settingsApiKeySaved.
  ///
  /// In en, this message translates to:
  /// **'A key is already saved on the home node'**
  String get settingsApiKeySaved;

  /// No description provided for @settingsAiModelSaved.
  ///
  /// In en, this message translates to:
  /// **'AI model saved'**
  String get settingsAiModelSaved;

  /// No description provided for @settingsAiModelTestChat.
  ///
  /// In en, this message translates to:
  /// **'Test chat model'**
  String get settingsAiModelTestChat;

  /// No description provided for @settingsAiModelTestChatBusy.
  ///
  /// In en, this message translates to:
  /// **'Testing…'**
  String get settingsAiModelTestChatBusy;

  /// No description provided for @settingsAiModelTestChatOk.
  ///
  /// In en, this message translates to:
  /// **'Chat model OK — {modelName} in {latencyMs} ms'**
  String settingsAiModelTestChatOk(String modelName, int latencyMs);

  /// No description provided for @settingsAiModelTestChatFail.
  ///
  /// In en, this message translates to:
  /// **'Chat model failed: {error}'**
  String settingsAiModelTestChatFail(String error);

  /// No description provided for @settingsSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Save failed: {error}'**
  String settingsSaveFailed(String error);

  /// No description provided for @settingsDefault.
  ///
  /// In en, this message translates to:
  /// **'(default)'**
  String get settingsDefault;

  /// No description provided for @settingsAiEngineIntro.
  ///
  /// In en, this message translates to:
  /// **'Choose which external agent the home node forwards assistant turns to.'**
  String get settingsAiEngineIntro;

  /// No description provided for @settingsExternalAgent.
  ///
  /// In en, this message translates to:
  /// **'External agent'**
  String get settingsExternalAgent;

  /// No description provided for @settingsWebhookUrl.
  ///
  /// In en, this message translates to:
  /// **'Webhook URL'**
  String get settingsWebhookUrl;

  /// No description provided for @settingsHowToStart.
  ///
  /// In en, this message translates to:
  /// **'How to start'**
  String get settingsHowToStart;

  /// No description provided for @settingsBuiltIntoHome.
  ///
  /// In en, this message translates to:
  /// **'Built into the home node'**
  String get settingsBuiltIntoHome;

  /// No description provided for @settingsNoExtProcess.
  ///
  /// In en, this message translates to:
  /// **'No separate Ext Agent process required.'**
  String get settingsNoExtProcess;

  /// No description provided for @settingsBridgePort.
  ///
  /// In en, this message translates to:
  /// **'Bridge listen port'**
  String get settingsBridgePort;

  /// No description provided for @settingsBridgeEnabled.
  ///
  /// In en, this message translates to:
  /// **'Bridge enabled'**
  String get settingsBridgeEnabled;

  /// No description provided for @settingsBridgeHint.
  ///
  /// In en, this message translates to:
  /// **'Forward assistant turns to the selected external agent.'**
  String get settingsBridgeHint;

  /// No description provided for @settingsOpenClawEnabled.
  ///
  /// In en, this message translates to:
  /// **'OpenClaw enabled'**
  String get settingsOpenClawEnabled;

  /// No description provided for @settingsOpenClawHint.
  ///
  /// In en, this message translates to:
  /// **'Built-in OpenClaw gateway (EnvoyAI) on next node start.'**
  String get settingsOpenClawHint;

  /// No description provided for @settingsOpenClawUnavailable.
  ///
  /// In en, this message translates to:
  /// **'OpenClaw status unavailable'**
  String get settingsOpenClawUnavailable;

  /// No description provided for @settingsOpenClawStatus.
  ///
  /// In en, this message translates to:
  /// **'OpenClaw {state}'**
  String settingsOpenClawStatus(String state);

  /// No description provided for @settingsExtAgentStatus.
  ///
  /// In en, this message translates to:
  /// **'Ext Agent {state}'**
  String settingsExtAgentStatus(String state);

  /// No description provided for @settingsEnabled.
  ///
  /// In en, this message translates to:
  /// **'enabled'**
  String get settingsEnabled;

  /// No description provided for @settingsDisabled.
  ///
  /// In en, this message translates to:
  /// **'disabled'**
  String get settingsDisabled;

  /// No description provided for @settingsAiEngineSaved.
  ///
  /// In en, this message translates to:
  /// **'AI Engine saved'**
  String get settingsAiEngineSaved;

  /// No description provided for @settingsNotConnectedNode.
  ///
  /// In en, this message translates to:
  /// **'Not connected to a home node'**
  String get settingsNotConnectedNode;

  /// No description provided for @settingsPiState.
  ///
  /// In en, this message translates to:
  /// **'State: {state}'**
  String settingsPiState(String state);

  /// No description provided for @settingsPiBuiltIn.
  ///
  /// In en, this message translates to:
  /// **'Built-in local coding agent'**
  String get settingsPiBuiltIn;

  /// No description provided for @settingsPiLocalOnly.
  ///
  /// In en, this message translates to:
  /// **'Local-only coding agent (no mesh tools).'**
  String get settingsPiLocalOnly;

  /// No description provided for @settingsPiEnabled.
  ///
  /// In en, this message translates to:
  /// **'Pi enabled'**
  String get settingsPiEnabled;

  /// No description provided for @settingsPiCodingBackend.
  ///
  /// In en, this message translates to:
  /// **'Coding backend'**
  String get settingsPiCodingBackend;

  /// No description provided for @settingsPiCodingBackendPi.
  ///
  /// In en, this message translates to:
  /// **'Pi (sidecar)'**
  String get settingsPiCodingBackendPi;

  /// No description provided for @settingsPiCodingBackendEh.
  ///
  /// In en, this message translates to:
  /// **'envoy-harness (ACP)'**
  String get settingsPiCodingBackendEh;

  /// No description provided for @settingsPiCodingBackendHint.
  ///
  /// In en, this message translates to:
  /// **'Same setting as Social. Routes sendToPi and approvals through the same Pi UI. Older EnvoyGo builds without this control still work when switched from Social.'**
  String get settingsPiCodingBackendHint;

  /// No description provided for @settingsPiCodingBackendSaved.
  ///
  /// In en, this message translates to:
  /// **'Coding backend updated'**
  String get settingsPiCodingBackendSaved;

  /// No description provided for @settingsPiOverrideHint.
  ///
  /// In en, this message translates to:
  /// **'Model override (optional). Clear to inherit AI Model settings.'**
  String get settingsPiOverrideHint;

  /// No description provided for @settingsPiModelName.
  ///
  /// In en, this message translates to:
  /// **'Model name'**
  String get settingsPiModelName;

  /// No description provided for @settingsPiEndpoint.
  ///
  /// In en, this message translates to:
  /// **'Endpoint'**
  String get settingsPiEndpoint;

  /// No description provided for @settingsPiLeaveBlankKey.
  ///
  /// In en, this message translates to:
  /// **'Leave blank to keep the saved key'**
  String get settingsPiLeaveBlankKey;

  /// No description provided for @settingsPiSaveOverride.
  ///
  /// In en, this message translates to:
  /// **'Save model override'**
  String get settingsPiSaveOverride;

  /// No description provided for @settingsPiClearOverride.
  ///
  /// In en, this message translates to:
  /// **'Clear override (inherit AI Model)'**
  String get settingsPiClearOverride;

  /// No description provided for @settingsPiModelSaved.
  ///
  /// In en, this message translates to:
  /// **'Pi model saved'**
  String get settingsPiModelSaved;

  /// No description provided for @settingsPiModelRequired.
  ///
  /// In en, this message translates to:
  /// **'Model name is required'**
  String get settingsPiModelRequired;

  /// No description provided for @settingsPiInherits.
  ///
  /// In en, this message translates to:
  /// **'Pi inherits EnvoyMesh model settings'**
  String get settingsPiInherits;

  /// No description provided for @settingsPiFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed: {error}'**
  String settingsPiFailed(String error);

  /// No description provided for @settingsPiClearFailed.
  ///
  /// In en, this message translates to:
  /// **'Clear failed: {error}'**
  String settingsPiClearFailed(String error);

  /// No description provided for @settingsPiProviderCustom.
  ///
  /// In en, this message translates to:
  /// **'{provider} (custom)'**
  String settingsPiProviderCustom(String provider);

  /// No description provided for @aiEngineReadonlyHint.
  ///
  /// In en, this message translates to:
  /// **'Both blocks are read-only on mobile. Configure on the home node (Settings → AI → AI Engine).'**
  String get aiEngineReadonlyHint;

  /// No description provided for @aiEngineBuiltInOpenClaw.
  ///
  /// In en, this message translates to:
  /// **'Built-in OpenClaw'**
  String get aiEngineBuiltInOpenClaw;

  /// No description provided for @aiEngineExtBridge.
  ///
  /// In en, this message translates to:
  /// **'External Agent Bridge'**
  String get aiEngineExtBridge;

  /// No description provided for @aiEngineModeBoth.
  ///
  /// In en, this message translates to:
  /// **'Built-in + Ext'**
  String get aiEngineModeBoth;

  /// No description provided for @aiEngineModeBuiltIn.
  ///
  /// In en, this message translates to:
  /// **'Built-in only'**
  String get aiEngineModeBuiltIn;

  /// No description provided for @aiEngineModeExt.
  ///
  /// In en, this message translates to:
  /// **'Ext only'**
  String get aiEngineModeExt;

  /// No description provided for @aiEngineModeNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get aiEngineModeNone;

  /// No description provided for @aiEngineRunning.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get aiEngineRunning;

  /// No description provided for @aiEngineConfigured.
  ///
  /// In en, this message translates to:
  /// **'Configured (not running)'**
  String get aiEngineConfigured;

  /// No description provided for @aiEngineDisabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get aiEngineDisabled;

  /// No description provided for @browserTitle.
  ///
  /// In en, this message translates to:
  /// **'Browser'**
  String get browserTitle;

  /// No description provided for @browserGo.
  ///
  /// In en, this message translates to:
  /// **'Go'**
  String get browserGo;

  /// No description provided for @browserBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get browserBack;

  /// No description provided for @browserForward.
  ///
  /// In en, this message translates to:
  /// **'Forward'**
  String get browserForward;

  /// No description provided for @browserReload.
  ///
  /// In en, this message translates to:
  /// **'Reload'**
  String get browserReload;

  /// No description provided for @browserPairFirst.
  ///
  /// In en, this message translates to:
  /// **'Not connected to home node — pair and reconnect first.'**
  String get browserPairFirst;

  /// No description provided for @browserIntegrityFailed.
  ///
  /// In en, this message translates to:
  /// **'Content integrity check failed — refused to render'**
  String get browserIntegrityFailed;

  /// No description provided for @browserDecodeImageFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to decode image: {error}'**
  String browserDecodeImageFailed(String error);

  /// No description provided for @browserPhoto.
  ///
  /// In en, this message translates to:
  /// **'Photo'**
  String get browserPhoto;

  /// No description provided for @browserPhotos.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get browserPhotos;

  /// No description provided for @browserNoPhotos.
  ///
  /// In en, this message translates to:
  /// **'No photos yet.'**
  String get browserNoPhotos;

  /// No description provided for @browserHint.
  ///
  /// In en, this message translates to:
  /// **'Enter an envoy:// URL to browse content served by a bonded contact.'**
  String get browserHint;

  /// No description provided for @extSwitchTitle.
  ///
  /// In en, this message translates to:
  /// **'Switch Ext Agent'**
  String get extSwitchTitle;

  /// No description provided for @extSwitchTooltip.
  ///
  /// In en, this message translates to:
  /// **'Switch Ext Agent ({name})'**
  String extSwitchTooltip(String name);

  /// No description provided for @extNotRunningChat.
  ///
  /// In en, this message translates to:
  /// **'{name} is not running — start it before chatting.'**
  String extNotRunningChat(String name);

  /// No description provided for @extSwitchFailed.
  ///
  /// In en, this message translates to:
  /// **'Switch failed: {error}'**
  String extSwitchFailed(String error);

  /// No description provided for @extNotRunning.
  ///
  /// In en, this message translates to:
  /// **'{name} is not running'**
  String extNotRunning(String name);

  /// No description provided for @extChecking.
  ///
  /// In en, this message translates to:
  /// **'Checking…'**
  String get extChecking;

  /// No description provided for @extCheckAgain.
  ///
  /// In en, this message translates to:
  /// **'Check again'**
  String get extCheckAgain;

  /// No description provided for @audioLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading audio…'**
  String get audioLoading;

  /// No description provided for @audioUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Audio unavailable'**
  String get audioUnavailable;

  /// No description provided for @audioVoiceNote.
  ///
  /// In en, this message translates to:
  /// **'Voice note'**
  String get audioVoiceNote;

  /// No description provided for @meLastAttempt.
  ///
  /// In en, this message translates to:
  /// **'Last attempt: {time}'**
  String meLastAttempt(String time);

  /// No description provided for @meJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get meJustNow;

  /// No description provided for @mePublicIpLabel.
  ///
  /// In en, this message translates to:
  /// **'Public IP or domain'**
  String get mePublicIpLabel;

  /// No description provided for @mePublicIpHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. 1.2.3.4 or mynode.example.com'**
  String get mePublicIpHint;

  /// No description provided for @mePublicIpHelp.
  ///
  /// In en, this message translates to:
  /// **'Set this if your home node has a public IP or domain.\nEnables direct connection without the relay on 5G/WAN.'**
  String get mePublicIpHelp;

  /// No description provided for @meNetworkDebug.
  ///
  /// In en, this message translates to:
  /// **'Network Debug'**
  String get meNetworkDebug;

  /// No description provided for @meRunNetworkTests.
  ///
  /// In en, this message translates to:
  /// **'Run Network Tests'**
  String get meRunNetworkTests;

  /// No description provided for @meTesting.
  ///
  /// In en, this message translates to:
  /// **'Testing…'**
  String get meTesting;

  /// No description provided for @meNetworkTestsHint.
  ///
  /// In en, this message translates to:
  /// **'Tests all paths EnvoyGo uses for pairing.'**
  String get meNetworkTestsHint;

  /// No description provided for @meSwitchNode.
  ///
  /// In en, this message translates to:
  /// **'Switch Node'**
  String get meSwitchNode;

  /// No description provided for @chainsRecentTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent team jobs'**
  String get chainsRecentTitle;

  /// No description provided for @chainsActiveTitle.
  ///
  /// In en, this message translates to:
  /// **'Active team jobs'**
  String get chainsActiveTitle;

  /// No description provided for @chainsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to load chains'**
  String get chainsLoadFailed;

  /// No description provided for @chainsNoReports.
  ///
  /// In en, this message translates to:
  /// **'No reports yet'**
  String get chainsNoReports;

  /// No description provided for @chainsEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Team jobs you run on the home node will appear here.\nStart one from this phone or from the home Social UI.'**
  String get chainsEmptyHint;

  /// No description provided for @chainsNoActive.
  ///
  /// In en, this message translates to:
  /// **'No active team jobs on the home node.\nStart one with the button below.'**
  String get chainsNoActive;

  /// No description provided for @chainsReportGone.
  ///
  /// In en, this message translates to:
  /// **'This report is no longer available'**
  String get chainsReportGone;

  /// No description provided for @chainsReportGoneHint.
  ///
  /// In en, this message translates to:
  /// **'It may have been removed by the 90-day GC policy.'**
  String get chainsReportGoneHint;

  /// No description provided for @chainsBackToRecent.
  ///
  /// In en, this message translates to:
  /// **'Back to Recent team jobs'**
  String get chainsBackToRecent;

  /// No description provided for @chainsLoadReportFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to load report'**
  String get chainsLoadReportFailed;

  /// No description provided for @chainsSummary.
  ///
  /// In en, this message translates to:
  /// **'Summary'**
  String get chainsSummary;

  /// No description provided for @chainsWorkers.
  ///
  /// In en, this message translates to:
  /// **'Workers'**
  String get chainsWorkers;

  /// No description provided for @chainsSubtasks.
  ///
  /// In en, this message translates to:
  /// **'Subtasks'**
  String get chainsSubtasks;

  /// No description provided for @chainsSynthesis.
  ///
  /// In en, this message translates to:
  /// **'Synthesis'**
  String get chainsSynthesis;

  /// No description provided for @chainsDuration.
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get chainsDuration;

  /// No description provided for @chainsManageOnSocial.
  ///
  /// In en, this message translates to:
  /// **'Fleet setup, bidding, and recipes stay on the home-node Social UI. Cancel, rebalance, and pin work here too.'**
  String get chainsManageOnSocial;

  /// No description provided for @chainsStartTitle.
  ///
  /// In en, this message translates to:
  /// **'Start team job'**
  String get chainsStartTitle;

  /// No description provided for @chainsStartFab.
  ///
  /// In en, this message translates to:
  /// **'New team job'**
  String get chainsStartFab;

  /// No description provided for @chainsStartIntro.
  ///
  /// In en, this message translates to:
  /// **'Describe a goal. The home node plans subtasks and assigns bonded Agent Network workers.'**
  String get chainsStartIntro;

  /// No description provided for @chainsStartAssignmentMode.
  ///
  /// In en, this message translates to:
  /// **'Assignment mode'**
  String get chainsStartAssignmentMode;

  /// No description provided for @chainsStartModeSkill.
  ///
  /// In en, this message translates to:
  /// **'By skill'**
  String get chainsStartModeSkill;

  /// No description provided for @chainsStartModeRole.
  ///
  /// In en, this message translates to:
  /// **'By role'**
  String get chainsStartModeRole;

  /// No description provided for @chainsStartModeSkillHint.
  ///
  /// In en, this message translates to:
  /// **'Workers are ranked by matching skills.'**
  String get chainsStartModeSkillHint;

  /// No description provided for @chainsStartModeRoleHint.
  ///
  /// In en, this message translates to:
  /// **'Each step prefers a collaboration role (PM, programmer, …).'**
  String get chainsStartModeRoleHint;

  /// No description provided for @chainsStartGoalLabel.
  ///
  /// In en, this message translates to:
  /// **'Goal'**
  String get chainsStartGoalLabel;

  /// No description provided for @chainsStartGoalHint.
  ///
  /// In en, this message translates to:
  /// **'What should the team accomplish?'**
  String get chainsStartGoalHint;

  /// No description provided for @chainsStartGoalTooShort.
  ///
  /// In en, this message translates to:
  /// **'Goal must be at least {min} characters'**
  String chainsStartGoalTooShort(int min);

  /// No description provided for @chainsStartAttachmentsLabel.
  ///
  /// In en, this message translates to:
  /// **'Attachments'**
  String get chainsStartAttachmentsLabel;

  /// No description provided for @chainsStartAttachmentsAdd.
  ///
  /// In en, this message translates to:
  /// **'Add files'**
  String get chainsStartAttachmentsAdd;

  /// No description provided for @chainsStartAttachmentsHint.
  ///
  /// In en, this message translates to:
  /// **'Tip: add a short label per file (e.g. brief), then mention [brief] in your goal so workers know which file to use — even when the filename is long or unclear.'**
  String get chainsStartAttachmentsHint;

  /// No description provided for @chainsStartAttachmentsMax.
  ///
  /// In en, this message translates to:
  /// **'You can attach up to {max} files'**
  String chainsStartAttachmentsMax(int max);

  /// No description provided for @chainsStartAttachmentTooLarge.
  ///
  /// In en, this message translates to:
  /// **'{name} is too large (max {maxMb} MB)'**
  String chainsStartAttachmentTooLarge(String name, int maxMb);

  /// No description provided for @chainsStartAttachmentUploading.
  ///
  /// In en, this message translates to:
  /// **'Uploading…'**
  String get chainsStartAttachmentUploading;

  /// No description provided for @chainsStartAttachmentFailed.
  ///
  /// In en, this message translates to:
  /// **'Upload failed'**
  String get chainsStartAttachmentFailed;

  /// No description provided for @chainsStartAttachmentLabel.
  ///
  /// In en, this message translates to:
  /// **'Label'**
  String get chainsStartAttachmentLabel;

  /// No description provided for @chainsStartAttachmentLabelHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. brief, sales data'**
  String get chainsStartAttachmentLabelHint;

  /// No description provided for @chainsStartAttachmentRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove attachment'**
  String get chainsStartAttachmentRemove;

  /// No description provided for @chainsStartPreview.
  ///
  /// In en, this message translates to:
  /// **'Preview plan'**
  String get chainsStartPreview;

  /// No description provided for @chainsStartPreviewing.
  ///
  /// In en, this message translates to:
  /// **'Planning…'**
  String get chainsStartPreviewing;

  /// No description provided for @chainsStartPreviewFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not build a plan'**
  String get chainsStartPreviewFailed;

  /// No description provided for @chainsStartNeedPreview.
  ///
  /// In en, this message translates to:
  /// **'Preview a plan before starting'**
  String get chainsStartNeedPreview;

  /// No description provided for @chainsStartPlanHeading.
  ///
  /// In en, this message translates to:
  /// **'Plan'**
  String get chainsStartPlanHeading;

  /// No description provided for @chainsStartNoSubtasks.
  ///
  /// In en, this message translates to:
  /// **'No subtasks in this plan.'**
  String get chainsStartNoSubtasks;

  /// No description provided for @chainsStartConfirm.
  ///
  /// In en, this message translates to:
  /// **'Start team job'**
  String get chainsStartConfirm;

  /// No description provided for @chainsStartStarting.
  ///
  /// In en, this message translates to:
  /// **'Starting…'**
  String get chainsStartStarting;

  /// No description provided for @chainsStartStarted.
  ///
  /// In en, this message translates to:
  /// **'Team job started'**
  String get chainsStartStarted;

  /// No description provided for @chainsStartFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not start the team job'**
  String get chainsStartFailed;

  /// No description provided for @chainsStartNoWorkers.
  ///
  /// In en, this message translates to:
  /// **'No reachable Agent Network workers. Bond contacts with agents on the home node first.'**
  String get chainsStartNoWorkers;

  /// No description provided for @chainsStartReadinessTitle.
  ///
  /// In en, this message translates to:
  /// **'Get workers ready'**
  String get chainsStartReadinessTitle;

  /// No description provided for @chainsStartReadinessJoinOff.
  ///
  /// In en, this message translates to:
  /// **'On the home computer: Team jobs → Manage workers → turn on Join Agent Network.'**
  String get chainsStartReadinessJoinOff;

  /// No description provided for @chainsStartReadinessBond.
  ///
  /// In en, this message translates to:
  /// **'Bond contacts in Discover (Social or this phone), then ask them to Join Agent Network.'**
  String get chainsStartReadinessBond;

  /// No description provided for @chainsStartReadinessRefresh.
  ///
  /// In en, this message translates to:
  /// **'On Social Team jobs, open Manage workers and refresh cards, then preview again here.'**
  String get chainsStartReadinessRefresh;

  /// No description provided for @chainsStepsTitle.
  ///
  /// In en, this message translates to:
  /// **'Job steps'**
  String get chainsStepsTitle;

  /// No description provided for @chainsStepsWaitingOn.
  ///
  /// In en, this message translates to:
  /// **'Waiting on:'**
  String get chainsStepsWaitingOn;

  /// No description provided for @chainsAttachmentHonesty.
  ///
  /// In en, this message translates to:
  /// **'Files you attach live on this home’s vault. When a worker is assigned, they receive a copy of those inputs under their Team job workspace — not a standing mirror of your Library.'**
  String get chainsAttachmentHonesty;

  /// No description provided for @chainsDeliveryTitle.
  ///
  /// In en, this message translates to:
  /// **'Input delivery'**
  String get chainsDeliveryTitle;

  /// No description provided for @chainsDeliveryRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get chainsDeliveryRetry;

  /// No description provided for @chainsDeliveryRetried.
  ///
  /// In en, this message translates to:
  /// **'Input delivery retried'**
  String get chainsDeliveryRetried;

  /// No description provided for @chainsDeliveryRetryFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not retry input delivery'**
  String get chainsDeliveryRetryFailed;

  /// No description provided for @chainsDeliveryPhasePending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get chainsDeliveryPhasePending;

  /// No description provided for @chainsDeliveryPhaseTransferring.
  ///
  /// In en, this message translates to:
  /// **'Transferring'**
  String get chainsDeliveryPhaseTransferring;

  /// No description provided for @chainsDeliveryPhaseVerified.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get chainsDeliveryPhaseVerified;

  /// No description provided for @chainsDeliveryPhaseFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get chainsDeliveryPhaseFailed;

  /// No description provided for @chainsInputDeliveryScope.
  ///
  /// In en, this message translates to:
  /// **'Input delivery'**
  String get chainsInputDeliveryScope;

  /// No description provided for @chainsInputDeliveryScopeReferenced.
  ///
  /// In en, this message translates to:
  /// **'Referenced only'**
  String get chainsInputDeliveryScopeReferenced;

  /// No description provided for @chainsInputDeliveryScopeAll.
  ///
  /// In en, this message translates to:
  /// **'All attachments'**
  String get chainsInputDeliveryScopeAll;

  /// No description provided for @chainsInputDeliveryScopeHint.
  ///
  /// In en, this message translates to:
  /// **'Referenced (default) sends files mentioned as [label] in a step; if none match, all job attachments are sent. All sends every attachment to each awarded worker.'**
  String get chainsInputDeliveryScopeHint;

  /// No description provided for @chainsIterationAskOwnerTitle.
  ///
  /// In en, this message translates to:
  /// **'Review draft before publish'**
  String get chainsIterationAskOwnerTitle;

  /// No description provided for @chainsIterationAskOwnerBody.
  ///
  /// In en, this message translates to:
  /// **'Accept to publish, or continue for another refinement round.'**
  String get chainsIterationAskOwnerBody;

  /// No description provided for @chainsIterationAcceptDraft.
  ///
  /// In en, this message translates to:
  /// **'Accept & publish'**
  String get chainsIterationAcceptDraft;

  /// No description provided for @chainsIterationContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue refining'**
  String get chainsIterationContinue;

  /// No description provided for @chainsIterationAccepted.
  ///
  /// In en, this message translates to:
  /// **'Draft accepted — publishing'**
  String get chainsIterationAccepted;

  /// No description provided for @chainsIterationContinued.
  ///
  /// In en, this message translates to:
  /// **'Starting another refinement round'**
  String get chainsIterationContinued;

  /// No description provided for @chainsIterationResolveFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not apply your decision'**
  String get chainsIterationResolveFailed;

  /// No description provided for @chainsObservedTitle.
  ///
  /// In en, this message translates to:
  /// **'Jobs you’re on'**
  String get chainsObservedTitle;

  /// No description provided for @chainsObservedHint.
  ///
  /// In en, this message translates to:
  /// **'View only — only the Assigner can manage these jobs.'**
  String get chainsObservedHint;

  /// No description provided for @chainsObservedReadOnly.
  ///
  /// In en, this message translates to:
  /// **'View only'**
  String get chainsObservedReadOnly;

  /// No description provided for @chainsStartNeedWorkers.
  ///
  /// In en, this message translates to:
  /// **'Select at least one online worker, or preview again to restore the recommended pool.'**
  String get chainsStartNeedWorkers;

  /// No description provided for @chainsStartWorkersHint.
  ///
  /// In en, this message translates to:
  /// **'Online workers from the plan. Uncheck any you do not want. Unchecking everyone blocks Start — preview again to reset to the recommended pool.'**
  String get chainsStartWorkersHint;

  /// No description provided for @chainsStartWorkersHeading.
  ///
  /// In en, this message translates to:
  /// **'Workers'**
  String get chainsStartWorkersHeading;

  /// No description provided for @chainsStartNoSuggestedWorkers.
  ///
  /// In en, this message translates to:
  /// **'No suggested workers yet — Start will use the home node’s discovery pool.'**
  String get chainsStartNoSuggestedWorkers;

  /// No description provided for @chainsStartWorkerMatches.
  ///
  /// In en, this message translates to:
  /// **'matches {count} steps'**
  String chainsStartWorkerMatches(int count);

  /// No description provided for @chainsStartWorkerOnline.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get chainsStartWorkerOnline;

  /// No description provided for @chainsStartWorkerRelay.
  ///
  /// In en, this message translates to:
  /// **'Online (relay)'**
  String get chainsStartWorkerRelay;

  /// No description provided for @chainsStartWorkerOffline.
  ///
  /// In en, this message translates to:
  /// **'Offline / unknown'**
  String get chainsStartWorkerOffline;

  /// No description provided for @chainsActiveGone.
  ///
  /// In en, this message translates to:
  /// **'This team job is no longer active'**
  String get chainsActiveGone;

  /// No description provided for @chainsBudgetLine.
  ///
  /// In en, this message translates to:
  /// **'Budget {spent} / {max} USD'**
  String chainsBudgetLine(String spent, String max);

  /// No description provided for @chainsBudgetWarn.
  ///
  /// In en, this message translates to:
  /// **'Budget warning — consider adding budget.'**
  String get chainsBudgetWarn;

  /// No description provided for @chainsBudgetExceeded.
  ///
  /// In en, this message translates to:
  /// **'Budget exceeded — the job may stall until rebalanced.'**
  String get chainsBudgetExceeded;

  /// No description provided for @chainsPartialCount.
  ///
  /// In en, this message translates to:
  /// **'{count} partial results'**
  String chainsPartialCount(int count);

  /// No description provided for @chainsCancelTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel team job?'**
  String get chainsCancelTitle;

  /// No description provided for @chainsCancelBody.
  ///
  /// In en, this message translates to:
  /// **'Workers will be told to stop. Partial results already collected are kept.'**
  String get chainsCancelBody;

  /// No description provided for @chainsCancelConfirm.
  ///
  /// In en, this message translates to:
  /// **'Cancel job'**
  String get chainsCancelConfirm;

  /// No description provided for @chainsCancelDone.
  ///
  /// In en, this message translates to:
  /// **'Team job cancelled'**
  String get chainsCancelDone;

  /// No description provided for @chainsCancelReason.
  ///
  /// In en, this message translates to:
  /// **'Cancelled from EnvoyGo'**
  String get chainsCancelReason;

  /// No description provided for @chainsCancelStep.
  ///
  /// In en, this message translates to:
  /// **'Cancel step'**
  String get chainsCancelStep;

  /// No description provided for @chainsCancelStepTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel this step?'**
  String get chainsCancelStepTitle;

  /// No description provided for @chainsCancelStepBody.
  ///
  /// In en, this message translates to:
  /// **'This step and any steps that depend on it will stop. Partial results already collected are kept.'**
  String get chainsCancelStepBody;

  /// No description provided for @chainsCancelStepFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not cancel this step'**
  String get chainsCancelStepFailed;

  /// No description provided for @chainsReassignStep.
  ///
  /// In en, this message translates to:
  /// **'Reassign'**
  String get chainsReassignStep;

  /// No description provided for @chainsStepCancelled.
  ///
  /// In en, this message translates to:
  /// **'Step cancelled'**
  String get chainsStepCancelled;

  /// No description provided for @chainsStepReassigned.
  ///
  /// In en, this message translates to:
  /// **'Step reassigned'**
  String get chainsStepReassigned;

  /// No description provided for @chainsReassignFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not reassign this step'**
  String get chainsReassignFailed;

  /// No description provided for @chainsCancelStepReason.
  ///
  /// In en, this message translates to:
  /// **'Cancelled step from EnvoyGo'**
  String get chainsCancelStepReason;

  /// No description provided for @chainsDetailCancelled.
  ///
  /// In en, this message translates to:
  /// **'This job was cancelled.'**
  String get chainsDetailCancelled;

  /// No description provided for @chainsDetailPublished.
  ///
  /// In en, this message translates to:
  /// **'This job finished and published a report.'**
  String get chainsDetailPublished;

  /// No description provided for @chainsRebalanceHeading.
  ///
  /// In en, this message translates to:
  /// **'Add budget'**
  String get chainsRebalanceHeading;

  /// No description provided for @chainsRebalanceHint.
  ///
  /// In en, this message translates to:
  /// **'Raise the cost ceiling and retry un-awarded steps.'**
  String get chainsRebalanceHint;

  /// No description provided for @chainsRebalanceAmount.
  ///
  /// In en, this message translates to:
  /// **'Additional USD'**
  String get chainsRebalanceAmount;

  /// No description provided for @chainsRebalanceAction.
  ///
  /// In en, this message translates to:
  /// **'Add & retry'**
  String get chainsRebalanceAction;

  /// No description provided for @chainsRebalanceInvalidAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a positive dollar amount'**
  String get chainsRebalanceInvalidAmount;

  /// No description provided for @chainsRebalanceDone.
  ///
  /// In en, this message translates to:
  /// **'Budget updated'**
  String get chainsRebalanceDone;

  /// No description provided for @chainsRebalanceFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not rebalance'**
  String get chainsRebalanceFailed;

  /// No description provided for @chainsPin.
  ///
  /// In en, this message translates to:
  /// **'Pin report'**
  String get chainsPin;

  /// No description provided for @chainsUnpin.
  ///
  /// In en, this message translates to:
  /// **'Unpin report'**
  String get chainsUnpin;

  /// No description provided for @chainsPinDone.
  ///
  /// In en, this message translates to:
  /// **'Report pinned (kept past 90-day cleanup)'**
  String get chainsPinDone;

  /// No description provided for @chainsUnpinDone.
  ///
  /// In en, this message translates to:
  /// **'Report unpinned'**
  String get chainsUnpinDone;

  /// No description provided for @chainsPublished.
  ///
  /// In en, this message translates to:
  /// **'Published {date}'**
  String chainsPublished(String date);

  /// No description provided for @chainsChainId.
  ///
  /// In en, this message translates to:
  /// **'Chain {id}'**
  String chainsChainId(String id);

  /// No description provided for @termNone.
  ///
  /// In en, this message translates to:
  /// **'No terminal sessions'**
  String get termNone;

  /// No description provided for @termAttachFailed.
  ///
  /// In en, this message translates to:
  /// **'Terminal attach failed: {error}'**
  String termAttachFailed(String error);

  /// No description provided for @termCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied to clipboard'**
  String get termCopied;

  /// No description provided for @termReconnecting.
  ///
  /// In en, this message translates to:
  /// **'Reconnecting…'**
  String get termReconnecting;

  /// No description provided for @termCopyAll.
  ///
  /// In en, this message translates to:
  /// **'Copy all output'**
  String get termCopyAll;

  /// No description provided for @termPaste.
  ///
  /// In en, this message translates to:
  /// **'Paste'**
  String get termPaste;

  /// No description provided for @termCloseSession.
  ///
  /// In en, this message translates to:
  /// **'Close session'**
  String get termCloseSession;

  /// No description provided for @chatImagePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'[image]'**
  String get chatImagePlaceholder;

  /// No description provided for @chatsBotSyncing.
  ///
  /// In en, this message translates to:
  /// **'Updates sync…'**
  String get chatsBotSyncing;

  /// No description provided for @chatsBotSavedHint.
  ///
  /// In en, this message translates to:
  /// **'Saved on your home node. Chat when ready.'**
  String get chatsBotSavedHint;

  /// No description provided for @chatsBotNotFound.
  ///
  /// In en, this message translates to:
  /// **'Bot not found on home node'**
  String get chatsBotNotFound;

  /// No description provided for @chatAiDisabledAskOwner.
  ///
  /// In en, this message translates to:
  /// **'Ask the home owner to enable an AI model for family chat.'**
  String get chatAiDisabledAskOwner;

  /// No description provided for @pairingLoadProfilesFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not load existing profiles: {error}'**
  String pairingLoadProfilesFailed(String error);

  /// No description provided for @pairingFailed.
  ///
  /// In en, this message translates to:
  /// **'Pairing failed: {error}'**
  String pairingFailed(String error);

  /// No description provided for @pairingInviteAlreadyUsed.
  ///
  /// In en, this message translates to:
  /// **'This invite QR was already used. Ask the home owner to open Family → Show invite QR again, then scan the new code and choose I\'m back to select your profile (e.g. Dad).'**
  String get pairingInviteAlreadyUsed;

  /// No description provided for @pairingInProgressTitle.
  ///
  /// In en, this message translates to:
  /// **'Pairing with home'**
  String get pairingInProgressTitle;

  /// No description provided for @pairingInProgressSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Connecting to {owner}'**
  String pairingInProgressSubtitle(String owner);

  /// No description provided for @pairingElapsed.
  ///
  /// In en, this message translates to:
  /// **'Elapsed: {time}'**
  String pairingElapsed(String time);

  /// No description provided for @pairingHomeNodeLabel.
  ///
  /// In en, this message translates to:
  /// **'Home: {peer}'**
  String pairingHomeNodeLabel(String peer);

  /// No description provided for @pairingStageInitial.
  ///
  /// In en, this message translates to:
  /// **'Initializing'**
  String get pairingStageInitial;

  /// No description provided for @pairingStageInitialHint.
  ///
  /// In en, this message translates to:
  /// **'Setting up a secure channel to the home node.'**
  String get pairingStageInitialHint;

  /// No description provided for @pairingStageConnecting.
  ///
  /// In en, this message translates to:
  /// **'Reaching home'**
  String get pairingStageConnecting;

  /// No description provided for @pairingStageConnectingHint.
  ///
  /// In en, this message translates to:
  /// **'Looking for the home on your local network and via relay.'**
  String get pairingStageConnectingHint;

  /// No description provided for @pairingStageHandshaking.
  ///
  /// In en, this message translates to:
  /// **'Handshaking'**
  String get pairingStageHandshaking;

  /// No description provided for @pairingStageHandshakingHint.
  ///
  /// In en, this message translates to:
  /// **'Exchanging keys — this step can take a moment on first connect.'**
  String get pairingStageHandshakingHint;

  /// No description provided for @pairingStageVerifying.
  ///
  /// In en, this message translates to:
  /// **'Verifying'**
  String get pairingStageVerifying;

  /// No description provided for @pairingStageSlowHint.
  ///
  /// In en, this message translates to:
  /// **'Taking longer than usual. Make sure the home node is on the same Wi-Fi or has internet.'**
  String get pairingStageSlowHint;

  /// No description provided for @pairingStageVerySlowHint.
  ///
  /// In en, this message translates to:
  /// **'Pairing is taking much longer than expected. Check both devices are online, then cancel and try again.'**
  String get pairingStageVerySlowHint;

  /// No description provided for @pairingCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel pairing'**
  String get pairingCancel;

  /// No description provided for @pairingCancelConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel pairing?'**
  String get pairingCancelConfirmTitle;

  /// No description provided for @pairingCancelConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'The handshake will stop. You can try again from the QR code.'**
  String get pairingCancelConfirmBody;

  /// No description provided for @commonKeepWaiting.
  ///
  /// In en, this message translates to:
  /// **'Keep waiting'**
  String get commonKeepWaiting;

  /// No description provided for @pairingDontCloseApp.
  ///
  /// In en, this message translates to:
  /// **'Don\'t close the app — pairing runs in the background.'**
  String get pairingDontCloseApp;

  /// No description provided for @pairingNowLan.
  ///
  /// In en, this message translates to:
  /// **'Now trying your home node on the local network…'**
  String get pairingNowLan;

  /// No description provided for @pairingNowP2p.
  ///
  /// In en, this message translates to:
  /// **'Now establishing a secure peer-to-peer connection…'**
  String get pairingNowP2p;

  /// No description provided for @pairingNowRelay.
  ///
  /// In en, this message translates to:
  /// **'Now connecting through a relay server…'**
  String get pairingNowRelay;

  /// No description provided for @pairingStillWorking.
  ///
  /// In en, this message translates to:
  /// **'Still working — the first connection can take a minute or two. Please keep the app open.'**
  String get pairingStillWorking;

  /// No description provided for @pairingTroubleTitle.
  ///
  /// In en, this message translates to:
  /// **'Still having trouble?'**
  String get pairingTroubleTitle;

  /// No description provided for @pairingTroubleBody.
  ///
  /// In en, this message translates to:
  /// **'Make sure the home node is powered on and online, and that this device has internet access. If it keeps failing, cancel and try again.'**
  String get pairingTroubleBody;

  /// No description provided for @feedDefaultTitle.
  ///
  /// In en, this message translates to:
  /// **'Feed post'**
  String get feedDefaultTitle;

  /// No description provided for @aiDraftSection.
  ///
  /// In en, this message translates to:
  /// **'Draft section'**
  String get aiDraftSection;

  /// No description provided for @aiDraftFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not draft ({reason})'**
  String aiDraftFailed(String reason);

  /// No description provided for @authorAvatarNamed.
  ///
  /// In en, this message translates to:
  /// **'Avatar: {name}'**
  String authorAvatarNamed(String name);

  /// No description provided for @authorPhotoNamed.
  ///
  /// In en, this message translates to:
  /// **'Photo: {name}'**
  String authorPhotoNamed(String name);

  /// No description provided for @peopleEnvoyUser.
  ///
  /// In en, this message translates to:
  /// **'Envoy User'**
  String get peopleEnvoyUser;

  /// No description provided for @commonEllipsis.
  ///
  /// In en, this message translates to:
  /// **'…'**
  String get commonEllipsis;

  /// No description provided for @browserCached.
  ///
  /// In en, this message translates to:
  /// **'Cached'**
  String get browserCached;

  /// No description provided for @browserLoaded.
  ///
  /// In en, this message translates to:
  /// **'Loaded'**
  String get browserLoaded;

  /// No description provided for @browserNotPublished.
  ///
  /// In en, this message translates to:
  /// **'Not published yet'**
  String get browserNotPublished;

  /// No description provided for @browserNotFound.
  ///
  /// In en, this message translates to:
  /// **'Content not found'**
  String get browserNotFound;

  /// No description provided for @browserAccessDenied.
  ///
  /// In en, this message translates to:
  /// **'Access denied'**
  String get browserAccessDenied;

  /// No description provided for @browserPdfLoaded.
  ///
  /// In en, this message translates to:
  /// **'PDF loaded ({chars} base64 chars)'**
  String browserPdfLoaded(int chars);

  /// No description provided for @browserUnsupportedType.
  ///
  /// In en, this message translates to:
  /// **'Unsupported type: {mime}'**
  String browserUnsupportedType(String mime);

  /// No description provided for @browserInterests.
  ///
  /// In en, this message translates to:
  /// **'Interests'**
  String get browserInterests;

  /// No description provided for @browserKnowledge.
  ///
  /// In en, this message translates to:
  /// **'Knowledge'**
  String get browserKnowledge;

  /// No description provided for @browserCapabilities.
  ///
  /// In en, this message translates to:
  /// **'Capabilities'**
  String get browserCapabilities;

  /// No description provided for @connTooltipP2p.
  ///
  /// In en, this message translates to:
  /// **'P2P connection via relay hop'**
  String get connTooltipP2p;

  /// No description provided for @connTooltipRelay.
  ///
  /// In en, this message translates to:
  /// **'Relay connection — home can dial you'**
  String get connTooltipRelay;

  /// No description provided for @connTooltipConnectedVia.
  ///
  /// In en, this message translates to:
  /// **'Connected via {transport}'**
  String connTooltipConnectedVia(String transport);

  /// No description provided for @connBootstrap.
  ///
  /// In en, this message translates to:
  /// **'Bootstrap'**
  String get connBootstrap;

  /// No description provided for @settingsRunning.
  ///
  /// In en, this message translates to:
  /// **'running'**
  String get settingsRunning;

  /// No description provided for @settingsNotRunning.
  ///
  /// In en, this message translates to:
  /// **'not running'**
  String get settingsNotRunning;

  /// No description provided for @settingsModelIdHint.
  ///
  /// In en, this message translates to:
  /// **'model-id'**
  String get settingsModelIdHint;

  /// No description provided for @chainsSections.
  ///
  /// In en, this message translates to:
  /// **'Sections'**
  String get chainsSections;

  /// No description provided for @chainsWorkerAllocations.
  ///
  /// In en, this message translates to:
  /// **'Worker allocations'**
  String get chainsWorkerAllocations;

  /// No description provided for @chainsAwardedSummary.
  ///
  /// In en, this message translates to:
  /// **'{status} · {awarded}/{total} awarded'**
  String chainsAwardedSummary(String status, int awarded, int total);

  /// No description provided for @meAttemptN.
  ///
  /// In en, this message translates to:
  /// **'attempt {n}'**
  String meAttemptN(int n);

  /// No description provided for @meSecondsAgo.
  ///
  /// In en, this message translates to:
  /// **'{n}s ago'**
  String meSecondsAgo(int n);

  /// No description provided for @meMinutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{n}m ago'**
  String meMinutesAgo(int n);

  /// No description provided for @meHoursAgo.
  ///
  /// In en, this message translates to:
  /// **'{n}h ago'**
  String meHoursAgo(int n);

  /// No description provided for @meDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'{n}d ago'**
  String meDaysAgo(int n);

  /// No description provided for @termShowKeyboard.
  ///
  /// In en, this message translates to:
  /// **'Show keyboard'**
  String get termShowKeyboard;

  /// No description provided for @termHideKeyboard.
  ///
  /// In en, this message translates to:
  /// **'Hide keyboard'**
  String get termHideKeyboard;

  /// No description provided for @termCopySelection.
  ///
  /// In en, this message translates to:
  /// **'Copy selection'**
  String get termCopySelection;

  /// No description provided for @pairingImBackHint.
  ///
  /// In en, this message translates to:
  /// **'Tap a name if this is your second phone (I\'m back).'**
  String get pairingImBackHint;

  /// No description provided for @connP2pDetail.
  ///
  /// In en, this message translates to:
  /// **'P2P ({detail})'**
  String connP2pDetail(String detail);

  /// No description provided for @meConnRefused.
  ///
  /// In en, this message translates to:
  /// **'connection refused / blocked'**
  String get meConnRefused;

  /// No description provided for @meTimeout5s.
  ///
  /// In en, this message translates to:
  /// **'timeout (5s)'**
  String get meTimeout5s;

  /// No description provided for @timeMinutesShort.
  ///
  /// In en, this message translates to:
  /// **'{n}m'**
  String timeMinutesShort(int n);

  /// No description provided for @timeHoursShort.
  ///
  /// In en, this message translates to:
  /// **'{n}h'**
  String timeHoursShort(int n);

  /// No description provided for @timeDaysShort.
  ///
  /// In en, this message translates to:
  /// **'{n}d'**
  String timeDaysShort(int n);

  /// No description provided for @termCtrlSticky.
  ///
  /// In en, this message translates to:
  /// **'Ctrl modifier (sticky)'**
  String get termCtrlSticky;

  /// No description provided for @termCtrlLetter.
  ///
  /// In en, this message translates to:
  /// **'Ctrl + letter'**
  String get termCtrlLetter;

  /// No description provided for @connStateConnected.
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get connStateConnected;

  /// No description provided for @connStateConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get connStateConnecting;

  /// No description provided for @connStateDisconnected.
  ///
  /// In en, this message translates to:
  /// **'Disconnected'**
  String get connStateDisconnected;

  /// No description provided for @connStateError.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get connStateError;

  /// No description provided for @chatsDefaultGroup.
  ///
  /// In en, this message translates to:
  /// **'Group'**
  String get chatsDefaultGroup;

  /// No description provided for @chatsDefaultFamilyGroup.
  ///
  /// In en, this message translates to:
  /// **'Family group'**
  String get chatsDefaultFamilyGroup;

  /// No description provided for @chatsTerminalTitle.
  ///
  /// In en, this message translates to:
  /// **'Terminal: {name}'**
  String chatsTerminalTitle(String name);

  /// No description provided for @chatsExtAgent.
  ///
  /// In en, this message translates to:
  /// **'Ext Agent'**
  String get chatsExtAgent;

  /// No description provided for @browserBytesCount.
  ///
  /// In en, this message translates to:
  /// **'{count} bytes'**
  String browserBytesCount(int count);

  /// No description provided for @commonYouName.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get commonYouName;

  /// No description provided for @settingsAiModelEnvoyLocalStandby.
  ///
  /// In en, this message translates to:
  /// **'Envoy Local is the active provider on the home node. Tap to manage Local, or save a cloud provider below as standby.'**
  String get settingsAiModelEnvoyLocalStandby;

  /// No description provided for @settingsEnvoyLocalIntro.
  ///
  /// In en, this message translates to:
  /// **'Control llama.cpp on the home computer. Models download there — never onto this phone.'**
  String get settingsEnvoyLocalIntro;

  /// No description provided for @settingsEnvoyLocalStatusHeading.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get settingsEnvoyLocalStatusHeading;

  /// No description provided for @settingsEnvoyLocalInUse.
  ///
  /// In en, this message translates to:
  /// **'In use'**
  String get settingsEnvoyLocalInUse;

  /// No description provided for @settingsEnvoyLocalNotInUse.
  ///
  /// In en, this message translates to:
  /// **'Not in use'**
  String get settingsEnvoyLocalNotInUse;

  /// No description provided for @settingsEnvoyLocalStatusDownloading.
  ///
  /// In en, this message translates to:
  /// **'Downloading…'**
  String get settingsEnvoyLocalStatusDownloading;

  /// No description provided for @settingsEnvoyLocalStatusDetecting.
  ///
  /// In en, this message translates to:
  /// **'Detecting…'**
  String get settingsEnvoyLocalStatusDetecting;

  /// No description provided for @settingsEnvoyLocalStatusExtracting.
  ///
  /// In en, this message translates to:
  /// **'Extracting…'**
  String get settingsEnvoyLocalStatusExtracting;

  /// No description provided for @settingsEnvoyLocalStatusStarting.
  ///
  /// In en, this message translates to:
  /// **'Starting…'**
  String get settingsEnvoyLocalStatusStarting;

  /// No description provided for @settingsEnvoyLocalStatusReady.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get settingsEnvoyLocalStatusReady;

  /// No description provided for @settingsEnvoyLocalStatusError.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get settingsEnvoyLocalStatusError;

  /// No description provided for @settingsEnvoyLocalStatusDisabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get settingsEnvoyLocalStatusDisabled;

  /// No description provided for @settingsEnvoyLocalIdleTimeout.
  ///
  /// In en, this message translates to:
  /// **'Envoy Local operation timed out after 60 minutes. If a download is stuck near 100%, try China mirrors or a VPN, then retry — partial downloads resume.'**
  String get settingsEnvoyLocalIdleTimeout;

  /// No description provided for @settingsEnvoyLocalRuntime.
  ///
  /// In en, this message translates to:
  /// **'Runtime: {status}'**
  String settingsEnvoyLocalRuntime(String status);

  /// No description provided for @settingsEnvoyLocalRuntimeVersion.
  ///
  /// In en, this message translates to:
  /// **'Version: {version}'**
  String settingsEnvoyLocalRuntimeVersion(String version);

  /// No description provided for @settingsEnvoyLocalAccel.
  ///
  /// In en, this message translates to:
  /// **'Accelerator: {accel}'**
  String settingsEnvoyLocalAccel(String accel);

  /// No description provided for @settingsEnvoyLocalHardware.
  ///
  /// In en, this message translates to:
  /// **'This machine: {summary}'**
  String settingsEnvoyLocalHardware(String summary);

  /// No description provided for @settingsEnvoyLocalActiveModel.
  ///
  /// In en, this message translates to:
  /// **'Model: {model}'**
  String settingsEnvoyLocalActiveModel(String model);

  /// No description provided for @settingsEnvoyLocalProgressBytes.
  ///
  /// In en, this message translates to:
  /// **'{received} / {total} MB'**
  String settingsEnvoyLocalProgressBytes(String received, String total);

  /// No description provided for @settingsEnvoyLocalProgressReceived.
  ///
  /// In en, this message translates to:
  /// **'{received} MB downloaded'**
  String settingsEnvoyLocalProgressReceived(String received);

  /// No description provided for @settingsEnvoyLocalLastError.
  ///
  /// In en, this message translates to:
  /// **'Last error: {error}'**
  String settingsEnvoyLocalLastError(String error);

  /// No description provided for @settingsEnvoyLocalDownloadRegion.
  ///
  /// In en, this message translates to:
  /// **'Model download region'**
  String get settingsEnvoyLocalDownloadRegion;

  /// No description provided for @settingsEnvoyLocalDownloadRegionHint.
  ///
  /// In en, this message translates to:
  /// **'If downloads fail, try China mirrors or a VPN for Global.'**
  String get settingsEnvoyLocalDownloadRegionHint;

  /// No description provided for @settingsEnvoyLocalDownloadRegionEffective.
  ///
  /// In en, this message translates to:
  /// **'Using: {region}'**
  String settingsEnvoyLocalDownloadRegionEffective(String region);

  /// No description provided for @settingsEnvoyLocalRegionAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto (timezone / locale)'**
  String get settingsEnvoyLocalRegionAuto;

  /// No description provided for @settingsEnvoyLocalRegionCn.
  ///
  /// In en, this message translates to:
  /// **'China (ModelScope → hf-mirror)'**
  String get settingsEnvoyLocalRegionCn;

  /// No description provided for @settingsEnvoyLocalRegionGlobal.
  ///
  /// In en, this message translates to:
  /// **'Global (Hugging Face)'**
  String get settingsEnvoyLocalRegionGlobal;

  /// No description provided for @settingsEnvoyLocalEnable.
  ///
  /// In en, this message translates to:
  /// **'Download & enable'**
  String get settingsEnvoyLocalEnable;

  /// No description provided for @settingsEnvoyLocalEnabling.
  ///
  /// In en, this message translates to:
  /// **'Downloading…'**
  String get settingsEnvoyLocalEnabling;

  /// No description provided for @settingsEnvoyLocalStart.
  ///
  /// In en, this message translates to:
  /// **'Start Envoy Local'**
  String get settingsEnvoyLocalStart;

  /// No description provided for @settingsEnvoyLocalStarting.
  ///
  /// In en, this message translates to:
  /// **'Starting…'**
  String get settingsEnvoyLocalStarting;

  /// No description provided for @settingsEnvoyLocalStop.
  ///
  /// In en, this message translates to:
  /// **'Stop Envoy Local'**
  String get settingsEnvoyLocalStop;

  /// No description provided for @settingsEnvoyLocalRestart.
  ///
  /// In en, this message translates to:
  /// **'Restart'**
  String get settingsEnvoyLocalRestart;

  /// No description provided for @settingsEnvoyLocalCancelDownload.
  ///
  /// In en, this message translates to:
  /// **'Cancel download'**
  String get settingsEnvoyLocalCancelDownload;

  /// No description provided for @settingsEnvoyLocalStopHint.
  ///
  /// In en, this message translates to:
  /// **'Stop switches the assistant back to your cloud/Ollama provider when one is saved.'**
  String get settingsEnvoyLocalStopHint;

  /// No description provided for @settingsEnvoyLocalRecommended.
  ///
  /// In en, this message translates to:
  /// **'Recommended'**
  String get settingsEnvoyLocalRecommended;

  /// No description provided for @settingsEnvoyLocalRecommendedBadge.
  ///
  /// In en, this message translates to:
  /// **'Recommended'**
  String get settingsEnvoyLocalRecommendedBadge;

  /// No description provided for @settingsEnvoyLocalDownload.
  ///
  /// In en, this message translates to:
  /// **'Download'**
  String get settingsEnvoyLocalDownload;

  /// No description provided for @settingsEnvoyLocalInstalled.
  ///
  /// In en, this message translates to:
  /// **'Installed models'**
  String get settingsEnvoyLocalInstalled;

  /// No description provided for @settingsEnvoyLocalInstalledHint.
  ///
  /// In en, this message translates to:
  /// **'Downloaded on the home node. Choose which one is active.'**
  String get settingsEnvoyLocalInstalledHint;

  /// No description provided for @settingsEnvoyLocalNoInstalled.
  ///
  /// In en, this message translates to:
  /// **'No models installed yet.'**
  String get settingsEnvoyLocalNoInstalled;

  /// No description provided for @settingsEnvoyLocalSetActive.
  ///
  /// In en, this message translates to:
  /// **'Set active'**
  String get settingsEnvoyLocalSetActive;

  /// No description provided for @settingsEnvoyLocalActiveBadge.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get settingsEnvoyLocalActiveBadge;

  /// No description provided for @settingsEnvoyLocalInstalledBadge.
  ///
  /// In en, this message translates to:
  /// **'Installed'**
  String get settingsEnvoyLocalInstalledBadge;

  /// No description provided for @settingsEnvoyLocalCatalog.
  ///
  /// In en, this message translates to:
  /// **'Catalog'**
  String get settingsEnvoyLocalCatalog;

  /// No description provided for @settingsEnvoyLocalHfError.
  ///
  /// In en, this message translates to:
  /// **'Hugging Face search unavailable: {error}'**
  String settingsEnvoyLocalHfError(String error);

  /// No description provided for @settingsEnvoyLocalRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get settingsEnvoyLocalRefresh;

  /// No description provided for @settingsEnvoyLocalPhoneNote.
  ///
  /// In en, this message translates to:
  /// **'Advanced server parameters (context size, GPU layers) remain on the home-node Social UI.'**
  String get settingsEnvoyLocalPhoneNote;

  /// No description provided for @ehReviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Review this turn'**
  String get ehReviewTitle;

  /// No description provided for @ehReviewUnavailable.
  ///
  /// In en, this message translates to:
  /// **'A saved review is unavailable for this older turn.'**
  String get ehReviewUnavailable;

  /// No description provided for @ehReviewFile.
  ///
  /// In en, this message translates to:
  /// **'File'**
  String get ehReviewFile;

  /// No description provided for @ehReviewOpenFile.
  ///
  /// In en, this message translates to:
  /// **'Open file'**
  String get ehReviewOpenFile;

  /// No description provided for @ehReviewDiffUnavailable.
  ///
  /// In en, this message translates to:
  /// **'A textual diff is unavailable for this file.'**
  String get ehReviewDiffUnavailable;

  /// No description provided for @ehReviewOnly.
  ///
  /// In en, this message translates to:
  /// **'Workspace-detected · review only'**
  String get ehReviewOnly;

  /// No description provided for @ehRevertTitle.
  ///
  /// In en, this message translates to:
  /// **'Revert this turn?'**
  String get ehRevertTitle;

  /// No description provided for @ehRevertBody.
  ///
  /// In en, this message translates to:
  /// **'Files will be restored to their pre-turn contents. Later edits are protected and will stop the revert.'**
  String get ehRevertBody;

  /// No description provided for @ehRevertAction.
  ///
  /// In en, this message translates to:
  /// **'Revert'**
  String get ehRevertAction;

  /// No description provided for @ehRevertComplete.
  ///
  /// In en, this message translates to:
  /// **'This turn’s file changes were reverted.'**
  String get ehRevertComplete;

  /// No description provided for @ehRevertUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This turn can no longer be reverted safely.'**
  String get ehRevertUnavailable;

  /// No description provided for @ehRevertConflict.
  ///
  /// In en, this message translates to:
  /// **'Revert stopped because these files changed afterward: {files}'**
  String ehRevertConflict(String files);

  /// No description provided for @ehSearchTranscript.
  ///
  /// In en, this message translates to:
  /// **'Search transcript'**
  String get ehSearchTranscript;

  /// No description provided for @ehSearchClose.
  ///
  /// In en, this message translates to:
  /// **'Close search'**
  String get ehSearchClose;

  /// No description provided for @ehNoMatches.
  ///
  /// In en, this message translates to:
  /// **'No matching turns'**
  String get ehNoMatches;

  /// No description provided for @ehCopyTurn.
  ///
  /// In en, this message translates to:
  /// **'Copy turn'**
  String get ehCopyTurn;

  /// No description provided for @ehShareTurn.
  ///
  /// In en, this message translates to:
  /// **'Share turn'**
  String get ehShareTurn;

  /// No description provided for @ehReviewDiff.
  ///
  /// In en, this message translates to:
  /// **'Review diff'**
  String get ehReviewDiff;

  /// No description provided for @ehRevertThisTurn.
  ///
  /// In en, this message translates to:
  /// **'Revert this turn'**
  String get ehRevertThisTurn;

  /// No description provided for @ehReviewChanges.
  ///
  /// In en, this message translates to:
  /// **'Review changes'**
  String get ehReviewChanges;

  /// No description provided for @ehRevertAll.
  ///
  /// In en, this message translates to:
  /// **'Revert all'**
  String get ehRevertAll;

  /// No description provided for @ehChangesCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 file changed this turn} other{{count} files changed this turn}}'**
  String ehChangesCount(int count);

  /// No description provided for @ehChangesKeepAll.
  ///
  /// In en, this message translates to:
  /// **'Keep all'**
  String get ehChangesKeepAll;

  /// No description provided for @ehChangesRevert.
  ///
  /// In en, this message translates to:
  /// **'Revert all'**
  String get ehChangesRevert;

  /// No description provided for @ehChangesHideList.
  ///
  /// In en, this message translates to:
  /// **'Hide list'**
  String get ehChangesHideList;

  /// No description provided for @ehChangesShowList.
  ///
  /// In en, this message translates to:
  /// **'Show list'**
  String get ehChangesShowList;

  /// No description provided for @ehReviewKeepFile.
  ///
  /// In en, this message translates to:
  /// **'Keep'**
  String get ehReviewKeepFile;

  /// No description provided for @ehReviewRevertFile.
  ///
  /// In en, this message translates to:
  /// **'Revert'**
  String get ehReviewRevertFile;

  /// No description provided for @ehReviewKeptAll.
  ///
  /// In en, this message translates to:
  /// **'Changes kept.'**
  String get ehReviewKeptAll;

  /// No description provided for @ehReviewRevertedFile.
  ///
  /// In en, this message translates to:
  /// **'Reverted {path}'**
  String ehReviewRevertedFile(String path);

  /// No description provided for @ehReviewAutoLabel.
  ///
  /// In en, this message translates to:
  /// **'Auto-review when ≥'**
  String get ehReviewAutoLabel;

  /// No description provided for @ehReviewAutoAlways.
  ///
  /// In en, this message translates to:
  /// **'Always'**
  String get ehReviewAutoAlways;

  /// No description provided for @ehQueueTitle.
  ///
  /// In en, this message translates to:
  /// **'Queued ({count})'**
  String ehQueueTitle(int count);

  /// No description provided for @ehQueueClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get ehQueueClear;

  /// No description provided for @ehQueueBusyHint.
  ///
  /// In en, this message translates to:
  /// **'Send queues next'**
  String get ehQueueBusyHint;

  /// No description provided for @ehQueueFollowUpHint.
  ///
  /// In en, this message translates to:
  /// **'Queue a follow-up…'**
  String get ehQueueFollowUpHint;

  /// No description provided for @ehInjectTooltip.
  ///
  /// In en, this message translates to:
  /// **'Inject (cancel + send)'**
  String get ehInjectTooltip;

  /// No description provided for @ehFilesChangedCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 file changed} other{{count} files changed}}'**
  String ehFilesChangedCount(int count);

  /// No description provided for @ehEmptyReply.
  ///
  /// In en, this message translates to:
  /// **'envoy-harness finished without a visible reply. Your message is still here — try again or rephrase.'**
  String get ehEmptyReply;

  /// No description provided for @ehConfigureModelHint.
  ///
  /// In en, this message translates to:
  /// **'Configure a model in Settings → AI.'**
  String get ehConfigureModelHint;

  /// No description provided for @ehReviewKeepFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not keep changes.'**
  String get ehReviewKeepFailed;

  /// No description provided for @ehReviewOpenGitDiff.
  ///
  /// In en, this message translates to:
  /// **'Open git diff'**
  String get ehReviewOpenGitDiff;

  /// No description provided for @ehDiffBefore.
  ///
  /// In en, this message translates to:
  /// **'Before'**
  String get ehDiffBefore;

  /// No description provided for @ehDiffAfter.
  ///
  /// In en, this message translates to:
  /// **'After'**
  String get ehDiffAfter;

  /// No description provided for @ehPermsTooltip.
  ///
  /// In en, this message translates to:
  /// **'Permission policy'**
  String get ehPermsTooltip;

  /// No description provided for @ehPermsSafe.
  ///
  /// In en, this message translates to:
  /// **'Default (safe auto-run)'**
  String get ehPermsSafe;

  /// No description provided for @ehPermsAsk.
  ///
  /// In en, this message translates to:
  /// **'Always ask'**
  String get ehPermsAsk;

  /// No description provided for @ehPermsApprove.
  ///
  /// In en, this message translates to:
  /// **'Always approve'**
  String get ehPermsApprove;

  /// No description provided for @ehPermsSet.
  ///
  /// In en, this message translates to:
  /// **'Permission policy → {mode}.'**
  String ehPermsSet(String mode);

  /// No description provided for @ehPermsNextTurn.
  ///
  /// In en, this message translates to:
  /// **' Applies from the next turn.'**
  String get ehPermsNextTurn;

  /// No description provided for @ehPermsFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to set permission policy: {error}'**
  String ehPermsFailed(String error);

  /// No description provided for @chainsStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get chainsStatusCancelled;

  /// No description provided for @chainsStatusPublished.
  ///
  /// In en, this message translates to:
  /// **'Published'**
  String get chainsStatusPublished;

  /// No description provided for @chainsStatusSynthesizing.
  ///
  /// In en, this message translates to:
  /// **'Synthesizing'**
  String get chainsStatusSynthesizing;

  /// No description provided for @chainsStatusRunning.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get chainsStatusRunning;

  /// No description provided for @chainsStatusWaitingWorkers.
  ///
  /// In en, this message translates to:
  /// **'Waiting for workers'**
  String get chainsStatusWaitingWorkers;

  /// No description provided for @chainsStatusBidding.
  ///
  /// In en, this message translates to:
  /// **'Bidding'**
  String get chainsStatusBidding;

  /// No description provided for @chainsStatusAssigning.
  ///
  /// In en, this message translates to:
  /// **'Assigning'**
  String get chainsStatusAssigning;

  /// No description provided for @chainsStatusPlanning.
  ///
  /// In en, this message translates to:
  /// **'Planning'**
  String get chainsStatusPlanning;

  /// No description provided for @ehWorking.
  ///
  /// In en, this message translates to:
  /// **'Working'**
  String get ehWorking;

  /// No description provided for @ehCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get ehCompleted;

  /// No description provided for @ehUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update'**
  String get ehUpdate;

  /// No description provided for @ehToolLabel.
  ///
  /// In en, this message translates to:
  /// **'Tool: {name}'**
  String ehToolLabel(String name);

  /// No description provided for @ehMatchCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 match} other{{count} matches}}'**
  String ehMatchCount(int count);

  /// No description provided for @termMore.
  ///
  /// In en, this message translates to:
  /// **'More…'**
  String get termMore;

  /// No description provided for @termCompactContext.
  ///
  /// In en, this message translates to:
  /// **'Compact context'**
  String get termCompactContext;

  /// No description provided for @termUpdatePlan.
  ///
  /// In en, this message translates to:
  /// **'Show or update plan'**
  String get termUpdatePlan;

  /// No description provided for @termHarnessStatus.
  ///
  /// In en, this message translates to:
  /// **'Harness status'**
  String get termHarnessStatus;

  /// No description provided for @termPiActions.
  ///
  /// In en, this message translates to:
  /// **'Pi actions'**
  String get termPiActions;

  /// No description provided for @termHarnessActions.
  ///
  /// In en, this message translates to:
  /// **'envoy-harness actions'**
  String get termHarnessActions;

  /// No description provided for @termPreviousCommand.
  ///
  /// In en, this message translates to:
  /// **'Previous command'**
  String get termPreviousCommand;

  /// No description provided for @termNextCommand.
  ///
  /// In en, this message translates to:
  /// **'Next command'**
  String get termNextCommand;

  /// No description provided for @termCursorLeft.
  ///
  /// In en, this message translates to:
  /// **'Move cursor left'**
  String get termCursorLeft;

  /// No description provided for @termCursorRight.
  ///
  /// In en, this message translates to:
  /// **'Move cursor right'**
  String get termCursorRight;

  /// No description provided for @termEnterKey.
  ///
  /// In en, this message translates to:
  /// **'Enter key'**
  String get termEnterKey;

  /// No description provided for @chainsCancelFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not cancel this team job.'**
  String get chainsCancelFailed;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'de',
    'en',
    'fr',
    'it',
    'ja',
    'ko',
    'zh',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
    case 'it':
      return AppLocalizationsIt();
    case 'ja':
      return AppLocalizationsJa();
    case 'ko':
      return AppLocalizationsKo();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
