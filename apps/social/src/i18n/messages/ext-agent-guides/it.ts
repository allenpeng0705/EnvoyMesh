import type { LocalizedExtAgentGuide } from "./types.js";

export const itExtAgentGuides: LocalizedExtAgentGuide[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    summary: "Assistente IA personale sul tuo computer, connesso a EnvoyMesh tramite il canale integrato.",
    bestFor: "Chat quotidiana e risposte assistente (predefinito consigliato).",
    defaultPort: 8010,
    installSteps: [
      "Installa HomeClaw su questo computer (stessa macchina del nodo home EnvoyMesh). Segui la guida di installazione HomeClaw.",
      "Nelle impostazioni HomeClaw, abilita il canale EnvoyMesh / mesh e imposta la porta di ascolto su 8010 (predefinita).",
      "Consenti connessioni locali nel firewall (127.0.0.1 è sufficiente).",
    ],
    runSteps: [
      "Avvia HomeClaw e lascialo in esecuzione in background.",
      "HomeClaw ascolta su http://127.0.0.1:8010/message — non serve aprirlo nel browser.",
      "In EnvoyMesh: Impostazioni → IA → Motore IA, scegli HomeClaw come backend attivo. Lo stato dovrebbe mostrare In esecuzione entro circa 30 secondi.",
    ],
    verifySteps: [
      "La riga HomeClaw nella tabella mostra Stato: In esecuzione.",
      "Il badge Ponte agente esterno mostra Raggiungibile.",
      "Invia un messaggio di prova nel thread Ext Agent su questo nodo o da EnvoyGo.",
    ],
    troubleshooting: [
      "Stato Fermato? Verifica che HomeClaw sia in esecuzione e il canale EnvoyMesh sia attivo sulla porta 8010.",
      "Ancora irraggiungibile? Controlla che la porta 8010 non sia occupata, riavvia HomeClaw e clicca Aggiorna stato.",
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    summary: "Backend assistente esterno alternativo. EnvoyMesh include un piccolo helper che collega Hermes (o un eco di test) al bridge.",
    bestFor: "Provare Hermes insieme a HomeClaw, o sviluppo e test.",
    defaultPort: 8020,
    installSteps: [
      "Opzionale: installa la CLI o l’app Hermes per risposte reali (non solo eco di test).",
      "Node.js è richiesto su questo computer (incluso nell’app desktop EnvoyMesh).",
      "Aggiungi Hermes a bridge-config.json se necessario — copia da bridge-config.multi-agent.example.json nella cartella di installazione EnvoyMesh.",
    ],
    runSteps: [
      "Apri Terminale (Mac/Linux) o Prompt dei comandi / PowerShell (Windows).",
      "Vai alla cartella di installazione EnvoyMesh (contiene tools/ext-agent-adapters).",
      { code: "node tools/ext-agent-adapters/hermes/server.mjs" },
      "Lascia quella finestra aperta mentre usi Hermes. Ascolta sulla porta 8020.",
      "In Impostazioni → IA → Motore IA, seleziona Hermes come backend attivo.",
    ],
    verifySteps: [
      "La riga Hermes mostra In esecuzione nel registro.",
      "In modalità eco di test (senza CLI Hermes), le risposte sono del tipo [Hermes echo] il tuo messaggio.",
    ],
    troubleshooting: [
      "Porta già in uso? Chiudi altre istanze dell’helper o esegui PORT=8021 node tools/ext-agent-adapters/hermes/server.mjs e aggiorna bridge-config.json.",
    ],
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    summary: "OpenHuman è un’app IA desktop. EnvoyMesh si connette tramite un helper locale con lo stesso protocollo di HomeClaw.",
    bestFor: "Utenti che già usano OpenHuman su questo computer.",
    defaultPort: 8021,
    installSteps: [
      "Installa e apri l’applicazione desktop OpenHuman su questo computer.",
      "Aggiungi OpenHuman a bridge-config.json (porta 8021) usando il file esempio multi-agente se necessario.",
      "L’integrazione completa richiede un helper RPC locale (avanzato). Per i primi test puoi usare l’helper eco incluso.",
    ],
    runSteps: [
      "Apri il Terminale e vai alla cartella di installazione EnvoyMesh.",
      { code: "node tools/ext-agent-adapters/openhuman/server.mjs" },
      "Tieni la finestra aperta. L’helper ascolta sulla porta 8021.",
      "Seleziona OpenHuman in Impostazioni → IA → Motore IA.",
    ],
    verifySteps: [
      "La riga OpenHuman mostra In esecuzione.",
      "La modalità eco di test risponde [OpenHuman echo] … finché OPENHUMAN_RPC_URL non è configurato per la chat OpenHuman reale.",
    ],
    troubleshooting: [
      "L’app OpenHuman deve restare aperta sulla stessa macchina del nodo home.",
      "Per chat reale (non eco), imposta OPENHUMAN_RPC_URL sull’helper JSON-RPC locale di OpenHuman.",
    ],
  },
  {
    id: "pi",
    name: "Pi (coding)",
    summary: "Pi è un assistente orientato al coding. EnvoyMesh inoltra i messaggi se la CLI Pi è installata, o usa un semplice eco di test.",
    bestFor: "Solo aiuto al coding — non consigliato come agente chat principale.",
    defaultPort: 8022,
    installSteps: [
      "Installa la CLI Pi dal progetto pi-mono (per sviluppatori).",
      "Aggiungi Pi a bridge-config.json sulla porta 8022 se necessario.",
    ],
    runSteps: [
      "Test senza Pi installato — apri il Terminale nella cartella EnvoyMesh ed esegui:",
      { code: "PI_ECHO=1 node tools/ext-agent-adapters/pi/server.mjs" },
      { code: '$env:PI_ECHO="1"; node tools/ext-agent-adapters/pi/server.mjs' },
      "Con Pi installato: esegui node tools/ext-agent-adapters/pi/server.mjs (senza PI_ECHO) e lascia la finestra aperta.",
      "Seleziona Pi (coding) come backend attivo in Impostazioni → IA → Motore IA.",
    ],
    verifySteps: [
      "La riga Pi mostra In esecuzione.",
      "La modalità eco risponde [Pi echo] …",
    ],
    troubleshooting: [
      "Se Pi manca, usa PI_ECHO=1 per testare o scegli HomeClaw/Hermes.",
    ],
  },
];
