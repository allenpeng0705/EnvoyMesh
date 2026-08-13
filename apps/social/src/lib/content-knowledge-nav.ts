/**
 * Navigate to Knowledge (and optional sub-panel).
 * Mirrors browser-nav openBrowserAt for Settings deep-links.
 */

export const OPEN_CONTENT_KNOWLEDGE_EVENT = "envoymesh:open-content-knowledge";

/** Hub tabs. Legacy `"ask"` still accepted by deep-links → Browse (Ask is embedded). */
export type KnowledgeHubPanel = "browse" | "plugins" | "setup";

export type KnowledgeHubPanelInput = KnowledgeHubPanel | "ask";

export interface OpenContentKnowledgeDetail {
  panel?: KnowledgeHubPanelInput;
}

export function normalizeKnowledgeHubPanel(
  panel?: KnowledgeHubPanelInput | null,
): KnowledgeHubPanel {
  if (panel === "plugins" || panel === "setup") return panel;
  // "ask" and unknown → browse (Ask lives on the Browse panel).
  return "browse";
}

export function openContentKnowledge(panel: KnowledgeHubPanelInput = "browse"): void {
  window.dispatchEvent(
    new CustomEvent<OpenContentKnowledgeDetail>(OPEN_CONTENT_KNOWLEDGE_EVENT, {
      detail: { panel: normalizeKnowledgeHubPanel(panel) },
    }),
  );
}
