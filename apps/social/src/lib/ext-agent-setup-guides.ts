/**
 * Locale-aware Ext Agent setup guides — re-exports from i18n bundle.
 */
import { localizedExtAgentGuides } from "../i18n/messages/ext-agent-guides/index.js";
import type { LocaleId } from "../i18n/types.js";
import type { LocalizedExtAgentGuide } from "../i18n/messages/ext-agent-guides/types.js";

export type ExtAgentSetupGuide = LocalizedExtAgentGuide;

export function getSetupGuide(agentId: string, locale: LocaleId = "en"): LocalizedExtAgentGuide | undefined {
  return localizedExtAgentGuides(locale, [agentId])[0];
}

export function guidesForRegistry(agentIds: string[], locale: LocaleId = "en"): LocalizedExtAgentGuide[] {
  return localizedExtAgentGuides(locale, agentIds);
}

export function defaultSetupGuides(locale: LocaleId = "en"): LocalizedExtAgentGuide[] {
  return localizedExtAgentGuides(locale, []);
}
