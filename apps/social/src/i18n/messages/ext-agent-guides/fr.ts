import type { LocalizedExtAgentGuide } from "./types.js";

export const frExtAgentGuides: LocalizedExtAgentGuide[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    summary: "Assistant IA personnel sur votre ordinateur, connecté à EnvoyMesh via son canal intégré.",
    bestFor: "Chat quotidien et réponses assistant (recommandé par défaut).",
    defaultPort: 8010,
    installSteps: [
      "Installez HomeClaw sur cet ordinateur (même machine que le nœud domicile EnvoyMesh). Suivez le guide d’installation HomeClaw.",
      "Dans les paramètres HomeClaw, activez le canal EnvoyMesh / mesh et définissez le port d’écoute sur 8010 (par défaut).",
      "Autorisez les connexions locales dans le pare-feu (127.0.0.1 suffit).",
    ],
    runSteps: [
      "Démarrez HomeClaw et laissez-le tourner en arrière-plan.",
      "HomeClaw écoute sur http://127.0.0.1:8010/message — inutile d’ouvrir cela dans un navigateur.",
      "Dans EnvoyMesh : Paramètres → IA → Moteur IA, choisissez HomeClaw comme backend actif. L’état doit afficher En cours d’exécution en environ 30 secondes.",
    ],
    verifySteps: [
      "La ligne HomeClaw du tableau affiche l’état En cours d’exécution.",
      "Le badge Pont agent externe affiche Accessible.",
      "Envoyez un message test dans le fil Ext Agent sur ce nœud ou depuis EnvoyGo.",
    ],
    troubleshooting: [
      "État Arrêté ? Vérifiez que HomeClaw tourne et que le canal EnvoyMesh est activé sur le port 8010.",
      "Toujours inaccessible ? Vérifiez qu’aucun autre programme n’utilise le port 8010, redémarrez HomeClaw puis cliquez sur Actualiser l’état.",
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    summary: "Assistant externe alternatif. EnvoyMesh inclut un petit helper qui connecte Hermes (ou un écho de test) au pont.",
    bestFor: "Essayer Hermes avec HomeClaw, ou développement et tests.",
    defaultPort: 8020,
    installSteps: [
      "Optionnel : installez le CLI ou l’app Hermes pour de vraies réponses (pas seulement l’écho de test).",
      "Node.js est requis sur cet ordinateur (inclus avec l’app bureau EnvoyMesh).",
      "Ajoutez Hermes à bridge-config.json si besoin — copiez depuis bridge-config.multi-agent.example.json dans le dossier d’installation EnvoyMesh.",
    ],
    runSteps: [
      "Ouvrez le Terminal (Mac/Linux) ou l’Invite de commandes / PowerShell (Windows).",
      "Allez dans le dossier d’installation EnvoyMesh (contient tools/ext-agent-adapters).",
      { code: "node tools/ext-agent-adapters/hermes/server.mjs" },
      "Laissez cette fenêtre ouverte pendant l’utilisation de Hermes. Écoute sur le port 8020.",
      "Dans Paramètres → IA → Moteur IA, sélectionnez Hermes comme backend actif.",
    ],
    verifySteps: [
      "La ligne Hermes affiche En cours d’exécution dans le registre.",
      "En mode écho de test (sans CLI Hermes), les réponses ressemblent à [Hermes echo] votre message.",
    ],
    troubleshooting: [
      "Port déjà utilisé ? Fermez d’autres instances du helper ou exécutez PORT=8021 node tools/ext-agent-adapters/hermes/server.mjs et mettez bridge-config.json à jour.",
    ],
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    summary: "OpenHuman est une application IA de bureau. EnvoyMesh se connecte via un helper local utilisant le même protocole que HomeClaw.",
    bestFor: "Utilisateurs qui exécutent déjà OpenHuman sur cet ordinateur.",
    defaultPort: 8021,
    installSteps: [
      "Installez et ouvrez l’application de bureau OpenHuman sur cet ordinateur.",
      "Ajoutez OpenHuman à bridge-config.json (port 8021) via le fichier exemple multi-agents si nécessaire.",
      "L’intégration complète nécessite un helper RPC local (avancé). Pour les premiers tests, utilisez le helper écho inclus.",
    ],
    runSteps: [
      "Ouvrez le Terminal et allez dans le dossier d’installation EnvoyMesh.",
      { code: "node tools/ext-agent-adapters/openhuman/server.mjs" },
      "Gardez la fenêtre ouverte. Le helper écoute sur le port 8021.",
      "Sélectionnez OpenHuman dans Paramètres → IA → Moteur IA.",
    ],
    verifySteps: [
      "La ligne OpenHuman affiche En cours d’exécution.",
      "Le mode écho de test répond [OpenHuman echo] … jusqu’à configuration de OPENHUMAN_RPC_URL pour le chat OpenHuman réel.",
    ],
    troubleshooting: [
      "L’app OpenHuman doit rester ouverte sur la même machine que le nœud domicile.",
      "Pour le chat réel (pas l’écho), définissez OPENHUMAN_RPC_URL vers le helper JSON-RPC local d’OpenHuman.",
    ],
  },
  {
    id: "pi",
    name: "Pi (codage)",
    summary: "Pi est un assistant orienté codage. EnvoyMesh transmet les messages si le CLI Pi est installé, ou utilise un écho de test simple.",
    bestFor: "Aide au codage uniquement — non recommandé comme agent de chat principal.",
    defaultPort: 8022,
    installSteps: [
      "Installez le CLI Pi depuis le projet pi-mono (pour développeurs).",
      "Ajoutez Pi à bridge-config.json sur le port 8022 si nécessaire.",
    ],
    runSteps: [
      "Test sans Pi installé — ouvrez le Terminal dans le dossier EnvoyMesh et exécutez :",
      { code: "PI_ECHO=1 node tools/ext-agent-adapters/pi/server.mjs" },
      { code: '$env:PI_ECHO="1"; node tools/ext-agent-adapters/pi/server.mjs' },
      "Avec Pi installé : exécutez node tools/ext-agent-adapters/pi/server.mjs (sans PI_ECHO) et laissez la fenêtre ouverte.",
      "Sélectionnez Pi (codage) comme backend actif dans Paramètres → IA → Moteur IA.",
    ],
    verifySteps: [
      "La ligne Pi affiche En cours d’exécution.",
      "Le mode écho répond [Pi echo] …",
    ],
    troubleshooting: [
      "Si Pi est absent, utilisez PI_ECHO=1 pour tester ou choisissez HomeClaw/Hermes.",
    ],
  },
];
