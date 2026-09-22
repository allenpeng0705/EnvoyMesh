/**
 * Shared agent → model → inline OpenAI/Anthropic provider fields for Coding.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CODING_ALL_HARNESSES,
  CODING_FEATURED_HARNESSES,
  CODING_TIER_A_HARNESSES,
  codingHarnessHint,
  codingHarnessLabel,
  codingHarnessToExtAgentId,
  isCodingFeaturedHarness,
  isCodingTierBHarness,
  type CodingHarnessId,
  type ModelProviderConfig,
} from "@envoymesh/api";
import {
  harnessProbeLabelKey,
} from "../lib/coding-harness-probe.js";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import {
  codingEnvoyHarnessModelSuggestions,
  codingModelSuggestionsForAgent,
  type CodingProviderKind,
} from "../lib/coding-projects.js";
import type { CodingAgentModelProviderValue } from "../lib/coding-agent-model-provider.js";

export type { CodingAgentModelProviderValue } from "../lib/coding-agent-model-provider.js";

export type CodingAgentModelProviderFieldsProps = {
  value: CodingAgentModelProviderValue;
  onChange: (next: CodingAgentModelProviderValue) => void;
  busy?: boolean;
  disabled?: boolean;
  /** When true, render harness as radios (new task). Else select (project settings). */
  harnessAsRadios?: boolean;
  enabledHarnesses?: readonly CodingHarnessId[];
  harnessProbe?: Partial<
    Record<CodingHarnessId, "ready" | "not-ready" | "install" | "unknown" | "checking">
  >;
  /** Scope hint for copy: coding defaults vs project vs this task. */
  scope?: "defaults" | "project" | "task";
  /**
   * What empty Envoy/Pi model/provider means in this form.
   * - coding-defaults: inherit Coding defaults (project / new task)
   * - envoymesh-ai: inherit EnvoyMesh AI (Coding defaults page)
   */
  fallbackKind?: "coding-defaults" | "envoymesh-ai";
  /**
   * Model label for empty-state placeholder
   * (Coding defaults model, or EnvoyMesh AI model).
   */
  fallbackModelHint?: string;
  /** @deprecated Use fallbackModelHint. */
  settingsAiModelHint?: string;
  /** Settings → AI. Envoy Harness and Pi offer this provider plus EnvoyLocal. */
  modelProviders?: ModelProviderConfig | null;
};

export function CodingAgentModelProviderFields({
  value,
  onChange,
  busy = false,
  disabled = false,
  harnessAsRadios = false,
  enabledHarnesses = [],
  harnessProbe = {},
  scope = "task",
  fallbackKind,
  fallbackModelHint = "",
  settingsAiModelHint = "",
  modelProviders = null,
}: CodingAgentModelProviderFieldsProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [localModelIds, setLocalModelIds] = useState<string[]>([]);
  const locked = busy || disabled;
  const isEhOrPi =
    value.harness === "envoy-harness" || value.harness === "pi";
  const inheritFallback = isEhOrPi && !value.providerKind;
  const resolvedFallbackKind =
    fallbackKind ??
    (scope === "defaults" ? "envoymesh-ai" : "coding-defaults");
  const hint = (fallbackModelHint || settingsAiModelHint).trim();
  const useCodingDefaultsFallback =
    inheritFallback && resolvedFallbackKind === "coding-defaults";
  const useEnvoymeshAiFallback =
    inheritFallback && resolvedFallbackKind === "envoymesh-ai";

  useEffect(() => {
    let cancelled = false;
    const harness = value.harness;
    if (!isCodingTierBHarness(harness)) {
      setCatalogModels([]);
      setModelsLoading(false);
      return;
    }
    const agentId = codingHarnessToExtAgentId(harness);
    const getCatalog = nodeService.getExtAgentCommandCatalog;
    if (!agentId || !getCatalog) {
      setCatalogModels([]);
      setModelsLoading(false);
      return;
    }
    setModelsLoading(true);
    void getCatalog({ agentId, probeModels: true })
      .then((catalog) => {
        if (cancelled) return;
        const ids = (catalog.models ?? [])
          .map((m) => m.id?.trim())
          .filter((id): id is string => Boolean(id));
        // Prefer catalog default when the field is still empty.
        if (
          !value.model.trim() &&
          catalog.defaultModel?.trim() &&
          !cancelled
        ) {
          // Do not auto-write into the form — only seed suggestions.
        }
        setCatalogModels(
          [
            ...(catalog.defaultModel?.trim()
              ? [catalog.defaultModel.trim()]
              : []),
            ...ids,
          ].filter((id, i, arr) => arr.indexOf(id) === i),
        );
        setModelsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogModels([]);
          setModelsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omit nodeService object identity — only harness drives refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.harness]);

  useEffect(() => {
    if (value.harness !== "envoy-harness" && value.harness !== "pi") {
      setLocalModelIds([]);
      return;
    }
    const list = nodeService.listEnvoyLocalInstalledModels;
    if (!list) return;
    let cancelled = false;
    void list()
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((row) => row.active).map((row) => row.id);
        const rest = rows
          .map((row) => row.id)
          .filter((id) => id && !active.includes(id));
        setLocalModelIds([...active, ...rest]);
      })
      .catch(() => {
        if (!cancelled) setLocalModelIds([]);
      });
    return () => {
      cancelled = true;
    };
    // nodeService identity changes every render; the harness is what refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.harness]);

  const homeModels = useMemo(
    () =>
      codingEnvoyHarnessModelSuggestions({
        modelProviders,
        envoyLocalModelIds: localModelIds,
      }),
    [modelProviders, localModelIds],
  );

  const modelSuggestions = useMemo(
    () =>
      codingModelSuggestionsForAgent({
        harness: value.harness,
        providerKind: value.providerKind,
        catalogModels,
        homeModels,
      }),
    [catalogModels, homeModels, value.harness, value.providerKind],
  );

  const defaultAgentModelHint = useMemo(() => {
    const list = codingModelSuggestionsForAgent({
      harness: value.harness,
      providerKind: "",
      catalogModels,
      homeModels,
    });
    return list[0] ?? "";
  }, [catalogModels, homeModels, value.harness]);

  const showCompatFields =
    value.providerKind === "openai-compatible" ||
    value.providerKind === "anthropic-compatible";

  const emptyModelLabel = useCodingDefaultsFallback
    ? hint
      ? t(
          "codingView.modelPlaceholderCodingDefaults",
          "Empty = Coding defaults ({model})",
          { model: hint },
        )
      : t(
          "codingView.modelPlaceholderCodingDefaultsEmpty",
          "Empty = Coding defaults",
        )
    : useEnvoymeshAiFallback
      ? hint
        ? t(
            "codingView.modelPlaceholderEnvoymeshAi",
            "Empty = EnvoyMesh AI ({model})",
            { model: hint },
          )
        : t(
            "codingView.modelPlaceholderEnvoymeshAiEmpty",
            "Empty = EnvoyMesh AI",
          )
      : isEhOrPi
        ? t("codingView.modelPlaceholder", "e.g. gpt-4o or claude-sonnet…")
        : showCompatFields
          ? t(
              "codingView.modelPlaceholderCompat",
              "Model id for your compatible endpoint",
            )
          : defaultAgentModelHint
            ? t(
                "codingView.modelPlaceholderAgentDefault",
                "Empty = agent default ({model})",
                { model: defaultAgentModelHint },
              )
            : t(
                "codingView.modelPlaceholderAgentLogin",
                "Empty = this agent’s own login",
              );

  const modelFieldTestId =
    scope === "defaults"
      ? "coding-defaults-settings-model"
      : scope === "project"
        ? "coding-project-settings-model"
        : "coding-new-task-model";

  /** Listed models become a real dropdown (EnvoyCoder). Custom endpoints stay free text. */
  const showModelSelect = !showCompatFields && modelSuggestions.length > 0;
  const modelSelectOptions = useMemo(() => {
    const current = value.model.trim();
    if (!current || modelSuggestions.includes(current)) return modelSuggestions;
    return [current, ...modelSuggestions];
  }, [modelSuggestions, value.model]);

  const patch = (partial: Partial<CodingAgentModelProviderValue>) => {
    onChange({ ...value, ...partial });
  };

  /** Ready agents, plus the current choice so an existing unready task can still be edited. */
  const listedHarnesses = useMemo(() => {
    const allowed = new Set<CodingHarnessId>(enabledHarnesses);
    if (value.harness) allowed.add(value.harness);
    return CODING_ALL_HARNESSES.filter((id) => allowed.has(id));
  }, [enabledHarnesses, value.harness]);

  const listedFeatured = listedHarnesses.filter((id) =>
    isCodingFeaturedHarness(id),
  );
  const moreHarnesses = listedHarnesses.filter(
    (id) => !isCodingFeaturedHarness(id),
  );
  const featuredSet = new Set<string>(CODING_FEATURED_HARNESSES);
  const checking =
    listedHarnesses.length === 0 &&
    Object.values(harnessProbe).some((b) => b === "checking");

  const probeSuffix = (id: CodingHarnessId): string => {
    if (enabledHarnesses.includes(id)) return "";
    const key = harnessProbeLabelKey(harnessProbe[id]);
    if (key === "not-ready")
      return ` · ${t("codingView.harnessNotReady", "Not ready")}`;
    if (key === "checking")
      return ` · ${t("codingView.harnessChecking", "Checking…")}`;
    return ` · ${t("codingView.harnessNotReady", "Not ready")}`;
  };

  const catalogHint = t(
    "codingView.harnessCatalogHint",
    "Only agents that are ready on this computer are listed. Install or check others in Settings → AI → Coding agents.",
  );

  const renderHarnessRadio = (id: CodingHarnessId) => {
    const ready = enabledHarnesses.includes(id);
    const badge = harnessProbe[id];
    const labelKey = harnessProbeLabelKey(badge);
    const showNotReady = !ready && labelKey !== "ready";
    return (
      <label key={id} className="coding-harness-option">
        <input
          type="radio"
          name="coding-harness"
          value={id}
          checked={value.harness === id}
          disabled={locked}
          onChange={() =>
            patch({
              harness: id,
              // Reset model + custom provider when switching agents so
              // suggestions follow the new agent's probed list (EnvoyCoder).
              ...(value.harness !== id
                ? { model: "", providerKind: "", endpoint: "", apiKey: "" }
                : {}),
            })
          }
          data-testid={`coding-harness-${id}`}
        />
        <span>
          <strong>{codingHarnessLabel(id)}</strong>
          <span className="coding-harness-option__hint">
            {t(`codingView.harnessHint.${id}`, codingHarnessHint(id))}
          </span>
          {showNotReady ? (
            <span
              className="coding-harness-probe coding-harness-probe--install"
              data-testid={`coding-harness-probe-${id}`}
            >
              {labelKey === "checking"
                ? t("codingView.harnessChecking", "Checking…")
                : t("codingView.harnessNotReady", "Not ready")}
            </span>
          ) : null}
        </span>
      </label>
    );
  };

  const renderGroupedOptions = () => {
    const builtin = listedHarnesses.filter((h) =>
      (CODING_TIER_A_HARNESSES as readonly string[]).includes(h),
    );
    const featured = listedHarnesses.filter(
      (h) => isCodingTierBHarness(h) && isCodingFeaturedHarness(h),
    );
    const more = listedHarnesses.filter(
      (h) => !isCodingFeaturedHarness(h),
    );
    return (
      <>
        {builtin.length > 0 ? (
          <optgroup label={t("codingView.harnessGroupBuiltin", "Built-in")}>
            {builtin.map((h) => (
              <option key={h} value={h}>
                {codingHarnessLabel(h)}
                {probeSuffix(h)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {featured.length > 0 ? (
          <optgroup
            label={t("codingView.harnessGroupFeatured", "Featured CLIs")}
          >
            {featured.map((h) => (
              <option key={h} value={h}>
                {codingHarnessLabel(h)}
                {probeSuffix(h)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {more.length > 0 ? (
          <optgroup label={t("codingView.harnessGroupMore", "More agents")}>
            {more.map((h) => (
              <option key={h} value={h}>
                {codingHarnessLabel(h)}
                {probeSuffix(h)}
              </option>
            ))}
          </optgroup>
        ) : null}
      </>
    );
  };

  const emptyHarnessMessage = checking
    ? t("codingView.harnessChecking", "Checking…")
    : t(
        "codingView.harnessNoneReady",
        "No ready agents yet. Install one in Settings → AI → Coding agents.",
      );

  return (
    <>
      {harnessAsRadios ? (
        <fieldset className="coding-harness-fieldset" disabled={locked}>
          <legend>{t("codingView.harnessLabel", "Agent")}</legend>
          {listedFeatured.length === 0 && moreHarnesses.length === 0 ? (
            <p
              className="coding-harness-catalog-hint"
              data-testid="coding-harness-none-ready"
            >
              {emptyHarnessMessage}
            </p>
          ) : (
            <>
              {listedFeatured.map((id) => renderHarnessRadio(id))}
              {moreHarnesses.length > 0 ? (
                <label className="modal-field coding-harness-more">
                  <span>{t("codingView.harnessMore", "More agents")}</span>
                  <select
                    value={featuredSet.has(value.harness) ? "" : value.harness}
                    disabled={locked}
                    data-testid="coding-harness-more"
                    onChange={(e) => {
                      const next = e.target.value.trim();
                      if (!next) return;
                      patch({
                        harness: next as CodingHarnessId,
                        ...(value.harness !== next
                          ? {
                              model: "",
                              providerKind: "",
                              endpoint: "",
                              apiKey: "",
                            }
                          : {}),
                      });
                    }}
                  >
                    <option value="">
                      {t(
                        "codingView.harnessMorePlaceholder",
                        "Choose another…",
                      )}
                    </option>
                    {moreHarnesses.map((h) => (
                      <option key={h} value={h}>
                        {codingHarnessLabel(h)}
                        {probeSuffix(h)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}
          <p className="coding-harness-catalog-hint">{catalogHint}</p>
        </fieldset>
      ) : (
        <label className="modal-field">
          <span>
            {scope === "task"
              ? t("codingView.taskAgentLabel", "Agent")
              : t(
                  "codingView.projectDefaultHarness",
                  "Default agent for new tasks",
                )}
          </span>
          {listedHarnesses.length === 0 ? (
            <p
              className="coding-harness-catalog-hint"
              data-testid="coding-harness-none-ready"
            >
              {emptyHarnessMessage}
            </p>
          ) : (
            <select
              value={value.harness}
              disabled={locked}
              data-testid={
                scope === "defaults"
                  ? "coding-defaults-settings-harness"
                  : scope === "task"
                    ? "coding-task-agent-harness"
                    : "coding-project-settings-harness"
              }
              onChange={(e) => {
                const next = e.target.value as CodingHarnessId;
                patch({
                  harness: next,
                  ...(value.harness !== next
                    ? {
                        model: "",
                        providerKind: "",
                        endpoint: "",
                        apiKey: "",
                      }
                    : {}),
                });
              }}
            >
              {renderGroupedOptions()}
            </select>
          )}
          <span className="coding-harness-catalog-hint">{catalogHint}</span>
        </label>
      )}

      <label className="modal-field">
        <span>{t("codingView.modelLabel", "Model")}</span>
        {showModelSelect ? (
          <select
            value={value.model}
            disabled={locked}
            data-testid={modelFieldTestId}
            onChange={(e) => patch({ model: e.target.value })}
          >
            <option value="">{emptyModelLabel}</option>
            {modelSelectOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value.model}
            disabled={locked}
            placeholder={emptyModelLabel}
            data-testid={modelFieldTestId}
            onChange={(e) => patch({ model: e.target.value })}
          />
        )}
        <p
          className="coding-job-modal__hint"
          data-testid={`coding-model-hint-${scope}`}
        >
          {useCodingDefaultsFallback
            ? t(
                "codingView.modelHintCodingDefaults",
                "Envoy and Pi use Coding defaults when empty. Set a model here only to override.",
              )
            : useEnvoymeshAiFallback
              ? t(
                  "codingView.modelHintEnvoymeshAi",
                  "Envoy and Pi use EnvoyMesh AI when empty. Set a model here only to override.",
                )
              : isEhOrPi
                ? scope === "defaults"
                  ? t(
                      "codingView.defaultsModelHint",
                      "Applied when a project has no model override.",
                    )
                  : scope === "project"
                    ? t(
                        "codingView.projectDefaultModelHint",
                        "Used when creating a new task. The task can override it.",
                      )
                    : t(
                        "codingView.modelLockHint",
                        "Locked for this task at start. Overrides the project default.",
                      )
                : modelsLoading
                  ? `${t(
                      "codingView.modelHintAgentLogin",
                      "Leave empty to use this agent’s own login and default model. Set a model only if the CLI supports an override.",
                    )} ${t("codingView.modelLoading", "Checking this agent’s models…")}`
                  : t(
                      "codingView.modelHintAgentLogin",
                      "Leave empty to use this agent’s own login and default model. Set a model only if the CLI supports an override.",
                    )}
        </p>
      </label>

      <label className="modal-field">
        <span>{t("codingView.providerKindLabel", "Provider")}</span>
        <select
          value={value.providerKind}
          disabled={locked}
          data-testid={
            scope === "defaults"
              ? "coding-defaults-settings-provider"
              : scope === "project"
                ? "coding-project-settings-provider"
                : "coding-new-task-provider"
          }
          onChange={(e) => {
            const next = e.target.value;
            patch({
              providerKind:
                next === "openai-compatible" || next === "anthropic-compatible"
                  ? next
                  : "",
            });
          }}
        >
          <option value="">
            {isEhOrPi
              ? resolvedFallbackKind === "envoymesh-ai"
                ? t("codingView.providerEnvoymeshAi", "EnvoyMesh AI (default)")
                : t("codingView.providerCodingDefaults", "Coding defaults")
              : t(
                  "codingView.providerAgentLogin",
                  "Agent’s own login (default)",
                )}
          </option>
          <option value="openai-compatible">
            {t("codingView.providerOpenAI", "OpenAI-compatible")}
          </option>
          <option value="anthropic-compatible">
            {t("codingView.providerAnthropic", "Anthropic-compatible")}
          </option>
        </select>
        <p
          className="coding-job-modal__hint"
          data-testid={`coding-provider-hint-${scope}`}
        >
          {useCodingDefaultsFallback
            ? t(
                "codingView.providerKindHintCodingDefaults",
                "Leave on Coding defaults to reuse your Coding default model and keys. Pick OpenAI/Anthropic-compatible only for a custom endpoint and key.",
              )
            : useEnvoymeshAiFallback
              ? t(
                  "codingView.providerKindHintEnvoymeshAi",
                  "Leave on EnvoyMesh AI to reuse your EnvoyMesh model and keys. Pick OpenAI/Anthropic-compatible only for a custom endpoint and key.",
                )
              : isEhOrPi
                ? t(
                    "codingView.providerKindHint",
                    "Optional custom endpoint and API key for this project or task.",
                  )
                : t(
                    "codingView.providerKindHintAgentLogin",
                    "Leave on Agent’s own login to use this CLI’s auth. Pick OpenAI/Anthropic-compatible only for a custom endpoint and key — most CLIs do not need it.",
                  )}
        </p>
      </label>

      {showCompatFields ? (
        <>
          <label className="modal-field">
            <span>{t("codingView.providerEndpoint", "Endpoint URL")}</span>
            <input
              type="url"
              value={value.endpoint}
              disabled={locked}
              placeholder="https://api.openai.com/v1"
              data-testid={
                scope === "project"
                  ? "coding-project-settings-endpoint"
                  : "coding-new-task-endpoint"
              }
              onChange={(e) => patch({ endpoint: e.target.value })}
            />
          </label>
          <label className="modal-field">
            <span>{t("codingView.providerApiKey", "API key")}</span>
            <input
              type="password"
              autoComplete="off"
              value={value.apiKey}
              disabled={locked}
              placeholder="sk-…"
              data-testid={
                scope === "project"
                  ? "coding-project-settings-apikey"
                  : "coding-new-task-apikey"
              }
              onChange={(e) => patch({ apiKey: e.target.value })}
            />
          </label>
        </>
      ) : null}
    </>
  );
}
