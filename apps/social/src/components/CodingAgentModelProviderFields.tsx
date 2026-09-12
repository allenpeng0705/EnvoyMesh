/**
 * Shared agent → model → inline OpenAI/Anthropic provider fields for Coding.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CODING_ALL_HARNESSES,
  CODING_TIER_B_HARNESSES,
  codingHarnessLabel,
  codingHarnessToExtAgentId,
  isCodingTierBHarness,
  type CodingHarnessId,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import {
  codingCompatibleModelSuggestions,
  type CodingProviderKind,
  type CodingWorkspacePrefill,
} from "../lib/coding-projects.js";

export type CodingAgentModelProviderValue = {
  harness: CodingHarnessId;
  model: string;
  providerKind: CodingProviderKind | "";
  endpoint: string;
  apiKey: string;
};

export type CodingAgentModelProviderFieldsProps = {
  value: CodingAgentModelProviderValue;
  onChange: (next: CodingAgentModelProviderValue) => void;
  busy?: boolean;
  disabled?: boolean;
  /** When true, render harness as radios (new workspace). Else select (project settings). */
  harnessAsRadios?: boolean;
  enabledHarnesses?: readonly CodingHarnessId[];
  harnessProbe?: Partial<
    Record<CodingHarnessId, "ready" | "install" | "unknown" | "checking">
  >;
  /** Scope hint for copy: coding defaults vs project vs this workspace. */
  scope?: "defaults" | "project" | "workspace";
  /**
   * What empty Envoy/Pi model/provider means in this form.
   * - coding-defaults: inherit Coding defaults (project / new workspace)
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

const HARNESS_HINT: Partial<Record<CodingHarnessId, string>> = {
  "envoy-harness": "Coding Agent (ACP)",
  pi: "Coding Agent",
  claudecode: "Claude Code CLI",
  codex: "OpenAI Codex CLI",
  opencode: "OpenCode CLI",
  cursor: "Cursor Agent CLI",
  codewhale: "CodeWhale CLI",
};

export function codingPrefillToValue(
  prefill: CodingWorkspacePrefill,
): CodingAgentModelProviderValue {
  return {
    harness: prefill.harness,
    model: prefill.model,
    providerKind: prefill.providerKind,
    endpoint: prefill.endpoint,
    apiKey: prefill.apiKey,
  };
}

export function CodingAgentModelProviderFields({
  value,
  onChange,
  busy = false,
  disabled = false,
  harnessAsRadios = false,
  enabledHarnesses = CODING_ALL_HARNESSES,
  harnessProbe = {},
  scope = "workspace",
  fallbackKind,
  fallbackModelHint = "",
  settingsAiModelHint = "",
}: CodingAgentModelProviderFieldsProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
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
    setCatalogLoading(true);
    void getCatalog({ agentId })
      .then((catalog) => {
        if (cancelled) return;
        const ids = (catalog.models ?? [])
          .map((m) => m.id?.trim())
          .filter((id): id is string => Boolean(id));
        setCatalogModels(ids);
      })
      .catch(() => {
        if (!cancelled) setCatalogModels([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omit nodeService object identity — only harness drives refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.harness]);

  const modelSuggestions = useMemo(() => {
    const fromCompat = codingCompatibleModelSuggestions(value.providerKind);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...catalogModels, ...fromCompat]) {
      const n = s.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }, [catalogModels, value.providerKind]);

  const showCompatFields =
    value.providerKind === "openai-compatible" ||
    value.providerKind === "anthropic-compatible";

  const patch = (partial: Partial<CodingAgentModelProviderValue>) => {
    onChange({ ...value, ...partial });
  };

  const renderHarnessRadio = (id: CodingHarnessId) => {
    const enabled = enabledHarnesses.includes(id);
    const badge = harnessProbe[id];
    const isTierB = (CODING_TIER_B_HARNESSES as readonly string[]).includes(id);
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
          onChange={() => patch({ harness: id })}
          data-testid={`coding-harness-${id}`}
        />
        <span>
          <strong>{codingHarnessLabel(id)}</strong>
          <span className="coding-harness-option__hint">
            {enabled
              ? t(`codingView.harnessHint.${id}`, HARNESS_HINT[id] ?? id)
              : t("codingView.harnessUnavailable", "Not available")}
          </span>
          {isTierB && enabled && badge ? (
            <span
              className={`coding-harness-probe coding-harness-probe--${badge}`}
              data-testid={`coding-harness-probe-${id}`}
            >
              {badge === "ready"
                ? t("codingView.harnessReady", "Ready")
                : badge === "install"
                  ? t("codingView.harnessNeedsInstall", "Install")
                  : badge === "checking"
                    ? t("codingView.harnessChecking", "Checking…")
                    : t("codingView.harnessProbeUnknown", "Check install")}
            </span>
          ) : null}
        </span>
      </label>
    );
  };

  return (
    <>
      {harnessAsRadios ? (
        <fieldset className="coding-harness-fieldset" disabled={locked}>
          <legend>{t("codingView.harnessLabel", "Agent")}</legend>
          {CODING_ALL_HARNESSES.map((id) => renderHarnessRadio(id))}
        </fieldset>
      ) : (
        <label className="modal-field">
          <span>
            {t(
              "codingView.projectDefaultHarness",
              "Default agent for new workspaces",
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
            onChange={(e) =>
              patch({ harness: e.target.value as CodingHarnessId })
            }
          >
            {CODING_ALL_HARNESSES.map((h) => (
              <option key={h} value={h}>
                {codingHarnessLabel(h)}
              </option>
            ))}
          </select>
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
            catalogLoading
              ? t("codingView.modelLoading", "Loading models…")
              : useCodingDefaultsFallback
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
                  : t("codingView.modelPlaceholder", "e.g. gpt-4o or claude-sonnet…")
          }
          data-testid={
            scope === "defaults"
              ? "coding-defaults-settings-model"
              : scope === "project"
                ? "coding-project-settings-model"
                : "coding-new-workspace-model"
          }
          onChange={(e) => patch({ model: e.target.value })}
        />
        <datalist id={datalistId}>
          {modelSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="coding-job-modal__hint">
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
              : scope === "defaults"
                ? t(
                    "codingView.defaultsModelHint",
                    "Applied when a project has no model override.",
                  )
                : scope === "project"
                  ? t(
                      "codingView.projectDefaultModelHint",
                      "Used when creating a new workspace. The workspace can override it.",
                    )
                  : t(
                      "codingView.modelLockHint",
                      "Locked for this workspace at start. Overrides the project default.",
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
                : "coding-new-workspace-provider"
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
              : t("codingView.providerAgentDefault", "Agent default")}
          </option>
          <option value="openai-compatible">
            {t("codingView.providerOpenAI", "OpenAI-compatible")}
          </option>
          <option value="anthropic-compatible">
            {t("codingView.providerAnthropic", "Anthropic-compatible")}
          </option>
        </select>
        <p className="coding-job-modal__hint">
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
              : t(
                  "codingView.providerKindHint",
                  "Optional custom endpoint and API key for this project or workspace.",
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
                  : "coding-new-workspace-endpoint"
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
                  : "coding-new-workspace-apikey"
              }
              onChange={(e) => patch({ apiKey: e.target.value })}
            />
          </label>
        </>
      ) : null}
    </>
  );
}
