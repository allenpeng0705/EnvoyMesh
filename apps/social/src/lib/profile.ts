/**
 * Shared profile types and preset capability groups.
 *
 * Used by both desktop ProfileView and mobile MobileProfileView
 * so they stay in sync without duplicating the capability catalog.
 */

// ---- Capability types ----

export type CapabilityTag = { tag: string };
export type CapabilityType = { type: string; params?: Record<string, unknown>; confidence?: number };
export type CapabilityDescriptor = { descriptor: string };
export type Capability = CapabilityTag | CapabilityType | CapabilityDescriptor;

export interface PresetCapabilityGroup {
  label: string;
  capabilities: Array<{ tag: string; label: string; description?: string }>;
}

export const PRESET_CAPABILITY_GROUPS: PresetCapabilityGroup[] = [
  {
    label: "Services",
    capabilities: [
      { tag: "document-search", label: "Document Search", description: "Can search and retrieve documents" },
      { tag: "coding-help", label: "Coding Help", description: "Assists with programming tasks" },
      { tag: "translation", label: "Translation", description: "Language translation service" },
      { tag: "data-analysis", label: "Data Analysis", description: "Analyzes and visualizes data" },
    ],
  },
  {
    label: "Languages",
    capabilities: [
      { tag: "lang:en", label: "English" },
      { tag: "lang:zh", label: "Chinese" },
      { tag: "lang:es", label: "Spanish" },
      { tag: "lang:fr", label: "French" },
      { tag: "lang:de", label: "German" },
      { tag: "lang:ja", label: "Japanese" },
    ],
  },
  {
    label: "Expertise",
    capabilities: [
      { tag: "expertise:python", label: "Python" },
      { tag: "expertise:javascript", label: "JavaScript" },
      { tag: "expertise:typescript", label: "TypeScript" },
      { tag: "expertise:rust", label: "Rust" },
      { tag: "expertise:go", label: "Go" },
      { tag: "expertise:ai", label: "AI/ML" },
    ],
  },
  {
    label: "Resources",
    capabilities: [
      { tag: "vault-access:finance", label: "Finance Vault" },
      { tag: "vault-access:legal", label: "Legal Vault" },
      { tag: "compute-gpu", label: "GPU Compute" },
    ],
  },
];
