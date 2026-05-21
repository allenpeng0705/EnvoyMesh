import type { BondRecord, DiscoverPublishedLibraryParams, DiscoverPublishedLibraryPeerResult, LibraryItem } from "./node-service.js";
import { resolveBondTarget } from "./bond-target.js";
import { runLibraryRequestShare } from "./library-request-share.js";

export type DocumentAgentIntentKind =
  | "list_library"
  | "discover"
  | "publish"
  | "unpublish"
  | "share_propose"
  | "request_share_from"
  | "transfer_status"
  | "knowledge";

export interface DocumentAgentTurnResult {
  answer: string;
  intent: DocumentAgentIntentKind;
  toolsUsed: string[];
}

export type DocumentAgentToolParams = Record<string, unknown>;

export interface DocumentAgentToolResult {
  ok: boolean;
  error?: string;
  result?: unknown;
  toolName: string;
  correlationId: string;
  latencyMs: number;
}

export interface ClassifiedDocumentIntent {
  kind: DocumentAgentIntentKind;
  fileTitleQuery?: string;
  pathHint?: string;
  targetOwnerHint?: string;
  sensitivity?: "public" | "friends" | "private";
}

export interface DocumentAgentTurnDeps {
  message: string;
  listLibraryItems: (query?: string) => Promise<LibraryItem[]>;
  getBonds: () => Promise<BondRecord[]>;
  executeTool: (toolName: string, params: DocumentAgentToolParams) => Promise<DocumentAgentToolResult>;
  knowledgeQuery: (question: string) => Promise<string>;
  /** Required for request_share_from — queries bonded peers' published catalogs. */
  discoverPublishedLibrary?: (params?: DiscoverPublishedLibraryParams) => Promise<DiscoverPublishedLibraryPeerResult[]>;
  /** Required for request_share_from — sends chat.message to contact. */
  sendChat?: (targetOwnerId: string, text: string) => Promise<void>;
}

/** Classify owner message into a document workflow (heuristic v1 — no extra LLM call). */
export function classifyDocumentIntent(message: string): ClassifiedDocumentIntent {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (/^(list|show|what).*(library|files|documents)|^\/library\b/i.test(lower)) {
    return { kind: "list_library" };
  }

  if (/^unpublish\b/i.test(lower)) {
    return {
      kind: "unpublish",
      pathHint: extractQuotedOrPath(text),
    };
  }

  const requestFromMatch =
    text.match(/^request share from\s+(.+?)\s+for\s+(.+)/i) ??
    text.match(/^ask\s+(.+?)\s+to share\s+(.+)/i);
  if (requestFromMatch) {
    return {
      kind: "request_share_from",
      targetOwnerHint: requestFromMatch[1]!.trim(),
      fileTitleQuery: requestFromMatch[2]!.trim().replace(/^["']|["']$/g, ""),
    };
  }

  if (/^publish\b|make.*discoverable/i.test(lower)) {
    return {
      kind: "publish",
      pathHint: extractQuotedOrPath(text),
    };
  }

  const discoverMatch =
    text.match(/^(?:discover|find on (?:the )?(?:mesh|contacts|network))\s+(.+)/i) ??
    text.match(/^who has\s+(.+)/i) ??
    text.match(/^find\s+(.+?)\s+(?:on|from)\s+(?:my\s+)?(?:contacts|mesh|network)/i);
  if (discoverMatch) {
    return { kind: "discover", fileTitleQuery: discoverMatch[1]!.trim() };
  }

  if (/^(transfer status|active transfers|list transfers)/i.test(lower)) {
    return { kind: "transfer_status" };
  }

  const statusOfMatch = text.match(/^status of\s+(\S+)/i);
  if (statusOfMatch) {
    return { kind: "transfer_status", pathHint: statusOfMatch[1]!.trim() };
  }

  if (/^(share|send)\b/i.test(lower) && /\bto\b/i.test(lower)) {
    const pathHint = extractQuotedOrPath(text);
    const targetOwnerHint = extractTargetHint(text);
    const sensitivity = lower.includes("private")
      ? "private"
      : lower.includes("public")
        ? "public"
        : "friends";
    return { kind: "share_propose", pathHint, targetOwnerHint, sensitivity };
  }

  return { kind: "knowledge" };
}

function extractQuotedOrPath(text: string): string | undefined {
  const quoted = text.match(/["']([^"']+)["']/);
  if (quoted?.[1]) return quoted[1].trim();
  const pathLike = text.match(/\b([\w./-]+\.(?:pdf|txt|md|docx?|csv|json|html|png|jpe?g|zip))\b/i);
  return pathLike?.[1]?.trim();
}

function extractTargetHint(text: string): string | undefined {
  const owner = text.match(/(envoy:owner:[\w-]+)/i);
  if (owner?.[1]) return owner[1];
  const toMatch = text.match(/\bto\s+([A-Za-z][\w\s.-]{0,40})/i);
  return toMatch?.[1]?.trim();
}

export { resolveBondTarget } from "./bond-target.js";

export function matchLibraryItem(items: LibraryItem[], hint: string | undefined): LibraryItem | undefined {
  if (!hint?.trim()) return undefined;
  const h = hint.trim().toLowerCase();
  return (
    items.find((i) => i.documentId === hint) ??
    items.find((i) => i.relativePath.toLowerCase() === h) ??
    items.find((i) => i.relativePath.toLowerCase().includes(h)) ??
    items.find((i) => i.title.toLowerCase().includes(h))
  );
}

function formatLibraryList(items: LibraryItem[]): string {
  if (items.length === 0) {
    return "Your vault library is empty. Import or add files under the vault root first.";
  }
  const lines = items.slice(0, 20).map((i) => {
    const pub = i.published ? " [published]" : "";
    const sizeKb = Math.max(1, Math.round(i.byteLength / 1024));
    return `• ${i.title} (${i.relativePath}, ${sizeKb} KB, id=${i.documentId.slice(0, 8)}…)${pub}`;
  });
  const extra = items.length > 20 ? `\n… and ${items.length - 20} more.` : "";
  return `Found ${items.length} file(s) in your library:\n${lines.join("\n")}${extra}\n\nMetadata only unless you share or publish.`;
}

function formatDiscoverResult(peers: unknown): string {
  if (!peers || typeof peers !== "object") {
    return "Discovery completed but returned no structured results.";
  }
  const list = peers as {
    peers?: Array<{
      displayName?: string;
      peerOwnerId: string;
      bondLevel: string;
      files: unknown[];
      error?: string;
    }>;
  };
  const rows = list.peers ?? (Array.isArray(peers) ? peers : []);
  if (rows.length === 0) {
    return "No bonded contacts responded with published library matches.";
  }
  const parts: string[] = ["Published file metadata from your contacts (bytes require share accept):"];
  for (const p of rows as Array<{
    displayName?: string;
    peerOwnerId: string;
    bondLevel: string;
    files: unknown[];
    error?: string;
  }>) {
    if (p.error) {
      parts.push(`• ${p.displayName ?? p.peerOwnerId.slice(0, 16)}… (${p.bondLevel}): ${p.error}`);
      continue;
    }
    if (!p.files?.length) {
      parts.push(`• ${p.displayName ?? p.peerOwnerId.slice(0, 16)}… (${p.bondLevel}): no matches`);
      continue;
    }
    for (const f of p.files as Array<{ title: string; relativePath: string; contentHash: string }>) {
      const name = p.displayName ?? p.peerOwnerId.replace(/^envoy:owner:/, "").slice(0, 12);
      parts.push(
        `• ${name} (${p.bondLevel}): ${f.title} — ${f.relativePath} hash ${f.contentHash.slice(0, 12)}…`,
      );
      parts.push(`  → request: \`request share from ${name} for ${f.title}\``);
    }
  }
  parts.push("\nTo request a file, say: request share from {contact} for {title}. Bytes require their share accept.");
  return parts.join("\n");
}

export async function runDocumentAgentTurn(deps: DocumentAgentTurnDeps): Promise<DocumentAgentTurnResult> {
  const intent = classifyDocumentIntent(deps.message);
  const toolsUsed: string[] = [];

  if (intent.kind === "knowledge") {
    const answer = await deps.knowledgeQuery(deps.message);
    return { answer, intent: "knowledge", toolsUsed };
  }

  if (intent.kind === "list_library") {
    toolsUsed.push("mesh.library_list");
    const result = await deps.executeTool("mesh.library_list", {});
    if (!result.ok) {
      return { answer: `Could not list library: ${result.error}`, intent: "list_library", toolsUsed };
    }
    const items = ((result.result as { items?: LibraryItem[] })?.items ?? []) as LibraryItem[];
    return { answer: formatLibraryList(items), intent: "list_library", toolsUsed };
  }

  if (intent.kind === "discover") {
    toolsUsed.push("mesh.library_discover");
    const result = await deps.executeTool("mesh.library_discover", {
      fileTitleQuery: intent.fileTitleQuery,
    });
    if (!result.ok) {
      return { answer: `Discovery failed: ${result.error}`, intent: "discover", toolsUsed };
    }
    return {
      answer: formatDiscoverResult(result.result),
      intent: "discover",
      toolsUsed,
    };
  }

  const items = await deps.listLibraryItems();

  if (intent.kind === "publish" || intent.kind === "unpublish") {
    const item = matchLibraryItem(items, intent.pathHint);
    if (!item) {
      return {
        answer: intent.pathHint
          ? `I could not find a library file matching "${intent.pathHint}". Try "list my library" first.`
          : 'Specify a file path or title, e.g. publish "docs/report.pdf".',
        intent: intent.kind,
        toolsUsed,
      };
    }
    const published = intent.kind === "publish";
    toolsUsed.push("mesh.library_publish");
    const result = await deps.executeTool("mesh.library_publish", {
      documentId: item.documentId,
      published,
    });
    if (!result.ok) {
      return { answer: `Publish update failed: ${result.error}`, intent: intent.kind, toolsUsed };
    }
    return {
      answer: published
        ? `Published metadata for **${item.title}** (${item.relativePath}). Bonded contacts can discover title/hash; file bytes still require share accept.`
        : `Removed **${item.title}** from the published catalog.`,
      intent: intent.kind,
      toolsUsed,
    };
  }

  if (intent.kind === "share_propose") {
    const item = matchLibraryItem(items, intent.pathHint);
    const bonds = await deps.getBonds();
    const target = resolveBondTarget(bonds, intent.targetOwnerHint);
    if (!item) {
      return {
        answer: intent.pathHint
          ? `Could not find "${intent.pathHint}" in your library.`
          : 'Specify a file, e.g. share "docs/report.pdf" to Alex.',
        intent: "share_propose",
        toolsUsed,
      };
    }
    if (!target) {
      return {
        answer: intent.targetOwnerHint
          ? `Could not match "${intent.targetOwnerHint}" to a bonded contact. Use their display name or owner id.`
          : "Specify who should receive the file, e.g. share report.pdf to Alex.",
        intent: "share_propose",
        toolsUsed,
      };
    }
    toolsUsed.push("mesh.share_propose");
    const result = await deps.executeTool("mesh.share_propose", {
      targetOwnerId: target.peerOwnerId,
      vaultRelativePath: item.relativePath,
      sensitivity: intent.sensitivity ?? "friends",
      summary: `Agent proposed sharing ${item.title} with ${target.displayName ?? target.peerOwnerId}`,
    });
    if (!result.ok) {
      return { answer: `Share proposal failed: ${result.error}`, intent: "share_propose", toolsUsed };
    }
    if ((result.result as { autoShared?: boolean })?.autoShared) {
      return {
        answer: `Shared **${item.title}** with ${target.displayName ?? target.peerOwnerId}. File transfer is in progress — check **Inbox** or ask for transfer status.`,
        intent: "share_propose",
        toolsUsed,
      };
    }
    return {
      answer: `Added a share proposal for **${item.title}** → ${target.displayName ?? target.peerOwnerId}. Open **Inbox** to send or dismiss.`,
      intent: "share_propose",
      toolsUsed,
    };
  }

  if (intent.kind === "request_share_from") {
    if (!deps.discoverPublishedLibrary || !deps.sendChat) {
      toolsUsed.push("mesh.library_request_share");
      const result = await deps.executeTool("mesh.library_request_share", {
        targetOwnerHint: intent.targetOwnerHint,
        fileTitleQuery: intent.fileTitleQuery,
      });
      if (!result.ok) {
        return { answer: `Share request failed: ${result.error}`, intent: "request_share_from", toolsUsed };
      }
      const payload = result.result as {
        targetDisplayName?: string;
        targetOwnerId?: string;
        matches?: unknown[];
      };
      const label = payload.targetDisplayName ?? payload.targetOwnerId ?? intent.targetOwnerHint;
      const n = Array.isArray(payload.matches) ? payload.matches.length : 0;
      return {
        answer: `Sent a share request to **${label}**${n > 0 ? ` (${n} published match${n === 1 ? "" : "es"})` : ""}. They can reply with a share offer — check **Inbox** when it arrives.`,
        intent: "request_share_from",
        toolsUsed,
      };
    }

    toolsUsed.push("mesh.library_discover", "mesh.library_request_share");
    const outcome = await runLibraryRequestShare(
      {
        getBonds: deps.getBonds,
        discoverPublishedLibrary: deps.discoverPublishedLibrary,
        sendChat: deps.sendChat,
      },
      {
        targetOwnerHint: intent.targetOwnerHint ?? "",
        fileTitleQuery: intent.fileTitleQuery,
      },
    );
    if (!outcome.ok) {
      return { answer: outcome.error, intent: "request_share_from", toolsUsed };
    }
    const { targetDisplayName, targetOwnerId, matches } = outcome.result;
    const label = targetDisplayName ?? targetOwnerId;
    const n = matches.length;
    return {
      answer: `Sent a share request to **${label}**${n > 0 ? ` (${n} published match${n === 1 ? "" : "es"})` : ""}. They can reply with a share offer — check **Inbox** when it arrives.`,
      intent: "request_share_from",
      toolsUsed,
    };
  }

  if (intent.kind === "transfer_status") {
    toolsUsed.push("mesh.transfer_status");
    const correlationId = intent.pathHint;
    const result = await deps.executeTool("mesh.transfer_status", correlationId ? { correlationId } : {});
    if (!result.ok) {
      return { answer: `Transfer lookup failed: ${result.error}`, intent: "transfer_status", toolsUsed };
    }
    if (correlationId) {
      const status = (result.result as { status?: { phase?: string; vaultRelativePath?: string } })?.status;
      if (!status) {
        return {
          answer: `No transfer found for correlation id \`${correlationId}\`.`,
          intent: "transfer_status",
          toolsUsed,
        };
      }
      return {
        answer: `Transfer \`${correlationId}\`: **${status.phase}**${status.vaultRelativePath ? ` (${status.vaultRelativePath})` : ""}.`,
        intent: "transfer_status",
        toolsUsed,
      };
    }
    const transfers = (result.result as { transfers?: Array<{ correlationId: string; phase: string; vaultRelativePath?: string }> })
      ?.transfers ?? [];
    if (transfers.length === 0) {
      return { answer: "No active file transfers.", intent: "transfer_status", toolsUsed };
    }
    const lines = transfers.map(
      (t) => `• ${t.correlationId.slice(0, 12)}… ${t.phase}${t.vaultRelativePath ? ` — ${t.vaultRelativePath}` : ""}`,
    );
    return {
      answer: `Active transfers (${transfers.length}):\n${lines.join("\n")}`,
      intent: "transfer_status",
      toolsUsed,
    };
  }

  const answer = await deps.knowledgeQuery(deps.message);
  return { answer, intent: "knowledge", toolsUsed };
}
