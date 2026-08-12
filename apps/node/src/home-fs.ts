/**
 * Cross-platform home-node filesystem helpers for folder browsing.
 * Used by Social / EnvoyGo folder pickers and Ext Agent projectPath validation.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { platform as nodePlatform } from "node:os";
import type {
  HomeFsPreviewKind,
  PreviewHomeFsFileParams,
  PreviewHomeFsFileResult,
} from "@envoymesh/api";
import { extractVaultDocumentText } from "@envoymesh/vault";

export type HomeFsPlatform = "darwin" | "linux" | "win32" | "other";

export type HomeFsEntryKind = "dir" | "file";

export interface HomeFsEntry {
  name: string;
  kind: HomeFsEntryKind;
  path: string;
}

export interface HomeFsInfo {
  platform: HomeFsPlatform;
  pathSep: string;
  homeDir: string;
  roots: string[];
}

export interface ListHomeFsEntriesParams {
  path?: string;
  dirsOnly?: boolean;
}

export interface ListHomeFsEntriesResult {
  path: string;
  parent?: string;
  entries: HomeFsEntry[];
}

/** Soft cap for preview payloads (~8 MiB). */
export const HOME_FS_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

function detectPlatform(): HomeFsPlatform {
  const p = nodePlatform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "other";
}

/** Enumerate Windows drive roots that exist (C:\, D:\, …). */
export function listWindowsDriveRoots(): string[] {
  const roots: string[] = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const root = `${letter}:\\`;
    try {
      if (existsSync(root)) roots.push(root);
    } catch {
      // ignore inaccessible drives
    }
  }
  return roots;
}

export function getHomeFsInfo(): HomeFsInfo {
  const platform = detectPlatform();
  const homeDir = path.resolve(homedir());
  const roots: string[] =
    platform === "win32"
      ? listWindowsDriveRoots()
      : ["/"];
  // Prefer home as a suggested start; keep it in roots if not already.
  if (homeDir && !roots.some((r) => path.resolve(r) === homeDir)) {
    // Don't put home in roots for Unix (roots stay `/`); clients start at homeDir.
  }
  return {
    platform,
    pathSep: path.sep,
    homeDir,
    roots: roots.length > 0 ? roots : platform === "win32" ? ["C:\\"] : ["/"],
  };
}

/**
 * Resolve and validate an absolute directory path on the home node.
 * Returns null if missing, not absolute, or not a directory.
 */
export function resolveHomeFsDirectory(projectPath: string | undefined | null): string | null {
  const raw = projectPath?.trim();
  if (!raw || raw.includes("\0")) return null;
  if (!path.isAbsolute(raw)) return null;
  let abs: string;
  try {
    abs = path.resolve(raw);
  } catch {
    return null;
  }
  if (!existsSync(abs)) return null;
  try {
    if (!statSync(abs).isDirectory()) return null;
  } catch {
    return null;
  }
  return abs;
}

function parentOf(absPath: string): string | undefined {
  const parent = path.dirname(absPath);
  if (parent === absPath) return undefined;
  // Windows: dirname of `C:\` is `C:\`
  if (detectPlatform() === "win32") {
    const normalized = path.resolve(absPath);
    if (/^[A-Za-z]:\\$/i.test(normalized)) return undefined;
  }
  return parent;
}

/**
 * List entries in a directory. When `path` is empty/undefined, lists
 * roots (Windows drives) or starts at homeDir for Unix convenience when
 * callers pass nothing — actually we list the start path:
 * - undefined → homeDir
 * - "" → homeDir
 */
export function listHomeFsEntries(
  params: ListHomeFsEntriesParams = {},
): ListHomeFsEntriesResult {
  const info = getHomeFsInfo();
  const raw = params.path?.trim();
  const target = raw
    ? resolveHomeFsDirectory(raw)
    : resolveHomeFsDirectory(info.homeDir);

  if (!target) {
    throw new Error(
      raw
        ? `Path is missing or is not a directory: ${raw}`
        : "Home directory is not available",
    );
  }

  // Special case: Windows "roots" listing when path equals a sentinel?
  // Clients navigate into a drive from roots via getHomeFsInfo().roots.

  let names: string[];
  try {
    names = readdirSync(target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Cannot list directory: ${msg}`);
  }

  const entries: HomeFsEntry[] = [];
  for (const name of names) {
    if (name === "." || name === "..") continue;
    // Skip hidden by default? Keep them for power users.
    const full = path.join(target, name);
    let kind: HomeFsEntryKind;
    try {
      const st = statSync(full);
      kind = st.isDirectory() ? "dir" : "file";
    } catch {
      continue;
    }
    if (params.dirsOnly && kind !== "dir") continue;
    entries.push({ name, kind, path: full });
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const parent = parentOf(target);
  return {
    path: target,
    ...(parent ? { parent } : {}),
    entries,
  };
}

/**
 * Resolve and validate an absolute **file** path on the home node.
 */
export function resolveHomeFsFile(filePath: string | undefined | null): string | null {
  const raw = filePath?.trim();
  if (!raw || raw.includes("\0")) return null;
  if (!path.isAbsolute(raw)) return null;
  let abs: string;
  try {
    abs = path.resolve(raw);
  } catch {
    return null;
  }
  if (!existsSync(abs)) return null;
  try {
    if (!statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return abs;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtmlDocument(title: string, bodyInner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;margin:16px;line-height:1.5;color:#0f172a;background:#fff;word-wrap:break-word}
pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
img{max-width:100%;height:auto}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{border:1px solid #cbd5e1;padding:4px 8px;text-align:left}
h1,h2,h3{margin:1em 0 0.4em}
</style></head><body>${bodyInner}</body></html>`;
}

function markdownToSimpleHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        parts.push(`<pre>${escapeHtml(codeBuf.join("\n"))}</pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^###\s+/.test(line)) {
      parts.push(`<h3>${escapeHtml(line.replace(/^###\s+/, ""))}</h3>`);
    } else if (/^##\s+/.test(line)) {
      parts.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`);
    } else if (/^#\s+/.test(line)) {
      parts.push(`<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`);
    } else if (line.trim() === "") {
      parts.push("<br/>");
    } else {
      parts.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  if (inCode) parts.push(`<pre>${escapeHtml(codeBuf.join("\n"))}</pre>`);
  return parts.join("\n");
}

function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
}

function mimeForExt(ext: string): string | undefined {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    case ".html":
    case ".htm":
      return "text/html";
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".txt":
    case ".log":
    case ".csv":
    case ".json":
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".dart":
    case ".py":
    case ".rs":
    case ".go":
    case ".css":
    case ".yml":
    case ".yaml":
    case ".toml":
    case ".xml":
      return "text/plain";
    default:
      return undefined;
  }
}

async function officeToHtml(ext: string, buf: Buffer, title: string): Promise<string | null> {
  if (ext === ".docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ buffer: buf });
      return wrapHtmlDocument(title, stripScripts(result.value || "<p></p>"));
    } catch {
      const text = await extractVaultDocumentText(ext, buf);
      if (!text) return null;
      return wrapHtmlDocument(title, `<pre>${escapeHtml(text)}</pre>`);
    }
  }
  if (ext === ".xlsx" || ext === ".xls") {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buf, { type: "buffer" });
      const parts: string[] = [`<h1>${escapeHtml(title)}</h1>`];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        parts.push(`<h2>${escapeHtml(sheetName)}</h2>`);
        parts.push(XLSX.utils.sheet_to_html(sheet));
      }
      return wrapHtmlDocument(title, stripScripts(parts.join("\n")));
    } catch {
      const text = await extractVaultDocumentText(ext, buf);
      if (!text) return null;
      return wrapHtmlDocument(title, `<pre>${escapeHtml(text)}</pre>`);
    }
  }
  if (ext === ".pptx" || ext === ".ppt" || ext === ".doc") {
    const text = await extractVaultDocumentText(ext, buf);
    if (!text) return null;
    return wrapHtmlDocument(title, `<pre>${escapeHtml(text)}</pre>`);
  }
  return null;
}

/**
 * Build a WebView-friendly preview for a file on the home node.
 */
export async function previewHomeFsFile(
  params: PreviewHomeFsFileParams,
): Promise<PreviewHomeFsFileResult> {
  const titleFallback = path.basename(params.path?.trim() || "file");
  const abs = resolveHomeFsFile(params.path);
  if (!abs) {
    return {
      path: params.path?.trim() || "",
      title: titleFallback,
      kind: "error",
      error: "Path is missing or is not a file",
    };
  }
  const title = path.basename(abs);
  let st;
  try {
    st = statSync(abs);
  } catch (e) {
    return {
      path: abs,
      title,
      kind: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (st.size > HOME_FS_PREVIEW_MAX_BYTES) {
    return {
      path: abs,
      title,
      kind: "error",
      byteLength: st.size,
      error: `File is too large to preview (max ${Math.round(HOME_FS_PREVIEW_MAX_BYTES / (1024 * 1024))} MiB)`,
    };
  }

  let buf: Buffer;
  try {
    buf = readFileSync(abs);
  } catch (e) {
    return {
      path: abs,
      title,
      kind: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const ext = path.extname(abs).toLowerCase();
  const mediaType = mimeForExt(ext);

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
    const kind: HomeFsPreviewKind = "image";
    return {
      path: abs,
      title,
      kind,
      mediaType: mediaType ?? "application/octet-stream",
      contentBase64: buf.toString("base64"),
      byteLength: buf.length,
    };
  }

  if (ext === ".pdf") {
    return {
      path: abs,
      title,
      kind: "pdf",
      mediaType: "application/pdf",
      contentBase64: buf.toString("base64"),
      byteLength: buf.length,
    };
  }

  if (ext === ".html" || ext === ".htm") {
    const raw = buf.toString("utf8");
    return {
      path: abs,
      title,
      kind: "html",
      mediaType: "text/html",
      html: wrapHtmlDocument(title, stripScripts(raw)),
      byteLength: buf.length,
    };
  }

  if (ext === ".md" || ext === ".markdown") {
    const raw = buf.toString("utf8");
    return {
      path: abs,
      title,
      kind: "markdown",
      mediaType: "text/markdown",
      html: wrapHtmlDocument(title, markdownToSimpleHtml(raw)),
      byteLength: buf.length,
    };
  }

  if (
    mediaType === "text/plain" ||
    [".txt", ".log", ".csv", ".json", ".ts", ".tsx", ".js", ".jsx", ".dart", ".py", ".rs", ".go", ".css", ".yml", ".yaml", ".toml", ".xml"].includes(ext)
  ) {
    const raw = buf.toString("utf8");
    return {
      path: abs,
      title,
      kind: "text",
      mediaType: "text/plain",
      html: wrapHtmlDocument(title, `<pre>${escapeHtml(raw)}</pre>`),
      text: raw,
      byteLength: buf.length,
    };
  }

  if ([".docx", ".xlsx", ".xls", ".pptx", ".ppt", ".doc"].includes(ext)) {
    try {
      const html = await officeToHtml(ext, buf, title);
      if (html) {
        return {
          path: abs,
          title,
          kind: "office",
          mediaType: "text/html",
          html,
          byteLength: buf.length,
        };
      }
    } catch (e) {
      return {
        path: abs,
        title,
        kind: "error",
        byteLength: buf.length,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    path: abs,
    title,
    kind: "unsupported",
    byteLength: buf.length,
    error: `Preview not available for ${ext || "this file type"}`,
  };
}

/** Agents that use a local project folder as cwd — see @envoymesh/api. */
export {
  EXT_AGENTS_WITH_PROJECT_PATH,
  extAgentUsesProjectPath,
} from "@envoymesh/api";

