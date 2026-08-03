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

  /// No description provided for @navMe.
  ///
  /// In en, this message translates to:
  /// **'Me'**
  String get navMe;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

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
  /// **'PhotoWall'**
  String get publishedPhotoWall;

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
  /// **'Team jobs you run on the home node will appear here.\nAuthor team jobs from the home node Social UI.'**
  String get chainsEmptyHint;

  /// No description provided for @chainsNoActive.
  ///
  /// In en, this message translates to:
  /// **'No active chains on the home node.\nStart one from the Social UI.'**
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
  /// **'Manage chains on the home node Social UI.'**
  String get chainsManageOnSocial;

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
