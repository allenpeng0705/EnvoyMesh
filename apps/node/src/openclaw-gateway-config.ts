/**
 * Build OpenClaw gateway config fragments for web search + skill keys.
 *
 * Skill API keys in bridge-config serve two roles:
 * - Web search providers (tavily, brave, …) → plugins.entries.<id>.config.webSearch
 * - ClawHub skills → skills.entries (env vars are also set for scripts)
 */

const WEB_SEARCH_PROVIDER_SLUGS = new Set([
  "brave",
  "duckduckgo",
  "exa",
  "firecrawl",
  "gemini",
  "google",
  "grok",
  "xai",
  "kimi",
  "moonshot",
  "minimax",
  "ollama",
  "perplexity",
  "searxng",
  "tavily",
]);

/** Map bridge skill slug → OpenClaw web_search provider id + plugin entry id. */
export function resolveWebSearchProviderFromSkillSlug(slug: string): {
  providerId: string;
  pluginId: string;
  envVar?: string;
} | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !WEB_SEARCH_PROVIDER_SLUGS.has(normalized)) {
    return null;
  }
  if (normalized === "google" || normalized === "gemini") {
    return { providerId: "gemini", pluginId: "google", envVar: "GEMINI_API_KEY" };
  }
  if (normalized === "grok" || normalized === "xai") {
    return { providerId: "grok", pluginId: "xai", envVar: "XAI_API_KEY" };
  }
  if (normalized === "kimi" || normalized === "moonshot") {
    return { providerId: "kimi", pluginId: "moonshot", envVar: "KIMI_API_KEY" };
  }
  const envVar = `${normalized.toUpperCase()}_API_KEY`;
  return { providerId: normalized, pluginId: normalized, envVar };
}

export function buildOpenClawGatewaySkillEntries(
  skillApiKeys?: Record<string, string>,
): Record<string, { enabled: boolean; apiKey: string }> {
  const entries: Record<string, { enabled: boolean; apiKey: string }> = {};
  for (const [slug, key] of Object.entries(skillApiKeys ?? {})) {
    const trimmed = key?.trim();
    if (trimmed) entries[slug] = { enabled: true, apiKey: trimmed };
  }
  return entries;
}

/** Prefer explicit provider order when multiple search keys are configured. */
const WEB_SEARCH_PROVIDER_PRIORITY = [
  "tavily",
  "brave",
  "perplexity",
  "gemini",
  "firecrawl",
  "exa",
  "kimi",
  "minimax",
  "searxng",
  "duckduckgo",
] as const;

function pickConfiguredWebSearchProvider(
  skillApiKeys: Record<string, string>,
): { slug: string; key: string; providerId: string; pluginId: string; envVar?: string } | null {
  const normalized = new Map<string, { slug: string; key: string }>();
  for (const [slug, key] of Object.entries(skillApiKeys)) {
    const trimmed = key?.trim();
    if (!trimmed) continue;
    const resolved = resolveWebSearchProviderFromSkillSlug(slug);
    if (!resolved) continue;
    normalized.set(resolved.providerId, { slug, key: trimmed });
  }
  for (const providerId of WEB_SEARCH_PROVIDER_PRIORITY) {
    const hit = normalized.get(providerId);
    if (!hit) continue;
    const resolved = resolveWebSearchProviderFromSkillSlug(hit.slug);
    if (!resolved) continue;
    return { ...hit, providerId: resolved.providerId, pluginId: resolved.pluginId, envVar: resolved.envVar };
  }
  const first = [...normalized.entries()][0];
  if (!first) return null;
  const [providerId, hit] = first;
  const resolved = resolveWebSearchProviderFromSkillSlug(hit.slug);
  if (!resolved) return null;
  return { ...hit, providerId, pluginId: resolved.pluginId, envVar: resolved.envVar };
}

export function resolveActiveWebSearchProvider(params: {
  webSearchEnabled: boolean;
  skillApiKeys?: Record<string, string>;
}): { enabled: boolean; provider?: string } {
  if (!params.webSearchEnabled) {
    return { enabled: false };
  }
  const picked = pickConfiguredWebSearchProvider(params.skillApiKeys ?? {});
  return { enabled: true, provider: picked?.providerId ?? "duckduckgo" };
}

/** True when POST to the webhook hits the EnvoyMesh route (bare gateway returns 404). */
export function isOpenClawEnvoymeshWebhookReady(httpStatus: number): boolean {
  return httpStatus !== 404;
}

/** OpenClaw tools + plugins section for the embedded gateway config. */
export function buildOpenClawGatewayAgentSection(params: {
  webSearchEnabled: boolean;
  skillApiKeys?: Record<string, string>;
}): { tools: Record<string, unknown>; plugins: Record<string, unknown> } {
  const pluginAllow = new Set<string>(["envoymesh"]);
  const pluginEntries: Record<string, unknown> = {
    envoymesh: { enabled: true },
  };
  let webSearch: Record<string, unknown>;

  if (!params.webSearchEnabled) {
    webSearch = { enabled: false };
  } else {
    const picked = pickConfiguredWebSearchProvider(params.skillApiKeys ?? {});
    if (picked) {
      pluginAllow.add(picked.pluginId);
      pluginEntries[picked.pluginId] = {
        enabled: true,
        config: {
          webSearch: {
            apiKey: picked.key,
          },
        },
      };
      webSearch = { enabled: true, provider: picked.providerId };
    } else {
      webSearch = { enabled: true, provider: "duckduckgo" };
    }
  }

  return {
    tools: {
      // "coding" profile includes web_search/web_fetch; "full" allows everything.
      profile: "full",
      web: { search: webSearch },
    },
    plugins: {
      allow: [...pluginAllow],
      entries: pluginEntries,
    },
  };
}

/** @deprecated Use buildOpenClawGatewayAgentSection */
export function buildOpenClawGatewayWebSearchSection(params: {
  webSearchEnabled: boolean;
  skillApiKeys?: Record<string, string>;
}): Record<string, unknown> {
  const section = buildOpenClawGatewayAgentSection(params);
  return {
    tools: section.tools,
    plugins: section.plugins,
  };
}

/** Env vars for gateway child process (OpenClaw auto-detect + skill scripts). */
export function buildOpenClawGatewaySearchEnv(
  skillApiKeys?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [slug, key] of Object.entries(skillApiKeys ?? {})) {
    const trimmed = key?.trim();
    if (!trimmed) continue;
    const resolved = resolveWebSearchProviderFromSkillSlug(slug);
    if (resolved?.envVar) {
      env[resolved.envVar] = trimmed;
    }
  }
  return env;
}
