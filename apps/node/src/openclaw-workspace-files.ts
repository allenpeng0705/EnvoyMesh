import { constants } from "node:fs";
import { access, open, readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { MAX_LIBRARY_ITEM_PREVIEW_BYTES } from "@envoymesh/api";

export type WorkspaceFileItem = {
  relativePath: string;
  title: string;
  extension: string;
  byteLength: number;
  updatedAt: string;
};

export type WorkspaceFileContent = {
  contentBase64: string;
  mimeType: string;
  sizeBytes: number;
  truncated: boolean;
};

export function assertPathInsideOpenClawWorkspace(workspaceDir: string, relativePath: string): string {
  const norm = relativePath.trim().replace(/^[\\/]+/, "");
  if (!norm || norm.includes("..") || norm.includes("~")) {
    throw new Error("Invalid workspace path");
  }
  const absoluteRoot = resolve(workspaceDir);
  const absolutePath = resolve(absoluteRoot, norm);
  const rel = relative(absoluteRoot, absolutePath);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error("Path is outside the OpenClaw workspace");
  }
  return absolutePath;
}

export async function listOpenClawWorkspaceFilesFromDir(
  workspaceDir: string,
  query?: string,
): Promise<WorkspaceFileItem[]> {
  try {
    await access(workspaceDir, constants.F_OK);
  } catch {
    return [];
  }
  const items = await walkWorkspaceFiles(workspaceDir, workspaceDir);
  const q = query?.trim().toLowerCase();
  if (!q) {
    return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }
  return items
    .filter(
      (item) =>
        item.relativePath.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q),
    )
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function readOpenClawWorkspaceFileFromDir(
  workspaceDir: string,
  params: { relativePath: string; maxBytes?: number; offset?: number },
): Promise<WorkspaceFileContent> {
  const maxBytes = Math.min(
    params.maxBytes ?? MAX_LIBRARY_ITEM_PREVIEW_BYTES,
    MAX_LIBRARY_ITEM_PREVIEW_BYTES,
  );
  const absolutePath = assertPathInsideOpenClawWorkspace(workspaceDir, params.relativePath);
  const st = await stat(absolutePath);
  if (!st.isFile()) {
    throw new Error("Path is not a file");
  }
  const mimeType = mimeTypeForFilename(basename(absolutePath));
  const rangeMode = params.offset !== undefined && params.offset !== null;
  const offset = rangeMode ? Math.max(0, Math.floor(Number(params.offset) || 0)) : 0;
  if (!rangeMode) {
    if (st.size > maxBytes) {
      throw new Error(`File too large for preview (${st.size} bytes, max ${maxBytes})`);
    }
    const content = await readFile(absolutePath);
    return {
      contentBase64: content.toString("base64"),
      mimeType,
      sizeBytes: st.size,
      truncated: false,
    };
  }
  if (offset >= st.size) {
    return {
      contentBase64: "",
      mimeType,
      sizeBytes: st.size,
      truncated: false,
    };
  }
  const length = Math.min(maxBytes, st.size - offset);
  const fh = await open(absolutePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, offset);
    const slice = buf.subarray(0, bytesRead);
    return {
      contentBase64: slice.toString("base64"),
      mimeType,
      sizeBytes: st.size,
      truncated: offset + bytesRead < st.size,
    };
  } finally {
    await fh.close();
  }
}

async function walkWorkspaceFiles(rootDir: string, currentDir: string): Promise<WorkspaceFileItem[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const items: WorkspaceFileItem[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      items.push(...(await walkWorkspaceFiles(rootDir, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const st = await stat(absolutePath);
    const rel = relative(rootDir, absolutePath).replace(/\\/g, "/");
    items.push({
      relativePath: rel,
      title: basename(rel),
      extension: extname(rel).replace(/^\./, ""),
      byteLength: st.size,
      updatedAt: st.mtime.toISOString(),
    });
  }
  return items;
}

function mimeTypeForFilename(filename: string): string {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "json":
      return "application/json";
    case "html":
      return "text/html";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}
