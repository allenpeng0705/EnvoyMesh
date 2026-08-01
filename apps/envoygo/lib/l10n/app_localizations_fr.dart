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
  String get navMe => 'Moi';

  @override
  String get commonCancel => 'Annuler';

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
  String get mePiAgent => 'Agent Pi';

  @override
  String get mePiAgentHint => 'Paramètres de l\'agent de codage local';

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
  String get meAiModelHint =>
      'Fournisseur utilisé pour l\'assistant sur ce nœud domicile';

  @override
  String get mePiAgentHintLong =>
      'Agent de codage local intégré sur le nœud domicile';

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
  String get chatPublishedContent => 'Contenu publié';

  @override
  String get chatClearThread => 'Effacer le fil';

  @override
  String get chatClearThreadTitle => 'Effacer le fil ?';

  @override
  String get chatClearThreadBody =>
      'Tous les messages de ce fil seront supprimés.';

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
  String get chatVoiceSendFailed => 'Échec de l\'envoi de la note vocale';

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
  String get authorPublish => 'Publier';

  @override
  String get authorType => 'Type';

  @override
  String get authorTypeProfile => 'Profil';

  @override
  String get authorTypePhoto => 'Photo PhotoWall';

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
  String get settingsPiBuiltIn => 'Agent de codage local intégré';

  @override
  String get settingsPiLocalOnly =>
      'Agent de codage local uniquement (sans outils mesh).';

  @override
  String get settingsPiEnabled => 'Pi activé';

  @override
  String get settingsPiOverrideHint =>
      'Remplacement de modèle (facultatif). Effacez pour hériter des paramètres du modèle IA.';

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
      'Gérez les chaînes sur l\'UI Social du nœud domicile.';

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
}
