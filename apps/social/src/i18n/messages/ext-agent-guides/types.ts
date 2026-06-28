/** A plain step or a terminal command shown in monospace. */
export type LocalizedGuideStep = string | { code: string };

export interface LocalizedExtAgentGuide {
  id: string;
  name: string;
  summary: string;
  bestFor: string;
  defaultPort: number;
  installSteps: string[];
  runSteps: LocalizedGuideStep[];
  verifySteps: string[];
  troubleshooting: string[];
}

/** Operator-facing backends shown by default in setup guides. */
export const EXT_AGENT_OPERATOR_GUIDE_IDS = ["homeclaw", "hermes", "openhuman"] as const;

/** Developer-only backends — shown only when registered in bridge-config.json. */
export const EXT_AGENT_DEVELOPER_GUIDE_IDS = ["pi"] as const;

export const EXT_AGENT_GUIDE_IDS = [
  ...EXT_AGENT_OPERATOR_GUIDE_IDS,
  ...EXT_AGENT_DEVELOPER_GUIDE_IDS,
] as const;

export type ExtAgentGuideId = (typeof EXT_AGENT_GUIDE_IDS)[number];
