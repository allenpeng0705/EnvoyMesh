// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Italian (`it`).
class AppLocalizationsIt extends AppLocalizations {
  AppLocalizationsIt([String locale = 'it']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get navChats => 'Chat';

  @override
  String get navInbox => 'Posta in arrivo';

  @override
  String get navContent => 'Contenuti';

  @override
  String get navSocial => 'Social';

  @override
  String get navTerminal => 'Terminale';

  @override
  String get navKnowledge => 'Conoscenza';

  @override
  String get navMe => 'Io';

  @override
  String get contentExplore => 'Esplora';

  @override
  String get termEmptyHint =>
      'Avvia una sessione Pi o un terminale shell sul nodo di casa.';

  @override
  String get commonCancel => 'Annulla';

  @override
  String get commonConfirm => 'Conferma';

  @override
  String get homeFolderDrives => 'Unità';

  @override
  String get homeFolderComputer => 'Computer';

  @override
  String get homeFolderHome => 'Home';

  @override
  String get homeFolderParent => '↑ Cartella superiore';

  @override
  String get homeFolderNoSubfolders => 'Nessuna sottocartella';

  @override
  String get commonSave => 'Salva';

  @override
  String get commonDelete => 'Elimina';

  @override
  String get commonRetry => 'Riprova';

  @override
  String get commonClose => 'Chiudi';

  @override
  String get commonLoading => 'Caricamento…';

  @override
  String get commonError => 'Qualcosa è andato storto';

  @override
  String get commonReconnect => 'Riconnetti';

  @override
  String get commonSwitch => 'Cambia';

  @override
  String get commonPair => 'Associa';

  @override
  String get commonUnpair => 'Dissocia';

  @override
  String get commonCreate => 'Crea';

  @override
  String get commonRename => 'Rinomina';

  @override
  String get languageTitle => 'Lingua';

  @override
  String get languageSubtitle => 'Lingua di menu ed etichette';

  @override
  String get languageSystem => 'Predefinita di sistema';

  @override
  String get languageSystemDesc => 'Segui la lingua del dispositivo';

  @override
  String get meConnectedNode => 'Nodo connesso';

  @override
  String get meNotConnected => 'Non connesso';

  @override
  String get meNotConnectedHint => 'Associa un nodo di casa per iniziare';

  @override
  String get meReconnect => 'Riconnetti';

  @override
  String get meSwitch => 'Cambia';

  @override
  String get meRepair => 'Riassocia';

  @override
  String get meReconnectNow => 'Riconnetti ora';

  @override
  String get meUnpair => 'Dissocia';

  @override
  String get meBrowser => 'Browser';

  @override
  String get meBrowserHint =>
      'Apri pagine envoy:// — o Contenuti per Il mio sito';

  @override
  String get meAiEngine => 'Motore IA';

  @override
  String get meAiEngineHint => 'Bridge + OpenClaw. Tocca per configurare.';

  @override
  String get meRecentTeamJobs => 'Job di team recenti';

  @override
  String get meRecentTeamJobsHint => 'Sfoglia i job multi-agente completati';

  @override
  String get meActiveTeamJobs => 'Job di team attivi';

  @override
  String get meActiveTeamJobsHint => 'Guarda i job in esecuzione';

  @override
  String get mePairNewNode => 'Associa nuovo nodo';

  @override
  String get mePairNewNodeHint => 'Aggiungi un altro nodo di casa';

  @override
  String get meSettings => 'Impostazioni';

  @override
  String get meAiModel => 'Modello IA';

  @override
  String get meEnvoyLocal => 'Envoy Local';

  @override
  String get meEnvoyLocalHint =>
      'Modello locale sul nodo di casa (scarica e avvia sul computer)';

  @override
  String get mePiAgent => 'Agente Pi';

  @override
  String get mePiAgentHint => 'Impostazioni agente di coding locale';

  @override
  String get meDarkMode => 'Modalità scura';

  @override
  String get meDarkModeHint => 'Segui l\'impostazione di sistema';

  @override
  String get mePushNotifications => 'Notifiche push';

  @override
  String get mePushNotificationsHint => 'Avvisi quando l\'app è in background';

  @override
  String get meUnpairDevice => 'Dissocia questo dispositivo';

  @override
  String get meUnpairDeviceHint => 'Disconnetti e rimuovi tutti i dati locali';

  @override
  String get meUnpairConfirmTitle => 'Dissociare?';

  @override
  String get meUnpairConfirmBody =>
      'Rimuove l\'associazione e le chat locali di questo nodo su questo dispositivo.';

  @override
  String get meUnpairedSnack => 'Dissociato. Chat e dati locali rimossi.';

  @override
  String meUnpairFailed(String error) {
    return 'Dissociazione non riuscita: $error';
  }

  @override
  String get meEditProfile => 'Modifica profilo';

  @override
  String meProfileUpdateFailed(String error) {
    return 'Impossibile aggiornare il profilo: $error';
  }

  @override
  String get mePublicAccess => 'Accesso pubblico';

  @override
  String get mePort => 'Porta';

  @override
  String get mePublicAccessSaved => 'Accesso pubblico salvato';

  @override
  String get meFamilyProfile => 'Profilo famiglia';

  @override
  String get meFamilyProfileHint =>
      'Sei connesso a questa casa come membro della famiglia';

  @override
  String get mePreferences => 'Preferenze';

  @override
  String get meViewEditProfile => 'Visualizza e modifica profilo';

  @override
  String get meEditNameAvatar => 'Modifica nome e avatar';

  @override
  String get meDisplayName => 'Nome visualizzato';

  @override
  String get meAvatarColor => 'Colore avatar (hex)';

  @override
  String meMorePaired(int count) {
    return '+$count altri associati';
  }

  @override
  String meSessionExpired(String name) {
    return 'Sessione scaduta per $name';
  }

  @override
  String meDisconnectedFrom(String name) {
    return 'Disconnesso da $name';
  }

  @override
  String meUnpairConfirmBodyNamed(String name) {
    return 'Disconnette e rimuove tutte le chat e i dati locali per $name.';
  }

  @override
  String get meTeamJobs => 'Job di team';

  @override
  String get meStartTeamJobHint =>
      'Anteprima di un piano e avvio sul nodo di casa';

  @override
  String get meAiModelHint =>
      'Provider usato per l\'assistente su questo nodo di casa';

  @override
  String get mePiAgentHintLong =>
      'Agente di coding locale integrato sul nodo di casa';

  @override
  String get mePushNotificationsHintLong =>
      'Ricevi avvisi su nuovi messaggi, richieste di contatto e approvazioni quando l\'app è in background.';

  @override
  String get meRecentTeamJobsHintLong =>
      'Visualizza i report dei job pubblicati sul nodo di casa';

  @override
  String get meActiveTeamJobsHintLong =>
      'Monitora i job di team in corso sul nodo di casa';

  @override
  String get inboxTitle => 'Posta in arrivo';

  @override
  String get inboxEmpty => 'Nessuna notifica';

  @override
  String get inboxEmptyHint =>
      'Richieste di bond e aggiornamenti feed compariranno qui';

  @override
  String get contentFeed => 'Bacheca';

  @override
  String get contentBlog => 'Blog';

  @override
  String get contentPeople => 'Persone';

  @override
  String get contentMyFiles => 'I miei file';

  @override
  String get contentKnowledge => 'Conoscenza';

  @override
  String get knowledgeTitle => 'Conoscenza';

  @override
  String get knowledgeLede =>
      'La tua base di conoscenza del vault — le note in notes/ alimentano EnvoyAI. I documenti restano in originale.';

  @override
  String get knowledgePanelBrowse => 'Esplora';

  @override
  String get knowledgePanelAsk => 'Chiedi';

  @override
  String get knowledgePanelPlugins => 'Plugin';

  @override
  String get knowledgePanelSetup => 'Impostazioni';

  @override
  String get knowledgeAskHint =>
      'Le risposte usano note e documenti su questo nodo. I contatti vedono solo ciò che pubblichi.';

  @override
  String get knowledgeAskHeading => 'Interroga il vault';

  @override
  String get knowledgeAskLabel => 'Domanda';

  @override
  String get knowledgeAskPlaceholder => 'Cosa ho scritto sull\'onboarding?';

  @override
  String get knowledgeAskSubmit => 'Chiedi';

  @override
  String get knowledgeAskBusy => 'Ricerca…';

  @override
  String get knowledgeAskAnswerHeading => 'Risposta';

  @override
  String get knowledgeAskEmptyAnswer =>
      'Nessuna risposta. Controlla Impostazioni — attiva la conoscenza del vault e ricostruisci l\'indice.';

  @override
  String get knowledgeAskContinueEnvoyAi => 'Apri in EnvoyAI';

  @override
  String get knowledgeAskEnvoyAiHint =>
      'Per conversazioni multi-turno con strumenti, continua in EnvoyAI.';

  @override
  String get knowledgeLibraryHeading => 'I tuoi file';

  @override
  String get knowledgeLibraryCaption =>
      'Note, documenti e ciò che hai pubblicato.';

  @override
  String get knowledgeEmbedGateTitleNeeded => 'Modello di embedding richiesto';

  @override
  String get knowledgeEmbedGateTitleDownloading =>
      'Download del modello di embedding…';

  @override
  String get knowledgeEmbedGateTitleError =>
      'Configurazione embedding non riuscita';

  @override
  String get knowledgeEmbedGateBodyNeeded =>
      'La ricerca conoscenza richiede un modello di embedding locale sul nodo di casa. Il download si avvia automaticamente all\'apertura dell\'app — Esplora resta indisponibile fino al termine. Puoi anche avviare o riprovare da qui.';

  @override
  String get knowledgeEmbedGateBodyDownloading =>
      'Download in corso sul nodo di casa (avviato con l\'app). Puoi uscire da questa schermata; la conoscenza si sblocca quando l\'embedder è pronto.';

  @override
  String get knowledgeEmbedGateBodyError =>
      'Runtime o modello di embedding non installabile sul nodo di casa. Riprova il download, o correggi la configurazione nell\'app desktop.';

  @override
  String get knowledgeEmbedGateDownload => 'Scarica sul nodo di casa';

  @override
  String get knowledgeEmbedGateDownloading => 'Download in corso…';

  @override
  String get knowledgeEmbedGateRetry => 'Riprova download';

  @override
  String get knowledgeEmbedGateOpenSetup => 'Apri Impostazioni';

  @override
  String get knowledgeEmbedGateBackgroundHint =>
      'Puoi continuare a usare le altre parti dell\'app mentre l\'operazione si completa.';

  @override
  String get knowledgeEmbedGateStripNeeded =>
      'Conoscenza non disponibile — modello di embedding non installato sul nodo di casa';

  @override
  String get knowledgeEmbedGateStripDownloading =>
      'Conoscenza non disponibile — download del modello di embedding sul nodo di casa';

  @override
  String get knowledgeEmbedGateStripError =>
      'Conoscenza non disponibile — configurazione embedding fallita sul nodo di casa';

  @override
  String get knowledgeEmbedGateDownloadStarted =>
      'Download embedding avviato sul nodo di casa';

  @override
  String get knowledgePluginsLede =>
      'Connettori opzionali. Notion richiede un URL MCP — non l\'app Notion.';

  @override
  String get knowledgePluginsObsidianTitle => 'Obsidian';

  @override
  String get knowledgePluginsObsidianDesc =>
      'Arricchisci le note del vault. App desktop opzionale.';

  @override
  String get knowledgePluginsNotionTitle => 'Notion (via MCP)';

  @override
  String get knowledgePluginsNotionDesc =>
      'Cerca e sfoglia via MCP. Errore soft senza URL.';

  @override
  String get knowledgePluginsMcpUrl => 'URL server MCP';

  @override
  String get knowledgePluginsMcpTool => 'Nome dello strumento di ricerca';

  @override
  String get knowledgePluginsSyncNow => 'Sincronizza ora';

  @override
  String get knowledgePluginsLinkedVaultLabel =>
      'Percorsi del vault Obsidian collegato';

  @override
  String get knowledgePluginsLinkedVaultHint => '/percorso/di/ObsidianVault';

  @override
  String get knowledgePluginsLinkedVaultEmpty =>
      'Nessun vault collegato per ora.';

  @override
  String get knowledgePluginsLinkedVaultRemove => 'Rimuovi';

  @override
  String get knowledgePluginsLinkedVaultAdd => 'Aggiungi cartella vault…';

  @override
  String get knowledgePluginsLinkedVaultPickTitle =>
      'Scegli cartella del vault Obsidian';

  @override
  String get knowledgePluginsLinkedVaultHelper =>
      'I vault di Obsidian su questo computer di casa vengono collegati automaticamente. Rimuovi una riga per scollegare (non si ricollegherà automaticamente). Aggiungi cartella vault… per altri.';

  @override
  String get knowledgePluginsOpenObsidian => 'Apri Obsidian';

  @override
  String get knowledgePluginsOpenNotion => 'Apri Notion';

  @override
  String get knowledgePluginsOpeningApp => 'Apertura…';

  @override
  String get knowledgePluginsOpenAppFailed =>
      'Impossibile aprire l\'app su questo computer.';

  @override
  String get knowledgePluginsOpenedWebsite =>
      'App non installata in locale — aperto il sito ufficiale sul nodo di casa.';

  @override
  String get knowledgePluginsDownloadObsidian => 'Scarica Obsidian';

  @override
  String get knowledgePluginsDownloadNotion => 'Scarica Notion';

  @override
  String get knowledgePluginsLinkedVaultAutoOne =>
      'Vault Obsidian collegato trovato su questo computer.';

  @override
  String knowledgePluginsLinkedVaultAutoMany(int count) {
    return '$count vault Obsidian collegati trovati su questo computer.';
  }

  @override
  String get knowledgeHubImportObsidianAll => 'Importa tutti i collegati';

  @override
  String get knowledgeHubImportNotionVisible => 'Importa le carte visibili';

  @override
  String get knowledgeHubExportToObsidian => 'Esporta in Obsidian';

  @override
  String get knowledgeHubExportToNotion => 'Esporta in Notion/MCP';

  @override
  String knowledgeHubImportObsidianOk(int count) {
    return '$count nota/e Obsidian importata/e';
  }

  @override
  String knowledgeHubImportNotionOk(int count) {
    return '$count nota/e Notion/MCP importata/e';
  }

  @override
  String knowledgeHubExportObsidianOk(int count) {
    return '$count nota/e esportata/e in Obsidian';
  }

  @override
  String knowledgeHubExportNotionOk(int count) {
    return '$count nota/e esportata/e via MCP';
  }

  @override
  String get knowledgeHubImportFailed => 'Importazione non riuscita';

  @override
  String get knowledgeHubExportFailed => 'Esportazione non riuscita';

  @override
  String get knowledgeHubImportMcpEmpty =>
      'Nessuna carta MCP attiva da importare — aggiorna prima Esplora';

  @override
  String get knowledgeHubExportEmpty =>
      'Nessuna nota Markdown del vault da esportare';

  @override
  String get knowledgeHubShareVaultOnly =>
      'La condivisione funziona solo per i file del vault — importa prima';

  @override
  String knowledgeHubMcpListError(String error) {
    return 'Elenco MCP: $error';
  }

  @override
  String get knowledgeSetupHint =>
      'Stato indice e recupero. I modelli di chat restano in Io → Modello IA.';

  @override
  String get knowledgeSetupEnabled => 'Attiva conoscenza del vault';

  @override
  String get knowledgeSetupStatusHint =>
      'Tocca Ricostruisci per aggiornare l\'indice vettoriale.';

  @override
  String get knowledgeSetupReindex => 'Ricostruisci indice';

  @override
  String get knowledgeSetupReindexDone => 'Reindicizzazione avviata';

  @override
  String get knowledgeSetupReindexConfirm =>
      'Ricostruire l\'indice vettoriale del vault sul nodo di casa?';

  @override
  String get knowledgeSetupTestEmbedding => 'Testa embedding';

  @override
  String get knowledgeSetupTestEmbeddingBusy => 'Test…';

  @override
  String knowledgeSetupTestEmbeddingOk(int dimensions, int latencyMs) {
    return 'Embedding OK — $dimensions dims in $latencyMs ms';
  }

  @override
  String knowledgeSetupTestEmbeddingFail(String error) {
    return 'Embedding non riuscito: $error';
  }

  @override
  String get knowledgeSetupRagMode => 'Modalità di recupero';

  @override
  String get knowledgeSetupRagHybrid => 'Ibrido';

  @override
  String get knowledgeSetupRagVector => 'Vettoriale';

  @override
  String get knowledgeSetupRagLexical => 'Lessicale';

  @override
  String get knowledgeSetupSnippetLimit => 'Estratti del vault per risposta';

  @override
  String knowledgeBrowseIndexIndexingProgress(int processed, int total) {
    return 'Indicizzazione $processed/$total…';
  }

  @override
  String get knowledgeHubOpenPlugins => 'Apri Plugin';

  @override
  String get knowledgeNoteNewTitle => 'Nuova nota';

  @override
  String get knowledgeNoteEditTitle => 'Modifica nota';

  @override
  String get knowledgeNoteFilename => 'Nome file';

  @override
  String get knowledgeNoteFilenameRequired =>
      'Inserisci un nome file per la nota';

  @override
  String get knowledgeNoteContent => 'Markdown';

  @override
  String get knowledgeNoteSensitivity => 'Visibilità';

  @override
  String get knowledgeNotePrivate => 'Privato';

  @override
  String get knowledgeNoteFriends => 'Amici';

  @override
  String get knowledgeNotePublished => 'Pubblicato';

  @override
  String get knowledgeNoteAlsoBlog => 'Pubblica anche come blog';

  @override
  String get knowledgeFilePreview => 'Anteprima';

  @override
  String get knowledgeFileOpenOnHome => 'Apri sul computer di casa';

  @override
  String get knowledgeFileOpenedOnHome => 'Aperto sul computer di casa';

  @override
  String get knowledgeFilePublish => 'Pubblica';

  @override
  String get knowledgeFileMakePrivate => 'Rendi privato';

  @override
  String get knowledgeFileMore => 'Altre azioni';

  @override
  String get knowledgeFileConvert => 'Converti in nota Markdown';

  @override
  String knowledgeFileConvertOk(String path) {
    return 'Nota Markdown salvata: $path';
  }

  @override
  String get knowledgeFileConvertFailed =>
      'Conversione in Markdown non riuscita';

  @override
  String get knowledgeFileDeleteTitle => 'Eliminare il file?';

  @override
  String knowledgeFileDeleteBody(String title) {
    return 'Eliminare «$title» dal vault di casa?';
  }

  @override
  String get knowledgeFileDeleteConfirm => 'Elimina';

  @override
  String get meKnowledge => 'Impostazioni conoscenza';

  @override
  String get meKnowledgeHint => 'Indice e recupero per le domande al vault';

  @override
  String get meKnowledgePlugins => 'Plugin conoscenza';

  @override
  String get meKnowledgePluginsHint => 'Collegamento Obsidian e Notion/MCP';

  @override
  String get knowledgeBrowseFilterAll => 'Tutto';

  @override
  String get knowledgeBrowseFiltersLabel => 'MOSTRA';

  @override
  String get knowledgeBrowseFilterNotes => 'Note';

  @override
  String get knowledgeBrowseFilterObsidian => 'Obsidian';

  @override
  String get knowledgeBrowseFilterNotion => 'Notion';

  @override
  String get knowledgeBrowseFilterBlog => 'Blog';

  @override
  String get knowledgeBrowseFilterDocuments => 'Documenti';

  @override
  String get knowledgeBrowseFilterPublished => 'Pubblicato';

  @override
  String knowledgeBrowseIndexReady(int count) {
    return '$count indicizzato/i';
  }

  @override
  String knowledgeBrowseIndexReadyLinked(int count, int linked) {
    return '$count indicizzato/i · $linked Obsidian collegato/i';
  }

  @override
  String get knowledgeBrowseIndexIndexing => 'Indicizzazione…';

  @override
  String get knowledgeBrowseIndexEmpty => 'Indice vuoto';

  @override
  String get knowledgeBrowseIndexChipHint =>
      'Apri Conoscenza → Impostazioni per gestire l\'indice.';

  @override
  String get contentNewPost => 'Nuovo post';

  @override
  String get chatsTitle => 'Chat';

  @override
  String get chatsEmpty => 'Nessuna conversazione';

  @override
  String get chatsEmptyHint => 'Associa il nodo di casa per iniziare.';

  @override
  String get chatsSearchHint => 'Cerca chat…';

  @override
  String get pairingScanTitle => 'Scansiona QR';

  @override
  String get pairingConfirmTitle => 'Conferma associazione';

  @override
  String get pairingFamilyInvite => 'Invito famiglia';

  @override
  String get pairingOwnerPair => 'Associazione proprietario';

  @override
  String get engagementLike => 'Mi piace';

  @override
  String get engagementUnlike => 'Non mi piace più';

  @override
  String get engagementComment => 'Commenta';

  @override
  String get engagementRemoveComment => 'Rimuovere il commento?';

  @override
  String get engagementRemove => 'Rimuovi';

  @override
  String get feedDelete => 'Elimina';

  @override
  String get blogDelete => 'Elimina';

  @override
  String get blogTitle => 'Blog';

  @override
  String get blogEmpty => 'Nessun post. Scrivi il tuo primo articolo.';

  @override
  String get blogHint => 'Post più lunghi pubblicati sulla mesh.';

  @override
  String get feedTitle => 'Bacheca';

  @override
  String get feedComposeTitle => 'Nuovo post feed';

  @override
  String get commonBack => 'Indietro';

  @override
  String get commonAccept => 'Accetta';

  @override
  String get commonDecline => 'Rifiuta';

  @override
  String get commonDismiss => 'Ignora';

  @override
  String get commonOpen => 'Apri';

  @override
  String get commonRefresh => 'Aggiorna';

  @override
  String get commonEdit => 'Modifica';

  @override
  String get commonPost => 'Pubblica';

  @override
  String get commonPosting => 'Pubblicazione…';

  @override
  String get commonPublish => 'Pubblica';

  @override
  String get commonShare => 'Condividi';

  @override
  String get commonSend => 'Invia';

  @override
  String get commonClear => 'Cancella';

  @override
  String get commonInvite => 'Invita';

  @override
  String get commonJoin => 'Unisciti';

  @override
  String get commonYou => 'Tu';

  @override
  String get commonUnknown => 'Sconosciuto';

  @override
  String get commonCopied => 'Copiato negli appunti';

  @override
  String get commonNotConnectedHome => 'Non connesso al nodo di casa';

  @override
  String get commonSaving => 'Salvataggio…';

  @override
  String get commonGenerating => 'Generazione…';

  @override
  String get commonHide => 'Nascondi';

  @override
  String get commonAdd => 'Aggiungi';

  @override
  String get commonRemove => 'Rimuovi';

  @override
  String get commonSearch => 'Cerca';

  @override
  String get connOffline => 'Offline';

  @override
  String get connDirect => 'Diretto';

  @override
  String get connP2p => 'P2P';

  @override
  String get connRelay => 'Relay';

  @override
  String get connLanDirect => 'LAN (diretto)';

  @override
  String get connPublicDirect => 'IP pubblico (diretto)';

  @override
  String get connRelayWs => 'WebSocket relay';

  @override
  String get connTooltipDirect => 'Connessione diretta';

  @override
  String get connTooltipConnecting => 'Connessione…';

  @override
  String get connTooltipOffline => 'Non connesso';

  @override
  String get connTooltipError => 'Errore di connessione';

  @override
  String get chatsSectionAi => 'IA';

  @override
  String get chatsSectionFamily => 'Famiglia';

  @override
  String get chatsSectionContacts => 'Contatti';

  @override
  String get chatsSectionGroups => 'Gruppi';

  @override
  String get chatsSectionTerminals => 'Terminali';

  @override
  String get chatsFabNew => 'Nuovo';

  @override
  String get chatsCreateBot => 'Crea Bot';

  @override
  String get chatsCreateBotHint => 'Personaggio IA sul nodo di casa';

  @override
  String get chatsNewPi => 'Nuovo Pi';

  @override
  String get chatsNewPiHint => 'Avvia terminale Pi';

  @override
  String get chatsNewTerminal => 'Nuovo terminale';

  @override
  String get chatsNewTerminalHint => 'Apri una shell sul nodo di casa';

  @override
  String get chatsNewGroup => 'Nuova chat di gruppo';

  @override
  String get chatsNewGroupHint => 'Gruppo mesh con contatti collegati';

  @override
  String get chatsNewFamilyGroup => 'Nuovo gruppo famiglia';

  @override
  String get chatsNewFamilyGroupHint =>
      'Gruppo locale con membri della famiglia';

  @override
  String get chatsDeleteBotTitle => 'Eliminare il Bot?';

  @override
  String chatsDeleteBotBody(String name) {
    return 'Rimuovere \"$name\" dal nodo di casa? Non è reversibile.';
  }

  @override
  String get chatsBotOptions => 'Opzioni Bot';

  @override
  String get chatsEditBot => 'Modifica Bot';

  @override
  String get chatsBotNameRequired => 'Il nome del Bot è obbligatorio';

  @override
  String get chatsBotPromptRequired =>
      'Personalità / prompt di sistema obbligatorio';

  @override
  String get chatsBotName => 'Nome Bot';

  @override
  String get chatsBotNameHint => 'es. Luna la bibliotecaria';

  @override
  String get chatsBotPrompt => 'Personalità / prompt di sistema';

  @override
  String get chatsBotPromptHint =>
      'Scrivi come il personaggio («Sei…»). Evita «Luna è…» o «Sono un\'IA…». Riformulato al salvataggio.';

  @override
  String get chatsBotDesc => 'Breve descrizione (facoltativo)';

  @override
  String get chatsBotDescHint =>
      'Una riga per l\'elenco chat. Lascia vuoto per auto-compilare dalla personalità.';

  @override
  String get chatsAvatarColor => 'Colore avatar';

  @override
  String get chatsShellHint => 'Shell (es. zsh, bash)';

  @override
  String get chatsCwdHint => 'Directory di lavoro (facoltativo)';

  @override
  String get chatsPiTitle => 'Avvia Pi';

  @override
  String get chatsPiBody =>
      'Scegli una cartella progetto sul computer di casa per aprire il terminale Pi.';

  @override
  String get chatsPiFolder => 'Cartella progetto';

  @override
  String get chatsPiFolderHint => '/Users/tu/progetto';

  @override
  String get chatsPiFolderRequired =>
      'Inserisci il percorso della cartella progetto.';

  @override
  String get chatsGroupName => 'Nome gruppo';

  @override
  String get chatsNoFamilyMembers => 'Nessun altro membro della famiglia.';

  @override
  String get chatVoiceCall => 'Chiamata vocale';

  @override
  String get chatVideoCall => 'Videochiamata';

  @override
  String get chatPublishedContent => 'Contenuti pubblicati';

  @override
  String get chatClearThread => 'Cancella thread';

  @override
  String get chatClearThreadTitle => 'Cancellare il thread?';

  @override
  String get chatClearThreadBody =>
      'Tutti i messaggi in questo thread verranno eliminati.';

  @override
  String get chatAiManual => 'Manuale';

  @override
  String get chatAiAssistant => 'Assistente';

  @override
  String get chatAiAuto => 'Auto';

  @override
  String get chatAiManualTooltip => 'Manuale: scrivi tu stesso';

  @override
  String get chatAiAssistantTooltip => 'Assistente: l\'IA suggerisce bozze';

  @override
  String get chatAiAutoTooltip =>
      'Risposta automatica: l\'IA risponde automaticamente';

  @override
  String get chatAgentMode => 'Agente';

  @override
  String get chatAgentModeOffTooltip =>
      'Modalità Agente disattivata — l\'assistente usa solo conoscenza pubblica';

  @override
  String get chatAgentModeOnTooltip =>
      'Modalità Agente attiva — OpenClaw può usare file locali, conoscenza privata e strumenti';

  @override
  String get chatAgentModeConfirmTitle =>
      'Attivare la modalità Agente per questa chat?';

  @override
  String get chatAgentModeConfirmBody =>
      'La modalità Agente usa EnvoyAI/OpenClaw e può leggere file locali, conoscenza privata ed eseguire strumenti sul nodo di casa. Attivala solo per contatti di cui ti fidi completamente.';

  @override
  String get chatAgentModeConfirmEnable => 'Attiva modalità Agente';

  @override
  String get chatSuggestedReply => 'Risposta suggerita';

  @override
  String get chatSuggestedReplyUse => 'Usa';

  @override
  String get chatSuggestedReplyDismiss => 'Ignora';

  @override
  String get chatDeleteMessageTitle => 'Eliminare il messaggio?';

  @override
  String get chatNoMessages => 'Nessun messaggio';

  @override
  String get chatTypeMessage => 'Scrivi un messaggio…';

  @override
  String get chatRecordVoice => 'Registra nota vocale';

  @override
  String get chatStopRecording => 'Interrompi registrazione';

  @override
  String get chatInviteToGroup => 'Invita al gruppo';

  @override
  String get chatNoContactsInvite => 'Nessun contatto da invitare.';

  @override
  String chatInvitedSnack(String name) {
    return '$name invitato';
  }

  @override
  String get chatVoiceSending => 'Invio nota vocale…';

  @override
  String get chatVoiceSent => 'Nota vocale inviata';

  @override
  String get chatVoiceRecording => 'Registrazione';

  @override
  String get chatVoiceReady => 'Pronta per l\'invio';

  @override
  String get chatVoiceCancel => 'Annulla';

  @override
  String get chatVoiceSend => 'Invia';

  @override
  String get chatVoiceSendHint => 'Invia per completare · Annulla per scartare';

  @override
  String get chatVoiceReadyHint =>
      'Invio non riuscito · Tocca Invia per riprovare · Annulla per scartare';

  @override
  String get chatVoiceSendFailed => 'Invio nota vocale non riuscito';

  @override
  String get chatMicDenied => 'Permesso microfono negato';

  @override
  String get chatRecordFailed => 'Avvio registrazione non riuscito';

  @override
  String get chatCallFailed => 'Avvio chiamata non riuscito';

  @override
  String get chatAiDisabled =>
      'Modello IA disabilitato. Abilita un provider in Impostazioni → IA.';

  @override
  String get chatAiDisabledFamily =>
      'IA non disponibile per questo profilo famiglia.';

  @override
  String get inboxPublishedUpdates => 'Aggiornamenti pubblicati';

  @override
  String get inboxPublishedEmpty =>
      'Nessuna notifica di pubblicazione. Quando un contatto collegato pubblica contenuti web, compariranno qui.';

  @override
  String get inboxPendingIntros => 'Presentazioni in sospeso';

  @override
  String get inboxPendingEmpty => 'Nessuna presentazione in sospeso';

  @override
  String get inboxWantsToConnect => 'Vuole connettersi';

  @override
  String get pairingInvalidQr => 'Codice QR di associazione non valido';

  @override
  String get pairingPasteUri => 'Oppure incolla URI di associazione';

  @override
  String get pairingUriHint => 'envoy://pair?… o envoy://invite?…';

  @override
  String get pairingNeedHomeHint =>
      'Configuri la tua casa? Installa prima EnvoyMesh su un Mac o PC Windows, poi scansiona il QR. Entri in famiglia? Scansiona il loro invito — nessuna installazione sul PC necessaria.';

  @override
  String get pairingDownloadEnvoyMesh => 'Download EnvoyMesh per computer';

  @override
  String get pairingJoinFamily => 'Unisciti alla famiglia';

  @override
  String pairingConnectTo(String name) {
    return 'Connettersi a $name?';
  }

  @override
  String pairingWelcomeFamily(String name) {
    return 'Benvenuto nella famiglia $name!';
  }

  @override
  String get pairingImNew => 'Sono nuovo';

  @override
  String get pairingImBack => 'Sono di ritorno';

  @override
  String get pairingDisplayNameOptional => 'Nome visualizzato (facoltativo)';

  @override
  String get pairingYourName => 'Il tuo nome';

  @override
  String get pairingAvatarColor => 'Colore avatar';

  @override
  String get pairingOwnerNameHint =>
      'Mostrato come nome profilo proprietario su questo nodo';

  @override
  String get pairingCopyError => 'Errore di copia';

  @override
  String get pairingRetryMembers => 'Riprova a caricare i membri';

  @override
  String get pairingWhoAreYou => 'Chi sei?';

  @override
  String get pairingAlreadyOnHome => 'Già in questa casa';

  @override
  String get pairingSelectProfile => 'Seleziona il tuo profilo';

  @override
  String get pairingNoMembersFirst =>
      'Nessun membro della famiglia — sarai il primo.';

  @override
  String get pairingNoExistingProfiles =>
      'Nessun profilo famiglia esistente. Passa a «Sono nuovo» per crearne uno.';

  @override
  String get pairingNameRequired => 'Inserisci il tuo nome';

  @override
  String get pairingSelectRequired => 'Seleziona il tuo profilo';

  @override
  String get pairingLanAvailable => 'LAN: disponibile';

  @override
  String get pairingRelayAvailable => 'Relay: disponibile';

  @override
  String pairingPeer(String peer) {
    return 'Peer: $peer';
  }

  @override
  String get pairingNameHintDad => 'es. Papà';

  @override
  String get pairingNameHintMom => 'es. Mamma, Alex';

  @override
  String get pairingChooseUniqueName => 'Scegli un nome non già usato sotto.';

  @override
  String get pairingSameNameHint =>
      'Usa lo stesso nome creato sul primo telefono.';

  @override
  String get pairingTapIfSecondPhone =>
      'Tocca un nome se questo è il secondo telefono (Sono di ritorno).';

  @override
  String get feedEmptyTitle => 'La tua cerchia è tranquilla';

  @override
  String get feedEmptyHint =>
      'Nessun post. Condividi un aggiornamento con i contatti collegati.';

  @override
  String get feedHint => 'Aggiornamenti da te e dai contatti collegati.';

  @override
  String get feedDeleteTitle => 'Eliminare il post?';

  @override
  String get feedDeleteBody => 'Non è reversibile.';

  @override
  String get blogPairHint =>
      'Associa un nodo di casa per scrivere e gestire post Blog.';

  @override
  String get blogConnectHint =>
      'Connettiti a un nodo di casa per gestire il Blog.';

  @override
  String get blogDeleteTitle => 'Eliminare il post?';

  @override
  String blogDeleteBody(String title) {
    return 'Eliminare \"$title\"? Non è reversibile.';
  }

  @override
  String get feedWhatsOnMind => 'A cosa stai pensando?';

  @override
  String get feedShareHint =>
      'Condividi un aggiornamento con i contatti collegati…';

  @override
  String get feedPhotos => 'Foto';

  @override
  String get feedVisibility => 'Visibilità';

  @override
  String get feedVisBonded => 'Contatti collegati';

  @override
  String get feedVisSelected => 'Contatti selezionati';

  @override
  String get feedVisOnlyMe => 'Solo io';

  @override
  String get feedNeedTextOrPhoto => 'Aggiungi testo o almeno una foto';

  @override
  String get feedNeedContact => 'Seleziona almeno un contatto';

  @override
  String get feedSelectedHint =>
      'Solo questi contatti possono vedere questo post. Scegline almeno uno.';

  @override
  String get feedNoContacts =>
      'Nessun contatto collegato — aggiungine uno o scegli Collegati / Solo io.';

  @override
  String get feedAiDraft => 'Bozza IA';

  @override
  String get feedDiscard => 'Scarta';

  @override
  String get feedInsert => 'Inserisci';

  @override
  String get feedReplace => 'Sostituisci';

  @override
  String get peoplePairHint =>
      'Associa un nodo di casa per scoprire persone sulla mesh.';

  @override
  String get peopleConnectHint =>
      'Connettiti a un nodo di casa per scoprire persone.';

  @override
  String get peopleHint =>
      'Trova persone non collegate — apri il profilo o blog pubblico e saluta.';

  @override
  String get peopleTopic => 'Argomento';

  @override
  String get peopleInterest => 'Interesse';

  @override
  String get peopleTopicHint => 'musica, coding, viaggi…';

  @override
  String get peopleInterestHint => 'fotografia, cucina, viaggi…';

  @override
  String get peopleOnMesh => 'Persone sulla mesh';

  @override
  String get peopleResults => 'Risultati';

  @override
  String get peopleEmpty => 'Nessuna persona da mostrare.';

  @override
  String get peopleProfile => 'Profilo';

  @override
  String get peopleBlog => 'Blog';

  @override
  String get peopleSayHello => 'Saluta';

  @override
  String get peopleHelloSent => 'Saluto inviato';

  @override
  String get peopleEnterSearch =>
      'Inserisci un argomento o interesse per cercare.';

  @override
  String get peopleNoMatches => 'Nessuna corrispondenza per questa ricerca.';

  @override
  String get peopleNoneFound => 'Nessuna persona pubblica trovata sulla mesh.';

  @override
  String get peopleHelloMessage => 'Ciao — vorrei connettermi su Envoy.';

  @override
  String get peopleOpenLink => 'Apri link';

  @override
  String get filesPairHint =>
      'Associa un nodo di casa per gestire I miei file.';

  @override
  String get filesConnectHint =>
      'Connettiti a un nodo di casa per gestire i file.';

  @override
  String get filesSearchHint => 'Cerca nella libreria';

  @override
  String get filesVaultHint =>
      'Libreria Vault — allegati chat e foto profilo restano in chat / Profilo';

  @override
  String get filesEmpty => 'Nessun file nella libreria.';

  @override
  String filesImported(String name) {
    return 'Importato $name';
  }

  @override
  String filesImportFailed(String error) {
    return 'Importazione non riuscita: $error';
  }

  @override
  String filesPreviewFailed(String error) {
    return 'Anteprima non riuscita: $error';
  }

  @override
  String get filesNoContactsShare =>
      'Nessun contatto collegato con cui condividere';

  @override
  String get filesShareWith => 'Condividi con…';

  @override
  String get filesShareSent => 'Condivisione inviata';

  @override
  String filesShareFailed(String error) {
    return 'Condivisione non riuscita: $error';
  }

  @override
  String get filesImport => 'Importa';

  @override
  String filesPreviewUnavailable(String mime, int bytes) {
    return 'Anteprima non disponibile per $mime ($bytes byte).';
  }

  @override
  String publishedTitle(String name) {
    return 'Contenuti pubblicati — $name';
  }

  @override
  String get publishedPhotoWall => 'Muro foto';

  @override
  String get engagementCommentHint => 'Scrivi un commento…';

  @override
  String get engagementRemoveCommentTooltip => 'Rimuovi commento';

  @override
  String get profileTitle => 'Profilo';

  @override
  String get profileMyTitle => 'Il mio profilo';

  @override
  String get profileUnnamed => 'Senza nome';

  @override
  String get profileRemovePhotoTitle => 'Rimuovere la foto?';

  @override
  String get profileNameRequired => 'Nome visualizzato o username obbligatorio';

  @override
  String get profileSaved => 'Profilo salvato';

  @override
  String get profileUsername => 'Username';

  @override
  String get profileBio => 'Bio';

  @override
  String get profileBioHint =>
      'Aggiungi una breve bio così i contatti ti riconoscono.';

  @override
  String get profilePhotos => 'Foto';

  @override
  String get profileNoPhotosYet => 'Nessuna foto — aggiungine una al muro';

  @override
  String get profileNoPhotosShared => 'Nessuna foto condivisa';

  @override
  String get profileLongPressRemove => 'Tieni premuta una foto per rimuoverla';

  @override
  String get contactsSearchHint => 'Cerca contatti…';

  @override
  String get contactsEmpty => 'Nessun contatto';

  @override
  String get contactsEmptyHint => 'I contatti collegati compariranno qui.';

  @override
  String get contactsChat => 'Chat';

  @override
  String get callIncoming => 'Chiamata vocale in arrivo';

  @override
  String get callConnected => 'Connesso';

  @override
  String get callConnecting => 'Connessione…';

  @override
  String get callDisconnected => 'Disconnesso';

  @override
  String get callSwitchCamera => 'Cambia fotocamera';

  @override
  String get authorPublish => 'Pubblica';

  @override
  String get authorType => 'Tipo';

  @override
  String get authorTypeProfile => 'Profilo';

  @override
  String get authorTypePhoto => 'Foto muro';

  @override
  String get authorTypeBlog => 'Post Blog';

  @override
  String get authorVisPublic => 'Pubblico';

  @override
  String get authorVisBonded => 'Collegato';

  @override
  String get authorVisPrivate => 'Privato';

  @override
  String get authorCaption => 'Didascalia';

  @override
  String get authorCaptionOptional => 'Didascalia (facoltativo)';

  @override
  String get authorBody => 'Corpo';

  @override
  String get authorBodyMarkdown => 'Corpo (Markdown)';

  @override
  String get authorTitle => 'Titolo';

  @override
  String get authorTitleRequired => 'Il titolo è obbligatorio';

  @override
  String get authorPickPhoto => 'Scegli prima una foto';

  @override
  String get authorChooseAvatar => 'Scegli avatar';

  @override
  String get authorChoosePhoto => 'Scegli foto';

  @override
  String get aiDraftButton => 'Bozza con IA';

  @override
  String get aiDraftEmphasize => 'Cosa enfatizzare? (facoltativo)';

  @override
  String get aiDraftEmphasizeHint => 'es. escursione del weekend con amici';

  @override
  String get aiDraftMode => 'Modalità';

  @override
  String get aiDraftTone => 'Tono';

  @override
  String get aiDraftRewrite => 'Riscrivi';

  @override
  String get aiDraftExpand => 'Espandi';

  @override
  String get aiDraftShorten => 'Accorcia';

  @override
  String get aiDraftGenerate => 'Genera';

  @override
  String get aiDraftNoModel =>
      'Nessun modello IA configurato sul nodo di casa.';

  @override
  String get aiDraftEmpty => 'Bozza vuota dal modello';

  @override
  String get aiDraftBio => 'Bozza bio';

  @override
  String get aiDraftBlog => 'Bozza post Blog';

  @override
  String get aiDraftFeed => 'Bozza aggiornamento Feed';

  @override
  String get aiDraftCaption => 'Bozza didascalia';

  @override
  String get settingsAiModelIntro =>
      'Provider cloud per l\'assistente del nodo di casa. Le modifiche si applicano al prossimo turno.';

  @override
  String settingsHomeUses(String mode) {
    return 'La casa usa $mode';
  }

  @override
  String get settingsEndpoint => 'Endpoint:';

  @override
  String get settingsModelLabel => 'Modello:';

  @override
  String get settingsEditOnSocial =>
      'Modifica questo provider nell\'UI Social del nodo di casa per opzioni avanzate.';

  @override
  String get settingsProvider => 'Provider';

  @override
  String get settingsEndpointUrl => 'URL endpoint';

  @override
  String get settingsModel => 'Modello';

  @override
  String get settingsCustomModel => 'Nome modello personalizzato';

  @override
  String get settingsApiKey => 'API key';

  @override
  String get settingsApiKeySaved => 'Una chiave è già salvata sul nodo di casa';

  @override
  String get settingsAiModelSaved => 'Modello IA salvato';

  @override
  String get settingsAiModelTestChat => 'Testa modello chat';

  @override
  String get settingsAiModelTestChatBusy => 'Test…';

  @override
  String settingsAiModelTestChatOk(String modelName, int latencyMs) {
    return 'Modello chat OK — $modelName in $latencyMs ms';
  }

  @override
  String settingsAiModelTestChatFail(String error) {
    return 'Modello chat non riuscito: $error';
  }

  @override
  String settingsSaveFailed(String error) {
    return 'Salvataggio non riuscito: $error';
  }

  @override
  String get settingsDefault => '(predefinito)';

  @override
  String get settingsAiEngineIntro =>
      'Scegli a quale agente esterno il nodo di casa inoltra i turni dell\'assistente.';

  @override
  String get settingsExternalAgent => 'Agente esterno';

  @override
  String get settingsWebhookUrl => 'URL Webhook';

  @override
  String get settingsHowToStart => 'Come avviare';

  @override
  String get settingsBuiltIntoHome => 'Integrato nel nodo di casa';

  @override
  String get settingsNoExtProcess =>
      'Nessun processo Ext Agent separato richiesto.';

  @override
  String get settingsBridgePort => 'Porta in ascolto Bridge';

  @override
  String get settingsBridgeEnabled => 'Bridge abilitato';

  @override
  String get settingsBridgeHint =>
      'Inoltra i turni dell\'assistente all\'agente esterno selezionato.';

  @override
  String get settingsOpenClawEnabled => 'OpenClaw abilitato';

  @override
  String get settingsOpenClawHint =>
      'Gateway OpenClaw integrato (EnvoyAI) al prossimo avvio del nodo.';

  @override
  String get settingsOpenClawUnavailable => 'Stato OpenClaw non disponibile';

  @override
  String settingsOpenClawStatus(String state) {
    return 'OpenClaw $state';
  }

  @override
  String settingsExtAgentStatus(String state) {
    return 'Agente Est $state';
  }

  @override
  String get settingsEnabled => 'abilitato';

  @override
  String get settingsDisabled => 'disabilitato';

  @override
  String get settingsAiEngineSaved => 'Motore IA salvato';

  @override
  String get settingsNotConnectedNode => 'Non connesso a un nodo di casa';

  @override
  String settingsPiState(String state) {
    return 'Stato: $state';
  }

  @override
  String get settingsPiBuiltIn => 'Agente di coding locale integrato';

  @override
  String get settingsPiLocalOnly =>
      'Agente di coding solo locale (senza strumenti mesh).';

  @override
  String get settingsPiEnabled => 'Pi abilitato';

  @override
  String get settingsPiOverrideHint =>
      'Override modello (facoltativo). Cancella per ereditare le impostazioni del modello IA.';

  @override
  String get settingsPiModelName => 'Nome modello';

  @override
  String get settingsPiEndpoint => 'Endpoint';

  @override
  String get settingsPiLeaveBlankKey =>
      'Lascia vuoto per mantenere la chiave salvata';

  @override
  String get settingsPiSaveOverride => 'Salva override modello';

  @override
  String get settingsPiClearOverride =>
      'Cancella override (eredita modello IA)';

  @override
  String get settingsPiModelSaved => 'Modello Pi salvato';

  @override
  String get settingsPiModelRequired => 'Il nome del modello è obbligatorio';

  @override
  String get settingsPiInherits =>
      'Pi eredita le impostazioni modello EnvoyMesh';

  @override
  String settingsPiFailed(String error) {
    return 'Non riuscito: $error';
  }

  @override
  String settingsPiClearFailed(String error) {
    return 'Cancellazione non riuscita: $error';
  }

  @override
  String settingsPiProviderCustom(String provider) {
    return '$provider (personalizzato)';
  }

  @override
  String get aiEngineReadonlyHint =>
      'Entrambi i blocchi sono di sola lettura su mobile. Configura sul nodo di casa (Impostazioni → IA → Motore IA).';

  @override
  String get aiEngineBuiltInOpenClaw => 'OpenClaw integrato';

  @override
  String get aiEngineExtBridge => 'Bridge Agente esterno';

  @override
  String get aiEngineModeBoth => 'Integrato + Ext';

  @override
  String get aiEngineModeBuiltIn => 'Solo integrato';

  @override
  String get aiEngineModeExt => 'Solo Ext';

  @override
  String get aiEngineModeNone => 'Nessuno';

  @override
  String get aiEngineRunning => 'In esecuzione';

  @override
  String get aiEngineConfigured => 'Configurato (non in esecuzione)';

  @override
  String get aiEngineDisabled => 'Disabilitato';

  @override
  String get browserTitle => 'Browser';

  @override
  String get browserGo => 'Vai';

  @override
  String get browserBack => 'Indietro';

  @override
  String get browserForward => 'Avanti';

  @override
  String get browserReload => 'Ricarica';

  @override
  String get browserPairFirst =>
      'Non connesso al nodo di casa — associa e riconnetti prima.';

  @override
  String get browserIntegrityFailed =>
      'Controllo integrità contenuto non riuscito — rendering rifiutato';

  @override
  String browserDecodeImageFailed(String error) {
    return 'Decodifica immagine non riuscita: $error';
  }

  @override
  String get browserPhoto => 'Foto';

  @override
  String get browserPhotos => 'Foto';

  @override
  String get browserNoPhotos => 'Nessuna foto.';

  @override
  String get browserHint =>
      'Inserisci un URL envoy:// per navigare i contenuti di un contatto collegato.';

  @override
  String get extSwitchTitle => 'Cambia Ext Agent';

  @override
  String extSwitchTooltip(String name) {
    return 'Cambia Ext Agent ($name)';
  }

  @override
  String extNotRunningChat(String name) {
    return '$name non è in esecuzione — avvialo prima di chattare.';
  }

  @override
  String extSwitchFailed(String error) {
    return 'Cambio non riuscito: $error';
  }

  @override
  String extNotRunning(String name) {
    return '$name non è in esecuzione';
  }

  @override
  String get extChecking => 'Verifica…';

  @override
  String get extCheckAgain => 'Controlla di nuovo';

  @override
  String get audioLoading => 'Caricamento audio…';

  @override
  String get audioUnavailable => 'Audio non disponibile';

  @override
  String get audioVoiceNote => 'Nota vocale';

  @override
  String meLastAttempt(String time) {
    return 'Ultimo tentativo: $time';
  }

  @override
  String get meJustNow => 'proprio ora';

  @override
  String get mePublicIpLabel => 'IP pubblico o dominio';

  @override
  String get mePublicIpHint => 'es. 1.2.3.4 o mynode.example.com';

  @override
  String get mePublicIpHelp =>
      'Imposta se il nodo di casa ha un IP pubblico o dominio.\nConsente connessione diretta senza relay su 5G/WAN.';

  @override
  String get meNetworkDebug => 'Debug di rete';

  @override
  String get meRunNetworkTests => 'Esegui test di rete';

  @override
  String get meTesting => 'Test in corso…';

  @override
  String get meNetworkTestsHint =>
      'Testa tutti i percorsi che EnvoyGo usa per l\'associazione.';

  @override
  String get meSwitchNode => 'Cambia nodo';

  @override
  String get chainsRecentTitle => 'Job di team recenti';

  @override
  String get chainsActiveTitle => 'Job di team attivi';

  @override
  String get chainsLoadFailed => 'Caricamento catene non riuscito';

  @override
  String get chainsNoReports => 'Nessun report';

  @override
  String get chainsEmptyHint =>
      'I job di team sul nodo di casa compariranno qui.\nCreali dall\'UI Social del nodo di casa.';

  @override
  String get chainsNoActive =>
      'Nessuna catena attiva sul nodo di casa.\nAvviane una dall\'UI Social.';

  @override
  String get chainsReportGone => 'Questo report non è più disponibile';

  @override
  String get chainsReportGoneHint =>
      'Potrebbe essere stato rimosso dalla policy GC di 90 giorni.';

  @override
  String get chainsBackToRecent => 'Torna ai job di team recenti';

  @override
  String get chainsLoadReportFailed => 'Caricamento report non riuscito';

  @override
  String get chainsSummary => 'Riepilogo';

  @override
  String get chainsWorkers => 'Worker';

  @override
  String get chainsSubtasks => 'Sottoattività';

  @override
  String get chainsSynthesis => 'Sintesi';

  @override
  String get chainsDuration => 'Durata';

  @override
  String get chainsManageOnSocial =>
      'Gestisci le catene sull\'UI Social del nodo di casa.';

  @override
  String get chainsStartTitle => 'Avvia un job di team';

  @override
  String get chainsStartFab => 'Nuovo job di team';

  @override
  String get chainsStartIntro =>
      'Descrivi un obiettivo. Il nodo di casa pianifica le sottoattività e assegna i worker Agent Network collegati.';

  @override
  String get chainsStartAssignmentMode => 'Modalità di assegnazione';

  @override
  String get chainsStartModeSkill => 'Per competenza';

  @override
  String get chainsStartModeRole => 'Per ruolo';

  @override
  String get chainsStartModeSkillHint =>
      'I worker sono classificati in base alle competenze corrispondenti.';

  @override
  String get chainsStartModeRoleHint =>
      'Ogni passaggio preferisce un ruolo (PM, programmatore, …).';

  @override
  String get chainsStartGoalLabel => 'Obiettivo';

  @override
  String get chainsStartGoalHint => 'Cosa deve realizzare il team?';

  @override
  String chainsStartGoalTooShort(int min) {
    return 'L\'obiettivo deve contenere almeno $min caratteri';
  }

  @override
  String get chainsStartAttachmentsLabel => 'Allegati';

  @override
  String get chainsStartAttachmentsAdd => 'Aggiungi file';

  @override
  String get chainsStartAttachmentsHint =>
      'Suggerimento: aggiungi un\'etichetta breve per file (es. brief), poi cita [brief] nell\'obiettivo così i worker sanno quale file usare — anche con nomi lunghi o poco chiari.';

  @override
  String chainsStartAttachmentsMax(int max) {
    return 'Puoi allegare fino a $max file';
  }

  @override
  String chainsStartAttachmentTooLarge(String name, int maxMb) {
    return '$name è troppo grande (max $maxMb MB)';
  }

  @override
  String get chainsStartAttachmentUploading => 'Caricamento…';

  @override
  String get chainsStartAttachmentFailed => 'Caricamento non riuscito';

  @override
  String get chainsStartAttachmentLabel => 'Etichetta';

  @override
  String get chainsStartAttachmentLabelHint => 'es. brief, dati vendite';

  @override
  String get chainsStartAttachmentRemove => 'Rimuovi allegato';

  @override
  String get chainsStartPreview => 'Anteprima piano';

  @override
  String get chainsStartPreviewing => 'Pianificazione…';

  @override
  String get chainsStartPreviewFailed => 'Impossibile creare un piano';

  @override
  String get chainsStartNeedPreview =>
      'Visualizza l\'anteprima del piano prima di avviare';

  @override
  String get chainsStartPlanHeading => 'Piano';

  @override
  String get chainsStartNoSubtasks => 'Nessuna sottoattività in questo piano.';

  @override
  String get chainsStartConfirm => 'Avvia job di team';

  @override
  String get chainsStartStarting => 'Avvio…';

  @override
  String get chainsStartStarted => 'Job di team avviato';

  @override
  String get chainsStartFailed => 'Impossibile avviare il job di team';

  @override
  String get chainsStartNoWorkers =>
      'Nessun worker Agent Network raggiungibile. Prima collega i contatti con gli agenti sul nodo di casa.';

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
      'Seleziona almeno un worker online, o visualizza di nuovo l\'anteprima per ripristinare il pool consigliato.';

  @override
  String get chainsStartWorkersHint =>
      'Worker online dal piano. Deseleziona quelli che non vuoi. Deselezionare tutti blocca l\'avvio — visualizza di nuovo l\'anteprima per ripristinare il pool consigliato.';

  @override
  String get chainsStartWorkersHeading => 'Worker';

  @override
  String get chainsStartNoSuggestedWorkers =>
      'Nessun worker suggerito per ora — l\'avvio utilizzerà il pool di scoperta del nodo di casa.';

  @override
  String chainsStartWorkerMatches(int count) {
    return 'corrisponde a $count passaggi';
  }

  @override
  String get chainsStartWorkerOnline => 'Online';

  @override
  String get chainsStartWorkerRelay => 'Online (relay)';

  @override
  String get chainsStartWorkerOffline => 'Offline / sconosciuto';

  @override
  String get chainsActiveGone => 'Questo job di team non è più attivo';

  @override
  String chainsBudgetLine(String spent, String max) {
    return 'Budget $spent / $max USD';
  }

  @override
  String get chainsBudgetWarn =>
      'Avviso budget — considera di aggiungere budget.';

  @override
  String get chainsBudgetExceeded =>
      'Budget superato — il job può rimanere bloccato fino al ribilanciamento.';

  @override
  String chainsPartialCount(int count) {
    return '$count risultati parziali';
  }

  @override
  String get chainsCancelTitle => 'Annullare il job di team?';

  @override
  String get chainsCancelBody =>
      'I worker riceveranno l\'ordine di fermarsi. I risultati parziali già raccolti vengono conservati.';

  @override
  String get chainsCancelConfirm => 'Annulla job';

  @override
  String get chainsCancelDone => 'Job di team annullato';

  @override
  String get chainsCancelReason => 'Annullato da EnvoyGo';

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
  String get chainsDetailCancelled => 'Questo job è stato annullato.';

  @override
  String get chainsDetailPublished =>
      'Questo job è terminato e ha pubblicato un rapporto.';

  @override
  String get chainsRebalanceHeading => 'Aggiungi budget';

  @override
  String get chainsRebalanceHint =>
      'Aumenta il tetto di costo e riprova i passaggi non assegnati.';

  @override
  String get chainsRebalanceAmount => 'USD aggiuntivi';

  @override
  String get chainsRebalanceAction => 'Aggiungi e riprova';

  @override
  String get chainsRebalanceInvalidAmount =>
      'Inserisci un importo in dollari positivo';

  @override
  String get chainsRebalanceDone => 'Budget aggiornato';

  @override
  String get chainsRebalanceFailed => 'Impossibile ribilanciare';

  @override
  String get chainsPin => 'Fissa il rapporto';

  @override
  String get chainsUnpin => 'Rimuovi il rapporto';

  @override
  String get chainsPinDone =>
      'Rapporto fissato (conservato oltre la pulizia dei 90 giorni)';

  @override
  String get chainsUnpinDone => 'Rapporto rimosso';

  @override
  String chainsPublished(String date) {
    return 'Pubblicato $date';
  }

  @override
  String chainsChainId(String id) {
    return 'Catena $id';
  }

  @override
  String get termNone => 'Nessuna sessione terminale';

  @override
  String termAttachFailed(String error) {
    return 'Collegamento terminale non riuscito: $error';
  }

  @override
  String get termCopied => 'Copiato negli appunti';

  @override
  String get termReconnecting => 'Riconnessione…';

  @override
  String get termCopyAll => 'Copia tutto l\'output';

  @override
  String get termPaste => 'Incolla';

  @override
  String get termCloseSession => 'Chiudi sessione';

  @override
  String get chatImagePlaceholder => '[immagine]';

  @override
  String get chatsBotSyncing => 'Sincronizzazione aggiornamenti…';

  @override
  String get chatsBotSavedHint =>
      'Salvato sul nodo di casa. Chatta quando sei pronto.';

  @override
  String get chatsBotNotFound => 'Bot non trovato sul nodo di casa';

  @override
  String get chatAiDisabledAskOwner =>
      'Chiedi al proprietario di casa di abilitare un modello IA per la chat famiglia.';

  @override
  String pairingLoadProfilesFailed(String error) {
    return 'Impossibile caricare i profili esistenti: $error';
  }

  @override
  String pairingFailed(String error) {
    return 'Associazione non riuscita: $error';
  }

  @override
  String get pairingInviteAlreadyUsed =>
      'Questo QR di invito è già stato usato. Chiedi al proprietario di aprire Famiglia → Mostra QR invito, scansiona il nuovo codice e scegli Sono tornato per selezionare il tuo profilo (es. Dad).';

  @override
  String get feedDefaultTitle => 'Post del feed';

  @override
  String get aiDraftSection => 'Sezione bozza';

  @override
  String aiDraftFailed(String reason) {
    return 'Impossibile creare la bozza ($reason)';
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
  String get peopleEnvoyUser => 'Utente Envoy';

  @override
  String get commonEllipsis => '…';

  @override
  String get browserCached => 'In cache';

  @override
  String get browserLoaded => 'Caricato';

  @override
  String get browserNotPublished => 'Non ancora pubblicato';

  @override
  String get browserNotFound => 'Contenuto non trovato';

  @override
  String get browserAccessDenied => 'Accesso negato';

  @override
  String browserPdfLoaded(int chars) {
    return 'PDF caricato ($chars caratteri base64)';
  }

  @override
  String browserUnsupportedType(String mime) {
    return 'Tipo non supportato: $mime';
  }

  @override
  String get browserInterests => 'Interessi';

  @override
  String get browserKnowledge => 'Conoscenze';

  @override
  String get browserCapabilities => 'Capacità';

  @override
  String get connTooltipP2p => 'Connessione P2P tramite hop relay';

  @override
  String get connTooltipRelay => 'Connessione relay — la casa può chiamarti';

  @override
  String connTooltipConnectedVia(String transport) {
    return 'Connesso tramite $transport';
  }

  @override
  String get connBootstrap => 'Bootstrap';

  @override
  String get settingsRunning => 'in esecuzione';

  @override
  String get settingsNotRunning => 'non in esecuzione';

  @override
  String get settingsModelIdHint => 'model-id';

  @override
  String get chainsSections => 'Sezioni';

  @override
  String get chainsWorkerAllocations => 'Allocazioni worker';

  @override
  String chainsAwardedSummary(String status, int awarded, int total) {
    return '$status · $awarded/$total assegnati';
  }

  @override
  String meAttemptN(int n) {
    return 'tentativo $n';
  }

  @override
  String meSecondsAgo(int n) {
    return '$n s fa';
  }

  @override
  String meMinutesAgo(int n) {
    return '$n min fa';
  }

  @override
  String meHoursAgo(int n) {
    return '$n h fa';
  }

  @override
  String meDaysAgo(int n) {
    return '$n g fa';
  }

  @override
  String get termShowKeyboard => 'Mostra tastiera';

  @override
  String get termHideKeyboard => 'Nascondi tastiera';

  @override
  String get termCopySelection => 'Copia selezione';

  @override
  String get pairingImBackHint =>
      'Tocca un nome se è il tuo secondo telefono (Sto tornando).';

  @override
  String connP2pDetail(String detail) {
    return 'P2P ($detail)';
  }

  @override
  String get meConnRefused => 'connessione rifiutata / bloccata';

  @override
  String get meTimeout5s => 'timeout (5 s)';

  @override
  String timeMinutesShort(int n) {
    return '$n min';
  }

  @override
  String timeHoursShort(int n) {
    return '$n h';
  }

  @override
  String timeDaysShort(int n) {
    return '$n g';
  }

  @override
  String get termCtrlSticky => 'Modificatore Ctrl (sticky)';

  @override
  String get termCtrlLetter => 'Ctrl + lettera';

  @override
  String get connStateConnected => 'Connesso';

  @override
  String get connStateConnecting => 'Connessione…';

  @override
  String get connStateDisconnected => 'Disconnesso';

  @override
  String get connStateError => 'Errore';

  @override
  String get chatsDefaultGroup => 'Gruppo';

  @override
  String get chatsDefaultFamilyGroup => 'Gruppo famiglia';

  @override
  String chatsTerminalTitle(String name) {
    return 'Terminale: $name';
  }

  @override
  String get chatsExtAgent => 'Agente Est';

  @override
  String browserBytesCount(int count) {
    return '$count byte';
  }

  @override
  String get commonYouName => 'Tu';

  @override
  String get settingsAiModelEnvoyLocalStandby =>
      'Envoy Local è il provider attivo sul nodo di casa. Tocca per gestire Local, o salva un provider cloud qui sotto come standby.';

  @override
  String get settingsEnvoyLocalIntro =>
      'Controlla llama.cpp sul computer di casa. I modelli vengono scaricati lì — mai su questo telefono.';

  @override
  String get settingsEnvoyLocalStatusHeading => 'Stato';

  @override
  String get settingsEnvoyLocalInUse => 'In uso';

  @override
  String get settingsEnvoyLocalNotInUse => 'Non in uso';

  @override
  String get settingsEnvoyLocalStatusDownloading => 'Download in corso…';

  @override
  String get settingsEnvoyLocalStatusDetecting => 'Rilevamento…';

  @override
  String get settingsEnvoyLocalStatusExtracting => 'Estrazione…';

  @override
  String get settingsEnvoyLocalStatusStarting => 'Avvio…';

  @override
  String get settingsEnvoyLocalStatusReady => 'Pronto';

  @override
  String get settingsEnvoyLocalStatusError => 'Errore';

  @override
  String get settingsEnvoyLocalStatusDisabled => 'Disabilitato';

  @override
  String get settingsEnvoyLocalIdleTimeout =>
      'L\'operazione Envoy Local è scaduta dopo 60 minuti. Se un download è bloccato vicino al 100%, prova mirror cinesi o una VPN, quindi riprova — i download parziali vengono ripresi.';

  @override
  String settingsEnvoyLocalRuntime(String status) {
    return 'Runtime: $status';
  }

  @override
  String settingsEnvoyLocalRuntimeVersion(String version) {
    return 'Versione: $version';
  }

  @override
  String settingsEnvoyLocalAccel(String accel) {
    return 'Acceleratore: $accel';
  }

  @override
  String settingsEnvoyLocalHardware(String summary) {
    return 'Questa macchina: $summary';
  }

  @override
  String settingsEnvoyLocalActiveModel(String model) {
    return 'Modello: $model';
  }

  @override
  String settingsEnvoyLocalProgressBytes(String received, String total) {
    return '$received / $total MB';
  }

  @override
  String settingsEnvoyLocalProgressReceived(String received) {
    return '$received MB scaricati';
  }

  @override
  String settingsEnvoyLocalLastError(String error) {
    return 'Ultimo errore: $error';
  }

  @override
  String get settingsEnvoyLocalDownloadRegion =>
      'Regione di download dei modelli';

  @override
  String get settingsEnvoyLocalDownloadRegionHint =>
      'Se i download falliscono, prova mirror cinesi o una VPN per Global.';

  @override
  String settingsEnvoyLocalDownloadRegionEffective(String region) {
    return 'In uso: $region';
  }

  @override
  String get settingsEnvoyLocalRegionAuto => 'Auto (fuso orario / locale)';

  @override
  String get settingsEnvoyLocalRegionCn => 'Cina (ModelScope → hf-mirror)';

  @override
  String get settingsEnvoyLocalRegionGlobal => 'Globale (Hugging Face)';

  @override
  String get settingsEnvoyLocalEnable => 'Scarica e abilita';

  @override
  String get settingsEnvoyLocalEnabling => 'Download in corso…';

  @override
  String get settingsEnvoyLocalStart => 'Avvia Envoy Local';

  @override
  String get settingsEnvoyLocalStarting => 'Avvio…';

  @override
  String get settingsEnvoyLocalStop => 'Ferma Envoy Local';

  @override
  String get settingsEnvoyLocalRestart => 'Riavvia';

  @override
  String get settingsEnvoyLocalCancelDownload => 'Annulla download';

  @override
  String get settingsEnvoyLocalStopHint =>
      'L\'arresto riporta l\'assistente al tuo provider cloud/Ollama se ne è salvato uno.';

  @override
  String get settingsEnvoyLocalRecommended => 'Consigliato';

  @override
  String get settingsEnvoyLocalRecommendedBadge => 'Consigliato';

  @override
  String get settingsEnvoyLocalDownload => 'Scarica';

  @override
  String get settingsEnvoyLocalInstalled => 'Modelli installati';

  @override
  String get settingsEnvoyLocalInstalledHint =>
      'Scaricati sul nodo di casa. Scegli quale rendere attivo.';

  @override
  String get settingsEnvoyLocalNoInstalled =>
      'Nessun modello installato per ora.';

  @override
  String get settingsEnvoyLocalSetActive => 'Imposta come attivo';

  @override
  String get settingsEnvoyLocalActiveBadge => 'Attivo';

  @override
  String get settingsEnvoyLocalInstalledBadge => 'Installato';

  @override
  String get settingsEnvoyLocalCatalog => 'Catalogo';

  @override
  String settingsEnvoyLocalHfError(String error) {
    return 'Ricerca Hugging Face non disponibile: $error';
  }

  @override
  String get settingsEnvoyLocalRefresh => 'Aggiorna';

  @override
  String get settingsEnvoyLocalPhoneNote =>
      'I parametri avanzati del server (dimensione del contesto, layer GPU) restano nell\'UI Social del nodo di casa.';
}
