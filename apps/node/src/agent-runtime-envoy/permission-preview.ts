/**
 * Diff previews for EH permission prompts (mirrors envoy-harness-tui).
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}\n… (${lines.length - maxLines} more lines)`;
}

function formatEditDiffPreview(
  filePath: string,
  oldText: string,
  newText: string,
): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const out = [`--- ${filePath}`, "@@ edit @@"];
  for (const line of oldLines.slice(0, 8)) {
    out.push(`- ${line}`);
  }
  for (const line of newLines.slice(0, 8)) {
    out.push(`+ ${line}`);
  }
  if (oldLines.length > 8 || newLines.length > 8) {
    out.push("…");
  }
  return out.join("\n");
}

function formatWriteDiffPreview(
  filePath: string,
  before: string,
  after: string,
): string {
  const out = [`--- ${filePath} (before)`, `+++ ${filePath} (after)`];
  const beforeLines = before.split("\n").slice(0, 6);
  const afterLines = after.split("\n").slice(0, 6);
  for (const line of beforeLines) out.push(`- ${line}`);
  for (const line of afterLines) out.push(`+ ${line}`);
  if (before.split("\n").length > 6 || after.split("\n").length > 6) {
    out.push("…");
  }
  return out.join("\n");
}

function formatNewFilePreview(filePath: string, content: string): string {
  return [`+++ new file ${filePath}`, truncateLines(content, 12)].join("\n");
}

export async function buildEhPermissionPreview(
  req: { toolName: string; args: unknown },
  cwd?: string,
): Promise<string | undefined> {
  const args = req.args as Record<string, unknown>;
  if (req.toolName === "edit") {
    const filePath = typeof args.path === "string" ? args.path : "?";
    const oldText = typeof args.oldText === "string" ? args.oldText : "";
    const newText = typeof args.newText === "string" ? args.newText : "";
    return formatEditDiffPreview(filePath, oldText, newText);
  }
  if (req.toolName === "bash") {
    const cmd = typeof args.command === "string" ? args.command : "";
    return cmd.length > 0 ? `$ ${cmd}` : undefined;
  }
  if (
    req.toolName === "write" &&
    typeof args.path === "string" &&
    typeof args.content === "string"
  ) {
    if (cwd === undefined) {
      return formatNewFilePreview(args.path, args.content);
    }
    try {
      const resolved = path.isAbsolute(args.path)
        ? args.path
        : path.resolve(cwd, args.path);
      const existing = await readFile(resolved, "utf-8");
      return formatWriteDiffPreview(args.path, existing, args.content);
    } catch {
      return formatNewFilePreview(args.path, args.content);
    }
  }
  return undefined;
}
