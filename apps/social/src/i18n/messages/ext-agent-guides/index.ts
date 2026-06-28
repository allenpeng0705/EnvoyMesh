import type { LocaleId } from "../../types.js";
import { deExtAgentGuides } from "./de.js";
import { enExtAgentGuides } from "./en.js";
import { frExtAgentGuides } from "./fr.js";
import { itExtAgentGuides } from "./it.js";
import { jaExtAgentGuides } from "./ja.js";
import { koExtAgentGuides } from "./ko.js";
import type { LocalizedExtAgentGuide } from "./types.js";
import { EXT_AGENT_OPERATOR_GUIDE_IDS } from "./types.js";
import { zhExtAgentGuides } from "./zh.js";

export { EXT_AGENT_DEVELOPER_GUIDE_IDS, EXT_AGENT_GUIDE_IDS, EXT_AGENT_OPERATOR_GUIDE_IDS } from "./types.js";
export type { ExtAgentGuideId } from "./types.js";

export const EXT_AGENT_GUIDES_BY_LOCALE: Record<LocaleId, LocalizedExtAgentGuide[]> = {
  en: enExtAgentGuides,
  zh: zhExtAgentGuides,
  ko: koExtAgentGuides,
  ja: jaExtAgentGuides,
  fr: frExtAgentGuides,
  de: deExtAgentGuides,
  it: itExtAgentGuides,
};

const operatorGuideIds = new Set<string>(EXT_AGENT_OPERATOR_GUIDE_IDS);

export function localizedExtAgentGuides(
  locale: LocaleId,
  registryAgentIds: string[],
): LocalizedExtAgentGuide[] {
  const bundle = EXT_AGENT_GUIDES_BY_LOCALE[locale] ?? enExtAgentGuides;
  if (registryAgentIds.length === 0) {
    return bundle.filter((g) => operatorGuideIds.has(g.id));
  }
  const known = new Set(registryAgentIds);
  return bundle.filter((g) => known.has(g.id));
}

export type { LocalizedExtAgentGuide, LocalizedGuideStep } from "./types.js";
