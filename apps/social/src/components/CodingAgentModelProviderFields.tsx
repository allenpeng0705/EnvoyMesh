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
} from "@envoymesh/api";
import {
  harnessProbeLabelKey,
} from "../lib/coding-harness-probe.js";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import {
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
};

export function CodingAgentModelProviderFields({
  value,
  onChange,
  busy = false,
  disabled = false,
  harnessAsRadios = false,
  enabledHarnesses = CODING_ALL_HARNESSES,
  harnessProbe = {},
  scope = "task",
  fallbackKind,
  fallbackModelHint = "",
  settingsAiModelHint = "",
}: CodingAgentModelProviderFieldsProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const locked = busy || disabled;
  const datalistId = `coding-model-suggestions-${scope}`;
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
      return;
    }
    const agentId = codingHarnessToExtAgentId(harness);
    const getCatalog = nodeService.getExtAgentCommandCatalog;
    if (!agentId || !getCatalog) {
      setCatalogModels([]);
      return;
    }
    void getCatalog({ agentId })
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
      })
      .catch(() => {
        if (!cancelled) setCatalogModels([]);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omit nodeService object identity — only harness drives refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.harness]);

  const modelSuggestions = useMemo(
    () =>
      codingModelSuggestionsForAgent({
        harness: value.harness,
        providerKind: value.providerKind,
        catalogModels,
      }),
    [catalogModels, value.harness, value.providerKind],
  );

  const defaultAgentModelHint = useMemo(() => {
    const list = codingModelSuggestionsForAgent({
      harness: value.harness,
      providerKind: "",
      catalogModels,
    });
    return list[0] ?? "";
  }, [catalogModels, value.harness]);

  const showCompatFields =
    value.providerKind === "openai-compatible" ||
    value.providerKind === "anthropic-compatible";

  const patch = (partial: Partial<CodingAgentModelProviderValue>) => {
    onChange({ ...value, ...partial });
  };

  const moreHarnesses = CODING_ALL_HARNESSES.filter(
    (id) => !isCodingFeaturedHarness(id) && enabledHarnesses.includes(id),
  );
  const featuredSet = new Set<string>(CODING_FEATURED_HARNESSES);

  const probeSuffix = (id: CodingHarnessId): string => {
    const key = harnessProbeLabelKey(harnessProbe[id]);
    if (key === "ready")
      return ` · ${t("codingView.harnessReady", "Ready")}`;
    if (key === "not-ready")
      return ` · ${t("codingView.harnessNotReady", "Not ready")}`;
    if (key === "checking")
      return ` · ${t("codingView.harnessChecking", "Checking…")}`;
    return "";
  };

  const renderHarnessRadio = (id: CodingHarnessId) => {
    const enabled = enabledHarnesses.includes(id);
    const badge = harnessProbe[id];
    const labelKey = harnessProbeLabelKey(badge);
    return (
      <label
        key={id}
        className={`coding-harness-option${!enabled ? " coding-harness-option--disabled" : ""}`}
      >
        <input
          type="radio"
          name="coding-harness"
          value={id}
          checked={value.harness === id}
          disabled={!enabled || locked}
          onChange={() =>
            patch({
              harness: id,
              // Reset custom provider when switching agents so suggestions
              // follow the new agent's defaults unless the user opts in again.
              ...(value.harness !== id
                ? { providerKind: "", endpoint: "", apiKey: "" }
                : {}),
            })
          }
          data-testid={`coding-harness-${id}`}
        />
        <span>
          <strong>{codingHarnessLabel(id)}</strong>
          <span className="coding-harness-option__hint">
            {enabled
              ? t(`codingView.harnessHint.${id}`, codingHarnessHint(id))
              : t("codingView.harnessUnavailable", "Not available")}
          </span>
          {enabled && labelKey ? (
            <span
              className={`coding-harness-probe coding-harness-probe--${labelKey === "not-ready" ? "install" : labelKey}`}
              data-testid={`coding-harness-probe-${id}`}
            >
              {labelKey === "ready"
                ? t("codingView.harnessReady", "Ready")
                : labelKey === "checking"
                  ? t("codingView.harnessChecking", "Checking…")
                  : t("codingView.harnessNotReady", "Not ready")}
            </span>
          ) : null}
        </span>
      </label>
    );
  };

  const renderGroupedOptions = () => (
    <>
      <optgroup label={t("codingView.harnessGroupBuiltin", "Built-in")}>
        {CODING_TIER_A_HARNESSES.map((h) => (
          <option key={h} value={h}>
            {codingHarnessLabel(h)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("codingView.harnessGroupFeatured", "Featured CLIs")}>
        {CODING_FEATURED_HARNESSES.filter((h) => isCodingTierBHarness(h)).map(
          (h) => (
            <option key={h} value={h}>
              {codingHarnessLabel(h)}
              {probeSuffix(h)}
            </option>
          ),
        )}
      </optgroup>
      <optgroup label={t("codingView.harnessGroupMore", "More agents")}>
        {moreHarnesses.map((h) => (
          <option key={h} value={h}>
            {codingHarnessLabel(h)}
            {probeSuffix(h)}
          </option>
        ))}
      </optgroup>
    </>
  );

  return (
    <>
      {harnessAsRadios ? (
        <fieldset className="coding-harness-fieldset" disabled={locked}>
          <legend>{t("codingView.harnessLabel", "Agent")}</legend>
          {CODING_FEATURED_HARNESSES.map((id) => renderHarnessRadio(id))}
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
                    ? { providerKind: "", endpoint: "", apiKey: "" }
                    : {}),
                });
              }}
            >
              <option value="">
                {t("codingView.harnessMorePlaceholder", "Choose another…")}
              </option>
              {moreHarnesses.map((h) => (
                <option key={h} value={h}>
                  {codingHarnessLabel(h)}
                  {probeSuffix(h)}
                </option>
              ))}
            </select>
          </label>
          <p className="coding-harness-catalog-hint">
            {t(
              "codingView.harnessCatalogHint",
              "Envoy and Pi are built in. Other agents are CLIs on this computer — pick one now; if it isn’t installed yet, we’ll show install steps when you start a task.",
            )}
          </p>
        </fieldset>
      ) : (
        <label className="modal-field">
          <span>
            {t(
              "codingView.projectDefaultHarness",
              "Default agent for new tasks",
            )}
          </span>
          <select
            value={value.harness}
            disabled={locked}
            data-testid={
              scope === "defaults"
                ? "coding-defaults-settings-harness"
                : "coding-project-settings-harness"
            }
            onChange={(e) => {
              const next = e.target.value as CodingHarnessId;
              patch({
                harness: next,
                ...(value.harness !== next
                  ? { providerKind: "", endpoint: "", apiKey: "" }
                  : {}),
              });
            }}
          >
            {renderGroupedOptions()}
          </select>
          <span className="coding-harness-catalog-hint">
            {t(
              "codingView.harnessCatalogHint",
              "Envoy and Pi are built in. Other agents are CLIs on this computer — pick one now; if it isn’t installed yet, we’ll show install steps when you start a task.",
            )}
          </span>
        </label>
      )}

      <label className="modal-field">
        <span>{t("codingView.modelLabel", "Model")}</span>
        <input
          type="text"
          value={value.model}
          disabled={locked}
          list={datalistId}
          placeholder={
            useCodingDefaultsFallback
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
                  ? t(
                      "codingView.modelPlaceholder",
                      "e.g. gpt-4o or claude-sonnet…",
                    )
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
                        )
          }
          data-testid={
            scope === "defaults"
              ? "coding-defaults-settings-model"
              : scope === "project"
                ? "coding-project-settings-model"
                : "coding-new-task-model"
          }
          onChange={(e) => patch({ model: e.target.value })}
        />
        <datalist id={datalistId}>
          {modelSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
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
