import type { LocalFileSource, OpenLocalFileParams } from "./node-service.js";
import type { StructuredBlock } from "./owner-agent-types.js";

export interface StructuredCardFileRef {
  source: LocalFileSource;
  relativePath: string;
  documentId?: string;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/^[\\/]+/, "").replace(/\\/g, "/").trim();
}

function parseFileRef(value: unknown): StructuredCardFileRef | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const relativePath =
    typeof obj.relativePath === "string"
      ? normalizeRelativePath(obj.relativePath)
      : typeof obj.path === "string"
        ? normalizeRelativePath(obj.path)
        : "";
  if (!relativePath) return undefined;
  const source: LocalFileSource =
    obj.source === "workspace"
      ? "workspace"
      : obj.source === "linked-obsidian"
        ? "linked-obsidian"
        : obj.source === "mcp-remote"
          ? "mcp-remote"
          : "vault";
  const documentId = typeof obj.documentId === "string" ? obj.documentId.trim() : undefined;
  return { source, relativePath, ...(documentId ? { documentId } : {}) };
}

function parseMetaPathLine(line: string): string | undefined {
  const match = line.match(/^(?:path|relativePath|file|documentId)\s*:\s*(.+)$/i);
  return match?.[1]?.trim();
}

function parseOpenLocalFileAction(action: string): OpenLocalFileParams | null {
  const trimmed = action.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const file = parseFileRef(parsed);
      if (file) return file;
      if (parsed.type === "openLocalFile" || parsed.action === "openLocalFile") {
        const fromNested = parseFileRef(parsed);
        if (fromNested) return fromNested;
      }
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("envoy://open-local-file")) {
    try {
      const url = new URL(trimmed);
      const source = url.searchParams.get("source") === "workspace" ? "workspace" : "vault";
      const relativePath = normalizeRelativePath(url.searchParams.get("path") ?? "");
      if (!relativePath) return null;
      const documentId = url.searchParams.get("documentId") ?? undefined;
      return { source, relativePath, ...(documentId ? { documentId } : {}) };
    } catch {
      return null;
    }
  }

  const colonParts = trimmed.split(":");
  if (colonParts[0]?.toLowerCase() === "openlocalfile" && colonParts.length >= 3) {
    const source = colonParts[1] === "workspace" ? "workspace" : "vault";
    const relativePath = normalizeRelativePath(colonParts.slice(2).join(":"));
    return relativePath ? { source, relativePath } : null;
  }

  if (/^open(localfile|file)?$/i.test(trimmed)) {
    return null;
  }

  return null;
}

/** Resolve a structured card into openable local file params, if possible. */
export function inferFileFromStructuredCard(
  block: Extract<StructuredBlock, { type: "card" }>,
): OpenLocalFileParams | null {
  if (block.file?.relativePath) {
    return {
      source: block.file.source,
      relativePath: normalizeRelativePath(block.file.relativePath),
      ...(block.file.documentId ? { documentId: block.file.documentId } : {}),
    };
  }

  if (block.cta?.action) {
    const fromAction = parseOpenLocalFileAction(block.cta.action);
    if (fromAction) return fromAction;
  }

  for (const line of block.meta ?? []) {
    const path = parseMetaPathLine(line);
    if (path && !/^envoy:/i.test(path) && path.includes(".")) {
      return { source: "vault", relativePath: normalizeRelativePath(path) };
    }
  }

  if (block.subtitle && /^vault[/\\]/i.test(block.subtitle.trim())) {
    return { source: "vault", relativePath: normalizeRelativePath(block.subtitle.trim()) };
  }

  return null;
}

export function parseStructuredCardFile(value: unknown): StructuredCardFileRef | undefined {
  return parseFileRef(value);
}

export function isOpenFileCtaAction(action: string | undefined): boolean {
  if (!action?.trim()) return false;
  return /^open(localfile|file)?$/i.test(action.trim()) || parseOpenLocalFileAction(action) !== null;
}
