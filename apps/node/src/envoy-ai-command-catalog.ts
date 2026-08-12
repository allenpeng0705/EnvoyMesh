/**
 * EnvoyAI (built-in OpenClaw) slash catalog for Social / EnvoyGo chat.
 * Envoy-owned commands for mesh UX; curated expand prompts for mesh tools
 * and product feature guides.
 */
import type { ExtAgentCommandCatalog, ExtAgentCommandDescriptor } from "@envoymesh/api";
import {
  mergeMmxMediaLimitations,
  mergeMmxMediaSlashCommands,
} from "./mmx-media-slash.js";

export const ENVOY_AI_COMMAND_CATALOG_VERSION = "3";

type StaticCmd = {
  slash: string;
  summary: string;
  argsHint?: string;
  intercept: ExtAgentCommandDescriptor["intercept"];
};

const COMMANDS: StaticCmd[] = [
  {
    slash: "/help",
    summary: "List EnvoyAI slash commands",
    intercept: "envoy",
  },
  {
    slash: "/clear",
    summary: "Clear this EnvoyAI chat and OpenClaw session memory",
    intercept: "envoy",
  },
  {
    slash: "/status",
    summary: "Show OpenClaw / EnvoyAI engine status",
    intercept: "envoy",
  },
  {
    slash: "/model",
    summary: "Show how to change the AI model (Settings → AI)",
    intercept: "envoy",
  },
  {
    slash: "/skills",
    summary: "Open the Skill Manager",
    intercept: "envoy",
  },
  {
    slash: "/approvals",
    summary: "Show pending agent approvals",
    intercept: "envoy",
  },
  {
    slash: "/report",
    summary: "Generate a mesh intelligence report",
    intercept: "envoy",
  },
  {
    slash: "/about",
    summary: "Explain EnvoyMesh and its major features",
    intercept: "hybrid",
  },
  {
    slash: "/terminal",
    summary: "Explain Terminals and Terminal Agent",
    intercept: "hybrid",
  },
  {
    slash: "/team",
    summary: "Explain Team jobs, Agent Network, and LAN office setup",
    intercept: "hybrid",
  },
  {
    slash: "/family",
    summary: "Explain Family Network",
    intercept: "hybrid",
  },
  {
    slash: "/extagent",
    summary: "Explain Ext Agent (Codex, Claude, …)",
    intercept: "hybrid",
  },
  {
    slash: "/envoyai",
    summary: "Explain EnvoyAI vs Ext Agent vs Pi",
    intercept: "hybrid",
  },
  {
    slash: "/pi",
    summary: "Explain the Pi local coding agent",
    intercept: "hybrid",
  },
  {
    slash: "/content",
    summary: "Explain Feed, Blog, Explore, and My Files",
    intercept: "hybrid",
  },
  {
    slash: "/bonds",
    summary: "Ask EnvoyAI to summarize bonded contacts (mesh tools)",
    intercept: "hybrid",
  },
  {
    slash: "/files",
    summary: "Ask EnvoyAI to list vault / workspace files (mesh tools)",
    intercept: "hybrid",
  },
  {
    slash: "/discover",
    summary: "Ask EnvoyAI to help discover peers on the mesh",
    argsHint: "[topic]",
    intercept: "hybrid",
  },
  {
    slash: "/knowledge",
    summary: "Ask EnvoyAI to search vault / mesh knowledge",
    argsHint: "<question>",
    intercept: "hybrid",
  },
  {
    slash: "/share",
    summary: "Ask EnvoyAI how to share a vault file with a contact",
    argsHint: "[hint]",
    intercept: "hybrid",
  },
];

const LIMITATIONS = [
  "These commands are EnvoyMesh-owned or expand into natural-language prompts for OpenClaw.",
  "Feature guides (/about, /terminal, /team, …) explain how to use the product; they do not switch views.",
  "OpenClaw does not expose a documented chat slash REPL in EnvoyAI — do not expect CLI-only verbs here.",
  "Terminal Agent (/goal, /watch, /openclaw) stays in the Terminal panel.",
];

/** Shared expand prompts — keep Social / EnvoyGo parsers in sync with these strings. */
export const ENVOY_AI_FEATURE_EXPAND_PROMPTS = {
  about:
    "Explain EnvoyMesh to me like a product guide: what it is (decentralized mesh, local-first, no central account), and briefly cover major surfaces — Discover/chat, EnvoyAI, Ext Agent, Terminals + Terminal Agent, Pi coding, Team jobs / Agent Network, Family Network, and Content (Feed, Blog, Explore, My Files). Tell me where to open each in Social (desktop) or EnvoyGo (phone).",
  terminal:
    "Explain how Terminals work in EnvoyMesh: open Chat → Terminals for a home-node shell; Terminal Agent can propose commands in Manual or Agent mode. Mention that Terminal-local slash commands (/goal, /watch, /openclaw, /manual, /agent, etc.) live only in the Terminal panel, not in EnvoyAI chat. Tell me how to start a session on desktop Social and on EnvoyGo.",
  team:
    "Explain Team jobs and Agent Network in EnvoyMesh in detail, with a step-by-step LAN office setup.\n\n" +
    "What they are: Team jobs split a goal across bonded contacts' agents (plan → bid/award → merge results). Agent Network is opt-in worker membership — peers only recruit you if Join Agent Network is on.\n\n" +
    "Where to configure (desktop Social on each home node — not EnvoyGo): Nav → Team jobs → Manage workers. Worker profile (Join Agent Network + skills/role) is under Team jobs → Your worker profile. EnvoyGo can start/view Team jobs against a paired home node but cannot set up the fleet/LAN.\n\n" +
    "Prerequisites for LAN: each desk machine runs EnvoyMesh with its own owner identity (do not clone profile dirs); same Wi-Fi/Ethernet subnet; firewall allows libp2p + mDNS; assigner has a usable AI model under Settings → AI. No public relay required for a LAN lab.\n\n" +
    "Recommended path — Office LAN (do this on EVERY desk machine):\n" +
    "1. Open Team jobs → Manage workers.\n" +
    "2. Under Office LAN, click Enable office LAN team. That turns on Join Agent Network, LAN Auto-Bond, auto-join Agent Network, lan-fast discovery, and creates a shared fleet token if missing.\n" +
    "3. On the first machine, Copy token and share it out-of-band.\n" +
    "4. On other machines, Enable office LAN team (or paste the same token under LAN Auto-Bond → Save).\n" +
    "5. Pass check: Contacts shows the other machines at direct trust; New team job no longer fails with no_workers.\n\n" +
    "Manual alternative: Manage workers → enable LAN Auto-Bond with a matching fleet token (≥8 chars), then separately expand Your worker profile → Join Agent Network. Bond-only LAN peers are trusted but not recruitable until Join is on (Office LAN preset turns Join on for you).\n\n" +
    "Advanced (optional): Fleet Manifest for pre-staged large fleets; Pairing Kiosk for walk-up invites. Company invite minting UI is not in Manage workers today — prefer Office LAN or Pairing Kiosk.\n\n" +
    "After setup: start New team job on the assigner; workers with Join on appear in the pool. Remind me that /team explains this — it does not switch views.",
  family:
    "Explain Family Network in EnvoyMesh: private home-node profiles, invite QR for family phones, and that family devices get EnvoyAI + family chat only — not mesh contacts, vault, or terminal. Tell me where to open Family settings on desktop (Settings → Family) and on EnvoyGo.",
  extagent:
    "Explain Ext Agent in EnvoyMesh: optional bridge to external agents (Codex, Claude Code, Hermes, etc.), how to enable/pick an agent under Settings → AI, the Ext Agent chat thread, and that each agent has its own / command catalog (unlike EnvoyAI).",
  envoyai:
    "Explain EnvoyAI (built-in OpenClaw on the home node) versus Ext Agent versus Pi: EnvoyAI has mesh tools, skills, and approvals; Ext Agent forwards to an external process; Pi is a local coding agent without mesh tools. Tell me how to use /help and feature slash commands here, and where Skills and Approvals live on desktop Social.",
  pi:
    "Explain the Pi local coding agent in EnvoyMesh: it works in a project folder (edit files, run shell) and does not use mesh tools. Tell me how to start Pi from Chat → Terminals or New Pi on desktop and EnvoyGo, and how it differs from EnvoyAI and Ext Agent.",
  content:
    "Explain EnvoyMesh Content surfaces: Feed (short updates for bonded contacts), Blog (longer posts on the mesh), Explore (browse peer sites), and My Files (vault library — import, publish, share). Tell me where to open Content on desktop Social and on EnvoyGo.",
} as const;

export function buildEnvoyAiCommandCatalog(params?: {
  now?: Date;
}): ExtAgentCommandCatalog {
  const commands: ExtAgentCommandDescriptor[] = mergeMmxMediaSlashCommands(
    COMMANDS.map((c) => ({
      slash: c.slash,
      summary: c.summary,
      ...(c.argsHint ? { argsHint: c.argsHint } : {}),
      intercept: c.intercept,
      source: "static" as const,
    })),
  );

  return {
    agentId: "envoyai",
    agentName: "EnvoyAI",
    commands,
    catalogVersion: ENVOY_AI_COMMAND_CATALOG_VERSION,
    fetchedAt: (params?.now ?? new Date()).toISOString(),
    limitations: mergeMmxMediaLimitations(LIMITATIONS),
  };
}

export function formatEnvoyAiCommandHelp(catalog: ExtAgentCommandCatalog): string {
  const lines: string[] = ["EnvoyAI slash commands:"];
  for (const cmd of catalog.commands) {
    const args = cmd.argsHint ? ` ${cmd.argsHint}` : "";
    lines.push(`${cmd.slash}${args} — ${cmd.summary}`);
  }
  if (catalog.limitations?.length) {
    lines.push("");
    lines.push("Notes:");
    for (const note of catalog.limitations) {
      lines.push(`• ${note}`);
    }
  }
  return lines.join("\n");
}

/** Expand hybrid slash verbs into prompts OpenClaw can act on. */
export function expandEnvoyAiHybridSlash(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  const cmd = (parts[0] ?? "").toLowerCase();
  const rest = parts.slice(1).join(" ").trim();

  switch (cmd) {
    case "about":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.about;
    case "terminal":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.terminal;
    case "team":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.team;
    case "family":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.family;
    case "extagent":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.extagent;
    case "envoyai":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.envoyai;
    case "pi":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.pi;
    case "content":
      return ENVOY_AI_FEATURE_EXPAND_PROMPTS.content;
    case "bonds":
      return "Using EnvoyMesh mesh tools, summarize my bonded contacts, trust tiers, and any notable offline or dormant bonds.";
    case "files":
      return "Using EnvoyMesh mesh tools, list files in my vault and OpenClaw workspace. Summarize what’s available.";
    case "discover":
      return rest
        ? `Using EnvoyMesh discovery tools, help me find peers related to: ${rest}`
        : "Using EnvoyMesh discovery tools, help me discover peers and capabilities on the mesh.";
    case "knowledge":
      if (!rest) return null;
      return `Using EnvoyMesh vault and mesh knowledge tools, answer this: ${rest}`;
    case "share":
      return rest
        ? `Using EnvoyMesh share tools, help me share a vault file with a contact. Context: ${rest}`
        : "Using EnvoyMesh share tools, explain how I can share a vault library file with a bonded contact, and help me do it if I name a file and contact.";
    default:
      return null;
  }
}
