/** Known bundled ext-agent backends (mirrors apps/node bridge defaults). */
export type KnownExtAgentId = "homeclaw" | "hermes" | "openhuman";

export interface ExtAgentPreset {
  id: KnownExtAgentId;
  name: string;
  adapter: "envoymesh-message";
  url: string;
  port: number;
  /** Included in default bridge registry when merged on the home node. */
  enabledByDefault: boolean;
  /** EnvoyMesh auto-starts the local sidecar (Hermes/OpenHuman). */
  autoStarted: boolean;
  /** Suffix under settings.ai.aiEngine for i18n hint keys. */
  hintKey: "agentHintHomeclaw" | "agentHintHermes" | "agentHintOpenhuman";
}

export const EXT_AGENT_PRESETS: ExtAgentPreset[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8010/message",
    port: 8010,
    enabledByDefault: true,
    autoStarted: false,
    hintKey: "agentHintHomeclaw",
  },
  {
    id: "hermes",
    name: "Hermes",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8020/message",
    port: 8020,
    enabledByDefault: true,
    autoStarted: true,
    hintKey: "agentHintHermes",
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8021/message",
    port: 8021,
    enabledByDefault: false,
    autoStarted: true,
    hintKey: "agentHintOpenhuman",
  },
];

const PRESET_BY_ID = new Map(EXT_AGENT_PRESETS.map((p) => [p.id, p]));

export function getExtAgentPreset(id: string | undefined | null): ExtAgentPreset | undefined {
  if (!id) return undefined;
  return PRESET_BY_ID.get(id as KnownExtAgentId);
}

/** Fill missing registry fields from bundled defaults (display only). */
export function resolveExtAgentEntry(
  entry: { id: string; name: string; adapter: string; url: string; enabled: boolean },
): typeof entry {
  const preset = getExtAgentPreset(entry.id);
  if (!preset) return entry;
  return {
    ...entry,
    name: entry.name || preset.name,
    adapter: entry.adapter || preset.adapter,
    url: entry.url || preset.url,
  };
}

export function defaultExtAgentRegistryForUi(): Array<{
  id: string;
  name: string;
  adapter: string;
  url: string;
  enabled: boolean;
}> {
  return EXT_AGENT_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    adapter: p.adapter,
    url: p.url,
    enabled: p.enabledByDefault,
  }));
}

export const CUSTOM_EXT_AGENT_NEW_ID = "__new_custom__";

/** Shared draft shape for Agent settings (matches AgentSettings ExtAgentConfig). */
export interface ExtAgentDraftBase {
  enabled: boolean;
  configured: boolean;
  name?: string;
  url?: string;
  listenPort?: number;
  activeExtAgent?: string;
  activeExtAgentId?: string | null;
  adapter?: string;
  extAgents?: Array<{
    id: string;
    name: string;
    adapter: string;
    url: string;
    enabled: boolean;
  }>;
  healthy?: boolean;
}

export interface ExtAgentEditOption {
  id: string;
  name: string;
  adapter: string;
  url: string;
  enabled: boolean;
  kind: "bundled" | "custom";
}

/** Short registry id: lowercase letters, numbers, hyphens. */
export function slugifyExtAgentId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function isBundledExtAgentId(id: string | undefined | null): boolean {
  return Boolean(id && getExtAgentPreset(id));
}

export function isCustomExtAgentSelection(id: string | undefined | null): boolean {
  if (!id) return false;
  if (id === CUSTOM_EXT_AGENT_NEW_ID) return true;
  return !isBundledExtAgentId(id);
}

/** Options for Configure mode: bundled presets, custom registry entries, then add-new. */
export function listEditAgentSelectOptions(
  registry: Array<{ id: string; name: string; adapter: string; url: string; enabled: boolean }>,
): { bundled: ExtAgentEditOption[]; custom: ExtAgentEditOption[] } {
  const bundled: ExtAgentEditOption[] = EXT_AGENT_PRESETS.map((preset) => {
    const existing = registry.find((e) => e.id === preset.id);
    return {
      id: preset.id,
      name: existing?.name || preset.name,
      adapter: existing?.adapter || preset.adapter,
      url: existing?.url || preset.url,
      enabled: existing?.enabled ?? preset.enabledByDefault,
      kind: "bundled",
    };
  });

  const custom: ExtAgentEditOption[] = registry
    .filter((entry) => !isBundledExtAgentId(entry.id))
    .map((entry) => ({ ...entry, kind: "custom" as const }));

  return { bundled, custom };
}

/** @deprecated Use listEditAgentSelectOptions — kept for tests. */
export function mergeEditAgentOptions(
  registry: Array<{ id: string; name: string; adapter: string; url: string; enabled: boolean }>,
): Array<{ id: string; name: string; adapter: string; url: string; enabled: boolean }> {
  const { bundled, custom } = listEditAgentSelectOptions(registry);
  return [...bundled, ...custom];
}

export function applyCustomAgentSelectToDraft<T extends ExtAgentDraftBase>(
  draft: T,
  agentId: string,
  registry: NonNullable<T["extAgents"]>,
): T {
  if (agentId === CUSTOM_EXT_AGENT_NEW_ID) {
    return {
      ...draft,
      activeExtAgent: CUSTOM_EXT_AGENT_NEW_ID,
      activeExtAgentId: CUSTOM_EXT_AGENT_NEW_ID,
      name: "",
      url: "",
      adapter: "envoymesh-message",
    };
  }

  const entry = (draft.extAgents ?? registry).find((e) => e.id === agentId);
  if (entry) {
    return {
      ...draft,
      activeExtAgent: agentId,
      activeExtAgentId: agentId,
      name: entry.name,
      url: entry.url,
      adapter: entry.adapter,
    };
  }

  return {
    ...draft,
    activeExtAgent: agentId,
    activeExtAgentId: agentId,
  };
}

export function finalizeExtAgentDraft<T extends ExtAgentDraftBase>(
  draft: T,
  customAgentIdInput: string,
): T {
  const activeSaveId = draft.activeExtAgentId ?? draft.activeExtAgent ?? "";
  const isNewCustom = activeSaveId === CUSTOM_EXT_AGENT_NEW_ID;
  const isExistingCustom = isCustomExtAgentSelection(activeSaveId) && !isNewCustom;

  if (isNewCustom || isExistingCustom) {
    const id = isNewCustom
      ? slugifyExtAgentId(customAgentIdInput || draft.name || "")
      : activeSaveId;
    const entry = {
      id,
      name: (draft.name ?? "").trim() || id,
      url: (draft.url ?? "").trim(),
      adapter: draft.adapter || "envoymesh-message",
      enabled: true,
    };
    const extAgents = [...(draft.extAgents ?? [])];
    const idx = extAgents.findIndex((e) => e.id === id);
    if (idx >= 0) {
      extAgents[idx] = { ...extAgents[idx], ...entry };
    } else {
      extAgents.push(entry);
    }
    return {
      ...draft,
      extAgents,
      activeExtAgent: id,
      activeExtAgentId: id,
      name: entry.name,
      url: entry.url,
      adapter: entry.adapter,
    };
  }

  if (activeSaveId && isBundledExtAgentId(activeSaveId)) {
    const withPreset = applyExtAgentPresetToDraft(draft, activeSaveId);
    if ((withPreset.extAgents?.length ?? 0) > 0) {
      return {
        ...withPreset,
        extAgents: (withPreset.extAgents ?? []).map((entry) =>
          entry.id === activeSaveId
            ? {
              ...entry,
              name: draft.name ?? entry.name,
              url: draft.url ?? entry.url,
              adapter: draft.adapter ?? entry.adapter,
            }
            : entry,
        ),
      };
    }
    return withPreset;
  }

  if (activeSaveId && (draft.extAgents?.length ?? 0) > 0) {
    return {
      ...draft,
      extAgents: (draft.extAgents ?? []).map((entry) =>
        entry.id === activeSaveId
          ? {
            ...entry,
            name: draft.name ?? entry.name,
            url: draft.url ?? entry.url,
            adapter: draft.adapter ?? entry.adapter,
          }
          : entry,
      ),
    };
  }

  return draft;
}

export function applyExtAgentPresetToDraft<T extends ExtAgentDraftBase>(
  draft: T,
  agentId: string,
): T {
  const preset = getExtAgentPreset(agentId);
  if (!preset) {
    return {
      ...draft,
      activeExtAgent: agentId,
      activeExtAgentId: agentId,
    };
  }

  const registry = draft.extAgents ?? [];
  const existing = registry.find((e) => e.id === agentId);
  const nextEntry = {
    id: preset.id,
    name: preset.name,
    adapter: preset.adapter,
    url: preset.url,
    enabled: existing?.enabled ?? preset.enabledByDefault,
  };
  const extAgents = existing
    ? registry.map((e) => (e.id === agentId ? { ...e, ...nextEntry } : e))
    : [...registry, nextEntry];

  return {
    ...draft,
    activeExtAgent: agentId,
    activeExtAgentId: agentId,
    name: preset.name,
    url: preset.url,
    adapter: preset.adapter,
    extAgents,
  };
}

/** Guess active agent id from draft fields (bundled or custom). */
export function inferExtAgentIdFromDraft(draft: {
  activeExtAgent?: string;
  activeExtAgentId?: string | null;
  name?: string;
  url?: string;
  extAgents?: Array<{ id: string; name?: string; url?: string }>;
}): string {
  const explicit = draft.activeExtAgentId ?? draft.activeExtAgent;
  if (explicit && explicit !== CUSTOM_EXT_AGENT_NEW_ID) {
    return explicit;
  }
  for (const preset of EXT_AGENT_PRESETS) {
    if (draft.url === preset.url || draft.name === preset.name) {
      return preset.id;
    }
  }
  const custom = (draft.extAgents ?? []).find((e) => !isBundledExtAgentId(e.id));
  if (custom) return custom.id;
  return "homeclaw";
}
