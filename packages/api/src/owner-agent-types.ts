import type { AgentCapabilityDomain } from "./capability-intent-routing.js";

export type OwnerAgentDomain = AgentCapabilityDomain | "knowledge";

export interface OwnerAgentPostureFlags {
  socialProxy: boolean;
  documentAcquisition: boolean;
  capabilityProvider: boolean;
  trustMode: boolean;
  autonomousKillSwitch?: boolean;
}

/** Pending approval surfaced on an owner-agent turn (Phase 18C). */
export interface OwnerAgentApprovalSummary {
  id: string;
  actionType: string;
  title: string;
  description: string;
  draftContent: string;
  contactOwnerId?: string;
  contactDisplayName?: string;
  priority: string;
  requestedAt: string;
}

/**
 * How the owner-agent turn's `answer` (or `blocks`) should be rendered.
 * The LLM picks this based on what feels right for the response:
 *   - "plain"     → short text, greetings, single facts. No Markdown.
 *   - "markdown"  → longer text with lists, code, or headings. Default.
 *   - "structured"→ distinct UI sections (file lists, contact cards, job
 *                   status). Rendered from `blocks` with React components
 *                   instead of Markdown.
 */
export type AnswerFormat = "plain" | "markdown" | "structured";

export type StructuredBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean; style?: "bullet" | "check" }
  | { type: "card"; title: string; subtitle?: string; meta?: string[]; cta?: { label: string; action: string } }
  | { type: "status"; tone: "info" | "success" | "warn" | "error"; text: string };
