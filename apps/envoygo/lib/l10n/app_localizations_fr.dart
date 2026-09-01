// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'EnvoyGo';

  @override
  String get navChats => 'Discussions';

  @override
  String get navInbox => 'Boîte de réception';

  @override
  String get navContent => 'Contenu';

  @override
  String get navSocial => 'Social';

  @override
  String get navTerminal => 'Terminal';

  @override
  String get navKnowledge => 'Connaissances';

  @override
  String get navMe => 'Moi';

  @override
  String get contentExplore => 'Explorer';

  @override
  String get socialDiscover => 'Découvrir';

  @override
  String get marketTitle => 'Marché';

  @override
  String get marketPaneBrowse => 'Parcourir';

  @override
  String get marketPaneShop => 'Ma boutique';

  @override
  String get marketBrowseEmptyTitle => 'Aucune annonce d’autres pour l’instant';

  @override
  String get marketBrowseEmptyDesc =>
      'Les annonces d’amis liés apparaissent ici après publication.';

  @override
  String get marketSearchPlaceholder => 'Chercher livres, électronique, tags…';

  @override
  String get marketSearchSubmit => 'Rechercher';

  @override
  String get marketSearchIdleHint =>
      'Saisissez un mot-clé, ou touchez une suggestion.';

  @override
  String marketSearchNoResults(String query) {
    return 'Aucune annonce pour « $query ».';
  }

  @override
  String get marketChipBooks => 'Livres';

  @override
  String get marketChipElectronics => 'Électronique';

  @override
  String get marketChipClothing => 'Vêtements';

  @override
  String get marketChipHome => 'Maison';

  @override
  String get marketChipDigital => 'Numérique';

  @override
  String get marketClearHistory => 'Effacer l’historique';

  @override
  String get marketHistoryCleared => 'Historique de recherche effacé.';

  @override
  String get marketMessageSeller => 'Contacter le vendeur';

  @override
  String get marketSellerLabel => 'Vendeur';

  @override
  String get marketShareLink => 'Copier le lien';

  @override
  String get marketShareCopied => 'Lien de partage copié.';

  @override
  String marketInquireDefault(String title) {
    return 'Bonjour — intéressé(e) par « $title ». Est-ce encore disponible ?';
  }

  @override
  String get marketInquireSent => 'Message envoyé. Ouverture du chat…';

  @override
  String get marketNotConnected =>
      'Non connecté au nœud home — associez pour voir la boutique.';

  @override
  String get marketNoListings =>
      'Aucune annonce. Appuyez sur « Ajouter depuis une photo », ou modifiez dans Social.';

  @override
  String get marketUntitled => 'Annonce sans titre';

  @override
  String get marketVisibilityPublicShort => 'Public';

  @override
  String get marketVisibilityBondsShort => 'Liens seulement';

  @override
  String get marketStatusActive => 'En vente';

  @override
  String get marketStatusReserved => 'Réservé';

  @override
  String get marketStatusSold => 'Vendu';

  @override
  String get marketStatusWithdrawn => 'Retiré';

  @override
  String get marketTagsLabel => 'Tags';

  @override
  String get marketEditOnSocialHint =>
      'Créez et modifiez les annonces pour l’instant dans l’onglet Marché Social du nœud home.';

  @override
  String get marketCaptureAddFromPhoto => 'Ajouter depuis une photo';

  @override
  String get marketCaptureCamera => 'Prendre une photo';

  @override
  String get marketCaptureGallery => 'Choisir dans la galerie';

  @override
  String get marketCaptureNotesTitle => 'Décrire l’article';

  @override
  String get marketCaptureNotesHint =>
      'Titre sur la première ligne, puis les détails…';

  @override
  String get marketCaptureContinue => 'Continuer';

  @override
  String get marketCaptureReviewTitle => 'Vérifier l’annonce';

  @override
  String get marketCaptureTitleLabel => 'Titre';

  @override
  String get marketCaptureDescriptionLabel => 'Description';

  @override
  String get marketCapturePriceLabel => 'Prix';

  @override
  String get marketCaptureCurrencyLabel => 'Devise';

  @override
  String get marketCaptureVisibilityLabel => 'Qui peut trouver ceci';

  @override
  String get marketCapturePublish => 'Publier';

  @override
  String get marketCapturePublished =>
      'Annonce publiée sur votre nœud domestique.';

  @override
  String get marketCaptureTitleRequired => 'Ajoutez un titre avant de publier.';

  @override
  String get marketSellerSuggestedReply =>
      'Réponse suggérée à partir de l’annonce';

  @override
  String get marketMarkReserved => 'Marquer comme réservé';

  @override
  String get marketMarkSold => 'Marquer comme vendu';

  @override
  String get marketMarkAvailable => 'Marquer comme disponible';

  @override
  String get marketRelist => 'Remettre en vente';

  @override
  String get marketStatusUpdated => 'Statut de l’annonce mis à jour.';

  @override
  String get marketPaymentHint =>
      'Convenez du paiement avec le vendeur en dehors d’EnvoyMesh — Envoy ne détient pas d’argent.';

  @override
  String get marketBlockSeller => 'Bloquer';

  @override
  String get marketReportSeller => 'Signaler';

  @override
  String get marketConfirmBlock =>
      'Bloquer ce vendeur ? Ses annonces disparaîtront de Parcourir.';

  @override
  String get marketConfirmReport =>
      'Signaler et bloquer ce vendeur ? Cela reste sur votre nœud (pas encore d’examen central).';

  @override
  String get marketFilterCategory => 'Catégorie';

  @override
  String get marketFilterAnyCategory => 'Toutes les catégories';

  @override
  String get marketFilterMinPrice => 'Prix min.';

  @override
  String get marketFilterMaxPrice => 'Prix max.';

  @override
  String get marketFilterCurrency => 'Devise';

  @override
  String get termEmptyHint =>
      'Démarrez une session Pi ou un terminal shell sur votre nœud domicile.';

  @override
  String get commonCancel => 'Annuler';

  @override
  String get commonConfirm => 'Confirmer';

  @override
  String get homeFolderDrives => 'Lecteurs';

  @override
  String get homeFolderComputer => 'Ordinateur';

  @override
  String get homeFolderHome => 'Accueil';

  @override
  String get homeFolderParent => '↑ Dossier parent';

  @override
  String get homeFolderNoSubfolders => 'Aucun sous-dossier';

  @override
  String get commonSave => 'Enregistrer';

  @override
  String get commonDelete => 'Supprimer';

  @override
  String get commonRetry => 'Réessayer';

  @override
  String get commonClose => 'Fermer';

  @override
  String get commonLoading => 'Chargement…';

  @override
  String get commonError => 'Une erreur s\'est produite';

  @override
  String get commonReconnect => 'Reconnecter';

  @override
  String get commonSwitch => 'Changer';

  @override
  String get commonPair => 'Associer';

  @override
  String get commonUnpair => 'Dissocier';

  @override
  String get commonCreate => 'Créer';

  @override
  String get commonRename => 'Renommer';

  @override
  String get languageTitle => 'Langue';

  @override
  String get languageSubtitle => 'Langue des menus et libellés';

  @override
  String get languageSystem => 'Par défaut du système';

  @override
  String get languageSystemDesc => 'Suivre la langue de l\'appareil';

  @override
  String get meConnectedNode => 'Nœud connecté';

  @override
  String get meNotConnected => 'Non connecté';

  @override
  String get meNotConnectedHint => 'Associez un nœud domicile pour commencer';

  @override
  String get meReconnect => 'Reconnecter';

  @override
  String get meSwitch => 'Changer';

  @override
  String get meRepair => 'Réassocier';

  @override
  String get meReconnectNow => 'Reconnecter maintenant';

  @override
  String get meUnpair => 'Dissocier';

  @override
  String get meBrowser => 'Navigateur';

  @override
  String get meBrowserHint =>
      'Ouvrir des pages envoy:// — ou l\'onglet Contenu pour Mon site';

  @override
  String get meMyShop => 'Ma boutique';

  @override
  String get meMyShopHint =>
      'Voir les annonces sur le nœud home (édition sur Social pour l’instant)';

  @override
  String get meAiEngine => 'Moteur IA';

  @override
  String get meAiEngineHint => 'Pont + OpenClaw. Appuyez pour configurer.';

  @override
  String get meRecentTeamJobs => 'Jobs d\'équipe récents';

  @override
  String get meRecentTeamJobsHint => 'Parcourir les jobs multi-agents terminés';

  @override
  String get meActiveTeamJobs => 'Jobs d\'équipe actifs';

  @override
  String get meActiveTeamJobsHint => 'Suivre les jobs en cours';

  @override
  String get mePairNewNode => 'Associer un nouveau nœud';

  @override
  String get mePairNewNodeHint => 'Ajouter un autre nœud domicile';

  @override
  String get meSettings => 'Paramètres';

  @override
  String get meAiModel => 'Modèle IA';

  @override
  String get meEnvoyLocal => 'Envoy Local';

  @override
  String get meEnvoyLocalHint =>
      'Modèle local sur le nœud domicile (télécharger et démarrer sur l\'ordinateur)';

  @override
  String get mePiAgent => 'Agents de code';

  @override
  String get mePiAgentHint => 'Réglages Pi et Envoy Harness';

  @override
  String get meDarkMode => 'Mode sombre';

  @override
  String get meDarkModeHint => 'Suivre le réglage système';

  @override
  String get mePushNotifications => 'Notifications push';

  @override
  String get mePushNotificationsHint =>
      'Alertes lorsque l\'app est en arrière-plan';

  @override
  String get meUnpairDevice => 'Dissocier cet appareil';

  @override
  String get meUnpairDeviceHint =>
      'Déconnecter et supprimer toutes les données locales';

  @override
  String get meUnpairConfirmTitle => 'Dissocier ?';

  @override
  String get meUnpairConfirmBody =>
      'Supprime l\'association et les discussions locales de ce nœud sur cet appareil.';

  @override
  String get meUnpairedSnack =>
      'Dissocié. Discussions et données locales supprimées.';

  @override
  String meUnpairFailed(String error) {
    return 'Échec de la dissociation : $error';
  }

  @override
  String get meEditProfile => 'Modifier le profil';

  @override
  String meProfileUpdateFailed(String error) {
    return 'Impossible de mettre à jour le profil : $error';
  }

  @override
  String get mePublicAccess => 'Accès public';

  @override
  String get mePort => 'Port';

  @override
  String get mePublicAccessSaved => 'Accès public enregistré';

  @override
  String get meFamilyProfile => 'Profil familial';

  @override
  String get meFamilyProfileHint =>
      'Vous êtes connecté à ce domicile en tant que membre de la famille';

  @override
  String get mePreferences => 'Préférences';

  @override
  String get meViewEditProfile => 'Voir et modifier le profil';

  @override
  String get meEditNameAvatar => 'Modifier le nom et l\'avatar';

  @override
  String get meDisplayName => 'Nom affiché';

  @override
  String get meAvatarColor => 'Couleur d\'avatar (hex)';

  @override
  String meMorePaired(int count) {
    return '+$count autres associés';
  }

  @override
  String meSessionExpired(String name) {
    return 'Session expirée pour $name';
  }

  @override
  String meDisconnectedFrom(String name) {
    return 'Déconnecté de $name';
  }

  @override
  String meUnpairConfirmBodyNamed(String name) {
    return 'Cela déconnectera et supprimera toutes les discussions et données locales pour $name.';
  }

  @override
  String get meTeamJobs => 'Jobs d\'équipe';

  @override
  String get meStartTeamJobHint =>
      'Prévisualiser un plan et lancer sur le nœud domicile';

  @override
  String get meAiModelHint =>
      'Fournisseur utilisé pour l\'assistant sur ce nœud domicile';

  @override
  String get mePiAgentHintLong =>
      'Agents de code locaux sur le nœud domicile (Pi et Envoy Harness)';

  @override
  String get mePushNotificationsHintLong =>
      'Recevez des alertes pour les nouveaux messages, demandes de contact et approbations lorsque l\'app est en arrière-plan.';

  @override
  String get meRecentTeamJobsHintLong =>
      'Voir les rapports de jobs publiés sur le nœud domicile';

  @override
  String get meActiveTeamJobsHintLong =>
      'Suivre les jobs d\'équipe en cours sur le nœud domicile';

  @override
  String get inboxTitle => 'Boîte de réception';

  @override
  String get inboxEmpty => 'Aucune notification';

  @override
  String get inboxEmptyHint =>
      'Les demandes de lien et mises à jour du fil apparaîtront ici';

  @override
  String get contentFeed => 'Fil';

  @override
  String get contentBlog => 'Blog';

  @override
  String get contentPeople => 'Personnes';

  @override
  String get contentMyFiles => 'Mes fichiers';

  @override
  String get contentKnowledge => 'Connaissances';

  @override
  String get knowledgeTitle => 'Connaissances';

  @override
  String get knowledgeLede =>
      'Votre base de connaissances du coffre — les notes sous notes/ alimentent EnvoyAI. Les documents restent à l\'original.';

  @override
  String get knowledgePanelBrowse => 'Parcourir';

  @override
  String get knowledgePanelAsk => 'Demander';

  @override
  String get knowledgePanelPlugins => 'Plugins';

  @override
  String get knowledgePanelSetup => 'Configuration';

  @override
  String get knowledgeAskHint =>
      'Les réponses utilisent les notes et documents de ce nœud. Les contacts ne voient que ce que vous publiez.';

  @override
  String get knowledgeAskHeading => 'Interroger votre coffre';

  @override
  String get knowledgeAskLabel => 'Question';

  @override
  String get knowledgeAskPlaceholder => 'Qu\'ai-je écrit sur l\'onboarding ?';

  @override
  String get knowledgeAskSubmit => 'Demander';

  @override
  String get knowledgeAskBusy => 'Recherche…';

  @override
  String get knowledgeAskAnswerHeading => 'Réponse';

  @override
  String get knowledgeAskEmptyAnswer =>
      'Aucune réponse. Vérifiez la configuration — activez la base de connaissances et reconstruisez l\'index.';

  @override
  String get knowledgeAskContinueEnvoyAi => 'Ouvrir dans EnvoyAI';

  @override
  String get knowledgeAskEnvoyAiHint =>
      'Pour des conversations multi-tours avec outils, continuez dans EnvoyAI.';

  @override
  String get knowledgeLibraryHeading => 'Vos fichiers';

  @override
  String get knowledgeLibraryCaption =>
      'Notes, documents et ce que vous avez publié.';

  @override
  String get knowledgeEmbedGateTitleNeeded => 'Modèle d\'embedding requis';

  @override
  String get knowledgeEmbedGateTitleDownloading =>
      'Téléchargement du modèle d\'embedding…';

  @override
  String get knowledgeEmbedGateTitleError =>
      'Échec de la configuration d\'embedding';

  @override
  String get knowledgeEmbedGateBodyNeeded =>
      'La recherche de connaissances nécessite un modèle d\'embedding local sur le nœud domicile. Le téléchargement démarre automatiquement au lancement de l\'app — Parcourir reste indisponible jusqu\'à la fin. Vous pouvez aussi démarrer ou réessayer depuis ici.';

  @override
  String get knowledgeEmbedGateBodyDownloading =>
      'Téléchargement en cours sur le nœud domicile (démarré avec l\'app). Vous pouvez quitter cet écran ; les connaissances s\'ouvrent quand l\'embedder est prêt.';

  @override
  String get knowledgeEmbedGateBodyError =>
      'Le runtime ou le modèle d\'embedding n\'a pas pu être installé sur le nœud domicile. Réessayez le téléchargement, ou réparez la configuration dans l\'app de bureau.';

  @override
  String get knowledgeEmbedGateDownload => 'Télécharger sur le nœud domicile';

  @override
  String get knowledgeEmbedGateDownloading => 'Téléchargement…';

  @override
  String get knowledgeEmbedGateRetry => 'Réessayer le téléchargement';

  @override
  String get knowledgeEmbedGateOpenSetup => 'Ouvrir Configuration';

  @override
  String get knowledgeEmbedGateBackgroundHint =>
      'Vous pouvez continuer à utiliser les autres parties de l\'app pendant que cela se termine.';

  @override
  String get knowledgeEmbedGateStripNeeded =>
      'Connaissances indisponibles — modèle d\'embedding non installé sur le domicile';

  @override
  String get knowledgeEmbedGateStripDownloading =>
      'Connaissances indisponibles — téléchargement du modèle d\'embedding sur le domicile';

  @override
  String get knowledgeEmbedGateStripError =>
      'Connaissances indisponibles — échec de la configuration d\'embedding sur le domicile';

  @override
  String get knowledgeEmbedGateDownloadStarted =>
      'Téléchargement d\'embedding lancé sur le domicile';

  @override
  String get knowledgeEmbedGateBlockedToast =>
      'Terminez la configuration d’embedding avant d’interroger le vault.';

  @override
  String get knowledgeEmbedGatePhaseDetecting => 'Détection de la plateforme…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingRuntime =>
      'Téléchargement du runtime llama.cpp…';

  @override
  String get knowledgeEmbedGatePhaseExtracting => 'Extraction du runtime…';

  @override
  String get knowledgeEmbedGatePhaseDownloadingModel =>
      'Téléchargement du modèle d’embedding…';

  @override
  String get knowledgeEmbedGatePhaseStarting => 'Démarrage de l’embeddeur…';

  @override
  String get knowledgeEmbedGatePhaseDownloading => 'Téléchargement…';

  @override
  String get knowledgeEmbedGateStepsAria =>
      'Étapes d’installation de l’embedding';

  @override
  String get knowledgePluginsLede =>
      'Connecteurs optionnels. Notion nécessite une URL MCP — pas l\'application Notion.';

  @override
  String get knowledgePluginsObsidianTitle => 'Obsidian';

  @override
  String get knowledgePluginsObsidianDesc =>
      'Enrichir les notes du coffre. Application de bureau optionnelle.';

  @override
  String get knowledgePluginsNotionTitle => 'Notion (via MCP)';

  @override
  String get knowledgePluginsNotionDesc =>
      'Recherche et navigation via MCP. Échec en douceur sans URL.';

  @override
  String get knowledgePluginsMcpUrl => 'URL du serveur MCP';

  @override
  String get knowledgePluginsMcpTool => 'Nom de l\'outil de recherche';

  @override
  String get knowledgePluginsSyncNow => 'Synchroniser maintenant';

  @override
  String get knowledgePluginsLinkedVaultLabel =>
      'Chemins du coffre Obsidian lié';

  @override
  String get knowledgePluginsLinkedVaultHint => '/chemin/vers/ObsidianVault';

  @override
  String get knowledgePluginsLinkedVaultEmpty =>
      'Aucun coffre lié pour l\'instant.';

  @override
  String get knowledgePluginsLinkedVaultRemove => 'Retirer';

  @override
  String get knowledgePluginsLinkedVaultAdd => 'Ajouter un dossier coffre…';

  @override
  String get knowledgePluginsLinkedVaultPickTitle =>
      'Choisir le dossier du coffre Obsidian';

  @override
  String get knowledgePluginsLinkedVaultHelper =>
      'Les coffres Obsidian sur cet ordinateur domestique sont liés automatiquement. Effacez une ligne pour délier (ne sera pas ré-lié). Ajouter un dossier coffre… pour en ajouter.';

  @override
  String get knowledgePluginsOpenObsidian => 'Ouvrir Obsidian';

  @override
  String get knowledgePluginsOpenNotion => 'Ouvrir Notion';

  @override
  String get knowledgePluginsOpeningApp => 'Ouverture…';

  @override
  String get knowledgePluginsOpenAppFailed =>
      'Impossible d\'ouvrir l\'application sur cet ordinateur.';

  @override
  String get knowledgePluginsOpenedWebsite =>
      'Application non installée localement — site officiel ouvert sur le nœud domicile.';

  @override
  String get knowledgePluginsDownloadObsidian => 'Télécharger Obsidian';

  @override
  String get knowledgePluginsDownloadNotion => 'Télécharger Notion';

  @override
  String get knowledgePluginsLinkedVaultAutoOne =>
      'Coffre Obsidian lié trouvé sur cet ordinateur.';

  @override
  String knowledgePluginsLinkedVaultAutoMany(int count) {
    return '$count coffres Obsidian liés trouvés sur cet ordinateur.';
  }

  @override
  String get knowledgeHubImportObsidianAll => 'Tout importer (liés)';

  @override
  String get knowledgeHubImportNotionVisible => 'Importer les cartes visibles';

  @override
  String get knowledgeHubExportToObsidian => 'Exporter vers Obsidian';

  @override
  String get knowledgeHubExportToNotion => 'Exporter vers Notion/MCP';

  @override
  String knowledgeHubImportObsidianOk(int count) {
    return '$count note(s) Obsidian importée(s)';
  }

  @override
  String knowledgeHubImportNotionOk(int count) {
    return '$count note(s) Notion/MCP importée(s)';
  }

  @override
  String knowledgeHubExportObsidianOk(int count) {
    return '$count note(s) exportée(s) vers Obsidian';
  }

  @override
  String knowledgeHubExportNotionOk(int count) {
    return '$count note(s) exportée(s) via MCP';
  }

  @override
  String get knowledgeHubImportFailed => 'Échec de l\'importation';

  @override
  String get knowledgeHubExportFailed => 'Échec de l\'exportation';

  @override
  String get knowledgeHubImportMcpEmpty =>
      'Aucune carte MCP en direct à importer — actualisez Parcourir d\'abord';

  @override
  String get knowledgeHubExportEmpty =>
      'Aucune note Markdown du coffre à exporter';

  @override
  String get knowledgeHubShareVaultOnly =>
      'Le partage ne fonctionne que pour les fichiers du coffre — importez d\'abord';

  @override
  String knowledgeHubMcpListError(String error) {
    return 'Liste MCP : $error';
  }

  @override
  String get knowledgeSetupHint =>
      'État de l\'index et récupération. Les modèles de chat restent dans Moi → Modèle IA.';

  @override
  String get knowledgeSetupEmbeddingHint =>
      'Embeddings pour la recherche dans le coffre. Sans modèle, la recherche par mots-clés reste disponible.';

  @override
  String get knowledgeSetupEnabled => 'Activer la base de connaissances';

  @override
  String get knowledgeSetupStatusHint =>
      'Appuyez sur Reconstruire pour rafraîchir l\'index vectoriel.';

  @override
  String get knowledgeSetupReindex => 'Reconstruire l\'index';

  @override
  String get knowledgeSetupReindexDone => 'Réindexation lancée';

  @override
  String get knowledgeSetupReindexConfirm =>
      'Reconstruire l\'index vectoriel du coffre sur le nœud domicile ?';

  @override
  String get knowledgeSetupTestEmbedding => 'Tester l\'embedding';

  @override
  String get knowledgeSetupTestEmbeddingBusy => 'Test…';

  @override
  String knowledgeSetupTestEmbeddingOk(int dimensions, int latencyMs) {
    return 'Embedding OK — $dimensions dims en $latencyMs ms';
  }

  @override
  String knowledgeSetupTestEmbeddingFail(String error) {
    return 'Échec embedding : $error';
  }

  @override
  String get knowledgeSetupRagMode => 'Mode de récupération';

  @override
  String get knowledgeSetupRagHybrid => 'Hybride';

  @override
  String get knowledgeSetupRagVector => 'Vectoriel';

  @override
  String get knowledgeSetupRagLexical => 'Lexical';

  @override
  String get knowledgeSetupSnippetLimit => 'Extraits du coffre par réponse';

  @override
  String knowledgeBrowseIndexIndexingProgress(int processed, int total) {
    return 'Indexation $processed/$total…';
  }

  @override
  String get knowledgeHubOpenPlugins => 'Ouvrir Plugins';

  @override
  String get knowledgeNoteNewTitle => 'Nouvelle note';

  @override
  String get knowledgeNoteEditTitle => 'Modifier la note';

  @override
  String get knowledgeNoteFilename => 'Nom du fichier';

  @override
  String get knowledgeNoteFilenameRequired =>
      'Saisir un nom de fichier de note';

  @override
  String get knowledgeNoteContent => 'Markdown';

  @override
  String get knowledgeNoteSensitivity => 'Visibilité';

  @override
  String get knowledgeNotePrivate => 'Privé';

  @override
  String get knowledgeNoteFriends => 'Amis';

  @override
  String get knowledgeNotePublished => 'Publié';

  @override
  String get knowledgeNoteAlsoBlog => 'Publier aussi comme blog';

  @override
  String get knowledgeFilePreview => 'Aperçu';

  @override
  String get knowledgeFileOpenOnHome => 'Ouvrir sur l\'ordinateur';

  @override
  String get knowledgeFileOpenedOnHome => 'Ouvert sur l\'ordinateur domicile';

  @override
  String get knowledgeFilePublish => 'Publier';

  @override
  String get knowledgeFileMakePrivate => 'Rendre privé';

  @override
  String get knowledgeBrowseImportAndPublish => 'Importer et publier';

  @override
  String get knowledgeBrowsePublishImportOnly => 'Publier uniquement l’import';

  @override
  String get knowledgeBrowsePublishImportNoDoc =>
      'Importé — publication ignorée sans ID de document.';

  @override
  String get knowledgeBrowseImportedAndPublished => 'Importé et publié.';

  @override
  String get knowledgeBrowsePublishImportHint =>
      'Après l’import, publier éventuellement pour vos contacts.';

  @override
  String get knowledgeFileMore => 'Plus d\'actions';

  @override
  String get knowledgeFileConvert => 'Convertir en note Markdown';

  @override
  String knowledgeFileConvertOk(String path) {
    return 'Note Markdown enregistrée : $path';
  }

  @override
  String get knowledgeFileConvertFailed => 'Échec de la conversion en Markdown';

  @override
  String get knowledgeFileDeleteTitle => 'Supprimer le fichier ?';

  @override
  String knowledgeFileDeleteBody(String title) {
    return 'Supprimer « $title » du coffre domicile ?';
  }

  @override
  String get knowledgeFileDeleteConfirm => 'Supprimer';

  @override
  String get meKnowledge => 'Configuration des connaissances';

  @override
  String get meKnowledgeHint => 'Index et récupération pour Questions Vault';

  @override
  String get meKnowledgePlugins => 'Plugins Connaissances';

  @override
  String get meKnowledgePluginsHint => 'Lien Obsidian et Notion/MCP';

  @override
  String get knowledgeBrowseFilterAll => 'Tous';

  @override
  String get knowledgeBrowseFiltersLabel => 'AFFICHER';

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
  String get knowledgeBrowseFilterPublished => 'Publié';

  @override
  String knowledgeBrowseIndexReady(int count) {
    return '$count indexé(s)';
  }

  @override
  String knowledgeBrowseIndexReadyLinked(int count, int linked) {
    return '$count indexé(s) · $linked Obsidian lié(s)';
  }

  @override
  String get knowledgeBrowseIndexIndexing => 'Indexation…';

  @override
  String get knowledgeBrowseIndexEmpty => 'Index vide';

  @override
  String get knowledgeBrowseIndexChipHint =>
      'Ouvrir Connaissances → Configuration pour gérer l\'index.';

  @override
  String get contentNewPost => 'Nouvelle publication';

  @override
  String get chatsTitle => 'Discussions';

  @override
  String get chatsEmpty => 'Aucune conversation';

  @override
  String get chatsEmptyHint => 'Associez votre nœud domicile pour commencer.';

  @override
  String get chatsSearchHint => 'Rechercher des discussions…';

  @override
  String get pairingScanTitle => 'Scanner le QR';

  @override
  String get pairingConfirmTitle => 'Confirmer l\'association';

  @override
  String get pairingFamilyInvite => 'Invitation familiale';

  @override
  String get pairingOwnerPair => 'Association propriétaire';

  @override
  String get engagementLike => 'J\'aime';

  @override
  String get engagementUnlike => 'Je n\'aime plus';

  @override
  String get engagementComment => 'Commenter';

  @override
  String get engagementRemoveComment => 'Supprimer le commentaire ?';

  @override
  String get engagementRemove => 'Supprimer';

  @override
  String get feedDelete => 'Supprimer';

  @override
  String get blogDelete => 'Supprimer';

  @override
  String get blogTitle => 'Blog';

  @override
  String get blogEmpty => 'Aucun article. Écrivez votre premier billet.';

  @override
  String get blogHint => 'Articles plus longs publiés sur le mesh.';

  @override
  String get feedTitle => 'Fil';

  @override
  String get feedComposeTitle => 'Nouvelle publication du fil';

  @override
  String get commonBack => 'Retour';

  @override
  String get commonAccept => 'Accepter';

  @override
  String get commonDecline => 'Refuser';

  @override
  String get commonDismiss => 'Ignorer';

  @override
  String get commonOpen => 'Ouvrir';

  @override
  String get commonRefresh => 'Actualiser';

  @override
  String get commonEdit => 'Modifier';

  @override
  String get commonPost => 'Publier';

  @override
  String get commonPosting => 'Publication…';

  @override
  String get commonPublish => 'Publier';

  @override
  String get commonShare => 'Partager';

  @override
  String get commonSend => 'Envoyer';

  @override
  String get commonClear => 'Effacer';

  @override
  String get commonInvite => 'Inviter';

  @override
  String get commonJoin => 'Rejoindre';

  @override
  String get commonYou => 'Vous';

  @override
  String get commonUnknown => 'Inconnu';

  @override
  String get commonCopied => 'Copié dans le presse-papiers';

  @override
  String get commonNotConnectedHome => 'Non connecté au nœud domicile';

  @override
  String get commonSaving => 'Enregistrement…';

  @override
  String get commonGenerating => 'Génération…';

  @override
  String get commonHide => 'Masquer';

  @override
  String get commonAdd => 'Ajouter';

  @override
  String get commonRemove => 'Retirer';

  @override
  String get commonSearch => 'Rechercher';

  @override
  String get connOffline => 'Hors ligne';

  @override
  String get connDirect => 'Direct';

  @override
  String get connP2p => 'P2P';

  @override
  String get connRelay => 'Relais';

  @override
  String get connLanDirect => 'LAN (direct)';

  @override
  String get connPublicDirect => 'IP publique (direct)';

  @override
  String get connRelayWs => 'WebSocket relais';

  @override
  String get connTooltipDirect => 'Connexion directe';

  @override
  String get connTooltipConnecting => 'Connexion…';

  @override
  String get connTooltipOffline => 'Non connecté';

  @override
  String get connTooltipError => 'Erreur de connexion';

  @override
  String get chatsSectionAi => 'IA';

  @override
  String get chatsSectionCoding => 'Coding';

  @override
  String get chatsCodingPi => 'Pi';

  @override
  String get chatsCodingPiHint => 'Agent de code (terminal)';

  @override
  String get chatsCodingEh => 'Envoy';

  @override
  String get chatsCodingEhHint => 'Agent de code (chat)';

  @override
  String get chatsEhNew => 'Nouveau chat de code';

  @override
  String get chatsEhRemoveTitle => 'Supprimer le chat de code ?';

  @override
  String chatsEhRemoveBody(String name) {
    return 'Retirer « $name » de la liste Coding ? L’historique sur le nœud home sera supprimé.';
  }

  @override
  String get chatsEhThinking => 'Envoy réfléchit…';

  @override
  String get chatsEhPromptHint =>
      'Demandez à Envoy de coder, refactoriser ou expliquer…';

  @override
  String get chatsSectionFamily => 'Famille';

  @override
  String get chatsSectionContacts => 'Contacts';

  @override
  String get chatsSectionGroups => 'Groupes';

  @override
  String get chatsSectionTerminals => 'Terminaux';

  @override
  String get chatsFabNew => 'Nouveau';

  @override
  String get chatsCreateBot => 'Créer un Bot';

  @override
  String get chatsCreateBotHint => 'Personnage IA sur votre nœud domicile';

  @override
  String get chatsNewPi => 'Nouveau Pi';

  @override
  String get chatsNewPiHint => 'Démarrer un terminal Pi';

  @override
  String get chatsNewEnvoy => 'Nouvel Envoy';

  @override
  String get chatsNewEnvoyHint => 'Démarrer le TUI Envoy Harness';

  @override
  String get ehChooseProjectTitle => 'Choisir le dossier projet Envoy';

  @override
  String get ehChangeProjectTitle => 'Changer le dossier projet Envoy';

  @override
  String get ehChooseProjectDesc =>
      'Envoy s’exécute dans ce dossier (lit AGENTS.md, modifie des fichiers, lance le shell).';

  @override
  String get ehStartWithProject => 'Démarrer';

  @override
  String get ehRestartWithProject => 'Redémarrer Envoy ici';

  @override
  String get ehEnsuringTerminal => 'Démarrage du TUI Envoy…';

  @override
  String get ehPermissionTitle => 'Autorisation d’outil';

  @override
  String get ehPermissionAllow => 'Autoriser';

  @override
  String get ehPermissionDeny => 'Refuser';

  @override
  String get ehQuestionTitle => 'Envoy a besoin de votre saisie';

  @override
  String get ehRecommended => 'Recommandé';

  @override
  String get ehSlashWhileBusy =>
      'Terminez ou /cancel le tour en cours d’abord.';

  @override
  String get ehChatReset => 'Nouveau chat démarré pour ce projet.';

  @override
  String get ehTurnCancelled => 'Tour annulé.';

  @override
  String get ehStatusRefreshed => 'État actualisé.';

  @override
  String get ehNoPeers => 'Aucun cluster de pairs configuré.';

  @override
  String get ehSearchUsage =>
      'Usage : /search <terme> — rechercher dans cette conversation.';

  @override
  String ehSearchNoMatches(String term) {
    return 'Aucune correspondance pour « $term ».';
  }

  @override
  String ehModelShow(String model) {
    return 'Modèle actif : $model';
  }

  @override
  String get ehModelUnknown =>
      'Aucun modèle configuré — définissez-en un dans Réglages → IA.';

  @override
  String ehProjectCurrent(String path) {
    return 'Dossier projet : $path';
  }

  @override
  String get ehProjectUnset => 'Aucun dossier projet — utilisez /cd <chemin>.';

  @override
  String ehProjectSet(String path) {
    return 'Dossier projet → $path';
  }

  @override
  String get ehProjectSetUnknown => 'Dossier projet mis à jour.';

  @override
  String ehProjectSetFailed(String error) {
    return 'Échec de définition du dossier projet : $error';
  }

  @override
  String get ehConfigureModel => 'Configurez un modèle dans Réglages → IA.';

  @override
  String get ehNotReady => 'envoy-harness n’est pas prêt.';

  @override
  String get termQuickHelp => '/help';

  @override
  String get termQuickCancel => '/cancel';

  @override
  String get chatsNewTerminal => 'Nouveau terminal';

  @override
  String get chatsNewTerminalHint => 'Ouvrir un shell sur le nœud domicile';

  @override
  String get chatsNewGroup => 'Nouveau groupe';

  @override
  String get chatsNewGroupHint => 'Groupe mesh avec contacts liés';

  @override
  String get chatsNewFamilyGroup => 'Nouveau groupe familial';

  @override
  String get chatsNewFamilyGroupHint =>
      'Groupe local avec les membres de la famille';

  @override
  String get chatsDeleteBotTitle => 'Supprimer le Bot ?';

  @override
  String chatsDeleteBotBody(String name) {
    return 'Retirer « $name » de votre nœud domicile ? Action irréversible.';
  }

  @override
  String get chatsBotOptions => 'Options du Bot';

  @override
  String get chatsEditBot => 'Modifier le Bot';

  @override
  String get chatsBotNameRequired => 'Le nom du Bot est requis';

  @override
  String get chatsBotPromptRequired => 'Personnalité / prompt système requis';

  @override
  String get chatsBotName => 'Nom du Bot';

  @override
  String get chatsBotNameHint => 'ex. Luna la bibliothécaire';

  @override
  String get chatsBotPrompt => 'Personnalité / prompt système';

  @override
  String get chatsBotPromptHint =>
      'Écrivez comme le personnage (« Vous êtes… »). Évitez « Luna est… » ou « Je suis une IA… ». Reformulé à l\'enregistrement.';

  @override
  String get chatsBotDesc => 'Courte description (facultatif)';

  @override
  String get chatsBotDescHint =>
      'Une ligne pour la liste des chats. Laissez vide pour remplir depuis la personnalité.';

  @override
  String get chatsAvatarColor => 'Couleur d\'avatar';

  @override
  String get chatsShellHint => 'Shell (ex. zsh, bash)';

  @override
  String get chatsCwdHint => 'Répertoire de travail (facultatif)';

  @override
  String get chatsPiTitle => 'Démarrer Pi';

  @override
  String get chatsPiBody =>
      'Choisissez un dossier projet sur l\'ordinateur domicile pour ouvrir le terminal Pi.';

  @override
  String get chatsPiFolder => 'Dossier projet';

  @override
  String get chatsPiFolderHint => '/Users/vous/projet';

  @override
  String get chatsPiFolderRequired => 'Entrez un chemin de dossier projet.';

  @override
  String get chatsGroupName => 'Nom du groupe';

  @override
  String get chatsNoFamilyMembers =>
      'Pas encore d\'autres membres de la famille.';

  @override
  String get chatVoiceCall => 'Appel vocal';

  @override
  String get chatVideoCall => 'Appel vidéo';

  @override
  String get chatPublishedContent => 'Contenu publié';

  @override
  String get chatClearThread => 'Effacer le fil';

  @override
  String get chatClearThreadTitle => 'Effacer le fil ?';

  @override
  String get chatClearThreadBody =>
      'Tous les messages de ce fil seront supprimés.';

  @override
  String get chatAiManual => 'Manuel';

  @override
  String get chatAiAssistant => 'Assistant';

  @override
  String get chatAiAuto => 'Auto';

  @override
  String get chatAiManualTooltip => 'Manuel : écrivez vous-même';

  @override
  String get chatAiAssistantTooltip =>
      'Assistant : l\'IA suggère des brouillons';

  @override
  String get chatAiAutoTooltip => 'Réponse auto : l\'IA répond automatiquement';

  @override
  String get chatAgentMode => 'Agent';

  @override
  String get chatAgentModeOffTooltip =>
      'Mode Agent désactivé — l\'assistant n\'utilise que les connaissances publiques';

  @override
  String get chatAgentModeOnTooltip =>
      'Mode Agent activé — OpenClaw peut utiliser les fichiers du domicile, les connaissances privées et les outils';

  @override
  String get chatAgentModeConfirmTitle =>
      'Activer le mode Agent pour ce chat ?';

  @override
  String get chatAgentModeConfirmBody =>
      'Le mode Agent utilise EnvoyAI/OpenClaw et peut lire les fichiers locaux, les connaissances privées et exécuter des outils sur votre nœud domicile. Activez-le uniquement pour les contacts en qui vous avez une confiance totale.';

  @override
  String get chatAgentModeConfirmEnable => 'Activer le mode Agent';

  @override
  String get chatSuggestedReply => 'Réponse suggérée';

  @override
  String get chatSuggestedReplyUse => 'Utiliser';

  @override
  String get chatSuggestedReplyDismiss => 'Ignorer';

  @override
  String get chatDeleteMessageTitle => 'Supprimer le message ?';

  @override
  String get chatNoMessages => 'Aucun message';

  @override
  String get chatTypeMessage => 'Écrire un message…';

  @override
  String get chatRecordVoice => 'Enregistrer une note vocale';

  @override
  String get chatStopRecording => 'Arrêter l\'enregistrement';

  @override
  String get chatInviteToGroup => 'Inviter au groupe';

  @override
  String get chatNoContactsInvite => 'Aucun contact à inviter.';

  @override
  String chatInvitedSnack(String name) {
    return '$name invité';
  }

  @override
  String get chatVoiceSending => 'Envoi de la note vocale…';

  @override
  String get chatVoiceSent => 'Note vocale envoyée';

  @override
  String get chatVoiceRecording => 'Enregistrement';

  @override
  String get chatVoiceReady => 'Prête à envoyer';

  @override
  String get chatVoiceCancel => 'Annuler';

  @override
  String get chatVoiceSend => 'Envoyer';

  @override
  String get chatVoiceSendHint => 'Envoyer pour terminer · Annuler pour jeter';

  @override
  String get chatVoiceReadyHint =>
      'Échec · Envoyer pour réessayer · Annuler pour jeter';

  @override
  String get chatVoiceSendFailed => 'Échec de l\'envoi de la note vocale';

  @override
  String get chatSentFile => 'Fichier envoyé';

  @override
  String get chatSentVoice => 'Message vocal envoyé';

  @override
  String get chatDeliverySent => 'Envoyé';

  @override
  String get chatDeliveryDelivered => 'Distribué';

  @override
  String get chatDeliveryFailed => 'Non distribué';

  @override
  String get chatMicDenied => 'Autorisation du micro refusée';

  @override
  String get chatRecordFailed => 'Échec du démarrage de l\'enregistrement';

  @override
  String get chatCallFailed => 'Échec du démarrage de l\'appel';

  @override
  String get chatAiDisabled =>
      'Modèle IA désactivé. Activez un fournisseur dans Paramètres → IA.';

  @override
  String get chatAiDisabledFamily => 'IA indisponible pour ce profil familial.';

  @override
  String get inboxPublishedUpdates => 'Mises à jour publiées';

  @override
  String get inboxPublishedEmpty =>
      'Aucune notification de publication. Quand un contact lié publie du contenu web, il apparaît ici.';

  @override
  String get inboxPendingIntros => 'Présentations en attente';

  @override
  String get inboxPendingEmpty => 'Aucune présentation en attente';

  @override
  String get inboxWantsToConnect => 'Souhaite se connecter';

  @override
  String get pairingInvalidQr => 'QR code d\'association invalide';

  @override
  String get pairingPasteUri => 'Ou coller l\'URI d\'association';

  @override
  String get pairingUriHint => 'envoy://pair?… ou envoy://invite?…';

  @override
  String get pairingNeedHomeHint =>
      'Créer votre propre foyer ? Installez d\'abord EnvoyMesh sur un Mac ou PC Windows, puis scannez son QR. Rejoindre une famille ? Scannez leur invitation — pas d\'installation PC nécessaire.';

  @override
  String get pairingDownloadEnvoyMesh =>
      'Téléchargements EnvoyMesh (ordinateur)';

  @override
  String get pairingJoinFamily => 'Rejoindre la famille';

  @override
  String pairingConnectTo(String name) {
    return 'Se connecter à $name ?';
  }

  @override
  String pairingWelcomeFamily(String name) {
    return 'Bienvenue dans la famille $name !';
  }

  @override
  String get pairingImNew => 'Je suis nouveau';

  @override
  String get pairingImBack => 'Je reviens';

  @override
  String get pairingDisplayNameOptional => 'Nom affiché (facultatif)';

  @override
  String get pairingYourName => 'Votre nom';

  @override
  String get pairingAvatarColor => 'Couleur d\'avatar';

  @override
  String get pairingOwnerNameHint =>
      'Affiché comme nom de profil propriétaire sur ce nœud';

  @override
  String get pairingCopyError => 'Erreur de copie';

  @override
  String get pairingRetryMembers => 'Réessayer de charger les membres';

  @override
  String get pairingWhoAreYou => 'Qui êtes-vous ?';

  @override
  String get pairingAlreadyOnHome => 'Déjà sur ce domicile';

  @override
  String get pairingSelectProfile => 'Sélectionnez votre profil';

  @override
  String get pairingNoMembersFirst =>
      'Pas encore de membres — vous serez le premier.';

  @override
  String get pairingNoExistingProfiles =>
      'Aucun profil familial existant. Passez à « Je suis nouveau » pour en créer un.';

  @override
  String get pairingNameRequired => 'Veuillez entrer votre nom';

  @override
  String get pairingSelectRequired => 'Veuillez sélectionner votre profil';

  @override
  String get pairingLanAvailable => 'LAN : disponible';

  @override
  String get pairingRelayAvailable => 'Relais : disponible';

  @override
  String pairingPeer(String peer) {
    return 'Pair : $peer';
  }

  @override
  String get pairingNameHintDad => 'ex. Papa';

  @override
  String get pairingNameHintMom => 'ex. Maman, Alex';

  @override
  String get pairingChooseUniqueName =>
      'Choisissez un nom pas déjà utilisé ci-dessous.';

  @override
  String get pairingSameNameHint =>
      'Utilisez le même nom que sur votre premier téléphone.';

  @override
  String get pairingTapIfSecondPhone =>
      'Appuyez sur un nom si c\'est votre second téléphone (Je reviens).';

  @override
  String get feedEmptyTitle => 'Votre cercle est calme';

  @override
  String get feedEmptyHint =>
      'Aucune publication. Partagez une mise à jour avec vos contacts liés.';

  @override
  String get feedHint => 'Mises à jour de vous et de vos contacts liés.';

  @override
  String get feedDeleteTitle => 'Supprimer la publication ?';

  @override
  String get feedDeleteBody => 'Action irréversible.';

  @override
  String get blogPairHint =>
      'Associez un nœud domicile pour écrire et gérer les articles Blog.';

  @override
  String get blogConnectHint =>
      'Connectez-vous à un nœud domicile pour gérer le Blog.';

  @override
  String get blogDeleteTitle => 'Supprimer l\'article ?';

  @override
  String blogDeleteBody(String title) {
    return 'Supprimer « $title » ? Action irréversible.';
  }

  @override
  String get feedWhatsOnMind => 'Qu\'avez-vous en tête ?';

  @override
  String get feedShareHint =>
      'Partagez une mise à jour avec vos contacts liés…';

  @override
  String get feedPhotos => 'Photos';

  @override
  String get feedVisibility => 'Visibilité';

  @override
  String get feedVisBonded => 'Contacts liés';

  @override
  String get feedVisSelected => 'Contacts sélectionnés';

  @override
  String get feedVisOnlyMe => 'Moi seulement';

  @override
  String get feedNeedTextOrPhoto => 'Ajoutez du texte ou au moins une photo';

  @override
  String get feedNeedContact => 'Sélectionnez au moins un contact';

  @override
  String get feedSelectedHint =>
      'Seuls ces contacts peuvent voir cette publication. Choisissez au moins un.';

  @override
  String get feedNoContacts =>
      'Pas encore de contacts liés — ajoutez-en un, ou choisissez Liés / Moi seulement.';

  @override
  String get feedAiDraft => 'Brouillon IA';

  @override
  String get feedDiscard => 'Abandonner';

  @override
  String get feedInsert => 'Insérer';

  @override
  String get feedReplace => 'Remplacer';

  @override
  String get peoplePairHint =>
      'Associez un nœud domicile pour découvrir des personnes sur le mesh.';

  @override
  String get peopleConnectHint =>
      'Connectez-vous à un nœud domicile pour découvrir des personnes.';

  @override
  String get peopleHint =>
      'Trouvez des personnes non liées — ouvrez leur profil ou blog public, puis dites bonjour.';

  @override
  String get peopleTopic => 'Sujet';

  @override
  String get peopleInterest => 'Intérêt';

  @override
  String get peopleTopicHint => 'musique, code, voyage…';

  @override
  String get peopleInterestHint => 'photo, cuisine, voyage…';

  @override
  String get peopleOnMesh => 'Personnes sur le mesh';

  @override
  String get peopleResults => 'Résultats';

  @override
  String get peopleEmpty => 'Aucune personne à afficher.';

  @override
  String get peopleProfile => 'Profil';

  @override
  String get peopleBlog => 'Blog';

  @override
  String get peopleSayHello => 'Dire bonjour';

  @override
  String get peopleHelloSent => 'Bonjour envoyé';

  @override
  String get peopleEnterSearch =>
      'Entrez un sujet ou un intérêt pour rechercher.';

  @override
  String get peopleNoMatches => 'Aucun résultat pour cette recherche.';

  @override
  String get peopleNoneFound => 'Aucune personne publique trouvée sur le mesh.';

  @override
  String get peopleHelloMessage =>
      'Bonjour — j\'aimerais me connecter sur Envoy.';

  @override
  String get peopleOpenLink => 'Ouvrir le lien';

  @override
  String get filesPairHint =>
      'Associez un nœud domicile pour gérer Mes fichiers.';

  @override
  String get filesConnectHint =>
      'Connectez-vous à un nœud domicile pour gérer les fichiers.';

  @override
  String get filesSearchHint => 'Rechercher dans la bibliothèque';

  @override
  String get filesVaultHint =>
      'Bibliothèque Vault — pièces jointes et photos de profil restent dans chat / Profil';

  @override
  String get filesEmpty => 'Aucun fichier dans la bibliothèque.';

  @override
  String filesImported(String name) {
    return '$name importé';
  }

  @override
  String filesImportFailed(String error) {
    return 'Échec de l\'import : $error';
  }

  @override
  String filesPreviewFailed(String error) {
    return 'Échec de l\'aperçu : $error';
  }

  @override
  String get filesNoContactsShare => 'Aucun contact lié avec qui partager';

  @override
  String get filesShareWith => 'Partager avec…';

  @override
  String get filesShareSent => 'Partage envoyé';

  @override
  String filesShareFailed(String error) {
    return 'Échec du partage : $error';
  }

  @override
  String get filesImport => 'Importer';

  @override
  String filesPreviewUnavailable(String mime, int bytes) {
    return 'Aperçu indisponible pour $mime ($bytes octets).';
  }

  @override
  String publishedTitle(String name) {
    return 'Contenu publié — $name';
  }

  @override
  String get publishedPhotoWall => 'Mur de photos';

  @override
  String get publishedFeed => 'Fil';

  @override
  String get engagementCommentHint => 'Écrire un commentaire…';

  @override
  String get engagementRemoveCommentTooltip => 'Supprimer le commentaire';

  @override
  String get profileTitle => 'Profil';

  @override
  String get profileMyTitle => 'Mon profil';

  @override
  String get profileUnnamed => 'Sans nom';

  @override
  String get profileRemovePhotoTitle => 'Supprimer la photo ?';

  @override
  String get profileNameRequired => 'Nom affiché ou nom d\'utilisateur requis';

  @override
  String get profileSaved => 'Profil enregistré';

  @override
  String get profileUsername => 'Nom d\'utilisateur';

  @override
  String get profileBio => 'Bio';

  @override
  String get profileBioHint =>
      'Ajoutez une courte bio pour que vos contacts vous reconnaissent.';

  @override
  String get profilePhotos => 'Photos';

  @override
  String get profileNoPhotosYet =>
      'Pas encore de photos — ajoutez-en une à votre mur';

  @override
  String get profileNoPhotosShared => 'Aucune photo partagée';

  @override
  String get profileLongPressRemove =>
      'Appui long sur une photo pour la supprimer';

  @override
  String get contactsSearchHint => 'Rechercher des contacts…';

  @override
  String get contactsEmpty => 'Aucun contact';

  @override
  String get contactsEmptyHint => 'Vos contacts liés apparaîtront ici.';

  @override
  String get contactsChat => 'Discuter';

  @override
  String get callIncoming => 'Appel vocal entrant';

  @override
  String get callConnected => 'Connecté';

  @override
  String get callConnecting => 'Connexion…';

  @override
  String get callDisconnected => 'Déconnecté';

  @override
  String get callSwitchCamera => 'Changer de caméra';

  @override
  String get authorPublish => 'Publier';

  @override
  String get authorType => 'Type';

  @override
  String get authorTypeProfile => 'Profil';

  @override
  String get authorTypePhoto => 'Photo du mur';

  @override
  String get authorTypeBlog => 'Article Blog';

  @override
  String get authorVisPublic => 'Public';

  @override
  String get authorVisBonded => 'Lié';

  @override
  String get authorVisPrivate => 'Privé';

  @override
  String get authorCaption => 'Légende';

  @override
  String get authorCaptionOptional => 'Légende (facultatif)';

  @override
  String get authorBody => 'Corps';

  @override
  String get authorBodyMarkdown => 'Corps (markdown)';

  @override
  String get authorTitle => 'Titre';

  @override
  String get authorTitleRequired => 'Le titre est requis';

  @override
  String get authorPickPhoto => 'Choisissez d\'abord une photo';

  @override
  String get authorChooseAvatar => 'Choisir un avatar';

  @override
  String get authorChoosePhoto => 'Choisir une photo';

  @override
  String get aiDraftButton => 'Rédiger avec l\'IA';

  @override
  String get aiDraftEmphasize => 'Que mettre en avant ? (facultatif)';

  @override
  String get aiDraftEmphasizeHint => 'ex. randonnée du week-end avec des amis';

  @override
  String get aiDraftMode => 'Mode';

  @override
  String get aiDraftTone => 'Ton';

  @override
  String get aiDraftRewrite => 'Réécrire';

  @override
  String get aiDraftExpand => 'Développer';

  @override
  String get aiDraftShorten => 'Raccourcir';

  @override
  String get aiDraftGenerate => 'Générer';

  @override
  String get aiDraftNoModel =>
      'Aucun modèle IA configuré sur le nœud domicile.';

  @override
  String get aiDraftEmpty => 'Brouillon vide du modèle';

  @override
  String get aiDraftBio => 'Rédiger la bio';

  @override
  String get aiDraftBlog => 'Rédiger l\'article Blog';

  @override
  String get aiDraftFeed => 'Rédiger la mise à jour du fil';

  @override
  String get aiDraftCaption => 'Rédiger la légende';

  @override
  String get settingsAiModelIntro =>
      'Fournisseur cloud pour l\'assistant du nœud domicile. Les changements s\'appliquent au prochain tour.';

  @override
  String settingsHomeUses(String mode) {
    return 'Le domicile utilise $mode';
  }

  @override
  String get settingsEndpoint => 'Endpoint :';

  @override
  String get settingsModelLabel => 'Modèle :';

  @override
  String get settingsEditOnSocial =>
      'Modifiez ce fournisseur dans l\'UI Social du nœud domicile pour les options avancées.';

  @override
  String get settingsProvider => 'Fournisseur';

  @override
  String get settingsEndpointUrl => 'URL de l\'endpoint';

  @override
  String get settingsModel => 'Modèle';

  @override
  String get settingsCustomModel => 'Nom de modèle personnalisé';

  @override
  String get settingsApiKey => 'Clé API';

  @override
  String get settingsApiKeySaved =>
      'Une clé est déjà enregistrée sur le nœud domicile';

  @override
  String get settingsAiModelSaved => 'Modèle IA enregistré';

  @override
  String get settingsAiModelTestChat => 'Tester le modèle chat';

  @override
  String get settingsAiModelTestChatBusy => 'Test…';

  @override
  String settingsAiModelTestChatOk(String modelName, int latencyMs) {
    return 'Modèle chat OK — $modelName en $latencyMs ms';
  }

  @override
  String settingsAiModelTestChatFail(String error) {
    return 'Échec modèle chat : $error';
  }

  @override
  String settingsSaveFailed(String error) {
    return 'Échec de l\'enregistrement : $error';
  }

  @override
  String get settingsDefault => '(par défaut)';

  @override
  String get settingsAiEngineIntro =>
      'Choisissez l\'agent externe auquel le nœud domicile transmet les tours de l\'assistant.';

  @override
  String get settingsExternalAgent => 'Agent externe';

  @override
  String get settingsWebhookUrl => 'URL Webhook';

  @override
  String get settingsHowToStart => 'Comment démarrer';

  @override
  String get settingsBuiltIntoHome => 'Intégré au nœud domicile';

  @override
  String get settingsNoExtProcess => 'Aucun processus Ext Agent séparé requis.';

  @override
  String get settingsBridgePort => 'Port d\'écoute Bridge';

  @override
  String get settingsBridgeEnabled => 'Bridge activé';

  @override
  String get settingsBridgeHint =>
      'Transmet les tours de l\'assistant à l\'agent externe sélectionné.';

  @override
  String get settingsOpenClawEnabled => 'OpenClaw activé';

  @override
  String get settingsOpenClawHint =>
      'Passerelle OpenClaw intégrée (EnvoyAI) au prochain démarrage du nœud.';

  @override
  String get settingsOpenClawUnavailable => 'Statut OpenClaw indisponible';

  @override
  String settingsOpenClawStatus(String state) {
    return 'OpenClaw $state';
  }

  @override
  String settingsExtAgentStatus(String state) {
    return 'Agent Ext $state';
  }

  @override
  String get settingsEnabled => 'activé';

  @override
  String get settingsDisabled => 'désactivé';

  @override
  String get settingsAiEngineSaved => 'Moteur IA enregistré';

  @override
  String get settingsNotConnectedNode => 'Non connecté à un nœud domicile';

  @override
  String settingsPiState(String state) {
    return 'État : $state';
  }

  @override
  String get settingsPiBuiltIn => 'Agents de code locaux';

  @override
  String get settingsPiLocalOnly =>
      'Pi sert au Terminal et à Ext Agent. Envoy Harness gère le chat de code et est toujours disponible dans le Terminal.';

  @override
  String get settingsPiEnabled => 'Activer Pi';

  @override
  String get settingsPiCodingBackend => 'Moteur actif';

  @override
  String get settingsPiCodingBackendPi => 'Pi (sidecar)';

  @override
  String get settingsPiCodingBackendEh => 'envoy-harness (ACP)';

  @override
  String get settingsPiCodingBackendHint =>
      'Quel moteur reçoit le chat de code et les approbations. N\'efface pas l\'autre.';

  @override
  String get settingsPiCodingBackendSaved => 'Moteur actif mis à jour';

  @override
  String get settingsPiSectionTitle => 'Pi';

  @override
  String get settingsPiSectionHint =>
      'Sidecar pour Terminal et Ext Agent — activation et modèle personnalisé';

  @override
  String get settingsEhSectionTitle => 'Envoy Harness';

  @override
  String get settingsEhSectionHint =>
      'Gère le chat de code et toujours disponible dans le Terminal — auto-exécution (dossier projet dans le chat Envoy)';

  @override
  String get settingsEhAutoRunPolicy => 'Auto-exécution Envoy Harness';

  @override
  String get settingsEhAutoRunAlways => 'Toujours confirmer';

  @override
  String get settingsEhAutoRunSafe => 'Confirmer seulement le destructif';

  @override
  String get settingsEhAutoRunOff => 'Désactivé — toujours prévisualiser';

  @override
  String get settingsEhAutoRunNever => 'Ne jamais demander (tout autoriser)';

  @override
  String get settingsEhAutoRunSaved =>
      'Auto-exécution Envoy Harness mise à jour';

  @override
  String get settingsEhActiveBadge => 'actif';

  @override
  String get settingsPiOverrideHint =>
      'Remplacement de modèle Pi (facultatif). Effacez pour hériter.';

  @override
  String get settingsPiModelName => 'Nom du modèle';

  @override
  String get settingsPiEndpoint => 'Endpoint';

  @override
  String get settingsPiLeaveBlankKey =>
      'Laisser vide pour conserver la clé enregistrée';

  @override
  String get settingsPiSaveOverride => 'Enregistrer le remplacement';

  @override
  String get settingsPiClearOverride =>
      'Effacer le remplacement (hériter du modèle IA)';

  @override
  String get settingsPiModelSaved => 'Modèle Pi enregistré';

  @override
  String get settingsPiModelRequired => 'Le nom du modèle est requis';

  @override
  String get settingsPiInherits =>
      'Pi hérite des paramètres de modèle EnvoyMesh';

  @override
  String settingsPiFailed(String error) {
    return 'Échec : $error';
  }

  @override
  String settingsPiClearFailed(String error) {
    return 'Échec de l\'effacement : $error';
  }

  @override
  String settingsPiProviderCustom(String provider) {
    return '$provider (personnalisé)';
  }

  @override
  String get aiEngineReadonlyHint =>
      'Les deux blocs sont en lecture seule sur mobile. Configurez sur le nœud domicile (Paramètres → IA → Moteur IA).';

  @override
  String get aiEngineBuiltInOpenClaw => 'OpenClaw intégré';

  @override
  String get aiEngineExtBridge => 'Pont Agent externe';

  @override
  String get aiEngineModeBoth => 'Intégré + Ext';

  @override
  String get aiEngineModeBuiltIn => 'Intégré seulement';

  @override
  String get aiEngineModeExt => 'Ext seulement';

  @override
  String get aiEngineModeNone => 'Aucun';

  @override
  String get aiEngineRunning => 'En cours';

  @override
  String get aiEngineConfigured => 'Configuré (non actif)';

  @override
  String get aiEngineDisabled => 'Désactivé';

  @override
  String get browserTitle => 'Navigateur';

  @override
  String get browserGo => 'Aller';

  @override
  String get browserBack => 'Retour';

  @override
  String get browserForward => 'Avancer';

  @override
  String get browserReload => 'Recharger';

  @override
  String get browserPairFirst =>
      'Non connecté au nœud domicile — associez et reconnectez d\'abord.';

  @override
  String get browserIntegrityFailed =>
      'Échec du contrôle d\'intégrité — rendu refusé';

  @override
  String browserDecodeImageFailed(String error) {
    return 'Échec du décodage de l\'image : $error';
  }

  @override
  String get browserPhoto => 'Photo';

  @override
  String get browserPhotos => 'Photos';

  @override
  String get browserNoPhotos => 'Pas encore de photos.';

  @override
  String get browserHint =>
      'Entrez une URL envoy:// pour parcourir le contenu d\'un contact lié.';

  @override
  String get extSwitchTitle => 'Changer d\'Ext Agent';

  @override
  String extSwitchTooltip(String name) {
    return 'Changer d\'Ext Agent ($name)';
  }

  @override
  String extNotRunningChat(String name) {
    return '$name n\'est pas actif — démarrez-le avant de discuter.';
  }

  @override
  String extSwitchFailed(String error) {
    return 'Échec du changement : $error';
  }

  @override
  String extNotRunning(String name) {
    return '$name n\'est pas actif';
  }

  @override
  String get extChecking => 'Vérification…';

  @override
  String get extCheckAgain => 'Revérifier';

  @override
  String get audioLoading => 'Chargement de l\'audio…';

  @override
  String get audioUnavailable => 'Audio indisponible';

  @override
  String get audioVoiceNote => 'Note vocale';

  @override
  String meLastAttempt(String time) {
    return 'Dernière tentative : $time';
  }

  @override
  String get meJustNow => 'à l\'instant';

  @override
  String get mePublicIpLabel => 'IP publique ou domaine';

  @override
  String get mePublicIpHint => 'ex. 1.2.3.4 ou mynode.example.com';

  @override
  String get mePublicIpHelp =>
      'Définissez ceci si votre nœud domicile a une IP publique ou un domaine.\nPermet une connexion directe sans relais en 5G/WAN.';

  @override
  String get meNetworkDebug => 'Débogage réseau';

  @override
  String get meRunNetworkTests => 'Lancer les tests réseau';

  @override
  String get meTesting => 'Test en cours…';

  @override
  String get meNetworkTestsHint =>
      'Teste tous les chemins qu\'EnvoyGo utilise pour l\'association.';

  @override
  String get meSwitchNode => 'Changer de nœud';

  @override
  String get chainsRecentTitle => 'Jobs d\'équipe récents';

  @override
  String get chainsActiveTitle => 'Jobs d\'équipe actifs';

  @override
  String get chainsLoadFailed => 'Échec du chargement des chaînes';

  @override
  String get chainsNoReports => 'Pas encore de rapports';

  @override
  String get chainsEmptyHint =>
      'Les jobs d\'équipe lancés sur le nœud domicile apparaîtront ici.\nCréez-les depuis l\'UI Social du nœud domicile.';

  @override
  String get chainsNoActive =>
      'Aucune chaîne active sur le nœud domicile.\nDémarrez-en une depuis l\'UI Social.';

  @override
  String get chainsReportGone => 'Ce rapport n\'est plus disponible';

  @override
  String get chainsReportGoneHint =>
      'Il a peut-être été supprimé par la politique GC de 90 jours.';

  @override
  String get chainsBackToRecent => 'Retour aux jobs d\'équipe récents';

  @override
  String get chainsLoadReportFailed => 'Échec du chargement du rapport';

  @override
  String get chainsSummary => 'Résumé';

  @override
  String get chainsWorkers => 'Workers';

  @override
  String get chainsSubtasks => 'Sous-tâches';

  @override
  String get chainsSynthesis => 'Synthèse';

  @override
  String get chainsDuration => 'Durée';

  @override
  String get chainsManageOnSocial =>
      'La configuration de flotte, les enchères et les recettes restent sur l’UI Social du nœud domicile. Annuler, rééquilibrer et épingler marchent aussi ici.';

  @override
  String get chainsStartTitle => 'Démarrer un job d\'équipe';

  @override
  String get chainsStartFab => 'Nouveau job d\'équipe';

  @override
  String get chainsStartIntro =>
      'Décrivez un objectif. Le nœud domicile planifie les sous-tâches et attribue des workers Agent Network liés.';

  @override
  String get chainsStartAssignmentMode => 'Mode d\'attribution';

  @override
  String get chainsStartModeSkill => 'Par compétence';

  @override
  String get chainsStartModeRole => 'Par rôle';

  @override
  String get chainsStartModeSkillHint =>
      'Les workers sont classés par compétences correspondantes.';

  @override
  String get chainsStartModeRoleHint =>
      'Chaque étape privilégie un rôle (PM, développeur, …).';

  @override
  String get chainsStartTeamStrategy => 'Stratégie d’équipe';

  @override
  String get chainsStartTeamStrategyHint =>
      'Comment les workers sont choisis pour cette tâche.';

  @override
  String get chainsStrategyBalanced => 'Équilibrée';

  @override
  String get chainsStrategyFastest => 'La plus rapide';

  @override
  String get chainsStrategyCheapest => 'La moins chère';

  @override
  String get chainsStrategyHighestConfidence => 'Confiance la plus élevée';

  @override
  String get chainsStrategyPrivacyLocal => 'Confidentialité (local)';

  @override
  String get chainsStrategyDiverseModel => 'Diversité de modèles';

  @override
  String get chainsStartAvailLease => 'Bail prêt';

  @override
  String get chainsStartAvailLegacy => 'Disponibilité héritée';

  @override
  String chainsStartReliabilityPct(int pct) {
    return 'Confiance $pct%';
  }

  @override
  String chainsStartReliabilitySparse(String level, int samples) {
    return '$level · $samples échantillons';
  }

  @override
  String get chainsStartReliabilityFallbackExact => 'historique de ce worker';

  @override
  String get chainsStartReliabilityFallbackPeerRuntimeSkill =>
      'travail similaire sur ce worker';

  @override
  String get chainsStartReliabilityFallbackPeerRuntime =>
      'runtime de ce worker';

  @override
  String get chainsStartReliabilityFallbackRuntimeSkill =>
      'workers avec cette compétence';

  @override
  String get chainsStartReliabilityFallbackPrior =>
      'a priori général (aucun historique pour l’instant)';

  @override
  String get chainsStartGoalLabel => 'Objectif';

  @override
  String get chainsStartGoalHint => 'Que doit accomplir l\'équipe ?';

  @override
  String chainsStartGoalTooShort(int min) {
    return 'L\'objectif doit comporter au moins $min caractères';
  }

  @override
  String get chainsStartAttachmentsLabel => 'Pièces jointes';

  @override
  String get chainsStartAttachmentsAdd => 'Ajouter des fichiers';

  @override
  String get chainsStartAttachmentsHint =>
      'Astuce : ajoutez un court libellé par fichier (ex. brief), puis citez [brief] dans l\'objectif pour indiquer quel fichier utiliser — même si le nom est long ou peu clair.';

  @override
  String chainsStartAttachmentsMax(int max) {
    return 'Vous pouvez joindre jusqu\'à $max fichiers';
  }

  @override
  String chainsStartAttachmentTooLarge(String name, int maxMb) {
    return '$name est trop volumineux (max. $maxMb Mo)';
  }

  @override
  String get chainsStartAttachmentUploading => 'Envoi…';

  @override
  String get chainsStartAttachmentFailed => 'Échec de l\'envoi';

  @override
  String get chainsStartAttachmentLabel => 'Libellé';

  @override
  String get chainsStartAttachmentLabelHint => 'ex. brief, données ventes';

  @override
  String get chainsStartAttachmentRemove => 'Retirer la pièce jointe';

  @override
  String get chainsStartPreview => 'Prévisualiser le plan';

  @override
  String get chainsStartPreviewing => 'Planification…';

  @override
  String get chainsStartPreviewFailed => 'Impossible de construire un plan';

  @override
  String get chainsStartNeedPreview =>
      'Prévisualisez un plan avant de démarrer';

  @override
  String get chainsStartPlanHeading => 'Plan';

  @override
  String get chainsStartNoSubtasks => 'Aucune sous-tâche dans ce plan.';

  @override
  String get chainsStartConfirm => 'Démarrer le job d\'équipe';

  @override
  String get chainsStartStarting => 'Démarrage…';

  @override
  String get chainsStartStarted => 'Job d\'équipe démarré';

  @override
  String get chainsStartFailed => 'Impossible de démarrer le job d\'équipe';

  @override
  String get chainsStartNoWorkers =>
      'Aucun worker Agent Network joignable. Liez d\'abord des contacts avec des agents sur le nœud domicile.';

  @override
  String get chainsTestNetworkTitle => 'Tester le réseau d’agents';

  @override
  String get chainsTestNetworkHint =>
      'Court test labo des chemins du réseau d’agents sur ce nœud.';

  @override
  String get chainsTestNetworkRun => 'Lancer le test';

  @override
  String get chainsTestNetworkRunning => 'Test en cours…';

  @override
  String get chainsTestNetworkFailed => 'Échec du test réseau.';

  @override
  String get chainsSpeculationReviewTitle =>
      'Les résultats ne correspondent pas';

  @override
  String get chainsSpeculationReviewBody =>
      'Deux membres de l\'équipe ont terminé cette étape avec des résultats différents. Choisissez un résultat ci-dessous, réassignez l\'étape ou continuez automatiquement.';

  @override
  String get chainsSpeculationReviewNonePass =>
      'Aucun résultat n\'a passé les contrôles. Choisissez la meilleure tentative, réassignez l\'étape ou continuez automatiquement.';

  @override
  String get chainsSpeculationReviewDisagree =>
      'Les deux résultats ne correspondent pas. Choisissez un résultat, réassignez l\'étape ou continuez automatiquement.';

  @override
  String get chainsSpeculationReviewPick => 'Utiliser ce résultat';

  @override
  String get chainsSpeculationReviewReassign => 'Réassigner l\'étape';

  @override
  String get chainsSpeculationReviewAutoResolve => 'Continuer automatiquement';

  @override
  String get chainsSpeculationReviewResolved =>
      'Sélection enregistrée — la mission continue.';

  @override
  String get chainsSpeculationReviewFailed =>
      'Impossible de résoudre cette étape';

  @override
  String get chainsSpeculationRolePrimary => 'Principal';

  @override
  String get chainsSpeculationRoleSpeculative => 'Exécution de secours';

  @override
  String get chainsSpeculationRoleReplacement => 'Remplacement';

  @override
  String get chainsStepStatePending => 'En attente';

  @override
  String get chainsStepStateOffered => 'Proposé';

  @override
  String get chainsStepStateAwarded => 'Assigné';

  @override
  String get chainsStepStateRunning => 'En cours';

  @override
  String get chainsStepStateDone => 'Terminé';

  @override
  String get chainsStepStateFailed => 'Échec';

  @override
  String get chainsStepStateCancelled => 'Annulé';

  @override
  String get chainsWorkerEngineFailed =>
      'Le moteur IA d\'un worker n\'a pas pu terminer cette étape. Réessayez bientôt.';

  @override
  String get chainsReassignUnavailable =>
      'La réassignation n\'est pas disponible sur ce nœud domicile';

  @override
  String get chainsAssignerAutoLabel =>
      'Choisir l\'assignateur le plus capable';

  @override
  String get chainsAssignerAutoHint =>
      'Si activé, le nœud domicile choisit le pair lié le plus fort pour planifier et gérer ce job.';

  @override
  String get chainsSuggestedAssigner => 'Assignateur suggéré';

  @override
  String get chainsAssignerPeerLabel => 'Assignateur';

  @override
  String get chainsAssignerPeerThisNode => 'Ce nœud domicile (par défaut)';

  @override
  String get chainsAssignerPeerHint =>
      'Optionnel — exécuter l\'assignateur sur un pair lié plutôt que sur ce nœud domicile.';

  @override
  String get chainsIterationPreviewOwner =>
      'Plusieurs tours — vous relisez chaque brouillon avant publication.';

  @override
  String get chainsIterationPreviewAuto =>
      'Plusieurs tours — l\'assignateur décide quand s\'arrêter.';

  @override
  String get chainsSpeculationDualWorkersLabel =>
      'Deux workers sur les étapes critiques';

  @override
  String get chainsSpeculationDualWorkersHint =>
      'Si les deux workers divergent, le nœud domicile peut choisir automatiquement ou vous demander d\'abord (voir les défauts du domicile).';

  @override
  String get chainsStartReadinessTitle => 'Préparer les workers';

  @override
  String get chainsStartReadinessJoinOff =>
      'Sur l’ordinateur domicile : Tâches d’équipe → Gérer les workers → activer Rejoindre le réseau d’agents.';

  @override
  String get chainsStartReadinessBond =>
      'Liez des contacts dans Découvrir (Social ou ce téléphone), puis demandez-leur de rejoindre le réseau d’agents.';

  @override
  String get chainsStartReadinessRefresh =>
      'Dans Social → Tâches d’équipe, ouvrez Gérer les workers, actualisez les cartes, puis prévisualisez à nouveau ici.';

  @override
  String get chainsStepsTitle => 'Étapes de la tâche';

  @override
  String get chainsStepsWaitingOn => 'En attente de :';

  @override
  String get chainsAttachmentHonesty =>
      'Les fichiers joints restent dans le vault de ce domicile. Quand un worker est assigné, il reçoit une copie de ces entrées dans son espace de tâche d’équipe — pas un miroir permanent de votre bibliothèque.';

  @override
  String get chainsDeliveryTitle => 'Livraison des entrées';

  @override
  String get chainsDeliveryRetry => 'Réessayer';

  @override
  String get chainsDeliveryRetried => 'Livraison des entrées relancée';

  @override
  String get chainsDeliveryRetryFailed =>
      'Impossible de relancer la livraison des entrées';

  @override
  String get chainsDeliveryPhasePending => 'En attente';

  @override
  String get chainsDeliveryPhaseTransferring => 'Transfert';

  @override
  String get chainsDeliveryPhaseVerified => 'Livré';

  @override
  String get chainsDeliveryPhaseFailed => 'Échec';

  @override
  String get chainsInputDeliveryScope => 'Livraison des entrées';

  @override
  String get chainsInputDeliveryScopeReferenced => 'Référencés uniquement';

  @override
  String get chainsInputDeliveryScopeAll => 'Toutes les pièces jointes';

  @override
  String get chainsInputDeliveryScopeHint =>
      '« Référencés » (défaut) envoie les fichiers mentionnés comme [label] dans une étape ; sans correspondance, toutes les pièces jointes sont envoyées. « Toutes » envoie chaque pièce à chaque worker attribué.';

  @override
  String get chainsIterationAskOwnerTitle =>
      'Relire le brouillon avant publication';

  @override
  String get chainsIterationAskOwnerBody =>
      'Acceptez pour publier, ou continuez pour un autre tour de raffinement.';

  @override
  String get chainsIterationAcceptDraft => 'Accepter et publier';

  @override
  String get chainsIterationContinue => 'Continuer le raffinement';

  @override
  String get chainsIterationAccepted => 'Brouillon accepté — publication';

  @override
  String get chainsIterationContinued => 'Nouveau tour de raffinement';

  @override
  String get chainsIterationResolveFailed =>
      'Impossible d’appliquer votre décision';

  @override
  String get chainsObservedTitle => 'Tâches auxquelles vous participez';

  @override
  String get chainsObservedHint =>
      'Lecture seule — seul l’assignateur peut gérer ces tâches.';

  @override
  String get chainsObservedReadOnly => 'Lecture seule';

  @override
  String get chainsStartNeedWorkers =>
      'Sélectionnez au moins un worker en ligne, ou prévisualisez à nouveau pour restaurer le pool recommandé.';

  @override
  String get chainsStartWorkersHint =>
      'Workers en ligne du plan. Décochez ceux que vous ne souhaitez pas. Tout décocher bloque le démarrage — prévisualisez à nouveau pour réinitialiser le pool recommandé.';

  @override
  String get chainsStartWorkersHeading => 'Workers';

  @override
  String get chainsStartNoSuggestedWorkers =>
      'Aucun worker suggéré pour l\'instant — le démarrage utilisera le pool de découverte du nœud domicile.';

  @override
  String chainsStartWorkerMatches(int count) {
    return 'correspond à $count étapes';
  }

  @override
  String get chainsStartWorkerOnline => 'En ligne';

  @override
  String get chainsStartWorkerRelay => 'En ligne (relais)';

  @override
  String get chainsStartWorkerOffline => 'Hors ligne / inconnu';

  @override
  String get chainsActiveGone => 'Ce job d\'équipe n\'est plus actif';

  @override
  String chainsBudgetLine(String spent, String max) {
    return 'Budget $spent / $max USD';
  }

  @override
  String get chainsBudgetWarn =>
      'Avertissement de budget — envisagez d\'ajouter du budget.';

  @override
  String get chainsBudgetExceeded =>
      'Budget dépassé — le job peut stagner jusqu\'au rééquilibrage.';

  @override
  String chainsPartialCount(int count) {
    return '$count résultats partiels';
  }

  @override
  String get chainsCancelTitle => 'Annuler le job d\'équipe ?';

  @override
  String get chainsCancelBody =>
      'Les workers seront informés de s\'arrêter. Les résultats partiels déjà collectés sont conservés.';

  @override
  String get chainsCancelConfirm => 'Annuler le job';

  @override
  String get chainsCancelDone => 'Job d\'équipe annulé';

  @override
  String get chainsCancelReason => 'Annulé depuis EnvoyGo';

  @override
  String get chainsCancelStep => 'Annuler l’étape';

  @override
  String get chainsCancelStepTitle => 'Annuler cette étape ?';

  @override
  String get chainsCancelStepBody =>
      'Cette étape et celles qui en dépendent s’arrêteront. Les résultats partiels déjà collectés sont conservés.';

  @override
  String get chainsCancelStepFailed => 'Impossible d’annuler cette étape';

  @override
  String get chainsReassignStep => 'Réassigner';

  @override
  String get chainsStepCancelled => 'Étape annulée';

  @override
  String get chainsStepReassigned => 'Étape réassignée';

  @override
  String get chainsReassignFailed => 'Impossible de réassigner cette étape';

  @override
  String get chainsCancelStepReason => 'Étape annulée depuis EnvoyGo';

  @override
  String get chainsDetailCancelled => 'Ce job a été annulé.';

  @override
  String get chainsDetailPublished =>
      'Ce job est terminé et a publié un rapport.';

  @override
  String get chainsDetailRecovering => 'Récupération';

  @override
  String chainsAttemptCount(int count) {
    return 'Tentatives : $count';
  }

  @override
  String get chainsExecutionDetails => 'Détails d’exécution';

  @override
  String chainsProvenanceSummaryLine(
    int attempts,
    String worker,
    String state,
  ) {
    return '$attempts tentative(s) · $worker · $state';
  }

  @override
  String chainsLastReason(String reason) {
    return 'Dernière raison : $reason';
  }

  @override
  String get chainsTechnicalDetails => 'Détails techniques';

  @override
  String get chainsProvenanceEmpty => 'Aucune donnée de provenance.';

  @override
  String get chainsProvenanceFailed => 'Impossible de charger la provenance.';

  @override
  String get chainsRebalanceHeading => 'Ajouter du budget';

  @override
  String get chainsRebalanceHint =>
      'Augmenter le plafond de coût et réessayer les étapes non attribuées.';

  @override
  String get chainsRebalanceAmount => 'USD supplémentaires';

  @override
  String get chainsRebalanceAction => 'Ajouter et réessayer';

  @override
  String get chainsRebalanceInvalidAmount =>
      'Saisissez un montant en dollars positif';

  @override
  String get chainsRebalanceDone => 'Budget mis à jour';

  @override
  String get chainsRebalanceFailed => 'Impossible de rééquilibrer';

  @override
  String get chainsPin => 'Épingler le rapport';

  @override
  String get chainsUnpin => 'Détacher le rapport';

  @override
  String get chainsPinDone =>
      'Rapport épinglé (conservé au-delà du nettoyage de 90 jours)';

  @override
  String get chainsUnpinDone => 'Rapport détaché';

  @override
  String chainsPublished(String date) {
    return 'Publié le $date';
  }

  @override
  String chainsChainId(String id) {
    return 'Chaîne $id';
  }

  @override
  String get termNone => 'Aucune session terminal';

  @override
  String termAttachFailed(String error) {
    return 'Échec de l\'attachement terminal : $error';
  }

  @override
  String get termCopied => 'Copié dans le presse-papiers';

  @override
  String get termReconnecting => 'Reconnexion…';

  @override
  String get termCopyAll => 'Copier toute la sortie';

  @override
  String get termPaste => 'Coller';

  @override
  String get termCloseSession => 'Fermer la session';

  @override
  String get chatImagePlaceholder => '[image]';

  @override
  String get chatsBotSyncing => 'Synchronisation…';

  @override
  String get chatsBotSavedHint =>
      'Enregistré sur le nœud domicile. Discutez quand vous êtes prêt.';

  @override
  String get chatsBotNotFound => 'Bot introuvable sur le nœud domicile';

  @override
  String get chatAiDisabledAskOwner =>
      'Demandez au propriétaire d\'activer un modèle IA pour le chat familial.';

  @override
  String pairingLoadProfilesFailed(String error) {
    return 'Impossible de charger les profils : $error';
  }

  @override
  String pairingFailed(String error) {
    return 'Échec de l\'association : $error';
  }

  @override
  String get pairingInviteAlreadyUsed =>
      'Ce QR d\'invitation a déjà été utilisé. Demandez au propriétaire d\'ouvrir Famille → Afficher le QR d\'invitation, scannez le nouveau code, puis choisissez Je suis de retour et votre profil (ex. Dad).';

  @override
  String get pairingInProgressTitle => 'Association au nœud domicile';

  @override
  String pairingInProgressSubtitle(String owner) {
    return 'Connexion à $owner…';
  }

  @override
  String pairingElapsed(String time) {
    return 'Écoulé : $time';
  }

  @override
  String pairingHomeNodeLabel(String peer) {
    return 'Domicile : $peer';
  }

  @override
  String get pairingStageInitial => 'Initialisation';

  @override
  String get pairingStageInitialHint =>
      'Mise en place d’un canal sécurisé vers le nœud domicile.';

  @override
  String get pairingStageConnecting => 'Recherche du domicile';

  @override
  String get pairingStageConnectingHint =>
      'Recherche du domicile sur le réseau local et via le relais.';

  @override
  String get pairingStageHandshaking => 'Handshake';

  @override
  String get pairingStageHandshakingHint =>
      'Échange des clés — cette étape peut prendre un moment lors de la première association.';

  @override
  String get pairingStageVerifying => 'Vérification';

  @override
  String get pairingStageSlowHint =>
      'Plus long que d’habitude. Vérifiez que le nœud domicile est sur le même Wi-Fi ou a Internet.';

  @override
  String get pairingStageVerySlowHint =>
      'L’association prend bien plus de temps que prévu. Vérifiez que les deux appareils sont en ligne, puis annulez et réessayez.';

  @override
  String get pairingCancel => 'Annuler l’association';

  @override
  String get pairingCancelConfirmTitle => 'Annuler l’association ?';

  @override
  String get pairingCancelConfirmBody =>
      'Le handshake sera interrompu. Vous pourrez réessayer depuis le QR code.';

  @override
  String get commonKeepWaiting => 'Continuer d’attendre';

  @override
  String get pairingDontCloseApp =>
      'Ne fermez pas l’application — l’association continue en arrière-plan.';

  @override
  String get pairingNowLan =>
      'Connexion en cours à votre nœud domestique sur le réseau local…';

  @override
  String get pairingNowP2p =>
      'Établissement d\'une connexion sécurisée de pair à pair…';

  @override
  String get pairingNowRelay => 'Connexion via un serveur relais…';

  @override
  String get pairingStillWorking =>
      'Toujours en cours — la première connexion peut prendre une à deux minutes. Veuillez garder l\'application ouverte.';

  @override
  String get pairingTroubleTitle => 'Toujours des difficultés ?';

  @override
  String get pairingTroubleBody =>
      'Assurez-vous que le nœud domestique est allumé et en ligne et que cet appareil a accès à Internet. Si cela échoue encore, annulez et réessayez.';

  @override
  String get feedDefaultTitle => 'Publication du fil';

  @override
  String get aiDraftSection => 'Section de brouillon';

  @override
  String aiDraftFailed(String reason) {
    return 'Impossible de rédiger ($reason)';
  }

  @override
  String authorAvatarNamed(String name) {
    return 'Avatar : $name';
  }

  @override
  String authorPhotoNamed(String name) {
    return 'Photo : $name';
  }

  @override
  String get peopleEnvoyUser => 'Utilisateur Envoy';

  @override
  String get commonEllipsis => '…';

  @override
  String get browserCached => 'En cache';

  @override
  String get browserLoaded => 'Chargé';

  @override
  String get browserNotPublished => 'Pas encore publié';

  @override
  String get browserNotFound => 'Contenu introuvable';

  @override
  String get browserAccessDenied => 'Accès refusé';

  @override
  String browserPdfLoaded(int chars) {
    return 'PDF chargé ($chars caractères base64)';
  }

  @override
  String browserUnsupportedType(String mime) {
    return 'Type non pris en charge : $mime';
  }

  @override
  String get browserInterests => 'Centres d\'intérêt';

  @override
  String get browserKnowledge => 'Connaissances';

  @override
  String get browserCapabilities => 'Capacités';

  @override
  String get connTooltipP2p => 'Connexion P2P via un relais';

  @override
  String get connTooltipRelay =>
      'Connexion relais — le domicile peut vous joindre';

  @override
  String connTooltipConnectedVia(String transport) {
    return 'Connecté via $transport';
  }

  @override
  String get connBootstrap => 'Amorçage';

  @override
  String get settingsRunning => 'en cours';

  @override
  String get settingsNotRunning => 'arrêté';

  @override
  String get settingsModelIdHint => 'model-id';

  @override
  String get chainsSections => 'Sections';

  @override
  String get chainsWorkerAllocations => 'Allocations des workers';

  @override
  String chainsAwardedSummary(String status, int awarded, int total) {
    return '$status · $awarded/$total attribués';
  }

  @override
  String meAttemptN(int n) {
    return 'tentative $n';
  }

  @override
  String meSecondsAgo(int n) {
    return 'il y a $n s';
  }

  @override
  String meMinutesAgo(int n) {
    return 'il y a $n min';
  }

  @override
  String meHoursAgo(int n) {
    return 'il y a $n h';
  }

  @override
  String meDaysAgo(int n) {
    return 'il y a $n j';
  }

  @override
  String get termShowKeyboard => 'Afficher le clavier';

  @override
  String get termHideKeyboard => 'Masquer le clavier';

  @override
  String get termCopySelection => 'Copier la sélection';

  @override
  String get pairingImBackHint =>
      'Touchez un nom si c\'est votre second téléphone (Je reviens).';

  @override
  String connP2pDetail(String detail) {
    return 'P2P ($detail)';
  }

  @override
  String get meConnRefused => 'connexion refusée / bloquée';

  @override
  String get meTimeout5s => 'délai dépassé (5 s)';

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
    return '$n j';
  }

  @override
  String get termCtrlSticky => 'Modificateur Ctrl (sticky)';

  @override
  String get termCtrlLetter => 'Ctrl + lettre';

  @override
  String get connStateConnected => 'Connecté';

  @override
  String get connStateConnecting => 'Connexion…';

  @override
  String get connStateDisconnected => 'Déconnecté';

  @override
  String get connStateError => 'Erreur';

  @override
  String get chatsDefaultGroup => 'Groupe';

  @override
  String get chatsDefaultFamilyGroup => 'Groupe familial';

  @override
  String chatsTerminalTitle(String name) {
    return 'Terminal : $name';
  }

  @override
  String get chatsExtAgent => 'Agent externe';

  @override
  String browserBytesCount(int count) {
    return '$count octets';
  }

  @override
  String get commonYouName => 'Vous';

  @override
  String get settingsAiModelEnvoyLocalStandby =>
      'Envoy Local est le fournisseur actif sur le nœud domicile. Appuyez pour gérer Local, ou enregistrez un fournisseur cloud ci-dessous comme secours.';

  @override
  String get settingsEnvoyLocalIntro =>
      'Contrôlez llama.cpp sur l\'ordinateur du domicile. Les modèles y sont téléchargés — jamais sur ce téléphone.';

  @override
  String get settingsEnvoyLocalStatusHeading => 'Statut';

  @override
  String get settingsEnvoyLocalInUse => 'En cours d\'utilisation';

  @override
  String get settingsEnvoyLocalNotInUse => 'Pas en cours d\'utilisation';

  @override
  String get settingsEnvoyLocalStatusDownloading => 'Téléchargement…';

  @override
  String get settingsEnvoyLocalStatusDetecting => 'Détection…';

  @override
  String get settingsEnvoyLocalStatusExtracting => 'Extraction…';

  @override
  String get settingsEnvoyLocalStatusStarting => 'Démarrage…';

  @override
  String get settingsEnvoyLocalStatusReady => 'Prêt';

  @override
  String get settingsEnvoyLocalStatusError => 'Erreur';

  @override
  String get settingsEnvoyLocalStatusDisabled => 'Désactivé';

  @override
  String get settingsEnvoyLocalIdleTimeout =>
      'L\'opération Envoy Local a expiré après 60 minutes. Si un téléchargement est bloqué près de 100 %, essayez des miroirs chinois ou un VPN, puis réessayez — les téléchargements partiels reprennent.';

  @override
  String settingsEnvoyLocalRuntime(String status) {
    return 'Exécution : $status';
  }

  @override
  String settingsEnvoyLocalRuntimeVersion(String version) {
    return 'Version : $version';
  }

  @override
  String settingsEnvoyLocalAccel(String accel) {
    return 'Accélérateur : $accel';
  }

  @override
  String settingsEnvoyLocalHardware(String summary) {
    return 'Cette machine : $summary';
  }

  @override
  String settingsEnvoyLocalActiveModel(String model) {
    return 'Modèle : $model';
  }

  @override
  String settingsEnvoyLocalProgressBytes(String received, String total) {
    return '$received / $total Mo';
  }

  @override
  String settingsEnvoyLocalProgressReceived(String received) {
    return '$received Mo téléchargés';
  }

  @override
  String settingsEnvoyLocalLastError(String error) {
    return 'Dernière erreur : $error';
  }

  @override
  String get settingsEnvoyLocalDownloadRegion =>
      'Région de téléchargement des modèles';

  @override
  String get settingsEnvoyLocalDownloadRegionHint =>
      'En cas d\'échec de téléchargement, essayez des miroirs chinois ou un VPN pour Global.';

  @override
  String settingsEnvoyLocalDownloadRegionEffective(String region) {
    return 'Utilisé : $region';
  }

  @override
  String get settingsEnvoyLocalRegionAuto => 'Auto (fuseau horaire / locale)';

  @override
  String get settingsEnvoyLocalRegionCn => 'Chine (ModelScope → hf-mirror)';

  @override
  String get settingsEnvoyLocalRegionGlobal => 'Global (Hugging Face)';

  @override
  String get settingsEnvoyLocalEnable => 'Télécharger et activer';

  @override
  String get settingsEnvoyLocalEnabling => 'Téléchargement…';

  @override
  String get settingsEnvoyLocalStart => 'Démarrer Envoy Local';

  @override
  String get settingsEnvoyLocalStarting => 'Démarrage…';

  @override
  String get settingsEnvoyLocalStop => 'Arrêter Envoy Local';

  @override
  String get settingsEnvoyLocalRestart => 'Redémarrer';

  @override
  String get settingsEnvoyLocalCancelDownload => 'Annuler le téléchargement';

  @override
  String get settingsEnvoyLocalStopHint =>
      'L\'arrêt revient à votre fournisseur cloud/Ollama si un est enregistré.';

  @override
  String get settingsEnvoyLocalRecommended => 'Recommandé';

  @override
  String get settingsEnvoyLocalRecommendedBadge => 'Recommandé';

  @override
  String get settingsEnvoyLocalDownload => 'Télécharger';

  @override
  String get settingsEnvoyLocalInstalled => 'Modèles installés';

  @override
  String get settingsEnvoyLocalInstalledHint =>
      'Téléchargés sur le nœud domicile. Choisissez celui qui est actif.';

  @override
  String get settingsEnvoyLocalNoInstalled =>
      'Aucun modèle installé pour l\'instant.';

  @override
  String get settingsEnvoyLocalSetActive => 'Définir comme actif';

  @override
  String get settingsEnvoyLocalActiveBadge => 'Actif';

  @override
  String get settingsEnvoyLocalInstalledBadge => 'Installé';

  @override
  String get settingsEnvoyLocalCatalog => 'Catalogue';

  @override
  String settingsEnvoyLocalHfError(String error) {
    return 'Recherche Hugging Face indisponible : $error';
  }

  @override
  String get settingsEnvoyLocalRefresh => 'Actualiser';

  @override
  String get settingsEnvoyLocalPhoneNote =>
      'Les paramètres avancés du serveur (taille du contexte, couches GPU) restent dans l\'UI Social du nœud domicile.';

  @override
  String get ehReviewTitle => 'Examiner ce tour';

  @override
  String get ehReviewUnavailable =>
      'Aucune revue enregistrée pour ce tour plus ancien.';

  @override
  String get ehReviewFile => 'Fichier';

  @override
  String get ehReviewOpenFile => 'Ouvrir le fichier';

  @override
  String get ehReviewDiffUnavailable =>
      'Aucun diff textuel disponible pour ce fichier.';

  @override
  String get ehReviewOnly => 'Détecté dans le workspace · revue seule';

  @override
  String get ehRevertTitle => 'Annuler ce tour ?';

  @override
  String get ehRevertBody =>
      'Les fichiers seront restaurés à leur contenu d’avant le tour. Les éditions ultérieures sont protégées et arrêtent le revert.';

  @override
  String get ehRevertAction => 'Annuler';

  @override
  String get ehRevertComplete =>
      'Les modifications de fichiers de ce tour ont été annulées.';

  @override
  String get ehRevertUnavailable =>
      'Ce tour ne peut plus être annulé en toute sécurité.';

  @override
  String ehRevertConflict(String files) {
    return 'Revert arrêté car ces fichiers ont changé ensuite : $files';
  }

  @override
  String get ehSearchTranscript => 'Rechercher dans la transcription';

  @override
  String get ehSearchClose => 'Fermer la recherche';

  @override
  String get ehNoMatches => 'Aucun tour correspondant';

  @override
  String get ehCopyTurn => 'Copier le tour';

  @override
  String get ehShareTurn => 'Partager le tour';

  @override
  String get ehReviewDiff => 'Voir le diff';

  @override
  String get ehRevertThisTurn => 'Annuler ce tour';

  @override
  String get ehReviewChanges => 'Examiner les changements';

  @override
  String get ehRevertAll => 'Tout annuler';

  @override
  String ehChangesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count fichiers modifiés ce tour',
      one: '1 fichier modifié ce tour',
    );
    return '$_temp0';
  }

  @override
  String get ehChangesKeepAll => 'Tout conserver';

  @override
  String get ehChangesRevert => 'Tout annuler';

  @override
  String get ehChangesHideList => 'Masquer la liste';

  @override
  String get ehChangesShowList => 'Afficher la liste';

  @override
  String get ehReviewKeepFile => 'Conserver';

  @override
  String get ehReviewRevertFile => 'Annuler';

  @override
  String get ehReviewKeptAll => 'Modifications conservées.';

  @override
  String ehReviewRevertedFile(String path) {
    return '$path annulé';
  }

  @override
  String get ehReviewAutoLabel => 'Revue auto si ≥';

  @override
  String get ehReviewAutoAlways => 'Toujours';

  @override
  String ehQueueTitle(int count) {
    return 'File d’attente ($count)';
  }

  @override
  String get ehQueueClear => 'Vider';

  @override
  String get ehQueueBusyHint => 'Envoyer met en file';

  @override
  String get ehQueueFollowUpHint => 'Mettre une suite en file…';

  @override
  String get ehInjectTooltip => 'Injecter (annuler + envoyer)';

  @override
  String ehFilesChangedCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count fichiers modifiés',
      one: '1 fichier modifié',
    );
    return '$_temp0';
  }

  @override
  String get ehEmptyReply =>
      'envoy-harness n’a pas produit de réponse visible. Votre message est toujours là — réessayez ou reformulez.';

  @override
  String get ehConfigureModelHint => 'Configurez un modèle dans Réglages → IA.';

  @override
  String get ehReviewKeepFailed => 'Impossible de conserver les modifications.';

  @override
  String get ehReviewOpenGitDiff => 'Ouvrir le diff git';

  @override
  String get ehDiffBefore => 'Avant';

  @override
  String get ehDiffAfter => 'Après';

  @override
  String get ehPermsTooltip => 'Politique d’autorisation';

  @override
  String get ehPermsSafe => 'Par défaut (auto-exécution sûre)';

  @override
  String get ehPermsAsk => 'Toujours demander';

  @override
  String get ehPermsApprove => 'Toujours approuver';

  @override
  String ehPermsSet(String mode) {
    return 'Politique d’autorisation → $mode.';
  }

  @override
  String get ehPermsNextTurn => ' S’applique au prochain tour.';

  @override
  String ehPermsFailed(String error) {
    return 'Impossible de définir la politique d’autorisation : $error';
  }

  @override
  String get chainsStatusCancelled => 'Annulé';

  @override
  String get chainsStatusPublished => 'Publié';

  @override
  String get chainsStatusRecovering => 'Récupération…';

  @override
  String get chainsStatusSynthesizing => 'Synthèse';

  @override
  String get chainsStatusRunning => 'En cours';

  @override
  String get chainsStatusWaitingWorkers => 'En attente de workers';

  @override
  String get chainsStatusBidding => 'Enchères';

  @override
  String get chainsStatusAssigning => 'Attribution';

  @override
  String get chainsStatusPlanning => 'Planification';

  @override
  String get ehWorking => 'En cours';

  @override
  String get ehCompleted => 'Terminé';

  @override
  String get ehUpdate => 'Mise à jour';

  @override
  String ehToolLabel(String name) {
    return 'Outil : $name';
  }

  @override
  String ehMatchCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count correspondances',
      one: '1 correspondance',
    );
    return '$_temp0';
  }

  @override
  String get termMore => 'Plus…';

  @override
  String get termCompactContext => 'Compacter le contexte';

  @override
  String get termUpdatePlan => 'Afficher ou mettre à jour le plan';

  @override
  String get termHarnessStatus => 'État du harness';

  @override
  String get termPiActions => 'Actions Pi';

  @override
  String get termHarnessActions => 'Actions envoy-harness';

  @override
  String get termPreviousCommand => 'Commande précédente';

  @override
  String get termNextCommand => 'Commande suivante';

  @override
  String get termCursorLeft => 'Déplacer le curseur à gauche';

  @override
  String get termCursorRight => 'Déplacer le curseur à droite';

  @override
  String get termEnterKey => 'Touche Entrée';

  @override
  String get chainsCancelFailed => 'Impossible d’annuler ce travail d’équipe.';

  @override
  String get settingsUseForCodingChat => 'Utiliser pour le chat de code';

  @override
  String get settingsUseForCodingChatHint =>
      'Obsolète — le chat de code utilise toujours Envoy Harness.';
}
