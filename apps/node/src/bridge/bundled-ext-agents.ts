/**
 * Bundled external agent registrations.
 * Added post-00b5b5d; minimal stub for compilation.
 */

export interface BundledExtAgentRegistration {
  agentId: string;
  displayName: string;
  category: string;
  enabled: boolean;
}

export function getBundledExtAgentRegistrations(): BundledExtAgentRegistration[] {
  return [];
}
