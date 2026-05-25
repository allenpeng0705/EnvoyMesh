import { execSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildVaultIndex,
  extractVaultDocumentText,
  isVaultExtractableExtension,
  isVaultSearchableExtension,
  searchVault,
  stripHtmlText,
  stripRtfText,
} from "../src/index.js";

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n" +
    "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
    "5 0 obj<</Length 44>>stream\n" +
    "BT /F1 24 Tf 100 700 Td (Distributed PDF guide) Tj ET\n" +
    "endstream\nendobj\n" +
    "xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000261 00000 n \n0000000342 00000 n \n" +
    "trailer<</Size 6/Root 1 0 R>>\nstartxref\n437\n%%EOF",
);

async function writeMinimalDocx(outputPath: string, text: string): Promise<void> {
  const workDir = join(tmpdir(), `envoymesh-docx-${randomUUID()}`);
  await mkdir(join(workDir, "word", "_rels"), { recursive: true });
  await mkdir(join(workDir, "_rels"), { recursive: true });
  await writeFile(
    join(workDir, "[Content_Types].xml"),
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  await writeFile(
    join(workDir, "_rels", ".rels"),
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  await writeFile(
    join(workDir, "word", "document.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  execSync(`cd "${workDir}" && zip -qr "${outputPath}" .`);
  await rm(workDir, { recursive: true, force: true });
}

async function writeMinimalPptx(outputPath: string, text: string): Promise<void> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>${text}</a:t></p:sld>`,
  );
  const raw = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(outputPath, raw);
}

async function writeMinimalXlsx(outputPath: string, rows: string[][]): Promise<void> {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const raw = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await writeFile(outputPath, raw);
}

async function writeMinimalXls(outputPath: string, rows: string[][]): Promise<void> {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const raw = XLSX.write(workbook, { type: "buffer", bookType: "xls" });
  await writeFile(outputPath, raw);
}

describe("document text extraction", () => {
  it("recognizes searchable extensions", () => {
    expect(isVaultExtractableExtension(".pdf")).toBe(true);
    expect(isVaultExtractableExtension(".docx")).toBe(true);
    expect(isVaultExtractableExtension(".pptx")).toBe(true);
    expect(isVaultExtractableExtension(".ppt")).toBe(true);
    expect(isVaultExtractableExtension(".xlsx")).toBe(true);
    expect(isVaultExtractableExtension(".xls")).toBe(true);
    expect(isVaultSearchableExtension(".csv")).toBe(true);
    expect(isVaultSearchableExtension(".bin")).toBe(false);
  });

  it("extracts text from PDF buffers", async () => {
    const text = await extractVaultDocumentText(".pdf", MINIMAL_PDF);
    expect(text).toContain("Distributed PDF guide");
  });

  it("extracts text from DOCX buffers", async () => {
    const docxPath = join(tmpdir(), `sample-${randomUUID()}.docx`);
    await writeMinimalDocx(docxPath, "Quarterly planning memo");
    const raw = await import("node:fs/promises").then((m) => m.readFile(docxPath));
    const text = await extractVaultDocumentText(".docx", raw);
    expect(text).toContain("Quarterly planning memo");
    await rm(docxPath, { force: true });
  });

  it("extracts text from PPTX, XLSX, and XLS buffers", async () => {
    const pptxPath = join(tmpdir(), `sample-${randomUUID()}.pptx`);
    const xlsxPath = join(tmpdir(), `sample-${randomUUID()}.xlsx`);
    const xlsPath = join(tmpdir(), `sample-${randomUUID()}.xls`);
    await writeMinimalPptx(pptxPath, "Product launch roadmap");
    await writeMinimalXlsx(xlsxPath, [
      ["Metric", "Value"],
      ["Revenue", "120000"],
    ]);
    await writeMinimalXls(xlsPath, [
      ["Category", "Amount"],
      ["Legacy budget", "900000"],
    ]);

    const pptxRaw = await import("node:fs/promises").then((m) => m.readFile(pptxPath));
    const xlsxRaw = await import("node:fs/promises").then((m) => m.readFile(xlsxPath));
    const xlsRaw = await import("node:fs/promises").then((m) => m.readFile(xlsPath));
    expect(await extractVaultDocumentText(".pptx", pptxRaw)).toContain("Product launch roadmap");
    expect(await extractVaultDocumentText(".xlsx", xlsxRaw)).toContain("Revenue");
    expect(await extractVaultDocumentText(".xlsx", xlsxRaw)).toContain("120000");
    expect(await extractVaultDocumentText(".xls", xlsRaw)).toContain("Legacy budget");
    expect(await extractVaultDocumentText(".xls", xlsRaw)).toContain("900000");

    await rm(pptxPath, { force: true });
    await rm(xlsxPath, { force: true });
    await rm(xlsPath, { force: true });
  });

  it("returns null for invalid legacy PPT buffers", async () => {
    expect(await extractVaultDocumentText(".ppt", Buffer.from("not-a-ppt"))).toBeNull();
  });

  it("strips HTML and RTF text", () => {
    expect(stripHtmlText("<html><body><p>Hello <b>HTML</b></p></body></html>")).toBe("Hello HTML");
    expect(stripRtfText("{\\rtf1\\ansi Hello \\par World}")).toBe("Hello World");
  });
});

describe("buildVaultIndex with extractable documents", () => {
  let workspaceDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    workspaceDir = join(tmpdir(), `envoymesh-vault-extract-${randomUUID()}`);
    vaultDir = join(workspaceDir, "shared_vault");
    await mkdir(join(vaultDir, "knowledge", "public"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("indexes extracted PDF and HTML content for search", async () => {
    await writeFile(join(vaultDir, "knowledge", "public", "guide.pdf"), MINIMAL_PDF);
    await writeFile(
      join(vaultDir, "knowledge", "public", "page.html"),
      "<html><body><h1>Mesh networking overview</h1></body></html>",
    );
    await writeFile(join(vaultDir, "knowledge", "public", "broken.pdf"), "not-a-pdf");

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const pdfDoc = index.documents.find((doc) => doc.relativePath.endsWith("guide.pdf"));
    const htmlDoc = index.documents.find((doc) => doc.relativePath.endsWith("page.html"));
    const brokenDoc = index.documents.find((doc) => doc.relativePath.endsWith("broken.pdf"));

    expect(pdfDoc).toBeTruthy();
    expect(htmlDoc).toBeTruthy();
    expect(index.chunks.some((chunk) => chunk.relativePath === pdfDoc!.relativePath)).toBe(true);
    expect(index.chunks.some((chunk) => chunk.relativePath === htmlDoc!.relativePath)).toBe(true);
    expect(index.chunks.some((chunk) => chunk.relativePath === brokenDoc!.relativePath)).toBe(false);

    const htmlResults = searchVault(index, "mesh networking", { limit: 5 });
    expect(htmlResults.map((result) => result.document.relativePath)).toEqual(
      expect.arrayContaining(["knowledge/public/page.html"]),
    );

    const pdfResults = searchVault(index, "distributed pdf", { limit: 5 });
    expect(pdfResults.some((result) => result.document.relativePath.endsWith("guide.pdf"))).toBe(true);
  });

  it("indexes DOCX content for search", async () => {
    const docxPath = join(vaultDir, "knowledge", "public", "memo.docx");
    await writeMinimalDocx(docxPath, "Budget review notes");

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const results = searchVault(index, "budget review", { limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].document.relativePath).toBe("knowledge/public/memo.docx");
  });

  it("indexes PPTX, XLSX, XLS, and PPT content for search", async () => {
    await writeMinimalPptx(join(vaultDir, "knowledge", "public", "deck.pptx"), "Investor update deck");
    await writeMinimalXlsx(join(vaultDir, "knowledge", "public", "metrics.xlsx"), [
      ["Category", "Amount"],
      ["Operating budget", "450000"],
    ]);
    await writeMinimalXls(join(vaultDir, "knowledge", "public", "legacy-metrics.xls"), [
      ["Plan", "Spend"],
      ["Capital budget", "250000"],
    ]);

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const pptxResults = searchVault(index, "investor update", { limit: 1 });
    const xlsxResults = searchVault(index, "operating budget", { limit: 1 });
    const xlsResults = searchVault(index, "capital budget", { limit: 1 });

    expect(pptxResults[0]?.document.relativePath).toBe("knowledge/public/deck.pptx");
    expect(xlsxResults[0]?.document.relativePath).toBe("knowledge/public/metrics.xlsx");
    expect(xlsResults[0]?.document.relativePath).toBe("knowledge/public/legacy-metrics.xls");
  });
});
