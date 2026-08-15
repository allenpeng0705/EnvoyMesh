import type { ExtAgentCommandCatalog, ExtAgentCommandDescriptor } from "@envoymesh/api";

/** Re-export Ext Agent filter helpers for EnvoyAI (same descriptor shape). */
export {
  filterExtAgentSlashCommands,
  isExtAgentSlashSuggestInput,
  isExtAgentHelpCommand,
} from "./ext-agent-slash-commands.js";

export type EnvoyAiSlashAction =
  | { type: "help" }
  | { type: "clear" }
  | { type: "status" }
  | { type: "model" }
  | { type: "skills" }
  | { type: "approvals" }
  | { type: "report" }
  | { type: "expand"; prompt: string }
  | { type: "unknown_slash"; text: string };

/** Keep in sync with apps/node/src/envoy-ai-command-catalog.ts ENVOY_AI_FEATURE_EXPAND_PROMPTS. */
const FEATURE_EXPAND = {
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
    "2. Under Office LAN, click Enable office LAN team. That turns on Join Agent Network, LAN Auto-Bond, auto-join Agent Network, lan-fast discovery, and creates a shared fleet token if missing. To turn it off later: same place → Disable office LAN team (keeps the token for easy re-enable).\n" +
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
    "Explain EnvoyMesh Content surfaces: Feed (short updates for bonded contacts), Blog (longer posts on the mesh), Explore (browse peer sites), and Knowledge (vault knowledge base — Browse / Ask / Setup). Tell me where to open Content on desktop Social and on EnvoyGo.",
} as const;

/**
 * Parse EnvoyAI slash input. Returns null for non-slash / empty.
 * Hybrid verbs expand into NL prompts for runOwnerAgentTurn.
 */
export function parseEnvoyAiSlashCommand(input: string): EnvoyAiSlashAction | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  const cmd = (parts[0] ?? "").toLowerCase();
  const rest = parts.slice(1).join(" ").trim();

  switch (cmd) {
    case "help":
      return { type: "help" };
    case "clear":
      return { type: "clear" };
    case "status":
      return { type: "status" };
    case "model":
      return { type: "model" };
    case "skills":
      return { type: "skills" };
    case "approvals":
      return { type: "approvals" };
    case "report":
      return { type: "report" };
    case "about":
      return { type: "expand", prompt: FEATURE_EXPAND.about };
    case "terminal":
      return { type: "expand", prompt: FEATURE_EXPAND.terminal };
    case "team":
      return { type: "expand", prompt: FEATURE_EXPAND.team };
    case "family":
      return { type: "expand", prompt: FEATURE_EXPAND.family };
    case "extagent":
      return { type: "expand", prompt: FEATURE_EXPAND.extagent };
    case "envoyai":
      return { type: "expand", prompt: FEATURE_EXPAND.envoyai };
    case "pi":
      return { type: "expand", prompt: FEATURE_EXPAND.pi };
    case "content":
      return { type: "expand", prompt: FEATURE_EXPAND.content };
    case "bonds":
      return {
        type: "expand",
        prompt:
          "Using EnvoyMesh mesh tools, summarize my bonded contacts, trust tiers, and any notable offline or dormant bonds.",
      };
    case "files":
      return {
        type: "expand",
        prompt:
          "Using EnvoyMesh mesh tools, list files in my vault and OpenClaw workspace. Summarize what’s available.",
      };
    case "discover":
      return {
        type: "expand",
        prompt: rest
          ? `Using EnvoyMesh discovery tools, help me find peers related to: ${rest}`
          : "Using EnvoyMesh discovery tools, help me discover peers and capabilities on the mesh.",
      };
    case "knowledge":
      if (!rest) return { type: "help" };
      return {
        type: "expand",
        prompt: `Using EnvoyMesh vault and mesh knowledge tools, answer this: ${rest}`,
      };
    case "share":
      return {
        type: "expand",
        prompt: rest
          ? `Using EnvoyMesh share tools, help me share a vault file with a contact. Context: ${rest}`
          : "Using EnvoyMesh share tools, explain how I can share a vault library file with a bonded contact, and help me do it if I name a file and contact.",
      };
    default:
      return { type: "unknown_slash", text: trimmed };
  }
}

export function formatEnvoyAiSlashHelp(catalog: ExtAgentCommandCatalog): string {
  const lines: string[] = ["EnvoyAI slash commands:"];
  if (catalog.commands.length === 0) {
    lines.push("(none)");
  } else {
    for (const cmd of catalog.commands) {
      const args = cmd.argsHint ? ` ${cmd.argsHint}` : "";
      lines.push(`${cmd.slash}${args} — ${cmd.summary}`);
    }
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

export function envoyAiSlashCommands(
  catalog: ExtAgentCommandCatalog | null | undefined,
): ExtAgentCommandDescriptor[] {
  return catalog?.commands ?? [];
}
