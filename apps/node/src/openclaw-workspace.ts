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
    "When asked about ANY of these EnvoyMesh topics — or any term you don't",
    "recognize that might be an EnvoyMesh feature — read `ENVOYMESH_GUIDE.md`",
    "first. It covers everything. Never say you don't have context.",
    "",
    "Key EnvoyMesh terms to recognize:",
    "Social (Chats, Feed, Blog, Discover, Explore), Knowledge (Browse, Ask, Plugins, Setup),",
    "Team jobs, Agent Network, Manage workers, Office LAN team, Join Agent Network,",
    "Ext Agent, HomeClaw, Hermes, OpenHuman, bridge, EnvoyAI, EnvoyGo, Pi,",
    "Envoy Local (chat llama-server), Envoy Local embedder (Knowledge Setup),",
    "chains (internal name for Team jobs), knowledge queries, vault RAG, embeddings,",
    "social intros, trust tiers, bonds, discovery, mDNS, relay, terminals, Terminal Agent,",
    "Family Network, Content, My Files, Obsidian, Notion MCP.",
    "",
    "When asked what you can help with, describe concrete EnvoyMesh capabilities:",
    "finding peers and documents, making bonds, vault Ask / RAG (same index EnvoyAI uses),",
    "Team jobs across bonded agents, mesh intelligence reports, chat history search,",
    "and web search for current events.",
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
    "- Agent triggers: `mesh.add-trigger`, `mesh.list-triggers`, `mesh.remove-trigger`, `mesh.update-trigger`.",
    "- Agent approvals: `mesh.list-pending`, `mesh.approve`, `mesh.reject`, `mesh.reject-all`, `mesh.escalate`.",
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
    "signed, and the user owns all their data on their own device (home node).",
    "",
    "## The app layout (desktop Social / Tauri)",
    "",
    "Top nav: **Social · Terminal · Knowledge · Team jobs · Settings · Profile**",
    "(plus Inbox when there are pending hellos / intros).",
    "",
    "### Social (top nav)",
    "",
    "Tabs inside Social: **Chats · Feed · Blog · Discover · Explore**.",
    "",
    "| Tab | What it is |",
    "|-----|------------|",
    "| Chats | DMs, groups, EnvoyAI row, Ext Agent row, Inbox |",
    "| Feed | Short Moments-style updates for bonded contacts |",
    "| Blog | Longer posts on the mesh |",
    "| Discover | Find people (interest / location / Wi-Fi / invite links) |",
    "| Explore | Browse peer mesh sites (Profile / Blog / PhotoWall / …) |",
    "",
    "### Chat (Social → Chats)",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Send a message | Type in the composer → Enter or Send |",
    "| Voice note | Mic button → record → Send |",
    "| Voice / video call | Phone / camera icons in the chat header |",
    "| Attach a file | Paperclip → choose a file |",
    "| Create a group | + at top of sidebar → Create group |",
    "| Contact shortcuts | Open a contact → Profile / Feed / Blog / Photo |",
    "| Block / Remove | Right-click (or long-press) a contact |",
    "| AI access per contact | Right-click → AI access |",
    "",
    "**EnvoyAI** (that's you) is always a row at the top of the chat sidebar.",
    "Slash guides: `/help`, `/about`, `/team`, `/knowledge`, `/content`, …",
    "",
    "### Discover (Social → Discover)",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Search the mesh | Name, interest, or topic in the search bar |",
    "| Search by location | Location tab → Same Country / City / Near Me |",
    "| Paste a contact link | `envoy://contact?...` |",
    "| Company / fleet invite | Paste invite link when offered |",
    "| Same Wi-Fi | 'Same Wi-Fi — people nearby' (mDNS) |",
    "| Say hello | 'Say hello' on a result — signed bond request |",
    "",
    "### Content surfaces (Feed / Blog / Explore / My Files)",
    "",
    "- **Feed / Blog:** compose and read card timelines; peer Filter from Chat shortcuts.",
    "- **Explore:** mesh browser for peer sites.",
    "- **My Files:** vault library (import, publish, share) — often reached via Knowledge",
    "  files or Content navigation depending on build.",
    "",
    "### Knowledge (top nav) — vault + embeddings",
    "",
    "Knowledge is its **own top tab** (not under Settings → AI).",
    "Panels: **Browse · Plugins · Setup**.",
    "",
    "| Panel | What it does |",
    "|-------|--------------|",
    "| Browse | File tree + **Ask your vault** (RAG Q&A over the embedding index) |",
    "| Plugins | Obsidian link/import + Notion MCP (owner EnvoyAI helpers) |",
    "| Setup | Embedding provider (default **Envoy Local embedder**), index status,",
    "  retrieval mode, knowledge paths |",
    "",
    "**Ask vs EnvoyAI:**",
    "- **Ask** calls `knowledgeQuery` against the vault embedding index.",
    "- **EnvoyAI chat** injects retrieved chunks from the **same** index on each turn.",
    "- No separate 'sync to EnvoyAI' step — once Setup indexes `notes/` (and linked",
    "  Obsidian paths for owner scope), both Ask and EnvoyAI can use that knowledge.",
    "- Mesh contacts querying you use `knowledge.query` with bond/policy limits —",
    "  not your full private owner view. Notion MCP is owner-EnvoyAI only.",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Ask the vault | Knowledge → Browse → type a question → Ask |",
    "| Install local embedder | Knowledge → Setup → Embedding →",
    "  **Install & start Envoy Local embedder** (or Browse gate → Download) |",
    "| Switch embed model | Knowledge → Setup → Embedding → pick 0.6B (default) or 4B |",
    "| Use cloud / Ollama embed | Knowledge → Setup → Embedding provider → OpenAI / Ollama / … |",
    "| Rebuild index | Knowledge → Setup → **Rebuild knowledge index** |",
    "| Link Obsidian | Knowledge → Plugins → Obsidian |",
    "| Notion MCP | Knowledge → Plugins → Notion (optional) |",
    "| Open from Settings | Settings → AI shows a shortcut 'Open Knowledge' |",
    "",
    "See **Envoy Local** below — chat GGUF and Knowledge embedder are **separate**.",
    "",
    "### Team jobs (top nav) — Agent Network",
    "",
    "UI name: **Team jobs**. Internally these are multi-agent **chains**.",
    "Split a goal across bonded contacts' agents: plan → bid/award → run → merge report.",
    "",
    "**Agent Network** = opt-in worker membership. Peers only recruit you if",
    "**Join Agent Network** is on (Team jobs → Your worker profile / Manage workers).",
    "",
    "| Action | How |",
    "|--------|-----|",
    "| Start a job | Team jobs → **New team job** → goal → Preview → Start |",
    "| Use a template | Research / Summarize / Ask my network chips |",
    "| Manage a running job | Active list → **Manage** (bids, award, counter-bid) |",
    "| Worker pool / LAN | Team jobs → **Manage workers** |",
    "| Your worker profile | Team jobs → Your worker profile (Join + skills/role) |",
    "| View reports | Team jobs → Reports |",
    "| Cancel | Cancel on an active job |",
    "",
    "**Office LAN quick path (same Wi-Fi desks — do on EVERY machine):**",
    "1. Team jobs → Manage workers → **Enable office LAN team**",
    "   (Join Agent Network + LAN Auto-Bond + shared fleet token).",
    "2. First machine: **Copy token** and share out-of-band.",
    "3. Other machines: Enable office LAN team (or paste the same token).",
    "4. Pass check: Contacts show peers at **direct** trust; New team job finds workers.",
    "",
    "EnvoyGo can **start/view** Team jobs against a paired home node, but fleet/LAN",
    "setup is desktop Social on each home node.",
    "",
    "**How a team job works (simplified):**",
    "1. You describe a goal.",
    "2. Orchestrator (EnvoyAI) decomposes into subtasks (LLM if enabled).",
    "3. Proposals fan out to bonded workers with Join on + matching skills.",
    "4. Workers bid (cost / ETA); auto-award or you Manage → Award.",
    "5. Workers run; orchestrator synthesizes a cited report.",
    "",
    "**Lifecycle (status chips):** planning → bidding → assigning / waiting workers →",
    "running → synthesizing → completed | failed | cancelled (plus await-owner refine).",
    "",
    "**Budget & defaults:** Settings historically exposed chain defaults (rebalance,",
    "stall timeout, LLM decomposition). Prefer Team jobs UI + Settings → AI for models.",
    "",
    "**Troubleshooting:**",
    "- **no_workers / 0 workers:** contacts bonded but Join Agent Network off, or",
    "  Agent Cards not synced — use Enable office LAN team or Your worker profile.",
    "- **Bids never arrive:** remote agents offline or no model configured.",
    "- Ask EnvoyAI `/team` for the full LAN setup narrative.",
    "",
    "### Agent features (EnvoyAI)",
    "",
    "**Identity:** own agent peer id + owner-signed credential.",
    "**Approvals:** sensitive actions queue until you approve (Inbox / Approvals).",
    "**Skills:** Skill Manager from EnvoyAI `/skills` or Settings.",
    "**Triggers / mode / style:** time, event, and topic triggers; reactive vs proactive.",
    "**Mesh tools:** discovery, bonds, knowledge, vault, Team jobs orchestration, etc.",
    "",
    "### Settings",
    "",
    "Typical tabs: **Account · AI · Network · Family · App** (labels may vary slightly).",
    "",
    "**AI:** chat models (OpenAI / Anthropic / Ollama / Envoy Local / …), Ext Agent,",
    "Pi, terminal assist. Knowledge Browse/Ask/Plugins/Setup live under **Knowledge**",
    "(Settings → AI has an 'Open Knowledge' shortcut).",
    "",
    "**Network:** node online, relays, bootstrap, mDNS, trust mode, diagnostics.",
    "",
    "**Family:** Family Network invites (phones get limited family surfaces).",
    "",
    "### Profile",
    "",
    "Photos, About (bio, hobbies, knowledge tags, capabilities), Share contact card.",
    "",
    "---",
    "",
    "## Envoy Local (on-device llama.cpp)",
    "",
    "Optional **post-install** downloads — never bundled in the EnvoyMesh installer.",
    "Cloud API and BYO Ollama stay first-class; users may skip Local entirely.",
    "",
    "There are **two** Local sidecars (independent):",
    "",
    "| | Chat (Envoy Local) | Knowledge embedder |",
    "|---|--------------------|--------------------|",
    "| Purpose | LLM for EnvoyAI / native assist / Pi inherit | Vector embeddings for Ask + EnvoyAI RAG |",
    "| Where | Settings → AI → **Envoy Local** (Manage…) | Knowledge → Setup → **Embedding** |",
    "| Default port | `127.0.0.1:18790` (OpenAI `/v1`) | `127.0.0.1:18791` (embed API) |",
    "| Model type | Instruct chat GGUF (Qwen / Gemma / Llama, …) | Embedding GGUF (Qwen3 Embedding 0.6B or 4B) |",
    "",
    "**Important:** the chat GGUF server does **not** embed vault text. Turning on",
    "Envoy Local for chat does **not** replace Knowledge Setup. Default Knowledge",
    "embedding is its own Envoy Local embedder (auto-download).",
    "",
    "### Set up Envoy Local for chat (EnvoyAI offline)",
    "",
    "1. Settings → AI → **Envoy Local** → **Manage Envoy Local…**",
    "   (or confirm the first-run dialog **Download & enable** when no cloud/Ollama",
    "   model is configured).",
    "2. **Download & enable Envoy Local** — engine + one recommended chat GGUF",
    "   (hardware-aware: often Qwen 2B/4B/9B). Progress: engine → model → starting.",
    "3. When status is **Ready** / **In use**, EnvoyAI (and Pi inherit) use Local.",
    "4. Optional: Manage → Models — search curated / Hugging Face, **Set active**,",
    "   tune context / GPU layers, **Update engine**, set China vs Global download region.",
    "5. **Stop Envoy Local** switches inference back to saved cloud/Ollama settings",
    "   without deleting those providers. **Disable** turns Local off across restarts.",
    "",
    "Saving a non–Envoy Local chat provider (cloud / Ollama / disabled) stops the",
    "chat sidecar. Boot only auto-starts Local when it was left **enabled** and",
    "assets are already on disk — never a silent first download.",
    "",
    "**Who uses chat Local:** EnvoyAI / OpenClaw, native chat assist, Pi (inherit).",
    "HomeClaw / Hermes / OpenHuman keep their own LLMs.",
    "",
    "### Set up Envoy Local for Knowledge embedding",
    "",
    "1. Knowledge → Setup → section **Embedding**",
    "   (or Knowledge Browse gate: **Download embedding model**).",
    "2. Provider default: **Envoy Local (llama.cpp embed)**.",
    "3. Click **Install & start Envoy Local embedder** if not running.",
    "4. Default model: **Qwen3 Embedding 0.6B** (~0.5 GB). Optional **4B** (~2.5 GB)",
    "   for stronger retrieval — downloads when selected.",
    "5. Wait until status shows embedder running; use **Test embedding** if unsure.",
    "6. Index vault files (automatic when enabled; or **Rebuild knowledge index**).",
    "",
    "You can switch Embedding provider anytime to **Ollama**, **OpenAI**, MiniMax,",
    "Zhipu, Qwen, or custom OpenAI-compatible **without** changing the chat model.",
    "Changing the effective embedder clears/rebuilds the vector index (confirm dialog).",
    "",
    "**Do not** rely on Embedding = Inherit from chat when chat is Envoy Local —",
    "that path falls back to weak **mock** vectors. Prefer the dedicated Local",
    "embedder (default) or a real Ollama/cloud embedding API.",
    "",
    "### Troubleshooting Envoy Local",
    "",
    "| Problem | Solution |",
    "|---------|----------|",
    "| Chat download stuck / fetch failed | Manage → download region China (mirrors) or VPN + Global |",
    "| Chat Ready but Ask empty | Install Knowledge embedder separately; index `notes/` |",
    "| Embedder not running | Knowledge → Setup → Install & start Envoy Local embedder |",
    "| OOM / slow Local chat | Manage → lower context (32K default), fit on, fewer GPU layers |",
    "| Want cloud chat + local embed | Keep cloud in Settings → AI; leave Knowledge on Envoy Local embed |",
    "| Want local chat + cloud embed | Enable Envoy Local chat; Knowledge Embedding → OpenAI/Ollama |",
    "",
    "---",
    "",
    "## EnvoyGo (product mobile) vs Capacitor backup",
    "",
    "**EnvoyGo** (Flutter) is the **product phone app**: thin client paired to the",
    "**home node** via QR. Chat, Terminals, EnvoyAI, Team jobs, Knowledge Ask, and",
    "Content run against home JSON-RPC — the phone does not run a full mesh node.",
    "",
    "**Capacitor `apps/mobile`** is a **backup / legacy** full-node-in-WebView experiment.",
    "Do not describe Capacitor as the primary mobile product unless the user asks.",
    "",
    "### Pairing EnvoyGo with home",
    "",
    "1. Home desktop: open pairing QR (`envoy://pair?...`).",
    "2. EnvoyGo: scan / paste pair URI.",
    "3. Phone uses home for vault, LLM, terminals, and mesh.",
    "",
    "---",
    "",
    "## Ext Agent (external AI agents)",
    "",
    "EnvoyMesh can connect **external agents** (HomeClaw, Hermes, Codex, Claude Code, …)",
    "beside built-in EnvoyAI via the HTTP **bridge**.",
    "",
    "| | Built-in EnvoyAI | Ext Agent |",
    "|---|---|---|",
    "| What | OpenClaw on the home node | External process + bridge |",
    "| Mesh tools | Yes (mesh.*) | Same tools via bridge HTTP |",
    "| Config | Settings → AI | Settings → AI → Ext Agent |",
    "| Chat | EnvoyAI sidebar row | Separate Ext Agent row when enabled |",
    "",
    "Configure: Settings → AI → Ext Agent → pick agent → Enable → Save",
    "(restart may be required for the bridge).",
    "",
    "---",
    "",
    "## Terminals",
    "",
    "Home-node PTY shells (desktop Social → **Terminal**; also EnvoyGo against home).",
    "Terminal Agent proposes shell commands (Manual / Agent mode).",
    "Terminal-local slash commands (`/goal`, `/watch`, …) live **only** in the",
    "Terminal panel — not in EnvoyAI chat. Pi is a separate local coding agent",
    "(project folder; no mesh tools).",
    "",
    "---",
    "",
    "## Trust tiers",
    "",
    "| Tier | Who | Access |",
    "|------|-----|--------|",
    "| Blocked | Blocked peers | Nothing |",
    "| Public | Strangers | Bond / ping only |",
    "| Referred | Friend-of-friend | Limited / public sensitivity |",
    "| Direct | Friends | Up to friends sensitivity; knowledge.query |",
    "",
    "## How bonds work",
    "",
    "1. Discover → Say hello (bond.request).",
    "2. Peer accepts.",
    "3. Both store trust; chat / calls / files / Team jobs become available.",
    "",
    "## Getting started (0 contacts)",
    "",
    "1. Social → Discover → Say hello.",
    "2. Settings → AI → cloud / Ollama **or** Envoy Local (chat) — see Envoy Local.",
    "3. Knowledge → Setup → Envoy Local embedder (or other embedding provider).",
    "4. Chat with **EnvoyAI** in the sidebar — that's me.",
    "5. Optional: Team jobs → Manage workers → Enable office LAN team for desks.",
    "",
    "## Connecting an AI model",
    "",
    "**Chat:** Settings → AI → provider (OpenAI-compatible / Anthropic / Ollama /",
    "Envoy Local / …) → endpoint, model, key → Save. Or Manage Envoy Local →",
    "Download & enable.",
    "",
    "**Embeddings (Ask + RAG):** Knowledge → Setup → Embedding — default Envoy Local",
    "embedder; independent from the chat provider.",
    "",
    "## Troubleshooting",
    "",
    "| Problem | Solution |",
    "|---------|----------|",
    "| Hello pending | Peer hasn't accepted — check Waiting on hello reply |",
    "| Ask / EnvoyAI misses notes | Knowledge → Setup: embedder ready + index; files under notes/ |",
    "| AI Disabled | Settings → AI configure a model or enable Envoy Local |",
    "| Local chat vs Ask both broken | Fix chat Local and Knowledge embedder separately |",
    "| Team job no workers | Manage workers / Join Agent Network / Office LAN token |",
    "| Can't find peers | Settings → Network; try Same Wi-Fi |",
    "| Node offline | Restart home node / Settings → Network |",
    "",
    "---",
    "",
    "## Common questions",
    "",
    "**Q: How do I find my first contact?**",
    "A: Social → Discover → Say hello (or paste `envoy://contact?...`).",
    "",
    "**Q: What can EnvoyMesh do?**",
    "A: Chat, calls, Feed/Blog/Explore, Knowledge Ask + vault, Team jobs,",
    "Terminals, EnvoyAI / Ext Agent / Pi, Family Network — local-first P2P.",
    "",
    "**Q: Does EnvoyAI use my Knowledge automatically?**",
    "A: Yes. After Knowledge Setup indexes the vault, EnvoyAI retrieves from the",
    "same embedding database Ask uses. No separate sync step.",
    "",
    "**Q: Where is Knowledge?**",
    "A: Top nav → **Knowledge** (Browse / Plugins / Setup). Not buried only in Settings.",
    "",
    "**Q: What are Team jobs?**",
    "A: Multi-agent jobs across bonded contacts (plan → bid → run → report).",
    "Open **Team jobs**. For LAN desks use Manage workers → Enable office LAN team.",
    "Slash: `/team`.",
    "",
    "**Q: What are knowledge queries on the mesh?**",
    "A: Bonded contacts can send `knowledge.query`; your node answers from vault",
    "within trust-tier / syndication policy — not the full private owner corpus.",
    "",
    "**Q: EnvoyGo vs Capacitor mobile?**",
    "A: **EnvoyGo** is the product phone app (thin client → home). Capacitor is backup.",
    "",
    "**Q: EnvoyAI vs Ext Agent vs Pi?**",
    "A: EnvoyAI = built-in OpenClaw + mesh tools. Ext Agent = external process via",
    "bridge. Pi = local coding agent, no mesh tools. Slash: `/envoyai`, `/extagent`, `/pi`.",
    "",
    "**Q: How do I connect a model?**",
    "A: Settings → AI → provider → Save. Or Envoy Local → Download & enable for",
    "on-device chat. Embeddings: Knowledge → Setup (separate from chat).",
    "",
    "**Q: What is Envoy Local?**",
    "A: Optional on-device llama.cpp. **Chat** = Settings → AI → Envoy Local.",
    "**Knowledge embedding** = Knowledge → Setup → Envoy Local embedder. Two",
    "sidecars; enabling chat Local does not embed the vault by itself.",
    "",
    "**Q: How do I set up Knowledge embedding offline?**",
    "A: Knowledge → Setup → Install & start Envoy Local embedder (0.6B default).",
    "Then Ask / EnvoyAI RAG use that index. Or use Ollama/cloud embedding APIs.",
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
    "## Product Knowledge",
    "",
    "Read `ENVOYMESH_GUIDE.md` for the full product guide — Social tabs,",
    "Knowledge (Browse/Ask/Plugins/Setup), Envoy Local (chat + embedder),",
    "Team jobs / Agent Network, EnvoyGo, Ext Agent, Terminals, trust tiers,",
    "and troubleshooting.",
    "Always consult it before answering EnvoyMesh feature questions.",
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

