// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get navChats => 'Chats';

  @override
  String get navInbox => 'Posteingang';

  @override
  String get navContent => 'Inhalt';

  @override
  String get navMe => 'Ich';

  @override
  String get commonCancel => 'Abbrechen';

  @override
  String get commonSave => 'Speichern';

  @override
  String get commonDelete => 'Löschen';

  @override
  String get commonRetry => 'Erneut versuchen';

  @override
  String get commonClose => 'Schließen';

  @override
  String get commonLoading => 'Wird geladen…';

  @override
  String get commonError => 'Etwas ist schiefgelaufen';

  @override
  String get commonReconnect => 'Erneut verbinden';

  @override
  String get commonSwitch => 'Wechseln';

  @override
  String get commonPair => 'Koppeln';

  @override
  String get commonUnpair => 'Entkoppeln';

  @override
  String get commonCreate => 'Erstellen';

  @override
  String get commonRename => 'Umbenennen';

  @override
  String get languageTitle => 'Sprache';

  @override
  String get languageSubtitle => 'Sprache für Menüs und Beschriftungen';

  @override
  String get languageSystem => 'Systemstandard';

  @override
  String get languageSystemDesc => 'Gerätesprache verwenden';

  @override
  String get meConnectedNode => 'Verbundener Knoten';

  @override
  String get meNotConnected => 'Nicht verbunden';

  @override
  String get meNotConnectedHint =>
      'Mit einem Heimknoten koppeln, um zu starten';

  @override
  String get meReconnect => 'Erneut verbinden';

  @override
  String get meSwitch => 'Wechseln';

  @override
  String get meRepair => 'Erneut koppeln';

  @override
  String get meReconnectNow => 'Jetzt erneut verbinden';

  @override
  String get meUnpair => 'Entkoppeln';

  @override
  String get meBrowser => 'Browser';

  @override
  String get meBrowserHint =>
      'envoy://-Seiten öffnen — oder Inhalt für Meine Seite';

  @override
  String get meAiEngine => 'KI-Engine';

  @override
  String get meAiEngineHint => 'Bridge + OpenClaw. Tippen zum Konfigurieren.';

  @override
  String get meRecentTeamJobs => 'Aktuelle Team-Jobs';

  @override
  String get meRecentTeamJobsHint => 'Abgeschlossene Multi-Agent-Jobs';

  @override
  String get meActiveTeamJobs => 'Aktive Team-Jobs';

  @override
  String get meActiveTeamJobsHint => 'Laufende Jobs ansehen';

  @override
  String get mePairNewNode => 'Neuen Knoten koppeln';

  @override
  String get mePairNewNodeHint => 'Weiteren Heimknoten hinzufügen';

  @override
  String get meSettings => 'Einstellungen';

  @override
  String get meAiModel => 'KI-Modell';

  @override
  String get meEnvoyLocal => 'Envoy Local';

  @override
  String get meEnvoyLocalHint =>
      'Lokales Modell auf dem Heimknoten (auf dem Computer herunterladen & starten)';

  @override
  String get mePiAgent => 'Pi-Agent';

  @override
  String get mePiAgentHint => 'Lokaler Coding-Agent';

  @override
  String get meDarkMode => 'Dunkelmodus';

  @override
  String get meDarkModeHint => 'Systemeinstellung folgen';

  @override
  String get mePushNotifications => 'Push-Benachrichtigungen';

  @override
  String get mePushNotificationsHint =>
      'Hinweise, wenn die App im Hintergrund ist';

  @override
  String get meUnpairDevice => 'Dieses Gerät entkoppeln';

  @override
  String get meUnpairDeviceHint => 'Trennen und alle lokalen Daten löschen';

  @override
  String get meUnpairConfirmTitle => 'Entkoppeln?';

  @override
  String get meUnpairConfirmBody =>
      'Entfernt die Kopplung und lokale Chats dieses Heimknotens auf diesem Gerät.';

  @override
  String get meUnpairedSnack => 'Entkoppelt. Lokale Chats und Daten entfernt.';

  @override
  String meUnpairFailed(String error) {
    return 'Entkoppeln fehlgeschlagen: $error';
  }

  @override
  String get meEditProfile => 'Profil bearbeiten';

  @override
  String meProfileUpdateFailed(String error) {
    return 'Profil konnte nicht aktualisiert werden: $error';
  }

  @override
  String get mePublicAccess => 'Öffentlicher Zugriff';

  @override
  String get mePort => 'Port';

  @override
  String get mePublicAccessSaved => 'Öffentlicher Zugriff gespeichert';

  @override
  String get meFamilyProfile => 'Familienprofil';

  @override
  String get meFamilyProfileHint =>
      'Sie sind als Familienmitglied mit diesem Heim verbunden';

  @override
  String get mePreferences => 'Einstellungen';

  @override
  String get meViewEditProfile => 'Profil anzeigen & bearbeiten';

  @override
  String get meEditNameAvatar => 'Name & Avatar bearbeiten';

  @override
  String get meDisplayName => 'Anzeigename';

  @override
  String get meAvatarColor => 'Avatarfarbe (hex)';

  @override
  String meMorePaired(int count) {
    return '+$count weitere gekoppelt';
  }

  @override
  String meSessionExpired(String name) {
    return 'Sitzung abgelaufen für $name';
  }

  @override
  String meDisconnectedFrom(String name) {
    return 'Getrennt von $name';
  }

  @override
  String meUnpairConfirmBodyNamed(String name) {
    return 'Trennt die Verbindung und entfernt alle lokalen Chats und Daten für $name.';
  }

  @override
  String get meTeamJobs => 'Team-Jobs';

  @override
  String get meStartTeamJobHint =>
      'Plan in der Vorschau ansehen und auf dem Heimknoten starten';

  @override
  String get meAiModelHint =>
      'Anbieter für den Assistenten auf diesem Heimknoten';

  @override
  String get mePiAgentHintLong =>
      'Eingebauter lokaler Coding-Agent auf dem Heimknoten';

  @override
  String get mePushNotificationsHintLong =>
      'Benachrichtigungen zu neuen Nachrichten, Kontaktanfragen und Freigaben, wenn die App im Hintergrund ist.';

  @override
  String get meRecentTeamJobsHintLong => 'Job-Berichte vom Heimknoten anzeigen';

  @override
  String get meActiveTeamJobsHintLong =>
      'Laufende Team-Jobs auf dem Heimknoten überwachen';

  @override
  String get inboxTitle => 'Posteingang';

  @override
  String get inboxEmpty => 'Noch keine Benachrichtigungen';

  @override
  String get inboxEmptyHint => 'Bond-Anfragen und Feed-Updates erscheinen hier';

  @override
  String get contentFeed => 'Feed';

  @override
  String get contentBlog => 'Blog';

  @override
  String get contentPeople => 'Personen';

  @override
  String get contentMyFiles => 'Meine Dateien';

  @override
  String get contentNewPost => 'Neuer Beitrag';

  @override
  String get chatsTitle => 'Chats';

  @override
  String get chatsEmpty => 'Noch keine Unterhaltungen';

  @override
  String get chatsEmptyHint => 'Koppeln Sie Ihren Heimknoten, um zu starten.';

  @override
  String get chatsSearchHint => 'Chats suchen…';

  @override
  String get pairingScanTitle => 'QR scannen';

  @override
  String get pairingConfirmTitle => 'Kopplung bestätigen';

  @override
  String get pairingFamilyInvite => 'Familieneinladung';

  @override
  String get pairingOwnerPair => 'Besitzer-Kopplung';

  @override
  String get engagementLike => 'Gefällt mir';

  @override
  String get engagementUnlike => 'Gefällt mir nicht mehr';

  @override
  String get engagementComment => 'Kommentieren';

  @override
  String get engagementRemoveComment => 'Kommentar entfernen?';

  @override
  String get engagementRemove => 'Entfernen';

  @override
  String get feedDelete => 'Löschen';

  @override
  String get blogDelete => 'Löschen';

  @override
  String get blogTitle => 'Blog';

  @override
  String get blogEmpty =>
      'Noch keine Beiträge. Schreiben Sie Ihren ersten Blogbeitrag.';

  @override
  String get blogHint => 'Längere Beiträge im Mesh.';

  @override
  String get feedTitle => 'Feed';

  @override
  String get feedComposeTitle => 'Neuer Feed-Beitrag';

  @override
  String get commonBack => 'Zurück';

  @override
  String get commonAccept => 'Annehmen';

  @override
  String get commonDecline => 'Ablehnen';

  @override
  String get commonDismiss => 'Verwerfen';

  @override
  String get commonOpen => 'Öffnen';

  @override
  String get commonRefresh => 'Aktualisieren';

  @override
  String get commonEdit => 'Bearbeiten';

  @override
  String get commonPost => 'Posten';

  @override
  String get commonPosting => 'Wird gepostet…';

  @override
  String get commonPublish => 'Veröffentlichen';

  @override
  String get commonShare => 'Teilen';

  @override
  String get commonSend => 'Senden';

  @override
  String get commonClear => 'Leeren';

  @override
  String get commonInvite => 'Einladen';

  @override
  String get commonJoin => 'Beitreten';

  @override
  String get commonYou => 'Sie';

  @override
  String get commonUnknown => 'Unbekannt';

  @override
  String get commonCopied => 'In Zwischenablage kopiert';

  @override
  String get commonNotConnectedHome => 'Nicht mit Heimknoten verbunden';

  @override
  String get commonSaving => 'Wird gespeichert…';

  @override
  String get commonGenerating => 'Wird generiert…';

  @override
  String get commonHide => 'Ausblenden';

  @override
  String get commonAdd => 'Hinzufügen';

  @override
  String get commonRemove => 'Entfernen';

  @override
  String get commonSearch => 'Suchen';

  @override
  String get connOffline => 'Offline';

  @override
  String get connDirect => 'Direkt';

  @override
  String get connP2p => 'P2P';

  @override
  String get connRelay => 'Relay';

  @override
  String get connLanDirect => 'LAN (direkt)';

  @override
  String get connPublicDirect => 'Öffentliche IP (direkt)';

  @override
  String get connRelayWs => 'Relay-WebSocket';

  @override
  String get connTooltipDirect => 'Direktverbindung';

  @override
  String get connTooltipConnecting => 'Verbindung wird hergestellt…';

  @override
  String get connTooltipOffline => 'Nicht verbunden';

  @override
  String get connTooltipError => 'Verbindungsfehler';

  @override
  String get chatsSectionAi => 'KI';

  @override
  String get chatsSectionFamily => 'Familie';

  @override
  String get chatsSectionContacts => 'Kontakte';

  @override
  String get chatsSectionGroups => 'Gruppen';

  @override
  String get chatsSectionTerminals => 'Terminals';

  @override
  String get chatsFabNew => 'Neu';

  @override
  String get chatsCreateBot => 'Bot erstellen';

  @override
  String get chatsCreateBotHint => 'KI-Charakter auf Ihrem Heimknoten';

  @override
  String get chatsNewPi => 'Neues Pi';

  @override
  String get chatsNewPiHint => 'Pi-Coding-Terminal starten';

  @override
  String get chatsNewTerminal => 'Neues Terminal';

  @override
  String get chatsNewTerminalHint => 'Shell auf dem Heimknoten öffnen';

  @override
  String get chatsNewGroup => 'Neuer Gruppenchat';

  @override
  String get chatsNewGroupHint => 'Mesh-Gruppe mit verbundenen Kontakten';

  @override
  String get chatsNewFamilyGroup => 'Neue Familiengruppe';

  @override
  String get chatsNewFamilyGroupHint => 'Lokale Gruppe mit Familienmitgliedern';

  @override
  String get chatsDeleteBotTitle => 'Bot löschen?';

  @override
  String chatsDeleteBotBody(String name) {
    return '„$name“ vom Heimknoten entfernen? Dies kann nicht rückgängig gemacht werden.';
  }

  @override
  String get chatsBotOptions => 'Bot-Optionen';

  @override
  String get chatsEditBot => 'Bot bearbeiten';

  @override
  String get chatsBotNameRequired => 'Bot-Name ist erforderlich';

  @override
  String get chatsBotPromptRequired =>
      'Persönlichkeit / System-Prompt erforderlich';

  @override
  String get chatsBotName => 'Bot-Name';

  @override
  String get chatsBotNameHint => 'z. B. Luna die Bibliothekarin';

  @override
  String get chatsBotPrompt => 'Persönlichkeit / System-Prompt';

  @override
  String get chatsBotPromptHint =>
      'Als Charakter schreiben („Du bist…“). Vermeiden Sie „Luna ist…“ oder „Ich bin eine KI…“. Wird beim Speichern umformuliert.';

  @override
  String get chatsBotDesc => 'Kurze Beschreibung (optional)';

  @override
  String get chatsBotDescHint =>
      'Eine kurze Zeile für die Chatliste. Leer lassen für Auto-Füllung aus der Persönlichkeit.';

  @override
  String get chatsAvatarColor => 'Avatarfarbe';

  @override
  String get chatsShellHint => 'Shell (z. B. zsh, bash)';

  @override
  String get chatsCwdHint => 'Arbeitsverzeichnis (optional)';

  @override
  String get chatsPiTitle => 'Pi starten';

  @override
  String get chatsPiBody =>
      'Wählen Sie einen Projektordner auf dem Heim-PC, um das Pi-Terminal zu öffnen.';

  @override
  String get chatsPiFolder => 'Projektordner';

  @override
  String get chatsPiFolderHint => '/Users/du/projekt';

  @override
  String get chatsPiFolderRequired => 'Geben Sie einen Projektordnerpfad ein.';

  @override
  String get chatsGroupName => 'Gruppenname';

  @override
  String get chatsNoFamilyMembers => 'Noch keine weiteren Familienmitglieder.';

  @override
  String get chatVoiceCall => 'Sprachanruf';

  @override
  String get chatVideoCall => 'Videoanruf';

  @override
  String get chatPublishedContent => 'Veröffentlichte Inhalte';

  @override
  String get chatClearThread => 'Thread leeren';

  @override
  String get chatClearThreadTitle => 'Thread leeren?';

  @override
  String get chatClearThreadBody =>
      'Alle Nachrichten in diesem Thread werden gelöscht.';

  @override
  String get chatDeleteMessageTitle => 'Nachricht löschen?';

  @override
  String get chatNoMessages => 'Noch keine Nachrichten';

  @override
  String get chatTypeMessage => 'Nachricht eingeben…';

  @override
  String get chatRecordVoice => 'Sprachnotiz aufnehmen';

  @override
  String get chatStopRecording => 'Aufnahme stoppen';

  @override
  String get chatInviteToGroup => 'In Gruppe einladen';

  @override
  String get chatNoContactsInvite => 'Keine Kontakte zum Einladen.';

  @override
  String chatInvitedSnack(String name) {
    return '$name eingeladen';
  }

  @override
  String get chatVoiceSending => 'Sprachnotiz wird gesendet…';

  @override
  String get chatVoiceSent => 'Sprachnotiz gesendet';

  @override
  String get chatVoiceRecording => 'Aufnahme';

  @override
  String get chatVoiceReady => 'Bereit zum Senden';

  @override
  String get chatVoiceCancel => 'Abbrechen';

  @override
  String get chatVoiceSend => 'Senden';

  @override
  String get chatVoiceSendHint => 'Senden zum Beenden · Abbrechen verwirft';

  @override
  String get chatVoiceReadyHint =>
      'Senden fehlgeschlagen · Erneut senden · Abbrechen verwirft';

  @override
  String get chatVoiceSendFailed => 'Sprachnotiz konnte nicht gesendet werden';

  @override
  String get chatMicDenied => 'Mikrofonberechtigung verweigert';

  @override
  String get chatRecordFailed => 'Aufnahme konnte nicht gestartet werden';

  @override
  String get chatCallFailed => 'Anruf konnte nicht gestartet werden';

  @override
  String get chatAiDisabled =>
      'KI-Modell deaktiviert. Aktivieren Sie einen Anbieter unter Einstellungen → KI.';

  @override
  String get chatAiDisabledFamily =>
      'KI für dieses Familienprofil nicht verfügbar.';

  @override
  String get inboxPublishedUpdates => 'Veröffentlichte Updates';

  @override
  String get inboxPublishedEmpty =>
      'Noch keine Veröffentlichungsbenachrichtigungen. Wenn ein verbundener Kontakt Webinhalte veröffentlicht, erscheinen sie hier.';

  @override
  String get inboxPendingIntros => 'Ausstehende Vorstellungen';

  @override
  String get inboxPendingEmpty => 'Keine ausstehenden Vorstellungen';

  @override
  String get inboxWantsToConnect => 'Möchte sich verbinden';

  @override
  String get pairingInvalidQr => 'Ungültiger Kopplungs-QR-Code';

  @override
  String get pairingPasteUri => 'Oder Kopplungs-URI einfügen';

  @override
  String get pairingUriHint => 'envoy://pair?… oder envoy://invite?…';

  @override
  String get pairingNeedHomeHint =>
      'Eigenes Zuhause einrichten? Installieren Sie EnvoyMesh zuerst auf einem Mac- oder Windows-PC und scannen Sie dann den QR-Code. Familie beitreten? Einfach deren Einladung scannen — keine PC-Installation nötig.';

  @override
  String get pairingDownloadEnvoyMesh => 'EnvoyMesh Desktop-Downloads';

  @override
  String get pairingJoinFamily => 'Familie beitreten';

  @override
  String pairingConnectTo(String name) {
    return 'Mit $name verbinden?';
  }

  @override
  String pairingWelcomeFamily(String name) {
    return 'Willkommen in der Familie $name!';
  }

  @override
  String get pairingImNew => 'Ich bin neu';

  @override
  String get pairingImBack => 'Ich bin zurück';

  @override
  String get pairingDisplayNameOptional => 'Anzeigename (optional)';

  @override
  String get pairingYourName => 'Ihr Name';

  @override
  String get pairingAvatarColor => 'Avatarfarbe';

  @override
  String get pairingOwnerNameHint =>
      'Wird als Besitzerprofilname auf diesem Knoten angezeigt';

  @override
  String get pairingCopyError => 'Kopierfehler';

  @override
  String get pairingRetryMembers => 'Mitglieder erneut laden';

  @override
  String get pairingWhoAreYou => 'Wer sind Sie?';

  @override
  String get pairingAlreadyOnHome => 'Bereits in diesem Heim';

  @override
  String get pairingSelectProfile => 'Profil auswählen';

  @override
  String get pairingNoMembersFirst =>
      'Noch keine Familienmitglieder — Sie sind der Erste.';

  @override
  String get pairingNoExistingProfiles =>
      'Noch keine Familienprofile. Wechseln Sie zu „Ich bin neu“, um eines zu erstellen.';

  @override
  String get pairingNameRequired => 'Bitte geben Sie Ihren Namen ein';

  @override
  String get pairingSelectRequired => 'Bitte wählen Sie Ihr Profil';

  @override
  String get pairingLanAvailable => 'LAN: verfügbar';

  @override
  String get pairingRelayAvailable => 'Relay: verfügbar';

  @override
  String pairingPeer(String peer) {
    return 'Peer: $peer';
  }

  @override
  String get pairingNameHintDad => 'z. B. Papa';

  @override
  String get pairingNameHintMom => 'z. B. Mama, Alex';

  @override
  String get pairingChooseUniqueName =>
      'Wählen Sie einen unten noch nicht verwendeten Namen.';

  @override
  String get pairingSameNameHint =>
      'Verwenden Sie denselben Namen wie auf Ihrem ersten Telefon.';

  @override
  String get pairingTapIfSecondPhone =>
      'Tippen Sie auf einen Namen, wenn dies Ihr zweites Telefon ist (Ich bin zurück).';

  @override
  String get feedEmptyTitle => 'Ihr Kreis ist ruhig';

  @override
  String get feedEmptyHint =>
      'Noch keine Beiträge. Teilen Sie ein Update mit verbundenen Kontakten.';

  @override
  String get feedHint => 'Updates von Ihnen und verbundenen Kontakten.';

  @override
  String get feedDeleteTitle => 'Beitrag löschen?';

  @override
  String get feedDeleteBody => 'Dies kann nicht rückgängig gemacht werden.';

  @override
  String get blogPairHint =>
      'Koppeln Sie einen Heimknoten, um Blog-Beiträge zu schreiben und zu verwalten.';

  @override
  String get blogConnectHint =>
      'Verbinden Sie sich mit einem Heimknoten, um den Blog zu verwalten.';

  @override
  String get blogDeleteTitle => 'Beitrag löschen?';

  @override
  String blogDeleteBody(String title) {
    return '„$title“ löschen? Dies kann nicht rückgängig gemacht werden.';
  }

  @override
  String get feedWhatsOnMind => 'Was beschäftigt Sie?';

  @override
  String get feedShareHint => 'Update mit verbundenen Kontakten teilen…';

  @override
  String get feedPhotos => 'Fotos';

  @override
  String get feedVisibility => 'Sichtbarkeit';

  @override
  String get feedVisBonded => 'Verbundene Kontakte';

  @override
  String get feedVisSelected => 'Ausgewählte Kontakte';

  @override
  String get feedVisOnlyMe => 'Nur ich';

  @override
  String get feedNeedTextOrPhoto => 'Text oder mindestens ein Foto hinzufügen';

  @override
  String get feedNeedContact => 'Wählen Sie mindestens einen Kontakt';

  @override
  String get feedSelectedHint =>
      'Nur diese Kontakte können diesen Beitrag sehen. Wählen Sie mindestens einen.';

  @override
  String get feedNoContacts =>
      'Noch keine verbundenen Kontakte — fügen Sie einen hinzu oder wählen Sie Verbunden / Nur ich.';

  @override
  String get feedAiDraft => 'KI-Entwurf';

  @override
  String get feedDiscard => 'Verwerfen';

  @override
  String get feedInsert => 'Einfügen';

  @override
  String get feedReplace => 'Ersetzen';

  @override
  String get peoplePairHint =>
      'Koppeln Sie einen Heimknoten, um Personen im Mesh zu finden.';

  @override
  String get peopleConnectHint =>
      'Verbinden Sie sich mit einem Heimknoten, um Personen zu finden.';

  @override
  String get peopleHint =>
      'Finden Sie Personen ohne Bond — öffnen Sie deren öffentliches Profil oder Blog und sagen Sie Hallo.';

  @override
  String get peopleTopic => 'Thema';

  @override
  String get peopleInterest => 'Interesse';

  @override
  String get peopleTopicHint => 'Musik, Coding, Reisen…';

  @override
  String get peopleInterestHint => 'Fotografie, Kochen, Reisen…';

  @override
  String get peopleOnMesh => 'Personen im Mesh';

  @override
  String get peopleResults => 'Ergebnisse';

  @override
  String get peopleEmpty => 'Noch keine Personen anzuzeigen.';

  @override
  String get peopleProfile => 'Profil';

  @override
  String get peopleBlog => 'Blog';

  @override
  String get peopleSayHello => 'Hallo sagen';

  @override
  String get peopleHelloSent => 'Hallo gesendet';

  @override
  String get peopleEnterSearch =>
      'Geben Sie ein Thema oder Interesse ein, um zu suchen.';

  @override
  String get peopleNoMatches => 'Keine Treffer für diese Suche.';

  @override
  String get peopleNoneFound =>
      'Noch keine öffentlichen Personen im Mesh gefunden.';

  @override
  String get peopleHelloMessage =>
      'Hallo — ich möchte mich auf Envoy verbinden.';

  @override
  String get peopleOpenLink => 'Link öffnen';

  @override
  String get filesPairHint =>
      'Koppeln Sie einen Heimknoten, um Meine Dateien zu verwalten.';

  @override
  String get filesConnectHint =>
      'Verbinden Sie sich mit einem Heimknoten, um Dateien zu verwalten.';

  @override
  String get filesSearchHint => 'Bibliothek durchsuchen';

  @override
  String get filesVaultHint =>
      'Vault-Bibliothek — Chat-Anhänge und Profilfotos bleiben in Chat / Profil';

  @override
  String get filesEmpty => 'Noch keine Dateien in der Bibliothek.';

  @override
  String filesImported(String name) {
    return '$name importiert';
  }

  @override
  String filesImportFailed(String error) {
    return 'Import fehlgeschlagen: $error';
  }

  @override
  String filesPreviewFailed(String error) {
    return 'Vorschau fehlgeschlagen: $error';
  }

  @override
  String get filesNoContactsShare => 'Keine verbundenen Kontakte zum Teilen';

  @override
  String get filesShareWith => 'Teilen mit…';

  @override
  String get filesShareSent => 'Freigabe gesendet';

  @override
  String filesShareFailed(String error) {
    return 'Freigabe fehlgeschlagen: $error';
  }

  @override
  String get filesImport => 'Importieren';

  @override
  String filesPreviewUnavailable(String mime, int bytes) {
    return 'Vorschau nicht verfügbar für $mime ($bytes Bytes).';
  }

  @override
  String publishedTitle(String name) {
    return 'Veröffentlichte Inhalte — $name';
  }

  @override
  String get publishedPhotoWall => 'Fotowand';

  @override
  String get engagementCommentHint => 'Kommentar schreiben…';

  @override
  String get engagementRemoveCommentTooltip => 'Kommentar entfernen';

  @override
  String get profileTitle => 'Profil';

  @override
  String get profileMyTitle => 'Mein Profil';

  @override
  String get profileUnnamed => 'Unbenannt';

  @override
  String get profileRemovePhotoTitle => 'Foto entfernen?';

  @override
  String get profileNameRequired =>
      'Anzeigename oder Benutzername erforderlich';

  @override
  String get profileSaved => 'Profil gespeichert';

  @override
  String get profileUsername => 'Benutzername';

  @override
  String get profileBio => 'Bio';

  @override
  String get profileBioHint =>
      'Fügen Sie eine kurze Bio hinzu, damit Kontakte Sie erkennen.';

  @override
  String get profilePhotos => 'Fotos';

  @override
  String get profileNoPhotosYet =>
      'Noch keine Fotos — fügen Sie eines zu Ihrer Wand hinzu';

  @override
  String get profileNoPhotosShared => 'Keine Fotos geteilt';

  @override
  String get profileLongPressRemove => 'Foto lange drücken zum Entfernen';

  @override
  String get contactsSearchHint => 'Kontakte suchen…';

  @override
  String get contactsEmpty => 'Noch keine Kontakte';

  @override
  String get contactsEmptyHint => 'Ihre verbundenen Kontakte erscheinen hier.';

  @override
  String get contactsChat => 'Chat';

  @override
  String get callIncoming => 'Eingehender Sprachanruf';

  @override
  String get callConnected => 'Verbunden';

  @override
  String get callConnecting => 'Verbindung wird hergestellt…';

  @override
  String get callDisconnected => 'Getrennt';

  @override
  String get callSwitchCamera => 'Kamera wechseln';

  @override
  String get authorPublish => 'Veröffentlichen';

  @override
  String get authorType => 'Typ';

  @override
  String get authorTypeProfile => 'Profil';

  @override
  String get authorTypePhoto => 'PhotoWall-Foto';

  @override
  String get authorTypeBlog => 'Blog-Beitrag';

  @override
  String get authorVisPublic => 'Öffentlich';

  @override
  String get authorVisBonded => 'Verbunden';

  @override
  String get authorVisPrivate => 'Privat';

  @override
  String get authorCaption => 'Beschriftung';

  @override
  String get authorCaptionOptional => 'Beschriftung (optional)';

  @override
  String get authorBody => 'Text';

  @override
  String get authorBodyMarkdown => 'Text (Markdown)';

  @override
  String get authorTitle => 'Titel';

  @override
  String get authorTitleRequired => 'Titel ist erforderlich';

  @override
  String get authorPickPhoto => 'Wählen Sie zuerst ein Foto';

  @override
  String get authorChooseAvatar => 'Avatar wählen';

  @override
  String get authorChoosePhoto => 'Foto wählen';

  @override
  String get aiDraftButton => 'Mit KI entwerfen';

  @override
  String get aiDraftEmphasize => 'Was soll betont werden? (optional)';

  @override
  String get aiDraftEmphasizeHint => 'z. B. Wochenend-Wanderung mit Freunden';

  @override
  String get aiDraftMode => 'Modus';

  @override
  String get aiDraftTone => 'Ton';

  @override
  String get aiDraftRewrite => 'Umschreiben';

  @override
  String get aiDraftExpand => 'Erweitern';

  @override
  String get aiDraftShorten => 'Kürzen';

  @override
  String get aiDraftGenerate => 'Generieren';

  @override
  String get aiDraftNoModel =>
      'Kein KI-Modell auf dem Heimknoten konfiguriert.';

  @override
  String get aiDraftEmpty => 'Leerer Entwurf vom Modell';

  @override
  String get aiDraftBio => 'Bio entwerfen';

  @override
  String get aiDraftBlog => 'Blog-Beitrag entwerfen';

  @override
  String get aiDraftFeed => 'Feed-Update entwerfen';

  @override
  String get aiDraftCaption => 'Beschriftung entwerfen';

  @override
  String get settingsAiModelIntro =>
      'Cloud-Modellanbieter für den Heimknoten-Assistenten. Änderungen gelten beim nächsten Assistenten-Turn.';

  @override
  String settingsHomeUses(String mode) {
    return 'Heim verwendet $mode';
  }

  @override
  String get settingsEndpoint => 'Endpoint:';

  @override
  String get settingsModelLabel => 'Modell:';

  @override
  String get settingsEditOnSocial =>
      'Bearbeiten Sie diesen Anbieter in der Social-UI des Heimknotens für erweiterte Optionen.';

  @override
  String get settingsProvider => 'Anbieter';

  @override
  String get settingsEndpointUrl => 'Endpoint-URL';

  @override
  String get settingsModel => 'Modell';

  @override
  String get settingsCustomModel => 'Benutzerdefinierter Modellname';

  @override
  String get settingsApiKey => 'API-Schlüssel';

  @override
  String get settingsApiKeySaved =>
      'Ein Schlüssel ist bereits auf dem Heimknoten gespeichert';

  @override
  String get settingsAiModelSaved => 'KI-Modell gespeichert';

  @override
  String settingsSaveFailed(String error) {
    return 'Speichern fehlgeschlagen: $error';
  }

  @override
  String get settingsDefault => '(Standard)';

  @override
  String get settingsAiEngineIntro =>
      'Wählen Sie, an welchen externen Agenten der Heimknoten Assistenten-Turns weiterleitet.';

  @override
  String get settingsExternalAgent => 'Externer Agent';

  @override
  String get settingsWebhookUrl => 'Webhook-URL';

  @override
  String get settingsHowToStart => 'So starten Sie';

  @override
  String get settingsBuiltIntoHome => 'In den Heimknoten integriert';

  @override
  String get settingsNoExtProcess =>
      'Kein separater Ext-Agent-Prozess erforderlich.';

  @override
  String get settingsBridgePort => 'Bridge-Listen-Port';

  @override
  String get settingsBridgeEnabled => 'Bridge aktiviert';

  @override
  String get settingsBridgeHint =>
      'Leitet Assistenten-Turns an den gewählten externen Agenten weiter.';

  @override
  String get settingsOpenClawEnabled => 'OpenClaw aktiviert';

  @override
  String get settingsOpenClawHint =>
      'Eingebautes OpenClaw-Gateway (EnvoyAI) beim nächsten Knotenstart.';

  @override
  String get settingsOpenClawUnavailable => 'OpenClaw-Status nicht verfügbar';

  @override
  String settingsOpenClawStatus(String state) {
    return 'OpenClaw $state';
  }

  @override
  String settingsExtAgentStatus(String state) {
    return 'Ext-Agent $state';
  }

  @override
  String get settingsEnabled => 'aktiviert';

  @override
  String get settingsDisabled => 'deaktiviert';

  @override
  String get settingsAiEngineSaved => 'KI-Engine gespeichert';

  @override
  String get settingsNotConnectedNode => 'Nicht mit einem Heimknoten verbunden';

  @override
  String settingsPiState(String state) {
    return 'Status: $state';
  }

  @override
  String get settingsPiBuiltIn => 'Eingebauter lokaler Coding-Agent';

  @override
  String get settingsPiLocalOnly =>
      'Nur lokaler Coding-Agent (keine Mesh-Tools).';

  @override
  String get settingsPiEnabled => 'Pi aktiviert';

  @override
  String get settingsPiOverrideHint =>
      'Modell-Override (optional). Leeren, um KI-Modell-Einstellungen zu erben.';

  @override
  String get settingsPiModelName => 'Modellname';

  @override
  String get settingsPiEndpoint => 'Endpoint';

  @override
  String get settingsPiLeaveBlankKey =>
      'Leer lassen, um gespeicherten Schlüssel zu behalten';

  @override
  String get settingsPiSaveOverride => 'Modell-Override speichern';

  @override
  String get settingsPiClearOverride => 'Override löschen (KI-Modell erben)';

  @override
  String get settingsPiModelSaved => 'Pi-Modell gespeichert';

  @override
  String get settingsPiModelRequired => 'Modellname ist erforderlich';

  @override
  String get settingsPiInherits => 'Pi erbt EnvoyMesh-Modell-Einstellungen';

  @override
  String settingsPiFailed(String error) {
    return 'Fehlgeschlagen: $error';
  }

  @override
  String settingsPiClearFailed(String error) {
    return 'Löschen fehlgeschlagen: $error';
  }

  @override
  String settingsPiProviderCustom(String provider) {
    return '$provider (benutzerdefiniert)';
  }

  @override
  String get aiEngineReadonlyHint =>
      'Beide Blöcke sind auf dem Handy schreibgeschützt. Konfigurieren Sie auf dem Heimknoten (Einstellungen → KI → KI-Engine).';

  @override
  String get aiEngineBuiltInOpenClaw => 'Eingebautes OpenClaw';

  @override
  String get aiEngineExtBridge => 'External-Agent-Bridge';

  @override
  String get aiEngineModeBoth => 'Eingebaut + Ext';

  @override
  String get aiEngineModeBuiltIn => 'Nur eingebaut';

  @override
  String get aiEngineModeExt => 'Nur Ext';

  @override
  String get aiEngineModeNone => 'Keine';

  @override
  String get aiEngineRunning => 'Läuft';

  @override
  String get aiEngineConfigured => 'Konfiguriert (nicht aktiv)';

  @override
  String get aiEngineDisabled => 'Deaktiviert';

  @override
  String get browserTitle => 'Browser';

  @override
  String get browserGo => 'Los';

  @override
  String get browserBack => 'Zurück';

  @override
  String get browserForward => 'Vor';

  @override
  String get browserReload => 'Neu laden';

  @override
  String get browserPairFirst =>
      'Nicht mit Heimknoten verbunden — zuerst koppeln und erneut verbinden.';

  @override
  String get browserIntegrityFailed =>
      'Integritätsprüfung fehlgeschlagen — Rendering verweigert';

  @override
  String browserDecodeImageFailed(String error) {
    return 'Bild konnte nicht decodiert werden: $error';
  }

  @override
  String get browserPhoto => 'Foto';

  @override
  String get browserPhotos => 'Fotos';

  @override
  String get browserNoPhotos => 'Noch keine Fotos.';

  @override
  String get browserHint =>
      'Geben Sie eine envoy://-URL ein, um Inhalte eines verbundenen Kontakts zu durchsuchen.';

  @override
  String get extSwitchTitle => 'Ext Agent wechseln';

  @override
  String extSwitchTooltip(String name) {
    return 'Ext Agent wechseln ($name)';
  }

  @override
  String extNotRunningChat(String name) {
    return '$name läuft nicht — starten Sie es vor dem Chat.';
  }

  @override
  String extSwitchFailed(String error) {
    return 'Wechsel fehlgeschlagen: $error';
  }

  @override
  String extNotRunning(String name) {
    return '$name läuft nicht';
  }

  @override
  String get extChecking => 'Prüfung…';

  @override
  String get extCheckAgain => 'Erneut prüfen';

  @override
  String get audioLoading => 'Audio wird geladen…';

  @override
  String get audioUnavailable => 'Audio nicht verfügbar';

  @override
  String get audioVoiceNote => 'Sprachnotiz';

  @override
  String meLastAttempt(String time) {
    return 'Letzter Versuch: $time';
  }

  @override
  String get meJustNow => 'gerade eben';

  @override
  String get mePublicIpLabel => 'Öffentliche IP oder Domain';

  @override
  String get mePublicIpHint => 'z. B. 1.2.3.4 oder mynode.example.com';

  @override
  String get mePublicIpHelp =>
      'Setzen Sie dies, wenn Ihr Heimknoten eine öffentliche IP oder Domain hat.\nErmöglicht Direktverbindung ohne Relay über 5G/WAN.';

  @override
  String get meNetworkDebug => 'Netzwerk-Debug';

  @override
  String get meRunNetworkTests => 'Netzwerktests ausführen';

  @override
  String get meTesting => 'Test läuft…';

  @override
  String get meNetworkTestsHint =>
      'Testet alle Pfade, die EnvoyGo für die Kopplung nutzt.';

  @override
  String get meSwitchNode => 'Knoten wechseln';

  @override
  String get chainsRecentTitle => 'Aktuelle Team-Jobs';

  @override
  String get chainsActiveTitle => 'Aktive Team-Jobs';

  @override
  String get chainsLoadFailed => 'Chains konnten nicht geladen werden';

  @override
  String get chainsNoReports => 'Noch keine Berichte';

  @override
  String get chainsEmptyHint =>
      'Team-Jobs auf dem Heimknoten erscheinen hier.\nErstellen Sie sie in der Social-UI des Heimknotens.';

  @override
  String get chainsNoActive =>
      'Keine aktiven Chains auf dem Heimknoten.\nStarten Sie eine in der Social-UI.';

  @override
  String get chainsReportGone => 'Dieser Bericht ist nicht mehr verfügbar';

  @override
  String get chainsReportGoneHint =>
      'Er wurde möglicherweise durch die 90-Tage-GC-Richtlinie entfernt.';

  @override
  String get chainsBackToRecent => 'Zurück zu aktuellen Team-Jobs';

  @override
  String get chainsLoadReportFailed => 'Bericht konnte nicht geladen werden';

  @override
  String get chainsSummary => 'Zusammenfassung';

  @override
  String get chainsWorkers => 'Worker';

  @override
  String get chainsSubtasks => 'Unteraufgaben';

  @override
  String get chainsSynthesis => 'Synthese';

  @override
  String get chainsDuration => 'Dauer';

  @override
  String get chainsManageOnSocial =>
      'Verwalten Sie Chains in der Social-UI des Heimknotens.';

  @override
  String get chainsStartTitle => 'Team-Job starten';

  @override
  String get chainsStartFab => 'Neuer Team-Job';

  @override
  String get chainsStartIntro =>
      'Beschreiben Sie ein Ziel. Der Heimknoten plant Unteraufgaben und weist verbundene Agent-Network-Worker zu.';

  @override
  String get chainsStartAssignmentMode => 'Zuweisungsmodus';

  @override
  String get chainsStartModeSkill => 'Nach Fähigkeit';

  @override
  String get chainsStartModeRole => 'Nach Rolle';

  @override
  String get chainsStartModeSkillHint =>
      'Worker werden nach passenden Fähigkeiten sortiert.';

  @override
  String get chainsStartModeRoleHint =>
      'Jeder Schritt bevorzugt eine Rolle (PM, Programmierer, …).';

  @override
  String get chainsStartGoalLabel => 'Ziel';

  @override
  String get chainsStartGoalHint => 'Was soll das Team erreichen?';

  @override
  String chainsStartGoalTooShort(int min) {
    return 'Das Ziel muss mindestens $min Zeichen umfassen';
  }

  @override
  String get chainsStartPreview => 'Plan in der Vorschau';

  @override
  String get chainsStartPreviewing => 'Planung läuft…';

  @override
  String get chainsStartPreviewFailed => 'Plan konnte nicht erstellt werden';

  @override
  String get chainsStartNeedPreview =>
      'Vor dem Start einen Plan in der Vorschau ansehen';

  @override
  String get chainsStartPlanHeading => 'Plan';

  @override
  String get chainsStartNoSubtasks => 'Keine Unteraufgaben in diesem Plan.';

  @override
  String get chainsStartConfirm => 'Team-Job starten';

  @override
  String get chainsStartStarting => 'Wird gestartet…';

  @override
  String get chainsStartStarted => 'Team-Job gestartet';

  @override
  String get chainsStartFailed => 'Team-Job konnte nicht gestartet werden';

  @override
  String get chainsStartNoWorkers =>
      'Keine erreichbaren Agent-Network-Worker. Bitte zuerst Kontakte mit Agenten auf dem Heimknoten verknüpfen.';

  @override
  String get chainsStartNeedWorkers =>
      'Mindestens einen Online-Worker auswählen, oder erneut Vorschau ansehen, um den empfohlenen Pool wiederherzustellen.';

  @override
  String get chainsStartWorkersHint =>
      'Online-Worker aus dem Plan. Entfernen Sie alle, die Sie nicht möchten. Wenn alle entfernt werden, ist Start blockiert — erneut Vorschau ansehen, um den empfohlenen Pool zurückzusetzen.';

  @override
  String get chainsStartWorkersHeading => 'Worker';

  @override
  String get chainsStartNoSuggestedWorkers =>
      'Noch keine vorgeschlagenen Worker — der Start verwendet den Discovery-Pool des Heimknotens.';

  @override
  String chainsStartWorkerMatches(int count) {
    return 'passt zu $count Schritten';
  }

  @override
  String get chainsStartWorkerOnline => 'Online';

  @override
  String get chainsStartWorkerRelay => 'Online (Relay)';

  @override
  String get chainsStartWorkerOffline => 'Offline / unbekannt';

  @override
  String get chainsActiveGone => 'Dieser Team-Job ist nicht mehr aktiv';

  @override
  String chainsBudgetLine(String spent, String max) {
    return 'Budget $spent / $max USD';
  }

  @override
  String get chainsBudgetWarn =>
      'Budgetwarnung — erwägen Sie, Budget hinzuzufügen.';

  @override
  String get chainsBudgetExceeded =>
      'Budget überschritten — der Job kann stocken, bis das Budget neu verteilt wird.';

  @override
  String chainsPartialCount(int count) {
    return '$count Teilergebnisse';
  }

  @override
  String get chainsCancelTitle => 'Team-Job abbrechen?';

  @override
  String get chainsCancelBody =>
      'Worker werden angewiesen zu stoppen. Bereits gesammelte Teilergebnisse bleiben erhalten.';

  @override
  String get chainsCancelConfirm => 'Job abbrechen';

  @override
  String get chainsCancelDone => 'Team-Job abgebrochen';

  @override
  String get chainsCancelReason => 'Von EnvoyGo abgebrochen';

  @override
  String get chainsDetailCancelled => 'Dieser Job wurde abgebrochen.';

  @override
  String get chainsDetailPublished =>
      'Dieser Job ist abgeschlossen und hat einen Bericht veröffentlicht.';

  @override
  String get chainsRebalanceHeading => 'Budget hinzufügen';

  @override
  String get chainsRebalanceHint =>
      'Kostenobergrenze anheben und nicht vergebene Schritte erneut versuchen.';

  @override
  String get chainsRebalanceAmount => 'Zusätzliche USD';

  @override
  String get chainsRebalanceAction => 'Hinzufügen & erneut versuchen';

  @override
  String get chainsRebalanceInvalidAmount => 'Positiven Dollarbetrag eingeben';

  @override
  String get chainsRebalanceDone => 'Budget aktualisiert';

  @override
  String get chainsRebalanceFailed => 'Neuverteilung nicht möglich';

  @override
  String get chainsPin => 'Bericht anheften';

  @override
  String get chainsUnpin => 'Bericht lösen';

  @override
  String get chainsPinDone =>
      'Bericht angeheftet (bleibt über die 90-Tage-Bereinigung hinaus erhalten)';

  @override
  String get chainsUnpinDone => 'Bericht gelöst';

  @override
  String chainsPublished(String date) {
    return 'Veröffentlicht $date';
  }

  @override
  String chainsChainId(String id) {
    return 'Kette $id';
  }

  @override
  String get termNone => 'Keine Terminal-Sitzungen';

  @override
  String termAttachFailed(String error) {
    return 'Terminal-Verbindung fehlgeschlagen: $error';
  }

  @override
  String get termCopied => 'In Zwischenablage kopiert';

  @override
  String get termReconnecting => 'Erneute Verbindung…';

  @override
  String get termCopyAll => 'Gesamte Ausgabe kopieren';

  @override
  String get termPaste => 'Einfügen';

  @override
  String get termCloseSession => 'Sitzung schließen';

  @override
  String get chatImagePlaceholder => '[Bild]';

  @override
  String get chatsBotSyncing => 'Updates werden synchronisiert…';

  @override
  String get chatsBotSavedHint =>
      'Auf dem Heimknoten gespeichert. Chatten Sie, wenn bereit.';

  @override
  String get chatsBotNotFound => 'Bot auf dem Heimknoten nicht gefunden';

  @override
  String get chatAiDisabledAskOwner =>
      'Bitten Sie den Heimbesitzer, ein KI-Modell für den Familienchat zu aktivieren.';

  @override
  String pairingLoadProfilesFailed(String error) {
    return 'Vorhandene Profile konnten nicht geladen werden: $error';
  }

  @override
  String pairingFailed(String error) {
    return 'Kopplung fehlgeschlagen: $error';
  }

  @override
  String get pairingInviteAlreadyUsed =>
      'Dieser Einladungs-QR wurde bereits verwendet. Bitte den Home-Besitzer Familie → Einladungs-QR anzeigen erneut öffnen lassen, den neuen Code scannen und unter Ich bin zurück Ihr Profil (z. B. Dad) wählen.';

  @override
  String get feedDefaultTitle => 'Feed-Beitrag';

  @override
  String get aiDraftSection => 'Entwurfsabschnitt';

  @override
  String aiDraftFailed(String reason) {
    return 'Entwurf nicht möglich ($reason)';
  }

  @override
  String authorAvatarNamed(String name) {
    return 'Avatar: $name';
  }

  @override
  String authorPhotoNamed(String name) {
    return 'Foto: $name';
  }

  @override
  String get peopleEnvoyUser => 'Envoy-Benutzer';

  @override
  String get commonEllipsis => '…';

  @override
  String get browserCached => 'Zwischengespeichert';

  @override
  String get browserLoaded => 'Geladen';

  @override
  String get browserNotPublished => 'Noch nicht veröffentlicht';

  @override
  String get browserNotFound => 'Inhalt nicht gefunden';

  @override
  String get browserAccessDenied => 'Zugriff verweigert';

  @override
  String browserPdfLoaded(int chars) {
    return 'PDF geladen ($chars Base64-Zeichen)';
  }

  @override
  String browserUnsupportedType(String mime) {
    return 'Nicht unterstützter Typ: $mime';
  }

  @override
  String get browserInterests => 'Interessen';

  @override
  String get browserKnowledge => 'Wissen';

  @override
  String get browserCapabilities => 'Fähigkeiten';

  @override
  String get connTooltipP2p => 'P2P-Verbindung über Relay-Hop';

  @override
  String get connTooltipRelay => 'Relay-Verbindung — Heim kann Sie anrufen';

  @override
  String connTooltipConnectedVia(String transport) {
    return 'Verbunden über $transport';
  }

  @override
  String get connBootstrap => 'Bootstrap';

  @override
  String get settingsRunning => 'läuft';

  @override
  String get settingsNotRunning => 'läuft nicht';

  @override
  String get settingsModelIdHint => 'model-id';

  @override
  String get chainsSections => 'Abschnitte';

  @override
  String get chainsWorkerAllocations => 'Worker-Zuteilungen';

  @override
  String chainsAwardedSummary(String status, int awarded, int total) {
    return '$status · $awarded/$total vergeben';
  }

  @override
  String meAttemptN(int n) {
    return 'Versuch $n';
  }

  @override
  String meSecondsAgo(int n) {
    return 'vor $n s';
  }

  @override
  String meMinutesAgo(int n) {
    return 'vor $n Min.';
  }

  @override
  String meHoursAgo(int n) {
    return 'vor $n Std.';
  }

  @override
  String meDaysAgo(int n) {
    return 'vor $n T.';
  }

  @override
  String get termShowKeyboard => 'Tastatur anzeigen';

  @override
  String get termHideKeyboard => 'Tastatur ausblenden';

  @override
  String get termCopySelection => 'Auswahl kopieren';

  @override
  String get pairingImBackHint =>
      'Tippen Sie einen Namen, wenn dies Ihr zweites Telefon ist (Ich bin zurück).';

  @override
  String connP2pDetail(String detail) {
    return 'P2P ($detail)';
  }

  @override
  String get meConnRefused => 'Verbindung abgelehnt / blockiert';

  @override
  String get meTimeout5s => 'Zeitüberschreitung (5 s)';

  @override
  String timeMinutesShort(int n) {
    return '$n Min.';
  }

  @override
  String timeHoursShort(int n) {
    return '$n Std.';
  }

  @override
  String timeDaysShort(int n) {
    return '$n T.';
  }

  @override
  String get termCtrlSticky => 'Ctrl-Taste (sticky)';

  @override
  String get termCtrlLetter => 'Ctrl + Buchstabe';

  @override
  String get connStateConnected => 'Verbunden';

  @override
  String get connStateConnecting => 'Verbinden…';

  @override
  String get connStateDisconnected => 'Getrennt';

  @override
  String get connStateError => 'Fehler';

  @override
  String get chatsDefaultGroup => 'Gruppe';

  @override
  String get chatsDefaultFamilyGroup => 'Familiengruppe';

  @override
  String chatsTerminalTitle(String name) {
    return 'Terminal: $name';
  }

  @override
  String get chatsExtAgent => 'Ext-Agent';

  @override
  String browserBytesCount(int count) {
    return '$count Bytes';
  }

  @override
  String get commonYouName => 'Du';

  @override
  String get settingsAiModelEnvoyLocalStandby =>
      'Envoy Local ist der aktive Anbieter auf dem Heimknoten. Tippen, um Local zu verwalten, oder unten einen Cloud-Anbieter als Standby speichern.';

  @override
  String get settingsEnvoyLocalIntro =>
      'Steuerung von llama.cpp auf dem Heimcomputer. Modelle werden dort heruntergeladen — nie auf dieses Telefon.';

  @override
  String get settingsEnvoyLocalStatusHeading => 'Status';

  @override
  String get settingsEnvoyLocalInUse => 'In Verwendung';

  @override
  String get settingsEnvoyLocalNotInUse => 'Nicht in Verwendung';

  @override
  String get settingsEnvoyLocalStatusDownloading => 'Wird heruntergeladen…';

  @override
  String get settingsEnvoyLocalStatusDetecting => 'Erkennung läuft…';

  @override
  String get settingsEnvoyLocalStatusExtracting => 'Wird entpackt…';

  @override
  String get settingsEnvoyLocalStatusStarting => 'Wird gestartet…';

  @override
  String get settingsEnvoyLocalStatusReady => 'Bereit';

  @override
  String get settingsEnvoyLocalStatusError => 'Fehler';

  @override
  String get settingsEnvoyLocalStatusDisabled => 'Deaktiviert';

  @override
  String get settingsEnvoyLocalIdleTimeout =>
      'Envoy-Local-Vorgang hat das Zeitlimit von 60 Minuten überschritten. Wenn ein Download bei ca. 100 % hängt, versuchen Sie China-Spiegel oder ein VPN und dann erneut — Teil-Downloads werden fortgesetzt.';

  @override
  String settingsEnvoyLocalRuntime(String status) {
    return 'Laufzeit: $status';
  }

  @override
  String settingsEnvoyLocalRuntimeVersion(String version) {
    return 'Version: $version';
  }

  @override
  String settingsEnvoyLocalAccel(String accel) {
    return 'Beschleuniger: $accel';
  }

  @override
  String settingsEnvoyLocalHardware(String summary) {
    return 'Diese Maschine: $summary';
  }

  @override
  String settingsEnvoyLocalActiveModel(String model) {
    return 'Modell: $model';
  }

  @override
  String settingsEnvoyLocalProgressBytes(String received, String total) {
    return '$received / $total MB';
  }

  @override
  String settingsEnvoyLocalProgressReceived(String received) {
    return '$received MB heruntergeladen';
  }

  @override
  String settingsEnvoyLocalLastError(String error) {
    return 'Letzter Fehler: $error';
  }

  @override
  String get settingsEnvoyLocalDownloadRegion => 'Modell-Download-Region';

  @override
  String get settingsEnvoyLocalDownloadRegionHint =>
      'Falls Downloads fehlschlagen, probieren Sie China-Spiegel oder ein VPN für Global.';

  @override
  String settingsEnvoyLocalDownloadRegionEffective(String region) {
    return 'Verwendet: $region';
  }

  @override
  String get settingsEnvoyLocalRegionAuto => 'Auto (Zeitzone / Gebietsschema)';

  @override
  String get settingsEnvoyLocalRegionCn => 'China (ModelScope → hf-mirror)';

  @override
  String get settingsEnvoyLocalRegionGlobal => 'Global (Hugging Face)';

  @override
  String get settingsEnvoyLocalEnable => 'Herunterladen & aktivieren';

  @override
  String get settingsEnvoyLocalEnabling => 'Wird heruntergeladen…';

  @override
  String get settingsEnvoyLocalStart => 'Envoy Local starten';

  @override
  String get settingsEnvoyLocalStarting => 'Wird gestartet…';

  @override
  String get settingsEnvoyLocalStop => 'Envoy Local stoppen';

  @override
  String get settingsEnvoyLocalRestart => 'Neustart';

  @override
  String get settingsEnvoyLocalCancelDownload => 'Download abbrechen';

  @override
  String get settingsEnvoyLocalStopHint =>
      'Stopp schaltet den Assistenten auf Ihren Cloud-/Ollama-Anbieter zurück, falls einer gespeichert ist.';

  @override
  String get settingsEnvoyLocalRecommended => 'Empfohlen';

  @override
  String get settingsEnvoyLocalRecommendedBadge => 'Empfohlen';

  @override
  String get settingsEnvoyLocalDownload => 'Herunterladen';

  @override
  String get settingsEnvoyLocalInstalled => 'Installierte Modelle';

  @override
  String get settingsEnvoyLocalInstalledHint =>
      'Auf dem Heimknoten heruntergeladen. Wählen Sie, welches aktiv sein soll.';

  @override
  String get settingsEnvoyLocalNoInstalled => 'Noch keine Modelle installiert.';

  @override
  String get settingsEnvoyLocalSetActive => 'Als aktiv festlegen';

  @override
  String get settingsEnvoyLocalActiveBadge => 'Aktiv';

  @override
  String get settingsEnvoyLocalInstalledBadge => 'Installiert';

  @override
  String get settingsEnvoyLocalCatalog => 'Katalog';

  @override
  String settingsEnvoyLocalHfError(String error) {
    return 'Hugging-Face-Suche nicht verfügbar: $error';
  }

  @override
  String get settingsEnvoyLocalRefresh => 'Aktualisieren';

  @override
  String get settingsEnvoyLocalPhoneNote =>
      'Erweiterte Server-Parameter (Kontextgröße, GPU-Schichten) bleiben in der Social-UI des Heimknotens.';
}
