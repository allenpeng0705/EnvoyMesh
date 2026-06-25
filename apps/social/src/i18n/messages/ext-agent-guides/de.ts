import type { LocalizedExtAgentGuide } from "./types.js";

export const deExtAgentGuides: LocalizedExtAgentGuide[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    summary: "Persönlicher KI-Assistent auf Ihrem Computer, verbunden mit EnvoyMesh über den integrierten Kanal.",
    bestFor: "Alltäglicher Chat und Assistentenantworten (empfohlene Standardwahl).",
    defaultPort: 8010,
    installSteps: [
      "Installieren Sie HomeClaw auf diesem Computer (gleiche Maschine wie der EnvoyMesh-Heimknoten). Folgen Sie der HomeClaw-Installationsanleitung.",
      "Aktivieren Sie in den HomeClaw-Einstellungen den EnvoyMesh-/Mesh-Kanal und setzen Sie den Lauschport auf 8010 (Standard).",
      "Erlauben Sie lokale Verbindungen in der Firewall (127.0.0.1 reicht).",
    ],
    runSteps: [
      "Starten Sie HomeClaw und lassen Sie es im Hintergrund laufen.",
      "HomeClaw lauscht auf http://127.0.0.1:8010/message — kein Browser nötig.",
      "In EnvoyMesh: Einstellungen → KI → KI-Engine, wählen Sie HomeClaw als aktives Backend. Status sollte innerhalb von ca. 30 Sekunden Läuft anzeigen.",
    ],
    verifySteps: [
      "Die HomeClaw-Zeile in der Tabelle zeigt Status: Läuft.",
      "Das Badge Externer-Agenten-Bridge zeigt Erreichbar.",
      "Senden Sie eine Testnachricht im Ext-Agent-Chat auf diesem Knoten oder von EnvoyGo.",
    ],
    troubleshooting: [
      "Status Gestoppt? Prüfen Sie, ob HomeClaw läuft und der EnvoyMesh-Kanal auf Port 8010 aktiv ist.",
      "Noch nicht erreichbar? Prüfen Sie Port 8010, starten Sie HomeClaw neu und klicken Sie auf Status aktualisieren.",
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    summary: "Alternatives externes Assistenten-Backend. EnvoyMesh enthält ein kleines Hilfsprogramm, das Hermes (oder Test-Echo) an die Bridge anbindet.",
    bestFor: "Hermes neben HomeClaw ausprobieren oder Entwicklung/Tests.",
    defaultPort: 8020,
    installSteps: [
      "Optional: Installieren Sie die Hermes-CLI oder -App für echte Antworten (nicht nur Test-Echo).",
      "Node.js ist auf diesem Computer erforderlich (in der EnvoyMesh-Desktop-App enthalten).",
      "Fügen Sie Hermes bei Bedarf zu bridge-config.json hinzu — Vorlage: bridge-config.multi-agent.example.json im EnvoyMesh-Installationsordner.",
    ],
    runSteps: [
      "Öffnen Sie Terminal (Mac/Linux) oder Eingabeaufforderung / PowerShell (Windows).",
      "Wechseln Sie in den EnvoyMesh-Installationsordner (enthält tools/ext-agent-adapters).",
      { code: "node tools/ext-agent-adapters/hermes/server.mjs" },
      "Lassen Sie dieses Fenster geöffnet. Hermes lauscht auf Port 8020.",
      "Unter Einstellungen → KI → KI-Engine wählen Sie Hermes als aktives Backend.",
    ],
    verifySteps: [
      "Die Hermes-Zeile zeigt Läuft in der Registrierungstabelle.",
      "Im Test-Echo-Modus (ohne Hermes-CLI) sehen Antworten aus wie [Hermes echo] Ihre Nachricht.",
    ],
    troubleshooting: [
      "Port belegt? Schließen Sie andere Helper-Instanzen oder führen Sie PORT=8021 node tools/ext-agent-adapters/hermes/server.mjs aus und passen Sie bridge-config.json an.",
    ],
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    summary: "OpenHuman ist eine Desktop-KI-App. EnvoyMesh verbindet sich über einen lokalen Helper mit dem gleichen Protokoll wie HomeClaw.",
    bestFor: "Nutzer, die OpenHuman bereits auf diesem Computer verwenden.",
    defaultPort: 8021,
    installSteps: [
      "Installieren und öffnen Sie die OpenHuman-Desktop-App auf diesem Computer.",
      "Fügen Sie OpenHuman bei Bedarf zu bridge-config.json hinzu (Port 8021) — siehe Multi-Agent-Beispieldatei.",
      "Volle Integration erfordert einen lokalen RPC-Helper (fortgeschritten). Für erste Tests können Sie den enthaltenen Echo-Helper nutzen.",
    ],
    runSteps: [
      "Öffnen Sie das Terminal und wechseln Sie in den EnvoyMesh-Installationsordner.",
      { code: "node tools/ext-agent-adapters/openhuman/server.mjs" },
      "Lassen Sie das Fenster geöffnet. Der Helper lauscht auf Port 8021.",
      "Wählen Sie OpenHuman unter Einstellungen → KI → KI-Engine.",
    ],
    verifySteps: [
      "Die OpenHuman-Zeile zeigt Läuft.",
      "Echo-Testmodus antwortet mit [OpenHuman echo] … bis OPENHUMAN_RPC_URL für echten OpenHuman-Chat gesetzt ist.",
    ],
    troubleshooting: [
      "Die OpenHuman-App muss auf derselben Maschine wie der Heimknoten laufen bleiben.",
      "Für echten Chat (nicht Echo) setzen Sie OPENHUMAN_RPC_URL auf den lokalen JSON-RPC-Helper von OpenHuman.",
    ],
  },
  {
    id: "pi",
    name: "Pi (Coding)",
    summary: "Pi ist ein coding-orientierter Assistent. EnvoyMesh leitet Nachrichten weiter, wenn die Pi-CLI installiert ist, oder nutzt ein einfaches Test-Echo.",
    bestFor: "Nur Coding-Hilfe — nicht als Standard-Chat-Agent für Zuhause empfohlen.",
    defaultPort: 8022,
    installSteps: [
      "Installieren Sie die Pi-CLI aus dem pi-mono-Projekt (für Entwickler).",
      "Fügen Sie Pi bei Bedarf zu bridge-config.json auf Port 8022 hinzu.",
    ],
    runSteps: [
      "Test ohne installiertes Pi — Terminal im EnvoyMesh-Ordner öffnen und ausführen:",
      { code: "PI_ECHO=1 node tools/ext-agent-adapters/pi/server.mjs" },
      { code: '$env:PI_ECHO="1"; node tools/ext-agent-adapters/pi/server.mjs' },
      "Mit installiertem Pi: node tools/ext-agent-adapters/pi/server.mjs ausführen (ohne PI_ECHO) und Fenster offen lassen.",
      "Wählen Sie Pi (Coding) als aktives Backend unter Einstellungen → KI → KI-Engine.",
    ],
    verifySteps: [
      "Die Pi-Zeile zeigt Läuft.",
      "Echo-Modus antwortet mit [Pi echo] …",
    ],
    troubleshooting: [
      "Wenn Pi fehlt, testen Sie mit PI_ECHO=1 oder wählen Sie HomeClaw/Hermes.",
    ],
  },
];
