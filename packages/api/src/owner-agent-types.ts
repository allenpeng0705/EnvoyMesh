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
