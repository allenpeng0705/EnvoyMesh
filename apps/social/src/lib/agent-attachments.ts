import type { AgentAttachmentRef } from "@envoymesh/api";
import { MAX_CHAT_ATTACHMENT_BYTES } from "@envoymesh/api";

export type AgentDraftAttachment = AgentAttachmentRef & {
  id: string;
  /** Local blob URL for image chip preview (revoked on remove). */
  previewUrl?: string;
};

export function attachmentBasename(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm || "file";
}

export function mergeAgentPromptWithAttachments(
  text: string,
  contextText: string | undefined,
): string {
  const body = text.trim();
  const ctx = contextText?.trim() ?? "";
  if (!ctx) return body;
  if (!body) return ctx;
  return `${body}\n\n${ctx}`;
}

export function toAgentAttachmentRefs(
  drafts: AgentDraftAttachment[],
): AgentAttachmentRef[] {
  return drafts.map((d) => ({
    path: d.path,
    ...(d.name ? { name: d.name } : {}),
    ...(d.mimeType ? { mimeType: d.mimeType } : {}),
  }));
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function assertAttachableFileSize(sizeBytes: number): string | null {
  if (sizeBytes <= 0) return "Empty file";
  if (sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) {
    return `File too large (max ${Math.round(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024))} MiB)`;
  }
  return null;
}

export function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
