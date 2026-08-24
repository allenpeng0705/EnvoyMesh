/**
 * Build EH turn prompt text from user text + project-scoped attachments.
 */

import { resolve } from "node:path";

import type { AgentAttachmentRef } from "@envoymesh/api";

import {
  buildAgentAttachmentContext,
  mergeAgentPromptWithAttachments,
} from "../agent-attachment-context.js";

export interface EhPromptPayload {
  text: string;
}

export function filterAttachmentsUnderCwd(
  attachments: AgentAttachmentRef[] | undefined,
  cwd: string | undefined,
): AgentAttachmentRef[] {
  if (attachments === undefined || attachments.length === 0) return [];
  if (cwd === undefined || cwd.trim().length === 0) return [...attachments];
  const root = resolve(cwd);
  const out: AgentAttachmentRef[] = [];
  for (const att of attachments) {
    const abs = resolve(att.path);
    if (abs === root || abs.startsWith(`${root}/`) || abs.startsWith(`${root}\\`)) {
      out.push(att);
    }
  }
  return out;
}

export async function buildEhPromptPayload(
  text: string,
  attachments: AgentAttachmentRef[] | undefined,
  cwd: string | undefined,
): Promise<EhPromptPayload> {
  const scoped = filterAttachmentsUnderCwd(attachments, cwd);
  if (scoped.length === 0) {
    return { text: text.trim() };
  }

  const ctx = await buildAgentAttachmentContext(scoped);
  if (!ctx.ok) {
    throw new Error(ctx.error ?? "attachment_context_failed");
  }
  const merged = mergeAgentPromptWithAttachments(text, ctx.contextText);
  return { text: merged };
}

/** Extract write/edit path from `session/activity` tool_call summaries. */
export function pathFromEhActivity(activity: {
  kind: string;
  summary: string;
}): string | undefined {
  if (activity.kind !== "tool_call") return undefined;
  const match = activity.summary.match(/^(?:write|edit)\s+(.+)$/);
  return match?.[1]?.trim();
}
