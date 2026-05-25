import { extname } from "node:path";
import { isVaultExtractableExtension } from "./vault-formats.js";

export {
  VAULT_EXTRACTABLE_EXTENSIONS,
  type VaultExtractableExtension,
  isVaultExtractableExtension,
  isVaultSearchableExtension,
} from "./vault-formats.js";

export async function extractVaultDocumentText(
  extension: string,
  raw: Buffer,
): Promise<string | null> {
  const ext = extension.startsWith(".")
    ? extension.toLowerCase()
    : extname(extension).toLowerCase() || extension.toLowerCase();

  if (!isVaultExtractableExtension(ext)) {
    return null;
  }

  try {
    switch (ext) {
      case ".pdf":
        return await extractPdfText(raw);
      case ".docx":
        return await extractDocxText(raw);
      case ".doc":
        return await extractDocText(raw);
      case ".pptx":
        return await extractPptxText(raw);
      case ".ppt":
        return await extractPptText(raw);
      case ".xlsx":
      case ".xls":
        return await extractSpreadsheetText(raw);
      case ".html":
      case ".htm":
        return stripHtmlText(raw.toString("utf8"));
      case ".rtf":
        return stripRtfText(raw.toString("utf8"));
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function extractPdfText(raw: Buffer): Promise<string | null> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: raw });
  try {
    const result = await parser.getText();
    return normalizeExtractedText(result.text);
  } finally {
    await parser.destroy?.();
  }
}

async function extractDocxText(raw: Buffer): Promise<string | null> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: raw });
  return normalizeExtractedText(result.value);
}

async function extractDocText(raw: Buffer): Promise<string | null> {
  const WordExtractor = (await import("word-extractor")).default;
  const extractor = new WordExtractor();
  const document = await extractor.extract(raw);
  return normalizeExtractedText(document.getBody());
}

async function extractPptxText(raw: Buffer): Promise<string | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(raw);
  const parts: string[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || !/^ppt\/(slides|notesSlides)\/[^/]+\.xml$/i.test(path)) {
      continue;
    }
    const xml = await file.async("string");
    for (const match of xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)) {
      const text = decodeXmlEntities(match[1]?.trim() ?? "");
      if (text) {
        parts.push(text);
      }
    }
  }

  return normalizeExtractedText(parts.join(" "));
}

async function extractPptText(raw: Buffer): Promise<string | null> {
  const PPT = (await import("ppt-to-text")).default;
  const text = PPT.extractText(raw, { separator: " " });
  return normalizeExtractedText(typeof text === "string" ? text : String(text ?? ""));
}

async function extractSpreadsheetText(raw: Buffer): Promise<string | null> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(raw, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    for (const row of rows) {
      if (!Array.isArray(row)) {
        continue;
      }
      for (const cell of row) {
        const value = String(cell ?? "").trim();
        if (value) {
          parts.push(value);
        }
      }
    }
  }

  return normalizeExtractedText(parts.join(" "));
}

export function stripHtmlText(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return normalizeExtractedText(text);
}

export function stripRtfText(rtf: string): string | null {
  const decoded = rtf
    .replace(/\{\\\*[^{}]*\}/g, " ")
    .replace(/\\'[0-9a-f]{2}/gi, (match) => String.fromCharCode(parseInt(match.slice(2), 16)))
    .replace(/\\par[d]?/gi, "\n")
    .replace(/\\[a-z]+-?\d* ?/gi, " ")
    .replace(/[{}]/g, " ");

  return normalizeExtractedText(decoded);
}

function normalizeExtractedText(text: string | undefined): string | null {
  const normalized = text?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
