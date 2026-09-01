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
  String get navSocial => 'Sozial';

  @override
  String get navTerminal => 'Terminal';

  @override
  String get navKnowledge => 'Wissen';

  @override
  String get navMe => 'Ich';

  @override
  String get contentExplore => 'Entdecken';

  @override
  String get socialDiscover => 'Personen finden';

  @override
  String get marketTitle => 'Markt';

  @override
  String get marketPaneBrowse => 'Stöbern';

  @override
  String get marketPaneShop => 'Mein Shop';

  @override
  String get marketBrowseEmptyTitle => 'Noch keine Angebote anderer';

  @override
  String get marketBrowseEmptyDesc =>
      'Angebote von verbundenen Freunden erscheinen hier nach der Veröffentlichung.';

  @override
  String get marketSearchPlaceholder => 'Bücher, Elektronik, Tags suchen…';

  @override
  String get marketSearchSubmit => 'Suchen';

  @override
  String get marketSearchIdleHint =>
      'Stichwort eingeben oder Vorschlag antippen.';

  @override
  String marketSearchNoResults(String query) {
    return 'Keine Angebote für „$query“.';
  }

  @override
  String get marketChipBooks => 'Bücher';

  @override
  String get marketChipElectronics => 'Elektronik';

  @override
  String get marketChipClothing => 'Kleidung';

  @override
  String get marketChipHome => 'Zuhause';

  @override
  String get marketChipDigital => 'Digital';

  @override
  String get marketClearHistory => 'Verlauf löschen';

  @override
  String get marketHistoryCleared => 'Suchverlauf gelöscht.';

  @override
  String get marketMessageSeller => 'Verkäufer anschreiben';

  @override
  String get marketSellerLabel => 'Verkäufer';

  @override
  String get marketShareLink => 'Link kopieren';

  @override
  String get marketShareCopied => 'Share-Link kopiert.';

  @override
  String marketInquireDefault(String title) {
    return 'Hallo — Interesse an „$title“. Ist es noch verfügbar?';
  }

  @override
  String get marketInquireSent => 'Nachricht gesendet. Chat wird geöffnet…';

  @override
  String get marketNotConnected =>
      'Nicht mit dem Home verbunden — koppeln, um den Shop zu sehen.';

  @override
  String get marketNoListings =>
      'Noch keine Angebote. Tippen Sie auf „Aus Foto hinzufügen“, oder bearbeiten Sie in Social.';

  @override
  String get marketUntitled => 'Unbenanntes Angebot';

  @override
  String get marketVisibilityPublicShort => 'Öffentlich';

  @override
  String get marketVisibilityBondsShort => 'Nur Bonds';

  @override
  String get marketStatusActive => 'Zu verkaufen';

  @override
  String get marketStatusReserved => 'Reserviert';

  @override
  String get marketStatusSold => 'Verkauft';

  @override
  String get marketStatusWithdrawn => 'Zurückgezogen';

  @override
  String get marketTagsLabel => 'Tags';

  @override
  String get marketEditOnSocialHint =>
      'Erstellen und bearbeiten Sie Angebote vorerst im Social-Markt-Tab des Home-Knotens.';

  @override
  String get marketCaptureAddFromPhoto => 'Aus Foto hinzufügen';

  @override
  String get marketCaptureCamera => 'Foto aufnehmen';

  @override
  String get marketCaptureGallery => 'Aus Galerie wählen';

  @override
  String get marketCaptureNotesTitle => 'Artikel beschreiben';

  @override
  String get marketCaptureNotesHint =>
      'Titel in der ersten Zeile, dann Details…';

  @override
  String get marketCaptureContinue => 'Weiter';

  @override
  String get marketCaptureReviewTitle => 'Angebot prüfen';

  @override
  String get marketCaptureTitleLabel => 'Titel';

  @override
  String get marketCaptureDescriptionLabel => 'Beschreibung';

  @override
  String get marketCapturePriceLabel => 'Preis';

  @override
  String get marketCaptureCurrencyLabel => 'Währung';

  @override
  String get marketCaptureVisibilityLabel => 'Wer kann das finden';

  @override
  String get marketCapturePublish => 'Veröffentlichen';

  @override
  String get marketCapturePublished =>
      'Angebot auf Ihrem Heimknoten veröffentlicht.';

  @override
  String get marketCaptureTitleRequired =>
      'Vor dem Veröffentlichen einen Titel hinzufügen.';

  @override
  String get marketSellerSuggestedReply =>
      'Vorgeschlagene Antwort aus dem Angebot';

  @override
  String get marketMarkReserved => 'Als reserviert markieren';

  @override
  String get marketMarkSold => 'Als verkauft markieren';

  @override
  String get marketMarkAvailable => 'Als verfügbar markieren';

  @override
  String get marketRelist => 'Erneut einstellen';

  @override
  String get marketStatusUpdated => 'Angebotsstatus aktualisiert.';

  @override
  String get marketPaymentHint =>
      'Vereinbaren Sie die Zahlung mit dem Verkäufer außerhalb von EnvoyMesh — Envoy verwahrt kein Geld.';

  @override
  String get marketBlockSeller => 'Blockieren';

  @override
  String get marketReportSeller => 'Melden';

  @override
  String get marketConfirmBlock =>
      'Diesen Verkäufer blockieren? Dessen Angebote verschwinden aus Durchsuchen.';

  @override
  String get marketConfirmReport =>
      'Verkäufer melden und blockieren? Das bleibt auf Ihrem Knoten (noch keine zentrale Prüfung).';

  @override
  String get marketFilterCategory => 'Kategorie';

  @override
  String get marketFilterAnyCategory => 'Alle Kategorien';

  @override
  String get marketFilterMinPrice => 'Mindestpreis';

  @override
  String get marketFilterMaxPrice => 'Höchstpreis';

  @override
  String get marketFilterCurrency => 'Währung';

  @override
  String get termEmptyHint =>
      'Starten Sie eine Pi-Coding-Sitzung oder ein Shell-Terminal auf Ihrem Heimknoten.';

  @override
  String get commonCancel => 'Abbrechen';

  @override
  String get commonConfirm => 'Bestätigen';

  @override
  String get homeFolderDrives => 'Laufwerke';

  @override
  String get homeFolderComputer => 'Computer';

  @override
  String get homeFolderHome => 'Start';

  @override
  String get homeFolderParent => '↑ Übergeordneter Ordner';

  @override
  String get homeFolderNoSubfolders => 'Keine Unterordner';

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
  String get meMyShop => 'Mein Shop';

  @override
  String get meMyShopHint =>
      'Angebote auf dem Home-Knoten ansehen (Bearbeiten vorerst in Social)';

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
  String get mePiAgent => 'Coding-Agenten';

  @override
  String get mePiAgentHint => 'Pi- und Envoy-Harness-Einstellungen';

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
      'Lokale Coding-Agenten auf dem Heimknoten (Pi und Envoy Harness)';

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
  String get contentFeed => 'Neuigkeiten';

  @override
  String get contentBlog => 'Blog';

  @override
  String get contentPeople => 'Personen';

  @override
  String get contentMyFiles => 'Meine Dateien';

  @override
  String get contentKnowledge => 'Wissen';

  @override
  String get knowledgeTitle => 'Wissen';

  @override
  String get knowledgeLede =>
      'Ihre Vault-Wissensdatenbank — Notizen unter notes/ versorgen EnvoyAI. Dokumente bleiben als Originale erhalten.';

  @override
  String get knowledgePanelBrowse => 'Durchsuchen';

  @override
  String get knowledgePanelAsk => 'Fragen';

  @override
  String get knowledgePanelPlugins => 'Plugins';

  @override
  String get knowledgePanelSetup => 'Einrichtung';

  @override
  String get knowledgeAskHint =>
      'Antworten verwenden Notizen und Dokumente auf diesem Knoten. Kontakte sehen nur, was Sie veröffentlichen.';

  @override
  String get knowledgeAskHeading => 'Vault befragen';

  @override
  String get knowledgeAskLabel => 'Frage';

  @override
  String get knowledgeAskPlaceholder =>
      'Was habe ich zum Onboarding geschrieben?';

  @override
  String get knowledgeAskSubmit => 'Fragen';

  @override
  String get knowledgeAskBusy => 'Suche…';

  @override
  String get knowledgeAskAnswerHeading => 'Antwort';

  @override
  String get knowledgeAskEmptyAnswer =>
      'Keine Antwort erhalten. Einrichtung prüfen — Vault-Wissen aktivieren und Index neu aufbauen.';

  @override
  String get knowledgeAskContinueEnvoyAi => 'In EnvoyAI öffnen';

  @override
  String get knowledgeAskEnvoyAiHint =>
      'Für mehrstufige Dialoge mit Werkzeugen in EnvoyAI fortfahren.';

  @override
  String get knowledgeLibraryHeading => 'Ihre Dateien';

  @override
  String get knowledgeLibraryCaption =>
      'Notizen, Dokumente und was Sie veröffentlicht haben.';

  @override
  String get knowledgeEmbedGateTitleNeeded => 'Embedding-Modell erforderlich';

  @override
  String get knowledgeEmbedGateTitleDownloading =>
      'Embedding-Modell wird heruntergeladen…';

  @override
  String get knowledgeEmbedGateTitleError =>
      'Embedding-Einrichtung fehlgeschlagen';

  @override
  String get knowledgeEmbedGateBodyNeeded =>
      'Die Wissenssuche benötigt ein lokales Embedding-Modell auf dem Heimknoten. Der Download startet automatisch beim App-Start — Browse bleibt bis zum Abschluss unverfügbar. Sie können den Download auch hier starten oder erneut versuchen.';

  @override
  String get knowledgeEmbedGateBodyDownloading =>
      'Download läuft auf dem Heimknoten (mit der App gestartet). Sie können diesen Bildschirm verlassen; Wissen wird freigeschaltet, wenn das Embedder-Modell bereit ist.';

  @override
  String get knowledgeEmbedGateBodyError =>
      'Embedding-Runtime oder -Modell konnte auf dem Heimknoten nicht installiert werden. Download erneut versuchen, oder Einrichtung in der Desktop-App reparieren.';

  @override
  String get knowledgeEmbedGateDownload => 'Auf Heim herunterladen';

  @override
  String get knowledgeEmbedGateDownloading => 'Wird heruntergeladen…';

  @override
  String get knowledgeEmbedGateRetry => 'Download erneut versuchen';

  @override
  String get knowledgeEmbedGateOpenSetup => 'Einrichtung öffnen';

  @override
  String get knowledgeEmbedGateBackgroundHint =>
      'Andere App-Bereiche können während des Vorgangs gefahrlos weiter genutzt werden.';

  @override
  String get knowledgeEmbedGateStripNeeded =>
      'Wissen nicht verfügbar — Embedding-Modell nicht auf Heim installiert';

  @override
  String get knowledgeEmbedGateStripDownloading =>
      'Wissen nicht verfügbar — Embedding-Modell wird auf Heim heruntergeladen';

  @override
  String get knowledgeEmbedGateStripError =>
      'Wissen nicht verfügbar — Embedding-Einrichtung auf Heim fehlgeschlagen';

  @override
  String get knowledgeEmbedGateDownloadStarted =>
      'Embedding-Download auf Heim gestartet';

  @override
  String get knowledgeEmbedGateBlockedToast =>
      'Schließe die Embedding-Einrichtung ab, bevor du den Vault fragst.';

  @override
  String get knowledgeEmbedGatePhaseDetecting => 'Plattform wird erkannt…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingRuntime =>
      'llama.cpp-Runtime wird heruntergeladen…';

  @override
  String get knowledgeEmbedGatePhaseExtracting => 'Runtime wird entpackt…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingModel =>
      'Embedding-Modell wird heruntergeladen…';

  @override
  String get knowledgeEmbedGatePhaseStarting => 'Embedder wird gestartet…';

  @override
  String get knowledgeEmbedGatePhaseDownloading => 'Wird heruntergeladen…';

  @override
  String get knowledgeEmbedGateStepsAria =>
      'Schritte der Embedding-Installation';

  @override
  String get knowledgePluginsLede =>
      'Optionale Konnektoren. Notion benötigt eine MCP-URL — nicht die Notion-App.';

  @override
  String get knowledgePluginsObsidianTitle => 'Obsidian';

  @override
  String get knowledgePluginsObsidianDesc =>
      'Vault-Notizen anreichern. Desktop-App optional.';

  @override
  String get knowledgePluginsNotionTitle => 'Notion (über MCP)';

  @override
  String get knowledgePluginsNotionDesc =>
      'Suche und Browsen über MCP. Schlägt ohne URL weich fehl.';

  @override
  String get knowledgePluginsMcpUrl => 'MCP-Server-URL';

  @override
  String get knowledgePluginsMcpTool => 'Name des Suchwerkzeugs';

  @override
  String get knowledgePluginsSyncNow => 'Jetzt synchronisieren';

  @override
  String get knowledgePluginsLinkedVaultLabel =>
      'Verknüpfte Obsidian-Vault-Pfade';

  @override
  String get knowledgePluginsLinkedVaultHint => '/Pfad/zum/ObsidianVault';

  @override
  String get knowledgePluginsLinkedVaultEmpty =>
      'Noch keine verknüpften Vaults.';

  @override
  String get knowledgePluginsLinkedVaultRemove => 'Entfernen';

  @override
  String get knowledgePluginsLinkedVaultAdd => 'Vault-Ordner hinzufügen…';

  @override
  String get knowledgePluginsLinkedVaultPickTitle =>
      'Obsidian-Vault-Ordner wählen';

  @override
  String get knowledgePluginsLinkedVaultHelper =>
      'Vaults von Obsidian auf diesem Heimcomputer werden automatisch verknüpft. Zeile entfernen zum Lösen (wird nicht erneut automatisch verknüpft). Vault-Ordner hinzufügen… für weitere.';

  @override
  String get knowledgePluginsOpenObsidian => 'Obsidian öffnen';

  @override
  String get knowledgePluginsOpenNotion => 'Notion öffnen';

  @override
  String get knowledgePluginsOpeningApp => 'Wird geöffnet…';

  @override
  String get knowledgePluginsOpenAppFailed =>
      'App konnte auf diesem Computer nicht geöffnet werden.';

  @override
  String get knowledgePluginsOpenedWebsite =>
      'App lokal nicht installiert — offizielle Website auf dem Heimknoten geöffnet.';

  @override
  String get knowledgePluginsDownloadObsidian => 'Obsidian herunterladen';

  @override
  String get knowledgePluginsDownloadNotion => 'Notion herunterladen';

  @override
  String get knowledgePluginsLinkedVaultAutoOne =>
      'Verknüpfter Obsidian-Vault auf diesem Computer gefunden.';

  @override
  String knowledgePluginsLinkedVaultAutoMany(int count) {
    return '$count verknüpfte Obsidian-Vaults auf diesem Computer gefunden.';
  }

  @override
  String get knowledgeHubImportObsidianAll => 'Alle verknüpften importieren';

  @override
  String get knowledgeHubImportNotionVisible => 'Sichtbare Karten importieren';

  @override
  String get knowledgeHubExportToObsidian => 'Nach Obsidian exportieren';

  @override
  String get knowledgeHubExportToNotion => 'Nach Notion/MCP exportieren';

  @override
  String knowledgeHubImportObsidianOk(int count) {
    return '$count Obsidian-Notiz(en) importiert';
  }

  @override
  String knowledgeHubImportNotionOk(int count) {
    return '$count Notion/MCP-Notiz(en) importiert';
  }

  @override
  String knowledgeHubExportObsidianOk(int count) {
    return '$count Notiz(en) nach Obsidian exportiert';
  }

  @override
  String knowledgeHubExportNotionOk(int count) {
    return '$count Notiz(en) über MCP exportiert';
  }

  @override
  String get knowledgeHubImportFailed => 'Import fehlgeschlagen';

  @override
  String get knowledgeHubExportFailed => 'Export fehlgeschlagen';

  @override
  String get knowledgeHubImportMcpEmpty =>
      'Keine Live-MCP-Karten zum Importieren — Browse zuerst aktualisieren';

  @override
  String get knowledgeHubExportEmpty =>
      'Keine Vault-Markdown-Notizen zum Exportieren';

  @override
  String get knowledgeHubShareVaultOnly =>
      'Teilen funktioniert nur für Vault-Dateien — zuerst importieren';

  @override
  String knowledgeHubMcpListError(String error) {
    return 'MCP-Liste: $error';
  }

  @override
  String get knowledgeSetupHint =>
      'Indexstatus und Abruf. Chat-Modelle bleiben in Ich → KI-Modell.';

  @override
  String get knowledgeSetupEmbeddingHint =>
      'Embeddings für die Suche im Tresor. Ohne Modell bleibt die Stichwortsuche verfügbar.';

  @override
  String get knowledgeSetupEnabled => 'Vault-Wissen aktivieren';

  @override
  String get knowledgeSetupStatusHint =>
      'Auf Neu aufbauen tippen, um den Vektorindex zu aktualisieren.';

  @override
  String get knowledgeSetupReindex => 'Index neu aufbauen';

  @override
  String get knowledgeSetupReindexDone => 'Neu-Index gestartet';

  @override
  String get knowledgeSetupReindexConfirm =>
      'Vektorindex des Vaults auf dem Heimknoten neu aufbauen?';

  @override
  String get knowledgeSetupTestEmbedding => 'Embedding testen';

  @override
  String get knowledgeSetupTestEmbeddingBusy => 'Teste…';

  @override
  String knowledgeSetupTestEmbeddingOk(int dimensions, int latencyMs) {
    return 'Embedding OK — $dimensions Dims in $latencyMs ms';
  }

  @override
  String knowledgeSetupTestEmbeddingFail(String error) {
    return 'Embedding fehlgeschlagen: $error';
  }

  @override
  String get knowledgeSetupRagMode => 'Abrufmodus';

  @override
  String get knowledgeSetupRagHybrid => 'Hybrid';

  @override
  String get knowledgeSetupRagVector => 'Vektor';

  @override
  String get knowledgeSetupRagLexical => 'Lexikalisch';

  @override
  String get knowledgeSetupSnippetLimit => 'Vault-Schnipsel pro Antwort';

  @override
  String knowledgeBrowseIndexIndexingProgress(int processed, int total) {
    return 'Indiziere $processed/$total…';
  }

  @override
  String get knowledgeHubOpenPlugins => 'Plugins öffnen';

  @override
  String get knowledgeNoteNewTitle => 'Neue Notiz';

  @override
  String get knowledgeNoteEditTitle => 'Notiz bearbeiten';

  @override
  String get knowledgeNoteFilename => 'Dateiname';

  @override
  String get knowledgeNoteFilenameRequired => 'Notizdateinamen eingeben';

  @override
  String get knowledgeNoteContent => 'Markdown';

  @override
  String get knowledgeNoteSensitivity => 'Sichtbarkeit';

  @override
  String get knowledgeNotePrivate => 'Privat';

  @override
  String get knowledgeNoteFriends => 'Freunde';

  @override
  String get knowledgeNotePublished => 'Veröffentlicht';

  @override
  String get knowledgeNoteAlsoBlog => 'Auch als Blog veröffentlichen';

  @override
  String get knowledgeFilePreview => 'Vorschau';

  @override
  String get knowledgeFileOpenOnHome => 'Auf Heim öffnen';

  @override
  String get knowledgeFileOpenedOnHome => 'Auf dem Heimcomputer geöffnet';

  @override
  String get knowledgeFilePublish => 'Veröffentlichen';

  @override
  String get knowledgeFileMakePrivate => 'Privat stellen';

  @override
  String get knowledgeBrowseImportAndPublish =>
      'Importieren und veröffentlichen';

  @override
  String get knowledgeBrowsePublishImportOnly => 'Nur Import veröffentlichen';

  @override
  String get knowledgeBrowsePublishImportNoDoc =>
      'Importiert — Veröffentlichung ohne Dokument-ID übersprungen.';

  @override
  String get knowledgeBrowseImportedAndPublished =>
      'Importiert und veröffentlicht.';

  @override
  String get knowledgeBrowsePublishImportHint =>
      'Nach dem Import optional für Kontakte veröffentlichen.';

  @override
  String get knowledgeFileMore => 'Weitere Aktionen';

  @override
  String get knowledgeFileConvert => 'In Markdown-Notiz umwandeln';

  @override
  String knowledgeFileConvertOk(String path) {
    return 'Markdown-Notiz gespeichert: $path';
  }

  @override
  String get knowledgeFileConvertFailed =>
      'Konvertierung zu Markdown fehlgeschlagen';

  @override
  String get knowledgeFileDeleteTitle => 'Datei löschen?';

  @override
  String knowledgeFileDeleteBody(String title) {
    return '„$title“ aus dem Heim-Vault löschen?';
  }

  @override
  String get knowledgeFileDeleteConfirm => 'Löschen';

  @override
  String get meKnowledge => 'Wissens-Einrichtung';

  @override
  String get meKnowledgeHint => 'Index und Abruf für Vault-Fragen';

  @override
  String get meKnowledgePlugins => 'Wissen-Plugins';

  @override
  String get meKnowledgePluginsHint => 'Obsidian-Verknüpfung und Notion/MCP';

  @override
  String get knowledgeBrowseFilterAll => 'Alle';

  @override
  String get knowledgeBrowseFiltersLabel => 'ANZEIGEN';

  @override
  String get knowledgeBrowseFilterNotes => 'Notizen';

  @override
  String get knowledgeBrowseFilterObsidian => 'Obsidian';

  @override
  String get knowledgeBrowseFilterNotion => 'Notion';

  @override
  String get knowledgeBrowseFilterBlog => 'Blog';

  @override
  String get knowledgeBrowseFilterDocuments => 'Dokumente';

  @override
  String get knowledgeBrowseFilterPublished => 'Veröffentlicht';

  @override
  String knowledgeBrowseIndexReady(int count) {
    return '$count indiziert';
  }

  @override
  String knowledgeBrowseIndexReadyLinked(int count, int linked) {
    return '$count indiziert · $linked Obsidian verknüpft';
  }

  @override
  String get knowledgeBrowseIndexIndexing => 'Indizierung…';

  @override
  String get knowledgeBrowseIndexEmpty => 'Index leer';

  @override
  String get knowledgeBrowseIndexChipHint =>
      'Wissen → Einrichtung öffnen, um den Index zu verwalten.';

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
  String get feedTitle => 'Neuigkeiten';

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
  String get chatsSectionCoding => 'Coding';

  @override
  String get chatsCodingPi => 'Pi';

  @override
  String get chatsCodingPiHint => 'Coding-Agent (Terminal)';

  @override
  String get chatsCodingEh => 'Envoy';

  @override
  String get chatsCodingEhHint => 'Coding-Agent (Chat)';

  @override
  String get chatsEhNew => 'Neuer Coding-Chat';

  @override
  String get chatsEhRemoveTitle => 'Coding-Chat entfernen?';

  @override
  String chatsEhRemoveBody(String name) {
    return '„$name“ aus der Coding-Liste entfernen? Der Chatverlauf auf dem Home-Knoten wird gelöscht.';
  }

  @override
  String get chatsEhThinking => 'Envoy denkt nach…';

  @override
  String get chatsEhPromptHint =>
      'Envoy bitten zu coden, zu refaktorieren oder zu erklären…';

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
  String get chatsNewEnvoy => 'Neues Envoy';

  @override
  String get chatsNewEnvoyHint => 'Envoy-Harness-TUI starten';

  @override
  String get ehChooseProjectTitle => 'Envoy-Projektordner wählen';

  @override
  String get ehChangeProjectTitle => 'Envoy-Projektordner ändern';

  @override
  String get ehChooseProjectDesc =>
      'Envoy läuft in diesem Ordner (liest AGENTS.md, bearbeitet Dateien, führt Shell aus).';

  @override
  String get ehStartWithProject => 'Starten';

  @override
  String get ehRestartWithProject => 'Envoy hier neu starten';

  @override
  String get ehEnsuringTerminal => 'Envoy-TUI wird gestartet…';

  @override
  String get ehPermissionTitle => 'Tool-Berechtigung';

  @override
  String get ehPermissionAllow => 'Zulassen';

  @override
  String get ehPermissionDeny => 'Ablehnen';

  @override
  String get ehQuestionTitle => 'Envoy braucht deine Eingabe';

  @override
  String get ehRecommended => 'Empfohlen';

  @override
  String get ehSlashWhileBusy =>
      'Beende oder /cancel den aktuellen Turn zuerst.';

  @override
  String get ehChatReset => 'Neuer Chat für dieses Projekt gestartet.';

  @override
  String get ehTurnCancelled => 'Turn abgebrochen.';

  @override
  String get ehStatusRefreshed => 'Status aktualisiert.';

  @override
  String get ehNoPeers => 'Kein Peer-Cluster konfiguriert.';

  @override
  String get ehSearchUsage =>
      'Nutzung: /search <Begriff> — diese Unterhaltung durchsuchen.';

  @override
  String ehSearchNoMatches(String term) {
    return 'Keine Treffer für „$term“.';
  }

  @override
  String ehModelShow(String model) {
    return 'Aktives Modell: $model';
  }

  @override
  String get ehModelUnknown =>
      'Kein Modell konfiguriert — unter Einstellungen → KI festlegen.';

  @override
  String ehProjectCurrent(String path) {
    return 'Projektordner: $path';
  }

  @override
  String get ehProjectUnset =>
      'Kein Projektordner gesetzt — /cd <Pfad> verwenden.';

  @override
  String ehProjectSet(String path) {
    return 'Projektordner → $path';
  }

  @override
  String get ehProjectSetUnknown => 'Projektordner aktualisiert.';

  @override
  String ehProjectSetFailed(String error) {
    return 'Projektordner konnte nicht gesetzt werden: $error';
  }

  @override
  String get ehConfigureModel => 'Modell in Einstellungen → KI konfigurieren.';

  @override
  String get ehNotReady => 'envoy-harness ist nicht bereit.';

  @override
  String get termQuickHelp => '/help';

  @override
  String get termQuickCancel => '/cancel';

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
  String get chatAiManual => 'Manuell';

  @override
  String get chatAiAssistant => 'Assistent';

  @override
  String get chatAiAuto => 'Auto';

  @override
  String get chatAiManualTooltip => 'Manuell: selbst schreiben';

  @override
  String get chatAiAssistantTooltip => 'Assistent: KI schlägt Entwürfe vor';

  @override
  String get chatAiAutoTooltip => 'Auto-Antwort: KI antwortet automatisch';

  @override
  String get chatAgentMode => 'Agent';

  @override
  String get chatAgentModeOffTooltip =>
      'Agent-Modus aus — Assistent nutzt nur öffentliches Wissen';

  @override
  String get chatAgentModeOnTooltip =>
      'Agent-Modus an — OpenClaw darf Heim-Dateien, privates Wissen und Werkzeuge nutzen';

  @override
  String get chatAgentModeConfirmTitle =>
      'Agent-Modus für diesen Chat aktivieren?';

  @override
  String get chatAgentModeConfirmBody =>
      'Der Agent-Modus nutzt EnvoyAI/OpenClaw und kann lokale Dateien, privates Wissen lesen und Werkzeuge auf Ihrem Heimknoten ausführen. Nur für Kontakte aktivieren, denen Sie vollständig vertrauen.';

  @override
  String get chatAgentModeConfirmEnable => 'Agent-Modus aktivieren';

  @override
  String get chatSuggestedReply => 'Vorgeschlagene Antwort';

  @override
  String get chatSuggestedReplyUse => 'Verwenden';

  @override
  String get chatSuggestedReplyDismiss => 'Verwerfen';

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
  String get chatSentFile => 'Datei gesendet';

  @override
  String get chatSentVoice => 'Sprachnachricht gesendet';

  @override
  String get chatDeliverySent => 'Gesendet';

  @override
  String get chatDeliveryDelivered => 'Zugestellt';

  @override
  String get chatDeliveryFailed => 'Nicht zugestellt';

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
  String get publishedFeed => 'Feed';

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
  String get authorTypePhoto => 'Fotowand-Foto';

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
  String get settingsAiModelTestChat => 'Chat-Modell testen';

  @override
  String get settingsAiModelTestChatBusy => 'Teste…';

  @override
  String settingsAiModelTestChatOk(String modelName, int latencyMs) {
    return 'Chat-Modell OK — $modelName in $latencyMs ms';
  }

  @override
  String settingsAiModelTestChatFail(String error) {
    return 'Chat-Modell fehlgeschlagen: $error';
  }

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
  String get settingsPiBuiltIn => 'Lokale Coding-Agenten';

  @override
  String get settingsPiLocalOnly =>
      'Pi ist für Terminal und Ext Agent. Envoy Harness steuert den Coding-Chat und ist im Terminal immer verfügbar.';

  @override
  String get settingsPiEnabled => 'Pi aktivieren';

  @override
  String get settingsPiCodingBackend => 'Aktive Engine';

  @override
  String get settingsPiCodingBackendPi => 'Pi (Sidecar)';

  @override
  String get settingsPiCodingBackendEh => 'envoy-harness (ACP)';

  @override
  String get settingsPiCodingBackendHint =>
      'Welche Engine Coding-Chat und Freigaben erhält. Löscht die andere Engine nicht.';

  @override
  String get settingsPiCodingBackendSaved => 'Aktive Engine aktualisiert';

  @override
  String get settingsPiSectionTitle => 'Pi';

  @override
  String get settingsPiSectionHint =>
      'Sidecar für Terminal und Ext Agent — Aktivierung und Modell-Override';

  @override
  String get settingsEhSectionTitle => 'Envoy Harness';

  @override
  String get settingsEhSectionHint =>
      'Steuert Coding-Chat und ist im Terminal immer verfügbar — Auto-Run (Projektordner im Envoy-Chat)';

  @override
  String get settingsEhAutoRunPolicy => 'Envoy Harness Auto-Run';

  @override
  String get settingsEhAutoRunAlways => 'Immer bestätigen';

  @override
  String get settingsEhAutoRunSafe => 'Nur destruktive bestätigen';

  @override
  String get settingsEhAutoRunOff => 'Aus — immer Vorschau';

  @override
  String get settingsEhAutoRunNever => 'Nie fragen (alles erlauben)';

  @override
  String get settingsEhAutoRunSaved => 'Envoy Harness Auto-Run aktualisiert';

  @override
  String get settingsEhActiveBadge => 'aktiv';

  @override
  String get settingsPiOverrideHint =>
      'Pi-Modell-Override (optional). Leeren, um KI-Modell zu erben.';

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
      'Flotten-Setup, Gebote und Rezepte bleiben in der Social-UI des Heimknotens. Abbrechen, Rebalance und Anheften gehen auch hier.';

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
  String get chainsStartTeamStrategy => 'Teamstrategie';

  @override
  String get chainsStartTeamStrategyHint =>
      'Wie Worker für diese Aufgabe ausgewählt werden.';

  @override
  String get chainsStrategyBalanced => 'Ausgewogen';

  @override
  String get chainsStrategyFastest => 'Am schnellsten';

  @override
  String get chainsStrategyCheapest => 'Am günstigsten';

  @override
  String get chainsStrategyHighestConfidence => 'Höchste Konfidenz';

  @override
  String get chainsStrategyPrivacyLocal => 'Datenschutz (lokal)';

  @override
  String get chainsStrategyDiverseModel => 'Modellvielfalt';

  @override
  String get chainsStartAvailLease => 'Lease bereit';

  @override
  String get chainsStartAvailLegacy => 'Legacy-Bereitschaft';

  @override
  String chainsStartReliabilityPct(int pct) {
    return 'Vertrauen $pct%';
  }

  @override
  String chainsStartReliabilitySparse(String level, int samples) {
    return '$level · $samples Stichproben';
  }

  @override
  String get chainsStartReliabilityFallbackExact => 'Verlauf dieses Workers';

  @override
  String get chainsStartReliabilityFallbackPeerRuntimeSkill =>
      'ähnliche Aufgaben auf diesem Worker';

  @override
  String get chainsStartReliabilityFallbackPeerRuntime =>
      'Laufzeit dieses Workers';

  @override
  String get chainsStartReliabilityFallbackRuntimeSkill =>
      'Worker mit dieser Fähigkeit';

  @override
  String get chainsStartReliabilityFallbackPrior =>
      'allgemeiner Prior (noch keine Historie)';

  @override
  String get chainsStartGoalLabel => 'Ziel';

  @override
  String get chainsStartGoalHint => 'Was soll das Team erreichen?';

  @override
  String chainsStartGoalTooShort(int min) {
    return 'Das Ziel muss mindestens $min Zeichen umfassen';
  }

  @override
  String get chainsStartAttachmentsLabel => 'Anhänge';

  @override
  String get chainsStartAttachmentsAdd => 'Dateien hinzufügen';

  @override
  String get chainsStartAttachmentsHint =>
      'Tipp: Kurzes Label pro Datei (z. B. brief), dann [brief] im Ziel nennen — so wissen Worker, welche Datei gemeint ist, auch bei langen oder unklaren Namen.';

  @override
  String chainsStartAttachmentsMax(int max) {
    return 'Sie können bis zu $max Dateien anhängen';
  }

  @override
  String chainsStartAttachmentTooLarge(String name, int maxMb) {
    return '$name ist zu groß (max. $maxMb MB)';
  }

  @override
  String get chainsStartAttachmentUploading => 'Wird hochgeladen…';

  @override
  String get chainsStartAttachmentFailed => 'Upload fehlgeschlagen';

  @override
  String get chainsStartAttachmentLabel => 'Label';

  @override
  String get chainsStartAttachmentLabelHint => 'z. B. brief, Verkaufsdaten';

  @override
  String get chainsStartAttachmentRemove => 'Anhang entfernen';

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
      'Keine erreichbaren Agent-Network-Worker. Bitte zuerst Kontakte mit Agenten auf dem Heimknoten verbinden.';

  @override
  String get chainsTestNetworkTitle => 'Agentennetz testen';

  @override
  String get chainsTestNetworkHint =>
      'Kurzer Labortest der Agentennetz-Pfade auf diesem Knoten.';

  @override
  String get chainsTestNetworkRun => 'Test starten';

  @override
  String get chainsTestNetworkRunning => 'Test läuft…';

  @override
  String get chainsTestNetworkFailed => 'Netzwerktest fehlgeschlagen.';

  @override
  String get chainsSpeculationReviewTitle => 'Ergebnisse stimmen nicht überein';

  @override
  String get chainsSpeculationReviewBody =>
      'Zwei Teammitglieder haben diesen Schritt mit unterschiedlichen Ergebnissen beendet. Wählen Sie unten ein Ergebnis, weisen Sie den Schritt neu zu oder fahren Sie automatisch fort.';

  @override
  String get chainsSpeculationReviewNonePass =>
      'Kein Ergebnis hat die Prüfung bestanden. Wählen Sie den besten Versuch, weisen Sie den Schritt neu zu oder fahren Sie automatisch fort.';

  @override
  String get chainsSpeculationReviewDisagree =>
      'Die beiden Ergebnisse passen nicht zusammen. Wählen Sie ein Ergebnis, weisen Sie den Schritt neu zu oder fahren Sie automatisch fort.';

  @override
  String get chainsSpeculationReviewPick => 'Dieses Ergebnis verwenden';

  @override
  String get chainsSpeculationReviewReassign => 'Schritt neu zuweisen';

  @override
  String get chainsSpeculationReviewAutoResolve => 'Automatisch fortfahren';

  @override
  String get chainsSpeculationReviewResolved =>
      'Auswahl gespeichert — die Aufgabe läuft weiter.';

  @override
  String get chainsSpeculationReviewFailed =>
      'Dieser Schritt konnte nicht gelöst werden';

  @override
  String get chainsSpeculationRolePrimary => 'Primär';

  @override
  String get chainsSpeculationRoleSpeculative => 'Ersatzlauf';

  @override
  String get chainsSpeculationRoleReplacement => 'Ersatz';

  @override
  String get chainsStepStatePending => 'Ausstehend';

  @override
  String get chainsStepStateOffered => 'Angeboten';

  @override
  String get chainsStepStateAwarded => 'Zugewiesen';

  @override
  String get chainsStepStateRunning => 'Läuft';

  @override
  String get chainsStepStateDone => 'Fertig';

  @override
  String get chainsStepStateFailed => 'Fehlgeschlagen';

  @override
  String get chainsStepStateCancelled => 'Abgebrochen';

  @override
  String get chainsWorkerEngineFailed =>
      'Die KI-Engine eines Workers konnte diesen Schritt nicht abschließen. Bitte später erneut versuchen.';

  @override
  String get chainsReassignUnavailable =>
      'Neu zuweisen ist auf diesem Heimknoten nicht verfügbar';

  @override
  String get chainsAssignerAutoLabel => 'Leistungsstärksten Assigner wählen';

  @override
  String get chainsAssignerAutoHint =>
      'Wenn aktiv, wählt der Heimknoten den stärksten verbundenen Partner zum Planen und Steuern dieser Aufgabe.';

  @override
  String get chainsSuggestedAssigner => 'Vorgeschlagener Assigner';

  @override
  String get chainsAssignerPeerLabel => 'Assigner';

  @override
  String get chainsAssignerPeerThisNode => 'Dieser Heimknoten (Standard)';

  @override
  String get chainsAssignerPeerHint =>
      'Optional — Assigner auf einem verbundenen Partner statt auf diesem Heimknoten ausführen.';

  @override
  String get chainsIterationPreviewOwner =>
      'Mehrere Runden — Sie prüfen jeden Entwurf vor der Veröffentlichung.';

  @override
  String get chainsIterationPreviewAuto =>
      'Mehrere Runden — der Assigner entscheidet, wann gestoppt wird.';

  @override
  String get chainsSpeculationDualWorkersLabel =>
      'Zwei Worker auf kritischen Schritten';

  @override
  String get chainsSpeculationDualWorkersHint =>
      'Bei unterschiedlichen Ergebnissen kann der Heimknoten automatisch wählen oder Sie zuerst fragen (siehe Heim-Standardeinstellungen).';

  @override
  String get chainsStartReadinessTitle => 'Worker bereitmachen';

  @override
  String get chainsStartReadinessJoinOff =>
      'Am Heimcomputer: Team-Aufgaben → Worker verwalten → Agentennetzwerk beitreten einschalten.';

  @override
  String get chainsStartReadinessBond =>
      'Kontakte unter Entdecken verbinden (Social oder dieses Telefon), dann bitten, dem Agentennetzwerk beizutreten.';

  @override
  String get chainsStartReadinessRefresh =>
      'In Social unter Team-Aufgaben „Worker verwalten“ öffnen, Karten aktualisieren, dann hier erneut vorschauen.';

  @override
  String get chainsStepsTitle => 'Aufgabenschritte';

  @override
  String get chainsStepsWaitingOn => 'Wartet auf:';

  @override
  String get chainsAttachmentHonesty =>
      'Angehängte Dateien liegen im Vault dieses Homes. Wird ein Worker zugewiesen, erhält er eine Kopie dieser Eingaben in seinem Team-Arbeitsbereich — kein dauerhaftes Spiegelbild deiner Bibliothek.';

  @override
  String get chainsDeliveryTitle => 'Eingabezustellung';

  @override
  String get chainsDeliveryRetry => 'Erneut versuchen';

  @override
  String get chainsDeliveryRetried => 'Eingabezustellung erneut versucht';

  @override
  String get chainsDeliveryRetryFailed =>
      'Eingabezustellung konnte nicht erneut versucht werden';

  @override
  String get chainsDeliveryPhasePending => 'Ausstehend';

  @override
  String get chainsDeliveryPhaseTransferring => 'Übertragung';

  @override
  String get chainsDeliveryPhaseVerified => 'Zugestellt';

  @override
  String get chainsDeliveryPhaseFailed => 'Fehlgeschlagen';

  @override
  String get chainsInputDeliveryScope => 'Eingabezustellung';

  @override
  String get chainsInputDeliveryScopeReferenced => 'Nur referenzierte';

  @override
  String get chainsInputDeliveryScopeAll => 'Alle Anhänge';

  @override
  String get chainsInputDeliveryScopeHint =>
      '„Nur referenzierte“ (Standard) sendet Dateien, die in einem Schritt als [label] genannt sind; ohne Treffer werden alle Anhänge gesendet. „Alle“ sendet jeden Anhang an jeden zugewiesenen Worker.';

  @override
  String get chainsIterationAskOwnerTitle =>
      'Entwurf vor Veröffentlichung prüfen';

  @override
  String get chainsIterationAskOwnerBody =>
      'Annehmen zum Veröffentlichen, oder weiter verfeinern.';

  @override
  String get chainsIterationAcceptDraft => 'Annehmen & veröffentlichen';

  @override
  String get chainsIterationContinue => 'Weiter verfeinern';

  @override
  String get chainsIterationAccepted =>
      'Entwurf angenommen — wird veröffentlicht';

  @override
  String get chainsIterationContinued => 'Weitere Verfeinerungsrunde startet';

  @override
  String get chainsIterationResolveFailed =>
      'Entscheidung konnte nicht angewendet werden';

  @override
  String get chainsObservedTitle => 'Aufgaben, an denen du beteiligt bist';

  @override
  String get chainsObservedHint =>
      'Nur Ansicht — nur der Auftraggeber kann diese Aufgaben verwalten.';

  @override
  String get chainsObservedReadOnly => 'Nur Ansicht';

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
  String get chainsCancelStep => 'Schritt abbrechen';

  @override
  String get chainsCancelStepTitle => 'Diesen Schritt abbrechen?';

  @override
  String get chainsCancelStepBody =>
      'Dieser Schritt und abhängige Schritte werden gestoppt. Bereits gesammelte Teilergebnisse bleiben erhalten.';

  @override
  String get chainsCancelStepFailed =>
      'Schritt konnte nicht abgebrochen werden';

  @override
  String get chainsReassignStep => 'Neu zuweisen';

  @override
  String get chainsStepCancelled => 'Schritt abgebrochen';

  @override
  String get chainsStepReassigned => 'Schritt neu zugewiesen';

  @override
  String get chainsReassignFailed =>
      'Schritt konnte nicht neu zugewiesen werden';

  @override
  String get chainsCancelStepReason => 'Schritt von EnvoyGo abgebrochen';

  @override
  String get chainsDetailCancelled => 'Dieser Job wurde abgebrochen.';

  @override
  String get chainsDetailPublished =>
      'Dieser Job ist abgeschlossen und hat einen Bericht veröffentlicht.';

  @override
  String get chainsDetailRecovering => 'Wiederherstellung';

  @override
  String chainsAttemptCount(int count) {
    return 'Versuche: $count';
  }

  @override
  String get chainsExecutionDetails => 'Ausführungsdetails';

  @override
  String chainsProvenanceSummaryLine(
    int attempts,
    String worker,
    String state,
  ) {
    return '$attempts Versuch(e) · $worker · $state';
  }

  @override
  String chainsLastReason(String reason) {
    return 'Letzter Grund: $reason';
  }

  @override
  String get chainsTechnicalDetails => 'Technische Details';

  @override
  String get chainsProvenanceEmpty => 'Keine Herkunftsdaten.';

  @override
  String get chainsProvenanceFailed => 'Herkunft konnte nicht geladen werden.';

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
  String get pairingInProgressTitle => 'Kopplung mit Heimknoten';

  @override
  String pairingInProgressSubtitle(String owner) {
    return 'Verbindung mit $owner wird aufgebaut';
  }

  @override
  String pairingElapsed(String time) {
    return 'Verstrichen: $time';
  }

  @override
  String pairingHomeNodeLabel(String peer) {
    return 'Heimknoten: $peer';
  }

  @override
  String get pairingStageInitial => 'Wird vorbereitet';

  @override
  String get pairingStageInitialHint =>
      'Sicherer Kanal zum Heimknoten wird aufgebaut.';

  @override
  String get pairingStageConnecting => 'Heimknoten wird erreicht';

  @override
  String get pairingStageConnectingHint =>
      'Heimknoten wird im lokalen Netzwerk und über das Relay gesucht.';

  @override
  String get pairingStageHandshaking => 'Handshake läuft';

  @override
  String get pairingStageHandshakingHint =>
      'Schlüssel werden ausgetauscht — bei der ersten Kopplung kann dies einen Moment dauern.';

  @override
  String get pairingStageVerifying => 'Wird überprüft';

  @override
  String get pairingStageSlowHint =>
      'Dauert länger als gewöhnlich. Stelle sicher, dass der Heimknoten im selben WLAN ist oder Internet hat.';

  @override
  String get pairingStageVerySlowHint =>
      'Kopplung dauert deutlich länger als erwartet. Prüfe, ob beide Geräte online sind, brich ab und versuche es erneut.';

  @override
  String get pairingCancel => 'Kopplung abbrechen';

  @override
  String get pairingCancelConfirmTitle => 'Kopplung abbrechen?';

  @override
  String get pairingCancelConfirmBody =>
      'Der Handshake wird gestoppt. Du kannst es mit dem QR-Code erneut versuchen.';

  @override
  String get commonKeepWaiting => 'Weiter warten';

  @override
  String get pairingDontCloseApp =>
      'App nicht schließen — die Kopplung läuft im Hintergrund.';

  @override
  String get pairingNowLan =>
      'Verbinde jetzt mit Ihrem Home-Node im lokalen Netzwerk…';

  @override
  String get pairingNowP2p =>
      'Stelle jetzt eine sichere Peer-to-Peer-Verbindung her…';

  @override
  String get pairingNowRelay => 'Verbinde jetzt über einen Relay-Server…';

  @override
  String get pairingStillWorking =>
      'Noch dabei — die erste Verbindung kann ein bis zwei Minuten dauern. Bitte halten Sie die App geöffnet.';

  @override
  String get pairingTroubleTitle => 'Immer noch Probleme?';

  @override
  String get pairingTroubleBody =>
      'Stellen Sie sicher, dass der Home-Node eingeschaltet und online ist und dass dieses Gerät Internetzugang hat. Wenn es weiterhin fehlschlägt, brechen Sie ab und versuchen Sie es erneut.';

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

  @override
  String get ehReviewTitle => 'Diesen Turn prüfen';

  @override
  String get ehReviewUnavailable =>
      'Für diesen älteren Turn ist keine gespeicherte Prüfung verfügbar.';

  @override
  String get ehReviewFile => 'Datei';

  @override
  String get ehReviewOpenFile => 'Datei öffnen';

  @override
  String get ehReviewDiffUnavailable =>
      'Für diese Datei ist kein textueller Diff verfügbar.';

  @override
  String get ehReviewOnly => 'Workspace erkannt · nur Prüfung';

  @override
  String get ehRevertTitle => 'Diesen Turn zurücksetzen?';

  @override
  String get ehRevertBody =>
      'Dateien werden auf den Stand vor dem Turn zurückgesetzt. Spätere Änderungen sind geschützt und stoppen den Revert.';

  @override
  String get ehRevertAction => 'Zurücksetzen';

  @override
  String get ehRevertComplete =>
      'Die Dateiänderungen dieses Turns wurden zurückgesetzt.';

  @override
  String get ehRevertUnavailable =>
      'Dieser Turn kann nicht mehr sicher zurückgesetzt werden.';

  @override
  String ehRevertConflict(String files) {
    return 'Revert gestoppt, weil diese Dateien danach geändert wurden: $files';
  }

  @override
  String get ehSearchTranscript => 'Transkript durchsuchen';

  @override
  String get ehSearchClose => 'Suche schließen';

  @override
  String get ehNoMatches => 'Keine passenden Turns';

  @override
  String get ehCopyTurn => 'Turn kopieren';

  @override
  String get ehShareTurn => 'Turn teilen';

  @override
  String get ehReviewDiff => 'Diff prüfen';

  @override
  String get ehRevertThisTurn => 'Diesen Turn zurücksetzen';

  @override
  String get ehReviewChanges => 'Änderungen prüfen';

  @override
  String get ehRevertAll => 'Alles zurücksetzen';

  @override
  String ehChangesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Dateien in diesem Turn geändert',
      one: '1 Datei in diesem Turn geändert',
    );
    return '$_temp0';
  }

  @override
  String get ehChangesKeepAll => 'Alles behalten';

  @override
  String get ehChangesRevert => 'Alles zurücksetzen';

  @override
  String get ehChangesHideList => 'Liste ausblenden';

  @override
  String get ehChangesShowList => 'Liste anzeigen';

  @override
  String get ehReviewKeepFile => 'Behalten';

  @override
  String get ehReviewRevertFile => 'Zurücksetzen';

  @override
  String get ehReviewKeptAll => 'Änderungen behalten.';

  @override
  String ehReviewRevertedFile(String path) {
    return '$path zurückgesetzt';
  }

  @override
  String get ehReviewAutoLabel => 'Auto-Prüfung ab ≥';

  @override
  String get ehReviewAutoAlways => 'Immer';

  @override
  String ehQueueTitle(int count) {
    return 'Warteschlange ($count)';
  }

  @override
  String get ehQueueClear => 'Leeren';

  @override
  String get ehQueueBusyHint => 'Senden reiht als Nächstes ein';

  @override
  String get ehQueueFollowUpHint => 'Follow-up einreihen…';

  @override
  String get ehInjectTooltip => 'Einschieben (abbrechen + senden)';

  @override
  String ehFilesChangedCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Dateien geändert',
      one: '1 Datei geändert',
    );
    return '$_temp0';
  }

  @override
  String get ehEmptyReply =>
      'envoy-harness hat keine sichtbare Antwort geliefert. Deine Nachricht ist noch da — erneut versuchen oder umformulieren.';

  @override
  String get ehConfigureModelHint =>
      'Modell unter Einstellungen → KI konfigurieren.';

  @override
  String get ehReviewKeepFailed => 'Änderungen konnten nicht behalten werden.';

  @override
  String get ehReviewOpenGitDiff => 'Git-Diff öffnen';

  @override
  String get ehDiffBefore => 'Vorher';

  @override
  String get ehDiffAfter => 'Nachher';

  @override
  String get ehPermsTooltip => 'Berechtigungsrichtlinie';

  @override
  String get ehPermsSafe => 'Standard (sichere Auto-Ausführung)';

  @override
  String get ehPermsAsk => 'Immer fragen';

  @override
  String get ehPermsApprove => 'Immer genehmigen';

  @override
  String ehPermsSet(String mode) {
    return 'Berechtigungsrichtlinie → $mode.';
  }

  @override
  String get ehPermsNextTurn => ' Gilt ab dem nächsten Turn.';

  @override
  String ehPermsFailed(String error) {
    return 'Berechtigungsrichtlinie konnte nicht gesetzt werden: $error';
  }

  @override
  String get chainsStatusCancelled => 'Abgebrochen';

  @override
  String get chainsStatusPublished => 'Veröffentlicht';

  @override
  String get chainsStatusRecovering => 'Wiederherstellung…';

  @override
  String get chainsStatusSynthesizing => 'Synthese';

  @override
  String get chainsStatusRunning => 'Läuft';

  @override
  String get chainsStatusWaitingWorkers => 'Warte auf Worker';

  @override
  String get chainsStatusBidding => 'Gebote';

  @override
  String get chainsStatusAssigning => 'Zuweisen';

  @override
  String get chainsStatusPlanning => 'Planung';

  @override
  String get ehWorking => 'Arbeitet';

  @override
  String get ehCompleted => 'Abgeschlossen';

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
      other: '$count Treffer',
      one: '1 Treffer',
    );
    return '$_temp0';
  }

  @override
  String get termMore => 'Mehr…';

  @override
  String get termCompactContext => 'Kontext kompaktieren';

  @override
  String get termUpdatePlan => 'Plan anzeigen oder aktualisieren';

  @override
  String get termHarnessStatus => 'Harness-Status';

  @override
  String get termPiActions => 'Pi-Aktionen';

  @override
  String get termHarnessActions => 'envoy-harness-Aktionen';

  @override
  String get termPreviousCommand => 'Vorheriger Befehl';

  @override
  String get termNextCommand => 'Nächster Befehl';

  @override
  String get termCursorLeft => 'Cursor nach links';

  @override
  String get termCursorRight => 'Cursor nach rechts';

  @override
  String get termEnterKey => 'Eingabetaste';

  @override
  String get chainsCancelFailed => 'Team-Job konnte nicht abgebrochen werden.';

  @override
  String get settingsUseForCodingChat => 'Für Coding-Chat verwenden';

  @override
  String get settingsUseForCodingChatHint =>
      'Veraltet — Coding-Chat nutzt immer Envoy Harness.';
}
