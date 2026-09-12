/**
 * Client-side Coding project registry (C1).
 * Paseo: Project = registered root; Workspace = task under a project.
 * Home-node Project registry comes later — this persists paths in localStorage
 * and is seeded from existing workspace cwds.
 */

import {
  isCodingHarnessId,
  type CodingHarnessId,
} from "@envoymesh/api";

const STORAGE_KEY = "envoymesh.codingProjects";
const DISMISSED_KEY = "envoymesh.codingProjects.dismissed";
const LAST_PREFILL_KEY = "envoymesh.coding.lastWorkspacePrefill";
const DEFAULTS_KEY = "envoymesh.coding.defaults";

/** Fired on window when the Coding project registry changes. */
export const CODING_PROJECTS_CHANGED_EVENT = "envoymesh:coding-projects-changed";

/** Fired on window when Coding defaults change. */
export const CODING_DEFAULTS_CHANGED_EVENT = "envoymesh:coding-defaults-changed";

/** Inline Coding provider (not Settings → AI). */
export type CodingProviderKind = "openai-compatible" | "anthropic-compatible";

export const CODING_PROVIDER_KINDS: readonly CodingProviderKind[] = [
  "openai-compatible",
  "anthropic-compatible",
] as const;

export function isCodingProviderKind(raw: string): raw is CodingProviderKind {
  return (CODING_PROVIDER_KINDS as readonly string[]).includes(raw);
}

export type CodingWorkspacePrefill = {
  harness: CodingHarnessId;
  model: string;
  providerKind: CodingProviderKind | "";
  endpoint: string;
  apiKey: string;
};

export type CodingProject = {
  /** Absolute path on the home node (project root). */
  path: string;
  /** Display label (folder basename or user rename). */
  label: string;
  addedAt: string;
  /** Preferred harness when creating a new workspace under this project. */
  defaultHarness?: CodingHarnessId;
  /** Preferred LLM for new workspaces under this project. */
  defaultModel?: string;
  /** Compatible provider kind; omit = agent-native. */
  defaultProviderKind?: CodingProviderKind;
  defaultEndpoint?: string;
  defaultApiKey?: string;
};

export type CodingProjectPatch = {
  label?: string;
  defaultHarness?: CodingHarnessId | null;
  defaultModel?: string | null;
  defaultProviderKind?: CodingProviderKind | null;
  defaultEndpoint?: string | null;
  defaultApiKey?: string | null;
};

/**
 * Global Coding defaults (not Settings → AI).
 * Empty model/provider for Envoy/Pi means EnvoyMesh AI at runtime.
 */
export type CodingDefaults = {
  harness: CodingHarnessId;
  model: string;
  providerKind: CodingProviderKind | "";
  endpoint: string;
  apiKey: string;
};

export const SYSTEM_CODING_DEFAULTS: CodingDefaults = {
  harness: "envoy-harness",
  model: "",
  providerKind: "",
  endpoint: "",
  apiKey: "",
};

/** Normalize a model / endpoint / key string (empty → undefined). */
export function normalizeCodingModelSpec(
  raw: string | null | undefined,
): string | undefined {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeCodingProviderKind(
  raw: string | null | undefined,
): CodingProviderKind | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return isCodingProviderKind(trimmed) ? trimmed : undefined;
}

/** Map Settings → AI `modelProviders` to a Coding model hint string. */
export function modelProvidersToCodingSpec(
  mp:
    | { mode?: string; modelName?: string }
    | null
    | undefined,
): string {
  const modelName = mp?.modelName?.trim() ?? "";
  if (!modelName) return "";
  const mode = (mp?.mode ?? "").toLowerCase();
  if (!mode || mode === "mock" || mode === "disabled") return modelName;
  switch (mode) {
    case "openai":
    case "openai-compatible":
    case "litellm":
      return `openai:${modelName}`;
    case "anthropic":
    case "anthropic-compatible":
      return `anthropic:${modelName}`;
    case "ollama":
      return `ollama:${modelName}`;
    case "deepseek":
      return `deepseek:${modelName}`;
    default:
      return `${mode}:${modelName}`;
  }
}

function parseCodingDefaults(raw: unknown): CodingDefaults {
  if (!raw || typeof raw !== "object") return { ...SYSTEM_CODING_DEFAULTS };
  const o = raw as Record<string, unknown>;
  const harnessRaw = typeof o.harness === "string" ? o.harness : "";
  return {
    harness:
      harnessRaw && isCodingHarnessId(harnessRaw)
        ? harnessRaw
        : SYSTEM_CODING_DEFAULTS.harness,
    model: normalizeCodingModelSpec(typeof o.model === "string" ? o.model : "") ?? "",
    providerKind:
      normalizeCodingProviderKind(
        typeof o.providerKind === "string" ? o.providerKind : "",
      ) ?? "",
    endpoint:
      normalizeCodingModelSpec(typeof o.endpoint === "string" ? o.endpoint : "") ??
      "",
    apiKey:
      normalizeCodingModelSpec(typeof o.apiKey === "string" ? o.apiKey : "") ?? "",
  };
}

export function loadCodingDefaults(): CodingDefaults {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return { ...SYSTEM_CODING_DEFAULTS };
    return parseCodingDefaults(JSON.parse(raw) as unknown);
  } catch {
    return { ...SYSTEM_CODING_DEFAULTS };
  }
}

export function saveCodingDefaults(next: CodingDefaults): CodingDefaults {
  const normalized: CodingDefaults = {
    harness: isCodingHarnessId(next.harness)
      ? next.harness
      : SYSTEM_CODING_DEFAULTS.harness,
    model: normalizeCodingModelSpec(next.model) ?? "",
    providerKind: normalizeCodingProviderKind(next.providerKind) ?? "",
    endpoint: normalizeCodingModelSpec(next.endpoint) ?? "",
    apiKey: normalizeCodingModelSpec(next.apiKey) ?? "",
  };
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new Event(CODING_DEFAULTS_CHANGED_EVENT));
  } catch {
    /* non-browser */
  }
  return normalized;
}

/**
 * Prefill for New workspace: project → Coding defaults → system.
 * Empty model/provider for Envoy/Pi means EnvoyMesh AI at runtime.
 */
export function resolveCodingWorkspacePrefill(opts: {
  project?: CodingProject | null;
  defaults?: CodingDefaults | null;
}): CodingWorkspacePrefill {
  const p = opts.project;
  const d = opts.defaults ?? loadCodingDefaults();
  const harness =
    (p?.defaultHarness && isCodingHarnessId(p.defaultHarness)
      ? p.defaultHarness
      : undefined) ||
    (d.harness && isCodingHarnessId(d.harness) ? d.harness : undefined) ||
    SYSTEM_CODING_DEFAULTS.harness;
  return {
    harness,
    model:
      normalizeCodingModelSpec(p?.defaultModel) ||
      normalizeCodingModelSpec(d.model) ||
      "",
    providerKind:
      normalizeCodingProviderKind(p?.defaultProviderKind) ||
      normalizeCodingProviderKind(d.providerKind) ||
      "",
    endpoint:
      normalizeCodingModelSpec(p?.defaultEndpoint) ||
      normalizeCodingModelSpec(d.endpoint) ||
      "",
    apiKey:
      normalizeCodingModelSpec(p?.defaultApiKey) ||
      normalizeCodingModelSpec(d.apiKey) ||
      "",
  };
}

/** @deprecated Use resolveCodingWorkspacePrefill — kept for older call sites. */
export function resolveCodingModelPrefill(opts: {
  project?: Pick<CodingProject, "defaultModel"> | null;
  lastUsed?: string | null;
  globalSpec?: string | null;
}): string {
  return (
    normalizeCodingModelSpec(opts.project?.defaultModel) ||
    normalizeCodingModelSpec(opts.lastUsed) ||
    normalizeCodingModelSpec(opts.globalSpec) ||
    ""
  );
}

/** Map a Coding model + provider kind to an EH host model string. */
export function codingModelToEhHostModel(
  model: string | null | undefined,
  providerKind: CodingProviderKind | "" | null | undefined,
): string | undefined {
  const m = normalizeCodingModelSpec(model);
  if (!m) return undefined;
  if (m.includes(":")) return m;
  const kind = normalizeCodingProviderKind(providerKind ?? undefined);
  if (kind === "openai-compatible") return `openai:${m}`;
  if (kind === "anthropic-compatible") return `anthropic:${m}`;
  return m;
}

/** Common model suggestions for compatible providers (EH / Pi). */
export function codingCompatibleModelSuggestions(
  kind: CodingProviderKind | "" | null | undefined,
): string[] {
  const k = normalizeCodingProviderKind(kind ?? undefined);
  if (k === "anthropic-compatible") {
    return [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-3-5-haiku-latest",
      "anthropic:claude-sonnet-4-20250514",
    ];
  }
  if (k === "openai-compatible") {
    return [
      "gpt-4o",
      "gpt-4.1",
      "o4-mini",
      "openai:gpt-4o",
      "deepseek-chat",
    ];
  }
  return ["gpt-4o", "claude-sonnet-4-20250514", "openai:gpt-4o"];
}

export function loadCodingLastUsedPrefill(): Partial<CodingWorkspacePrefill> | null {
  try {
    const raw = localStorage.getItem(LAST_PREFILL_KEY);
    if (!raw) {
      // Migrate legacy last-model key if present.
      const legacy = localStorage.getItem("envoymesh.coding.lastModel");
      const model = normalizeCodingModelSpec(legacy);
      return model ? { model } : null;
    }
    const parsed = JSON.parse(raw) as Partial<CodingWorkspacePrefill>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...(parsed.harness && isCodingHarnessId(parsed.harness)
        ? { harness: parsed.harness }
        : {}),
      ...(normalizeCodingModelSpec(parsed.model)
        ? { model: normalizeCodingModelSpec(parsed.model) }
        : {}),
      ...(normalizeCodingProviderKind(parsed.providerKind)
        ? { providerKind: normalizeCodingProviderKind(parsed.providerKind) }
        : {}),
      ...(normalizeCodingModelSpec(parsed.endpoint)
        ? { endpoint: normalizeCodingModelSpec(parsed.endpoint) }
        : {}),
      ...(normalizeCodingModelSpec(parsed.apiKey)
        ? { apiKey: normalizeCodingModelSpec(parsed.apiKey) }
        : {}),
    };
  } catch {
    return null;
  }
}

export function saveCodingLastUsedPrefill(
  prefill: Partial<CodingWorkspacePrefill> | null | undefined,
): void {
  try {
    if (!prefill) {
      localStorage.removeItem(LAST_PREFILL_KEY);
      return;
    }
    const payload: Partial<CodingWorkspacePrefill> = {};
    if (prefill.harness && isCodingHarnessId(prefill.harness)) {
      payload.harness = prefill.harness;
    }
    const model = normalizeCodingModelSpec(prefill.model);
    if (model) payload.model = model;
    const kind = normalizeCodingProviderKind(prefill.providerKind);
    if (kind) payload.providerKind = kind;
    const endpoint = normalizeCodingModelSpec(prefill.endpoint);
    if (endpoint) payload.endpoint = endpoint;
    const apiKey = normalizeCodingModelSpec(prefill.apiKey);
    if (apiKey) payload.apiKey = apiKey;
    localStorage.setItem(LAST_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    /* private mode — non-fatal */
  }
}

/** @deprecated Prefer saveCodingLastUsedPrefill */
export function loadCodingLastUsedModel(): string {
  return loadCodingLastUsedPrefill()?.model ?? "";
}

/** @deprecated Prefer saveCodingLastUsedPrefill */
export function saveCodingLastUsedModel(model: string | null | undefined): void {
  const next = normalizeCodingModelSpec(model);
  const prev = loadCodingLastUsedPrefill() ?? {};
  saveCodingLastUsedPrefill(next ? { ...prev, model: next } : { ...prev, model: undefined });
}

export function normalizeCodingProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").trim();
}

export function codingProjectLabel(path: string): string {
  const norm = normalizeCodingProjectPath(path);
  const parts = norm.split("/");
  return parts[parts.length - 1] || norm || "/";
}

function loadDismissedPaths(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const row of parsed) {
      const path = normalizeCodingProjectPath(String(row ?? ""));
      if (path) out.add(path);
    }
    return out;
  } catch {
    return new Set();
  }
}

function saveDismissedPaths(paths: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...paths]));
  } catch {
    /* private mode — non-fatal */
  }
}

function emitProjectsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CODING_PROJECTS_CHANGED_EVENT));
  }
}

function parseDefaultHarness(raw: unknown): CodingHarnessId | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return isCodingHarnessId(trimmed) ? trimmed : undefined;
}

function parseDefaultModel(raw: unknown): string | undefined {
  return normalizeCodingModelSpec(typeof raw === "string" ? raw : undefined);
}

function applyOptionalString(
  next: CodingProject,
  key: "defaultModel" | "defaultEndpoint" | "defaultApiKey",
  value: string | null | undefined,
): CodingProject {
  if (value === null) {
    const { [key]: _drop, ...rest } = next;
    return rest;
  }
  if (typeof value !== "string") return next;
  const normalized = normalizeCodingModelSpec(value);
  if (normalized) return { ...next, [key]: normalized };
  const { [key]: _drop, ...rest } = next;
  return rest;
}

function parseProjectRow(row: unknown): CodingProject | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<CodingProject>;
  const path = normalizeCodingProjectPath(String(r.path ?? ""));
  if (!path) return null;
  const defaultHarness = parseDefaultHarness(r.defaultHarness);
  const defaultModel = parseDefaultModel(r.defaultModel);
  const defaultProviderKind = normalizeCodingProviderKind(r.defaultProviderKind);
  const defaultEndpoint = normalizeCodingModelSpec(r.defaultEndpoint);
  const defaultApiKey = normalizeCodingModelSpec(r.defaultApiKey);
  return {
    path,
    label:
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim()
        : codingProjectLabel(path),
    addedAt:
      typeof r.addedAt === "string" && r.addedAt
        ? r.addedAt
        : new Date(0).toISOString(),
    ...(defaultHarness ? { defaultHarness } : {}),
    ...(defaultModel ? { defaultModel } : {}),
    ...(defaultProviderKind ? { defaultProviderKind } : {}),
    ...(defaultEndpoint ? { defaultEndpoint } : {}),
    ...(defaultApiKey ? { defaultApiKey } : {}),
  };
}

export function loadCodingProjects(): CodingProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CodingProject[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      const project = parseProjectRow(row);
      if (!project || seen.has(project.path)) continue;
      seen.add(project.path);
      out.push(project);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCodingProjects(projects: CodingProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    emitProjectsChanged();
  } catch {
    /* private mode — non-fatal */
  }
}

export function getCodingProject(path: string): CodingProject | null {
  const normalized = normalizeCodingProjectPath(path);
  if (!normalized) return null;
  return loadCodingProjects().find((p) => p.path === normalized) ?? null;
}

/** Register a project root. Returns the project; no-op if already present. */
export function addCodingProject(path: string): CodingProject {
  const normalized = normalizeCodingProjectPath(path);
  if (!normalized) {
    throw new Error("Project path required");
  }
  const dismissed = loadDismissedPaths();
  if (dismissed.delete(normalized)) {
    saveDismissedPaths(dismissed);
  }
  const projects = loadCodingProjects();
  const existing = projects.find((p) => p.path === normalized);
  if (existing) return existing;
  const next: CodingProject = {
    path: normalized,
    label: codingProjectLabel(normalized),
    addedAt: new Date().toISOString(),
  };
  saveCodingProjects([next, ...projects]);
  return next;
}

/**
 * When a project has no default agent yet, copy create-time workspace choices
 * into project defaults (first workspace defines the project engine).
 * Does not overwrite an existing defaultHarness.
 */
export function seedCodingProjectDefaultsIfEmpty(
  path: string,
  opts: {
    harness: CodingHarnessId;
    model?: string;
    providerKind?: CodingProviderKind | "";
    endpoint?: string;
    apiKey?: string;
  },
): CodingProject | null {
  addCodingProject(path);
  const project = getCodingProject(path);
  if (!project) return null;
  if (project.defaultHarness) return project;

  const model = normalizeCodingModelSpec(opts.model);
  const endpoint = normalizeCodingModelSpec(opts.endpoint);
  const apiKey = normalizeCodingModelSpec(opts.apiKey);
  const providerKind = normalizeCodingProviderKind(opts.providerKind);

  return updateCodingProject(path, {
    defaultHarness: opts.harness,
    ...(model && !project.defaultModel ? { defaultModel: model } : {}),
    ...(providerKind && !project.defaultProviderKind
      ? { defaultProviderKind: providerKind }
      : {}),
    ...(endpoint && !project.defaultEndpoint
      ? { defaultEndpoint: endpoint }
      : {}),
    ...(apiKey && !project.defaultApiKey ? { defaultApiKey: apiKey } : {}),
  });
}

/**
 * Patch an existing project (rename / defaults).
 * Returns the updated project, or null if the path is not registered.
 */
export function updateCodingProject(
  path: string,
  patch: CodingProjectPatch,
): CodingProject | null {
  const normalized = normalizeCodingProjectPath(path);
  if (!normalized) return null;
  const projects = loadCodingProjects();
  const index = projects.findIndex((p) => p.path === normalized);
  if (index < 0) return null;
  const current = projects[index]!;
  let next: CodingProject = { ...current };

  if (typeof patch.label === "string") {
    const label = patch.label.trim();
    next = {
      ...next,
      label: label || codingProjectLabel(normalized),
    };
  }

  if (patch.defaultHarness === null) {
    const { defaultHarness: _drop, ...rest } = next;
    next = rest;
  } else if (typeof patch.defaultHarness === "string") {
    if (isCodingHarnessId(patch.defaultHarness)) {
      next = { ...next, defaultHarness: patch.defaultHarness };
    }
  }

  next = applyOptionalString(next, "defaultModel", patch.defaultModel);
  next = applyOptionalString(next, "defaultEndpoint", patch.defaultEndpoint);
  next = applyOptionalString(next, "defaultApiKey", patch.defaultApiKey);

  if (patch.defaultProviderKind === null) {
    const { defaultProviderKind: _drop, ...rest } = next;
    next = rest;
  } else if (typeof patch.defaultProviderKind === "string") {
    const kind = normalizeCodingProviderKind(patch.defaultProviderKind);
    if (kind) next = { ...next, defaultProviderKind: kind };
  }

  projects[index] = next;
  saveCodingProjects(projects);
  return next;
}

/**
 * Remove a project from the Coding registry only (never deletes disk paths).
 * Also dismisses the path so cwd seeding cannot bring it back until Add project.
 */
export function removeCodingProject(path: string): boolean {
  const normalized = normalizeCodingProjectPath(path);
  if (!normalized) return false;
  const dismissed = loadDismissedPaths();
  dismissed.add(normalized);
  saveDismissedPaths(dismissed);
  const projects = loadCodingProjects();
  const next = projects.filter((p) => p.path !== normalized);
  if (next.length === projects.length) {
    emitProjectsChanged();
    return false;
  }
  saveCodingProjects(next);
  return true;
}

/**
 * Ensure known workspace cwds appear as projects (migration / sync).
 * Skips paths the user explicitly removed until they Add project again.
 */
export function ensureCodingProjectsFromCwds(cwds: string[]): CodingProject[] {
  let projects = loadCodingProjects();
  let changed = false;
  const seen = new Set(projects.map((p) => p.path));
  const dismissed = loadDismissedPaths();
  for (const cwd of cwds) {
    const path = normalizeCodingProjectPath(cwd);
    if (!path || seen.has(path) || dismissed.has(path)) continue;
    seen.add(path);
    projects = [
      {
        path,
        label: codingProjectLabel(path),
        addedAt: new Date().toISOString(),
      },
      ...projects,
    ];
    changed = true;
  }
  if (changed) saveCodingProjects(projects);
  return projects;
}
