import type { LocalizedExtAgentGuide } from "./types.js";

export const enExtAgentGuides: LocalizedExtAgentGuide[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    summary: "A personal AI assistant on your computer, connected to EnvoyMesh through its built-in channel.",
    bestFor: "Everyday chat and assistant replies (recommended default).",
    defaultPort: 8010,
    installSteps: [
      "Install HomeClaw on this computer (same machine as your EnvoyMesh home node). Follow the HomeClaw install guide for your operating system.",
      "In HomeClaw settings, enable the EnvoyMesh / mesh channel and set the listen port to 8010 (default).",
      "Allow local connections through your firewall (127.0.0.1 only is enough).",
    ],
    runSteps: [
      "Start HomeClaw and leave it running in the background.",
      "HomeClaw listens at http://127.0.0.1:8010/message — you do not need to open this in a browser.",
      "In EnvoyMesh: Settings → AI → AI Engine, choose HomeClaw as the active backend. Status should show Running within about 30 seconds.",
    ],
    verifySteps: [
      "The HomeClaw row in the table shows Status: Running.",
      "The External Agent Bridge badge shows Reachable.",
      "Send a test message to your Ext Agent chat thread on this node or from EnvoyGo.",
    ],
    troubleshooting: [
      "Status Stopped? Confirm HomeClaw is running and the EnvoyMesh channel is enabled on port 8010.",
      "Still unreachable? Check that nothing else is using port 8010, then restart HomeClaw and click Refresh status.",
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    summary: "An alternative external assistant. EnvoyMesh starts the local connection helper for you — no terminal commands.",
    bestFor: "Trying Hermes alongside HomeClaw.",
    defaultPort: 8020,
    installSteps: [
      "Install Hermes on this computer (same machine as your EnvoyMesh home node).",
      "No bridge-config editing is required — EnvoyMesh adds Hermes to the agent list automatically.",
    ],
    runSteps: [
      "Open Settings → AI → AI Engine and turn on External Agent Bridge if it is off.",
      "Choose Hermes in Active backend. EnvoyMesh starts the connection helper automatically.",
      "Click Refresh status — Hermes should show Running within a few seconds.",
    ],
    verifySteps: [
      "Hermes row shows Running in the registry table.",
      "Send a test message to your Ext Agent chat thread.",
      "If Hermes CLI is not installed yet, replies may look like [Hermes echo] your message (bridge test mode).",
    ],
    troubleshooting: [
      "Status Stopped? Select Hermes again and click Refresh status, or restart the home node.",
      "Replies stuck in echo mode? Make sure the hermes command is available in your PATH.",
      "Port already in use? Close other programs using port 8020, then refresh status.",
    ],
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    summary: "OpenHuman is a desktop AI app. EnvoyMesh connects through a local helper using the same protocol as HomeClaw.",
    bestFor: "Users who already run OpenHuman on this computer.",
    defaultPort: 8021,
    installSteps: [
      "Install and open the OpenHuman desktop application on this computer.",
      "Add OpenHuman to bridge-config.json (port 8021) using the multi-agent example file if needed.",
      "Full OpenHuman integration requires a local RPC helper (advanced). For first tests you can use the included echo helper.",
    ],
    runSteps: [
      "Open Terminal and go to your EnvoyMesh install folder.",
      { code: "node tools/ext-agent-adapters/openhuman/server.mjs" },
      "Keep the window open. The helper listens on port 8021.",
      "Select OpenHuman in Settings → AI → AI Engine.",
    ],
    verifySteps: [
      "OpenHuman row shows Running.",
      "Echo test mode replies with [OpenHuman echo] … until OPENHUMAN_RPC_URL is configured for live OpenHuman chat.",
    ],
    troubleshooting: [
      "OpenHuman app must stay open on the same machine as the home node.",
      "For live chat (not echo), set OPENHUMAN_RPC_URL to OpenHuman’s local JSON-RPC helper when available.",
    ],
  },
  {
    id: "pi",
    name: "Pi (coding)",
    summary: "Pi is a coding-focused assistant. EnvoyMesh forwards messages when the Pi CLI is installed, or uses a simple test echo.",
    bestFor: "Coding help only — not recommended as your main home chat agent.",
    defaultPort: 8022,
    installSteps: [
      "Install the Pi CLI from the pi-mono project (for developers).",
      "Add Pi to bridge-config.json on port 8022 if needed.",
    ],
    runSteps: [
      "Test without Pi installed — open Terminal in the EnvoyMesh folder and run:",
      { code: "PI_ECHO=1 node tools/ext-agent-adapters/pi/server.mjs" },
      { code: '$env:PI_ECHO="1"; node tools/ext-agent-adapters/pi/server.mjs' },
      "With Pi installed: run node tools/ext-agent-adapters/pi/server.mjs (no PI_ECHO) and leave the window open.",
      "Select Pi (coding) as the active backend in Settings → AI → AI Engine.",
    ],
    verifySteps: [
      "Pi row shows Running.",
      "Echo mode replies with [Pi echo] …",
    ],
    troubleshooting: [
      "If Pi is missing, use PI_ECHO=1 for testing or pick HomeClaw/Hermes instead.",
    ],
  },
];
