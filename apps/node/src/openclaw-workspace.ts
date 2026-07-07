import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type OpenClawWorkspaceSeed = {
  ownerId: string;
  displayName?: string;
  interests?: string[];
  capabilities?: string[];
  agentIdentitySnippet?: string;
  bondCount?: number;
};

export function openClawWorkspaceDir(profileDir: string): string {
  return join(profileDir, "openclaw-workspace");
}

export function openClawGatewayStateDir(profileDir: string): string {
  return join(profileDir, "openclaw-gateway");
}

export function openClawWorkspaceSkillsDir(profileDir: string): string {
  return join(openClawWorkspaceDir(profileDir), "skills");
}

/** Copy legacy ./skills installs into the persistent OpenClaw workspace (skip existing). */
export function importLegacySkillsIntoWorkspace(params: {
  legacySkillsDir: string;
  workspaceDir: string;
}): string[] {
  const imported: string[] = [];
  const targetRoot = join(params.workspaceDir, "skills");
  mkdirSync(targetRoot, { recursive: true });
  if (!existsSync(params.legacySkillsDir)) {
    return imported;
  }
  for (const entry of readdirSync(params.legacySkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = join(params.legacySkillsDir, entry.name);
    if (!existsSync(join(src, "SKILL.md"))) continue;
    const dest = join(targetRoot, entry.name);
    if (existsSync(dest)) continue;
    cpSync(src, dest, { recursive: true });
    imported.push(entry.name);
  }
  return imported;
}

function writeIfAbsent(path: string, content: string): void {
  if (existsSync(path)) return;
  writeFileSync(path, content, { encoding: "utf-8", mode: 0o600 });
}

function buildIdentityMd(): string {
  return [
    "# IDENTITY.md - Who Am I?",
    "",
    "- **Name:** EnvoyAI",
    "- **Creature:** EnvoyMesh built-in assistant — an AI agent on a decentralized P2P mesh",
    "- **Vibe:** Warm, competent, direct. No filler. Mesh-native.",
    "- **Emoji:** 🕸️",
    "",
    "You are the owner's EnvoyAI assistant. You help them navigate EnvoyMesh: bonds, discovery,",
    "vault knowledge, tasks, and network intelligence. You are already configured — never run",
    "first-contact onboarding or ask who you are.",
    "",
  ].join("\n");
}

function buildUserMd(seed: OpenClawWorkspaceSeed): string {
  const name = seed.displayName?.trim() || seed.ownerId;
  const interests =
    seed.interests && seed.interests.length > 0
      ? seed.interests.join(", ")
      : "(not set yet)";
  const capabilities =
    seed.capabilities && seed.capabilities.length > 0
      ? seed.capabilities.join(", ")
      : "(not set yet)";
  return [
    "# USER.md - About Your Human",
    "",
    `- **Name:** ${name}`,
    `- **What to call them:** ${name}`,
    `- **Owner ID:** ${seed.ownerId}`,
    "",
    "## Context",
    "",
    `- Interests: ${interests}`,
    `- Published capabilities: ${capabilities}`,
    `- Bonds on mesh: ${seed.bondCount ?? 0}`,
    "",
    "They use EnvoyMesh Social / EnvoyAI for mesh operations and personal assistance.",
    "",
  ].join("\n");
}

function buildSoulMd(): string {
  return [
    "# SOUL.md - Who You Are",
    "",
    "## Core Truths",
    "",
    "You are EnvoyAI on EnvoyMesh. Answer helpfully using mesh tools when needed.",
    "Skip bootstrap rituals — this workspace is pre-configured.",
    "",
    "When asked what you can help with, describe concrete EnvoyMesh capabilities:",
    "finding peers and documents, making bonds, knowledge queries, task negotiation,",
    "mesh intelligence reports, chat history search, and web search for current events.",
    "",
    "For news, headlines, prices, weather, or anything time-sensitive:",
    "call web_search first, then answer from the results.",
    "Never refuse citing a knowledge cutoff when web_search is available.",
    "",
    "Use mesh tools for factual mesh state. Never invent peer names or bond status.",
    "",
    "## Boundaries",
    "",
    "- Respect bond autonomy and sensitivity limits from EnvoyMesh policy.",
    "- Ask before external or high-risk actions.",
    "",
  ].join("\n");
}

function buildToolsMd(): string {
  return [
    "# TOOLS.md - Local Notes",
    "",
    "## Web search",
    "",
    "- `web_search` — built-in tool for current news, facts, and post-cutoff information.",
    "- Use it whenever the user asks about recent events, today's headlines, or live data.",
    "- Provider is configured by EnvoyMesh (Tavily when a key is set, otherwise DuckDuckGo).",
    "",
    "## EnvoyMesh mesh tools",
    "",
    "- All local files: `mesh.files_list_all` and `mesh.files_read` (vault + OpenClaw workspace in one view).",
    "- Vault-only shortcuts: `mesh.library_list`, `mesh.library_read`, `vault.search`.",
    "- OpenClaw built-in `read` / `exec` also work on openclaw-workspace/ when needed.",
    "- Use `envoymesh_list_mesh_tools` / `envoymesh_execute_mesh_tool` for other P2P mesh operations.",
    "",
  ].join("\n");
}

/**
 * Comprehensive EnvoyMesh product guide seeded into the OpenClaw workspace.
 * The agent reads this file to answer user questions with exact, specific
 * steps — no guessing, no vague suggestions.
 *
 * Updated on every workspace sync so it stays in sync with the running version.
 */
function buildEnvoyMeshGuideMd(): string {
  return [
    "# ENVOYMESH_GUIDE.md — Your EnvoyMesh Knowledge Base",
    "",
    "Read this file to answer user questions about how EnvoyMesh works.",
    "Give EXACT steps with real tab names, button names, and menu paths.",
    "If the user asks about something not covered here, be honest and say",
    "you'll help them figure it out.",
    "",
    "## What is EnvoyMesh?",
    "",
    "A decentralized, peer-to-peer mesh for private communication and AI agents.",
    "No central server — identity is cryptographic (Ed25519 keys), messages are",
    "signed, and the user owns all their data on their own device.",
    "",
    "## The app layout (desktop / Tauri)",
    "",
    "Top navigation bar: **Chat · Discover · Library · Chains · Settings · Profile**.",
    "Plus a **?** help button and a profile avatar button.",
    "",
    "### Chat tab",
    "",
    "Direct messages and group chats with bonded contacts.",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Send a message | Type in the composer at the bottom → press Enter or Send |",
    "| Voice note | Click the 🎤 mic button → record → Send (auto-transcribed) |",
    "| Voice call | Click the phone icon in the chat header (peer-to-peer) |",
    "| Video call | Click the camera icon in the chat header |",
    "| Attach a file | Click the 📎 paperclip → choose a file |",
    "| Create a group | Click the + button at the top of the sidebar → Create group |",
    "| Block / Unblock | Right-click (or long-press) a contact → Block / Unblock |",
    "| AI access per contact | Right-click a contact → AI access: None / Assistant only / Full |",
    "| Remove a contact | Right-click a contact → Remove contact |",
    "",
    "**EnvoyAI** (that's you) always appears as a row at the top of the sidebar.",
    "The user can chat with you any time, even with 0 contacts.",
    "",
    "**Inbox sub-mode:** A badge on the Chat tab shows incoming hello requests",
    "and social intro proposals. Click the badge to open the Inbox.",
    "",
    "**Terminals sub-mode (desktop):** A Terminals tab for remote shell access",
    "to the home node. Not available on mobile.",
    "",
    "### Discover tab",
    "",
    "Find new contacts and connect.",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Search the mesh | Type a name, interest, or topic in the search bar |",
    "| Search by location | Switch to 'Location' tab → Same Country / City / Near Me |",
    "| Paste a contact link | Paste an `envoy://contact?...` link from a friend |",
    "| Redeem a company invite | Paste an `envoy://invite?token=...` link |",
    "| Find people on same Wi-Fi | Click 'Same Wi-Fi — people nearby' (uses mDNS) |",
    "| Multi-hop search | Click 'Scan bonded peers' for friends-of-friends |",
    "| Say hello | Click 'Say hello' on a search result — sends a signed bond request |",
    "",
    "**Saying hello** sends a signed `bond.request`. The other person must ACCEPT",
    "for the connection to form. Pending outgoing hellos show as 'Waiting on N",
    "hello reply' in the Chat sidebar.",
    "",
    "**Interest matching:** During setup, the user selected ≥3 interests.",
    "EnvoyMesh auto-searches for people who share them and auto-says-hello to",
    "the top match.",
    "",
    "### Library tab",
    "",
    "Local files and vault documents.",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Import a file | Click Import or drag a file in |",
    "| Publish a file | Toggle the 'Published' switch → shares with bonded contacts |",
    "| Browse friends' files | Scroll to the 'Friends' Files' panel |",
    "| Search vault | Use the search bar for keyword search over documents |",
    "| Share a file | Click Share → choose a contact |",
    "",
    "### Chains tab (Agent Network)",
    "",
    "The Agent Network lets your AI agent decompose a complex goal and orchestrate",
    "it across your bonded contacts' agents. Think of it as **hiring a temporary",
    "team** — your agent is the orchestrator, your contacts' agents are workers.",
    "",
    "**Three collaboration shapes:**",
    "- **Solo A2A:** One task, one worker, one result (simplest).",
    "- **Fan-out / Fan-in:** One orchestrator fans out subtasks to N workers in",
    "  parallel, then merges results into one report.",
    "- **Multi-round negotiation:** Multiple agents bid on the same subtask;",
    "  the orchestrator issues counter-proposals; best bid wins.",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Start a chain | Click 'New chain' → type a goal → 'Preview plan' → 'Start chain' |",
    "| Use a template | Click a chip: Research a topic / Summarize a document / Ask my network |",
    "| Manage a running chain | Click any active chain → **Manage** → see live bids, award, counter-bid |",
    "| Rebalance budget | In the chain detail → 'Add budget & retry' (raise the USD ceiling) |",
    "| View a report | Completed chains under 'Reports' → 'View report' |",
    "| Export costs | Click 'Export costs (CSV)' on any chain |",
    "| Cancel a chain | Click 'Cancel' on an active chain |",
    "",
    "**Chain lifecycle:** created → planned → discovering → negotiating →",
    "running → partial → synthesizing → completed | failed | cancelled",
    "",
    "**How a chain works (step by step):**",
    "1. You describe a goal (e.g. 'Research local LLM benchmarks and summarize top 3').",
    "2. Your agent (EnvoyAI, the orchestrator) **decomposes** it into subtasks.",
    "   If LLM decomposition is enabled and the goal is >12 words, the model splits",
    "   it intelligently. Otherwise, a single keyword-based subtask is created.",
    "3. The orchestrator **fans out** — sends `task.chain.propose` to bonded",
    "   contacts whose agents have matching capabilities.",
    "4. Workers **BID** — each responds with cost (USD), ETA, and expiry.",
    "5. The orchestrator **evaluates bids** — ranks by composite score:",
    "   cost (35%) + reputation (30%) + freshness (20%) + capability precision (15%).",
    "   By default, auto-evaluates after 30s and awards the best bid.",
    "6. You can **intervene**: open the chain → Manage → manually award a specific",
    "   worker, counter-bid (raise the ceiling, rebroadcast), or rebalance.",
    "7. Workers **execute** — they run their subtask and send `task.chain.partial`",
    "   results. Heartbeats keep the orchestrator informed of progress.",
    "8. When all subtasks complete, the orchestrator **synthesizes** — merges",
    "   results into a composite report with citations back to each subtask.",
    "9. The final **Chain Report** is published with: executive summary, sections",
    "   with citations, cost breakdown per worker, and a downloadable artifact.",
    "",
    "**Budget & cost:**",
    "- Each chain has a `maxChainCostUsd` ceiling (default $10, editable in Settings).",
    "- The `ChainBudgetLedger` enforces: Σ worker costs + synthesis cost ≤ ceiling.",
    "- If a worker stalls (no heartbeat within `stallTimeoutMs`, default 60s),",
    "  the rebalance policy kicks in:",
    "  - **Manual** (default): you decide — open the chain, add budget, retry.",
    "  - **Auto**: the orchestrator automatically re-bids (up to `maxAutoRebalances`,",
    "    default 2, adding `autoRebalanceIncrementUsd` default $5 each time).",
    "  - **Never**: stall = cancel that subtask.",
    "",
    "**Chain Defaults** (Settings → AI → Chain Defaults):",
    "- Rebalance policy: Manual / Auto re-bid / Never",
    "- Stall timeout: how long before a subtask is considered stalled (ms)",
    "- Max auto-rebalances: hard cap on automatic re-bids (default 2)",
    "- Auto-rebalance increment: USD added per auto-rebid (default $5)",
    "- Low-confidence threshold: partials below this trigger a rebid (0–1, default 0.5)",
    "- Allow LLM decomposition: use the model to split goals >12 words",
    "",
    "**Requirements for chains:**",
    "- ≥1 bonded contact with an active AI agent (worker pool comes from direct bonds).",
    "- A configured model provider (for LLM decomposition + report synthesis).",
    "- The orchestrator is EnvoyAI (your built-in agent) by default.",
    "",
    "**Depth limits:** Default depth = 2 (orchestrator → workers). Depth 3",
    "requires explicit owner approval (`allowDepth3`). No depth > 3.",
    "",
    "**On EnvoyGo:** Active Chains (read-only status) and Recent Reports",
    "(read-only published reports with executive summary + cost breakdown).",
    "No chain creation or management from mobile — do that from desktop.",
    "",
    "### Setting up the Agent Network (step by step)",
    "",
    "The Agent Network requires preparation on both sides — you and your",
    "contacts need agents that can discover each other and bid on tasks.",
    "",
    "**Step 1: Configure your AI model (both sides)**",
    "Each participant needs a working AI model for task decomposition + execution.",
    "- Settings → AI → Model provider → choose OpenAI/Anthropic/Ollama/LiteLLM",
    "- Enter endpoint + model name + API key → Save",
    "- Without a model, chains can't decompose goals or synthesize reports.",
    "",
    "**Step 2: Bond with contacts who have AI agents**",
    "Workers come from your **direct-bonded contacts**. To get workers:",
    "- Go to Discover → find people → Say hello → they accept",
    "- Each contact must also have an AI agent running (EnvoyAI or Ext Agent)",
    "- The more bonded contacts with agents, the larger your worker pool",
    "",
    "**Step 3: Set up your capability tags (so others can find you as a worker)**",
    "Your agent advertises what it can do via capability tags. These come from:",
    "- **Profile → About → Capabilities:** Add tags like 'research', 'translation',",
    "  'code_review', 'summarization', 'writing'. These sync to your capability",
    "  manifest automatically when you save.",
    "- **Profile → About → Knowledge:** Add expertise areas (e.g. 'Rust', 'ML').",
    "- When a bonded contact's orchestrator searches for workers, it matches",
    "  against these tags via the Agent Card exchange.",
    "",
    "**Step 4: Agent Cards are exchanged automatically**",
    "- When you bond with someone, both nodes auto-fetch each other's Agent Card",
    "  (cached for 24h). The card lists capabilities, topics, and trust policy.",
    "- The CapabilityIndex (in-memory + persisted) maps capability → peer IDs.",
    "- The orchestrator uses this index to find workers for each subtask.",
    "- You don't need to manually configure anything — bonding triggers the exchange.",
    "",
    "**Step 5: Configure chain defaults (optional, recommended)**",
    "Settings → AI → Chain Defaults:",
    "- **Rebalance policy:** Auto (recommended) — automatically re-bids if a worker stalls",
    "- **Max auto-rebalances:** 2 (default) — how many times to auto-retry",
    "- **Allow LLM decomposition:** ON — lets the model split complex goals intelligently",
    "- **Stall timeout:** 60000ms (default) — how long before a stalled worker triggers rebid",
    "",
    "**Step 6: Test with a simple chain**",
    "1. Open the **Chains** tab → click **New chain**",
    "2. Type a simple goal: 'Summarize what EnvoyMesh does in 3 bullet points'",
    "3. Click **Preview plan** — you should see subtasks with worker counts",
    "4. If worker count > 0, click **Start chain**",
    "5. Watch the chain progress: bidding → running → synthesizing → completed",
    "6. Click **View report** to see the result",
    "",
    "**Troubleshooting chain setup:**",
    "- **'0 workers available':** You have no bonded contacts with active agents,",
    "  or their Agent Cards haven't synced yet. Bond more contacts, wait for",
    "  Agent Card exchange (happens automatically on bond).",
    "- **Bids never arrive:** The remote agents may be offline or their models",
    "  aren't configured. Check that your contacts have working AI setups.",
    "- **Chain stalls indefinitely:** Switch rebalance policy to 'Auto' in",
    "  Settings → AI → Chain Defaults, or manually rebalance from the chain detail.",
    "- **'No decomposition':** LLM decomposition is off. Enable it in Chain Defaults,",
    "  or use a goal template (Research/Summarize/Ask my network) which works",
    "  without LLM splitting.",
    "",
    "",
    "Five sub-tabs:",
    "",
    "**Account:** Display name, username, bio, profile photo. Privacy: autonomy",
    "controls (kill switch), data management (clear all), knowledge sharing.",
    "",
    "**AI:** Model provider config (powers the assistant):",
    "- Choose: OpenAI-compatible / Anthropic-compatible / Ollama / LiteLLM / Mock / Disabled",
    "- Enter endpoint URL, model name, API key. This powers me (EnvoyAI).",
    "- Also: agent identity, chain defaults, AI engine, RAG/knowledge base.",
    "",
    "**Devices & Fleet:** Team/company onboarding:",
    "- Company invites (mint `envoy://invite` links)",
    "- LAN auto-bond (shared fleet token for same-Wi-Fi peers)",
    "- Pairing kiosk (HTTP page for walk-up visitors; generates QR codes)",
    "- Fleet manifest (signed roster for bulk pre-staging)",
    "- Bond autonomy (auto-accept hellos matching a sponsor token)",
    "- Setup sponsor friend (auto-hello a designated contact after setup)",
    "",
    "**Network:** Relay config, bootstrap peers, trust mode toggle, connection",
    "status (reachable relays with health dots), ICE/TURN for calls.",
    "",
    "**App:** Language (6 locales), theme, authorized devices, activity feed.",
    "",
    "### Profile",
    "",
    "- **Photos:** Thumbnail + gallery (up to 12, each with visibility:",
    "  public / referred / direct).",
    "- **About:** Bio, gender, hobbies/interests (used for mesh discovery),",
    "  knowledge tags, location (city-level geohash).",
    "- **Share contact card:** Generates an `envoy://contact?...` link.",
    "",
    "---",
    "",
    "---",
    "",
    "## EnvoyGo (mobile app)",
    "",
    "EnvoyGo is the Flutter mobile companion (iOS + Android). It's a **remote",
    "thin client** — every action delegates to the home node via WebSocket.",
    "No local mesh, no vault, no identity keys. Always-on relay connection",
    "with automatic reconnection.",
    "",
    "### Pairing EnvoyGo with your home node",
    "",
    "1. On desktop: open **Settings → Network** (or click the QR icon in the",
    "   header) → a QR code appears.",
    "2. On your phone: open EnvoyGo → tap **Scan QR** → point at the code.",
    "3. Confirm the node name + connection info on the pairing screen.",
    "4. EnvoyGo connects, gets a session token, and persists it securely.",
    "5. You're connected! Chats, contacts, AI, terminals, and chains are",
    "   available remotely.",
    "",
    "Reconnection is automatic. No re-scan needed unless you unpair or the",
    "home node revokes the session. You can pair multiple home nodes and",
    "switch between them (Me tab → node switcher).",
    "",
    "### EnvoyGo tabs (3-tab layout)",
    "",
    "**Chats:** Direct messages, group chats, AI assistant (EnvoyAI), Ext Agent",
    "threads, and terminal sessions — all unified in one thread list. Voice",
    "notes, image attachments, and voice calls (WebRTC) supported.",
    "",
    "**Inbox:** Pending social intro proposals from bonded contacts.",
    "",
    "**Me:** Profile, connected node status, AI Engine settings, AI Model",
    "settings, Active Chains, Recent Chain Reports, public access editor,",
    "pair new node, dark mode, unpair, and a network debug card.",
    "",
    "### What EnvoyGo can do",
    "- Chat (DM + group + AI + Ext Agent) with voice notes + attachments",
    "- Voice calls (WebRTC, peer-to-peer via the home node signaling path)",
    "- Terminal sessions (full xterm.js emulation over PTY tunnel)",
    "- Chain reports (read-only: Active Chains + Recent Reports)",
    "- Contacts + inbox (bonded list + pending intros)",
    "- Settings (AI engine + AI model config, mirrors desktop)",
    "- Push notifications (when WebSocket is offline)",
    "- Multi-node switching (pair multiple home nodes)",
    "",
    "---",
    "",
    "## Ext Agent (external AI agents)",
    "",
    "EnvoyMesh supports connecting **external AI agents** alongside the built-in",
    "EnvoyAI. This lets you use HomeClaw, OpenClaw, Hermes, OpenHuman, or any",
    "custom agent as a mesh-facing assistant.",
    "",
    "### Built-in EnvoyAI vs Ext Agent",
    "",
    "| | Built-in EnvoyAI (OpenClaw) | Ext Agent |",
    "|---|---|---|",
    "| What | Bundled OpenClaw gateway, runs in-process | External agent (HomeClaw, Hermes, etc.) |",
    "| Config | Read-only in UI (edit node-config.json + restart) | Writable in UI (Settings → AI) |",
    "| Ports | Webhook 18789 | Bridge 3031 |",
    "| Toggle | `openclawEnabled` | `bridgeEnabled` |",
    "",
    "Both can run simultaneously (mode = 'both'). The user picks which agent",
    "handles each conversation by messaging the corresponding peer.",
    "",
    "### Built-in Ext Agent presets",
    "",
    "| Agent | Default URL | Port |",
    "|-------|------------|------|",
    "| **HomeClaw** | `http://127.0.0.1:8010/message` | 8010 |",
    "| **Hermes** | `http://127.0.0.1:8020/message` | 8020 |",
    "| **OpenHuman** | `http://127.0.0.1:8021/message` | 8021 |",
    "| **OpenClaw (Ext)** | `http://127.0.0.1:18789/webhook/envoymesh` | 18789 |",
    "",
    "Custom agents can be added (e.g. a coding agent on port 8022).",
    "",
    "### How to configure an Ext Agent (step by step)",
    "",
    "1. Go to **Settings → AI → AI Engine** section.",
    "2. Under **Ext Agent**, click **Configure**.",
    "3. **Select Agent** — choose HomeClaw / Hermes / OpenHuman / OpenClaw / custom.",
    "4. **Webhook URL** — confirm or edit (e.g. `http://127.0.0.1:8010/message`).",
    "5. **Listen Port** — default 3031 (the bridge's `/bridge/send` port).",
    "6. Check **Enable Ext Agent**.",
    "7. Click **Save**.",
    "8. Restart the node for the bridge to activate.",
    "",
    "On EnvoyGo: Me tab → AI Engine → same fields, syncs to desktop.",
    "",
    "### How the bridge works (for troubleshooting)",
    "",
    "- Mesh → Agent: bonded peer sends `chat.message` → bridge POSTs to",
    "  `agentUrl` with `{ from, fromOwnerId, fromName, text }`.",
    "- Agent → Mesh: agent POSTs `{ to, text }` to `http://127.0.0.1:3031/bridge/send`.",
    "  The `to` field must be the mesh **peer id** (`envoy_...`), not owner id.",
    "- One bridge = one agent. Don't point multiple agents at the same bridge.",
    "- 401 errors: check `secret` / `bridgeSecret` / `inboundSecret` matching.",
    "- 403 errors: add the sender's `ownerId` to the agent's `allowedOwnerIds`.",
    "",
    "---",
    "",
    "## Terminals (remote shell + AI assist)",
    "",
    "Terminals give you a full PTY shell on the home node, accessible from",
    "desktop and EnvoyGo.",
    "",
    "### Desktop (Social UI)",
    "- Open the **Chat** tab → switch to the **Terminals** sub-tab.",
    "- Create a new session (choose shell: bash/zsh, optional working directory).",
    "- Full xterm.js terminal with resize, scrollback, and reattach.",
    "- **Terminal AI assist** (Agent bar): type a natural-language command,",
    "  the AI suggests the shell command. Configure in Settings → AI →",
    "  Terminal assist (model, auto-run policy, allow/deny patterns).",
    "",
    "### EnvoyGo (mobile)",
    "- Terminals appear as threads in the Chats tab (type: terminal).",
    "- Full xterm.js emulation via WebView, keystrokes forwarded over",
    "  `homeTerminalWsSend` RPC.",
    "- Create new terminal via the + FAB in Chats.",
    "- Terminal AI assist runs on the home node (not on the phone).",
    "",
    "---",
    "",
    "## Trust tiers (security model)",
    "",
    "| Tier | Who | What they can access |",
    "|------|-----|---------------------|",
    "| Blocked | Anyone you block | Nothing — all requests denied |",
    "| Public (stranger) | Unknown peers | Only bond requests / pings |",
    "| Referred (introduced) | Friend-of-friend | Limited queries, public sensitivity |",
    "| Direct (friend) | Trusted contacts | Up to friends sensitivity, knowledge queries |",
    "",
    "Trust upgrades are human-committed by default (the user must click accept).",
    "Bond autonomy can auto-accept within policy bounds.",
    "",
    "## How bonds work",
    "",
    "1. User A clicks 'Say hello' on User B's profile in Discover.",
    "2. A signed bond.request envelope is sent to B.",
    "3. B accepts (manually or via bond autonomy).",
    "4. Both nodes store a trust record at the agreed tier.",
    "5. A and B can now chat, call, share files, and run chains together.",
    "",
    "## Getting started (for brand-new users)",
    "",
    "If the user has 0 contacts:",
    "1. Go to **Discover** — we already searched for people who share their interests.",
    "2. Click **Say hello** on someone interesting.",
    "3. Wait for them to accept (they'll appear in Chat).",
    "4. To connect a model (optional but recommended): **Settings → AI → Configure**.",
    "5. Try chatting with **EnvoyAI** (always in the sidebar) — that's me!",
    "",
    "## Connecting an AI model",
    "",
    "1. Settings → AI → Model provider section.",
    "2. Choose a provider:",
    "   - **OpenAI-compatible:** OpenAI, Groq, Together, etc. Needs API key.",
    "   - **Anthropic-compatible:** Claude models. Needs API key.",
    "   - **Ollama:** Local, free, private. Install from ollama.com, pull a model",
    "     like `llama3.2`, point to http://localhost:11434.",
    "   - **LiteLLM:** Proxy to any provider.",
    "3. Enter endpoint URL, model name, and API key.",
    "4. Save. The assistant is now fully powered.",
    "",
    "## Troubleshooting",
    "",
    "| Problem | Solution |",
    "|---------|----------|",
    "| No contacts after saying hello | The other person hasn't accepted yet — check 'Waiting on hello reply' |",
    "| Call won't connect | Check Settings → Network → ICE/TURN servers. Both peers must be online |",
    "| Assistant says 'AI Disabled' | Configure a model in Settings → AI |",
    "| Assistant in 'limited mode' | No model configured — scripted onboarding responses only |",
    "| Can't find any peers | Ensure node is running (Settings → Network). Try 'Same Wi-Fi' |",
    "| Chain has no workers | Need bonded contacts with active agents + configured model |",
    "| Node offline | Settings → Network → click Restart, or restart the app |",
    "",
    "---",
    "",
    "## Common questions (quote these directly when relevant)",
    "",
    "**Q: How do I find my first contact?**",
    "A: Open the **Discover** tab. We already searched for people who share your",
    "interests. Click 'Say hello' — once they accept, they'll appear in Chat.",
    "You can also paste a contact link (`envoy://contact?...`).",
    "",
    "**Q: What can EnvoyMesh do?**",
    "A: Chat (direct + group), voice notes, voice/video calls, file sharing,",
    "multi-agent chains, mesh knowledge queries, AI assistance (me!), and it's",
    "all decentralized — no central server, you own your data.",
    "",
    "**Q: Is it secure?**",
    "A: Yes. Every message is Ed25519-signed. Identity is cryptographic. Trust",
    "tiers control what each contact can access. Everything is auditable on-device.",
    "",
    "**Q: What are chains (Agent Network)?**",
    "A: Multi-agent task collaboration. Describe a goal (like 'Research X and",
    "summarize the top 3') → your agent decomposes it → your contacts' agents",
    "BID on subtasks (cost + ETA) → the best bid wins → they execute → results",
    "merge into a cited report with cost breakdown. Open the **Chains** tab,",
    "click **New chain**, and describe your goal. Needs bonded contacts with",
    "active agents + a configured model.",
    "",
    "**Q: My chain has no workers / no bids. Why?**",
    "A: Workers come from your **bonded contacts** whose agents are online and",
    "have matching capabilities. If you have 0 bonded contacts, or your contacts'",
    "agents aren't running, there are no workers to bid. Get more contacts first",
    "(Discover tab), then make sure they have AI agents configured.",
    "",
    "**Q: Can I control which worker wins a bid?**",
    "A: Yes. By default bids auto-evaluate after 30 seconds (best composite",
    "score wins). To override: open the active chain → **Manage** → **Live bids**",
    "→ click **Award** on the worker you prefer. You can also **Counter-bid**",
    "(raise the cost ceiling and rebroadcast) or **Rebalance** (add budget).",
    "",
    "**Q: How do I connect an AI model?**",
    "A: Settings → AI → choose a provider → enter endpoint + model + API key →",
    "Save. Ollama is free and runs locally (`ollama pull llama3.2`).",
    "",
    "**Q: Why is the assistant in 'limited mode'?**",
    "A: No model is configured. I can help with onboarding, but for full Q&A,",
    "vault search, and chains, connect a model in Settings → AI.",
    "",
    "**Q: How do I block someone?**",
    "A: Right-click (or long-press) the contact in Chat sidebar → Block.",
    "",
    "**Q: How do I use EnvoyGo (mobile)?**",
    "A: On desktop, open Settings → Network (or the QR icon) to show a pairing",
    "QR code. Open EnvoyGo on your phone → Scan QR → confirm. You're connected!",
    "EnvoyGo gives you chat, voice calls, terminals, chain reports, and AI —",
    "all remotely through your home node.",
    "",
    "**Q: How do I connect HomeClaw / Hermes / OpenHuman as an Ext Agent?**",
    "A: Settings → AI → AI Engine → Ext Agent → Configure → select the agent",
    "(HomeClaw on :8010, Hermes on :8020, OpenHuman on :8021) → Enable → Save",
    "→ restart the node. The agent must be running at its URL and configured",
    "with the EnvoyMesh channel plugin.",
    "",
    "**Q: What's the difference between EnvoyAI and Ext Agent?**",
    "A: EnvoyAI is the built-in OpenClaw gateway bundled with EnvoyMesh — it",
    "runs in-process and you're talking to it right now. Ext Agent is an",
    "external agent (HomeClaw, Hermes, etc.) connected via the HTTP bridge.",
    "Both can coexist; you choose which to message.",
    "",
    "**Q: How do I use terminals?**",
    "A: Desktop: Chat tab → Terminals sub-tab → create a session. Mobile",
    "(EnvoyGo): terminals appear in the Chats tab. You get a full shell on",
    "the home node with AI command assist (type what you want in plain English).",
    "",
  ].join("\n");
}

function buildAgentsMd(): string {
  return [
    "# AGENTS.md - Your Workspace",
    "",
    "## First Run",
    "",
    "Bootstrap is complete. Do not follow BOOTSTRAP.md or ask first-contact onboarding questions.",
    "",
    "## EnvoyMesh",
    "",
    "You have EnvoyMesh tools (mesh.*). Use them for discovery, bonds, knowledge, and tasks.",
    "",
  ].join("\n");
}

/**
 * Ensure a persistent OpenClaw workspace under the node profile.
 * Skips BOOTSTRAP.md and marks setup complete so EnvoyAI does not run first-contact onboarding.
 */
export function ensureOpenClawWorkspace(
  profileDir: string,
  seed: OpenClawWorkspaceSeed,
  options?: { legacySkillsDir?: string },
): string {
  const dir = openClawWorkspaceDir(profileDir);
  mkdirSync(join(dir, ".openclaw"), { recursive: true });
  mkdirSync(join(dir, "memory"), { recursive: true });
  mkdirSync(join(dir, "skills"), { recursive: true });

  const bootstrapPath = join(dir, "BOOTSTRAP.md");
  if (existsSync(bootstrapPath)) {
    try {
      unlinkSync(bootstrapPath);
    } catch {
      /* ignore */
    }
  }

  writeIfAbsent(join(dir, "IDENTITY.md"), buildIdentityMd());
  writeFileSync(join(dir, "SOUL.md"), buildSoulMd(), { encoding: "utf-8", mode: 0o600 });
  writeFileSync(join(dir, "TOOLS.md"), buildToolsMd(), { encoding: "utf-8", mode: 0o600 });
  writeIfAbsent(join(dir, "AGENTS.md"), buildAgentsMd());
  writeFileSync(join(dir, "USER.md"), buildUserMd(seed), { encoding: "utf-8", mode: 0o600 });
  // Comprehensive product guide — the agent reads this to answer user questions.
  // Always overwritten (not writeIfAbsent) so it stays current with the app version.
  writeFileSync(join(dir, "ENVOYMESH_GUIDE.md"), buildEnvoyMeshGuideMd(), { encoding: "utf-8", mode: 0o600 });

  const statePath = join(dir, ".openclaw", "workspace-state.json");
  const now = new Date().toISOString();
  let state: { setupCompletedAt?: string; bootstrapSeededAt?: string } = {};
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf-8"));
    } catch {
      state = {};
    }
  }
  if (!state.setupCompletedAt) {
    state.setupCompletedAt = now;
  }
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });

  if (seed.agentIdentitySnippet?.trim()) {
    writeIfAbsent(join(dir, "MEMORY.md"), [
      "# MEMORY.md",
      "",
      "## Agent identity (from EnvoyMesh)",
      "",
      seed.agentIdentitySnippet.trim(),
      "",
    ].join("\n"));
  }

  if (options?.legacySkillsDir?.trim()) {
    importLegacySkillsIntoWorkspace({
      legacySkillsDir: options.legacySkillsDir.trim(),
      workspaceDir: dir,
    });
  }

  return dir;
}

