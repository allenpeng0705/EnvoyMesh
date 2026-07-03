import { useEffect, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { networkPresetById, type NetworkPresetId } from "../../lib/network-presets.js";
import { isTauriShell, restartTauriNodeProcess } from "../../lib/tauri-shell.js";
import type { ModelProviderConfig, ModelProviderMode } from "@envoymesh/api";

type WizardStep = "profile" | "ai";
type AiChoice = "skip" | "configure";

const DEFAULT_SETUP_NETWORK_PRESET: NetworkPresetId = "explore-public";

function validateModelSetup(
  mode: ModelProviderMode,
  endpoint: string,
  modelName: string,
  apiKey: string,
): "endpoint" | "modelName" | "apiKey" | null {
  const endpointTrimmed = endpoint.trim();
  const modelNameTrimmed = modelName.trim();
  const apiKeyTrimmed = apiKey.trim();

  if (mode === "ollama") {
    return modelNameTrimmed ? null : "modelName";
  }
  if (mode === "litellm") {
    if (!endpointTrimmed) return "endpoint";
    if (!modelNameTrimmed) return "modelName";
    return null;
  }
  if (mode === "openai-compatible" || mode === "anthropic-compatible") {
    if (!endpointTrimmed) return "endpoint";
    if (!modelNameTrimmed) return "modelName";
    if (!apiKeyTrimmed) return "apiKey";
    return null;
  }
  return "endpoint";
}

export function SetupView() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig, refreshHumanProfile } = useNodeState();
  const tauriShell = isTauriShell();
  const wanPreset = useMemo(() => networkPresetById(DEFAULT_SETUP_NETWORK_PRESET), []);

  const [step, setStep] = useState<WizardStep>("profile");
  const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [aiChoice, setAiChoice] = useState<AiChoice>("skip");
  const [modelMode, setModelMode] = useState<ModelProviderMode>("openai-compatible");
  const [modelEndpoint, setModelEndpoint] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelApiKey, setModelApiKey] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dir = nodeConfig?.profileDir?.trim();
    if (dir) setSetupProfileDir(dir);
  }, [nodeConfig?.profileDir]);

  const modelProviderHints = useMemo(() => {
    switch (modelMode) {
      case "ollama":
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderOllama"),
          hint: t("settings.ai.model.endpointHintOllama"),
          apiKeyHint: t("settings.ai.model.apiKeyHintOllama"),
        };
      case "litellm":
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderLitellm"),
          hint: t("settings.ai.model.endpointHintLitellm"),
          apiKeyHint: t("settings.ai.model.apiKeyHintLitellm"),
        };
      case "anthropic-compatible":
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderAnthropic"),
          hint: t("settings.ai.model.endpointHintAnthropic"),
          apiKeyHint: t("settings.ai.model.apiKeyHintAnthropic"),
        };
      default:
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderOpenAi"),
          hint: t("settings.ai.model.endpointHintOpenAi"),
          apiKeyHint: t("settings.ai.model.apiKeyHintOpenAi"),
        };
    }
  }, [modelMode, t]);

  const modelValidationError =
    aiChoice === "configure"
      ? validateModelSetup(modelMode, modelEndpoint, modelName, modelApiKey)
      : null;

  const handleFinish = async () => {
    const profileDir = setupProfileDir.trim();
    if (!profileDir) return;
    if (!displayName.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setError(t("setup.profileError"));
      setStep("profile");
      return;
    }
    if (aiChoice === "configure") {
      const modelError = validateModelSetup(modelMode, modelEndpoint, modelName, modelApiKey);
      if (modelError) {
        setError(t(`setup.modelError.${modelError}`));
        setStep("ai");
        return;
      }
    }
    setIsInitializing(true);
    setError(null);
    try {
      const modelProviders: ModelProviderConfig =
        aiChoice === "skip"
          ? { mode: "disabled" }
          : {
              mode: modelMode,
              endpoint: modelEndpoint.trim() || undefined,
              modelName: modelName.trim() || undefined,
              apiKey: modelApiKey.trim() || undefined,
            };

      // Write initial node-config.json (skip initNode — profile keys already exist from node startup).
      await nodeService.updateNodeConfig({
        discoveryProfile: wanPreset.discoveryProfile,
        bootstrapPeers: [],
        bootstrapPresets: [...wanPreset.bootstrapPresets],
        relayEnabled: true,
        modelProviders,
        chatAssistEnabled: aiChoice === "configure",
        openclawEnabled: true,
      });

      if (tauriShell) {
        const restart = await restartTauriNodeProcess();
        if (restart.ok) {
          await nodeService.waitForConnection(25_000);
          await nodeService.reconnect();
        }
      } else {
        await nodeService.startNode();
      }

      await nodeService.updateHumanProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: "",
        hobbies: [],
        profileVisibility: "private",
      });

      await refreshNodeConfig();
      await refreshHumanProfile();
    } catch (err) {
      console.error("Failed to initialize node:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <div className="app">
      <div className="setup-view setup-wizard">
        <h1>{t("setup.welcome")}</h1>
        <p className="muted">{t("setup.lede")}</p>

        <div className="setup-wizard-steps" aria-label={t("setup.progressLabel")}>
          {(["profile", "ai"] as WizardStep[]).map((s, i) => (
            <span key={s} className={`setup-wizard-step${step === s ? " active" : ""}`}>
              {i + 1}. {s === "profile" ? t("setup.stepYou") : t("setup.stepAi")}
            </span>
          ))}
        </div>

        {error ? (
          <p className="library-view-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="setup-form">
          {step === "profile" && (
            <>
              <div className="form-group">
                <label>{t("setup.displayName")}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("setup.displayNamePlaceholder")}
                />
              </div>
              <div className="form-group">
                <label>{t("setup.username")}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("setup.usernamePlaceholder")}
                />
                <small>{t("setup.usernameHint")}</small>
              </div>
              {!tauriShell ? (
                <div className="form-group">
                  <label>{t("setup.profileDir")}</label>
                  <input
                    type="text"
                    value={setupProfileDir}
                    onChange={(e) => setSetupProfileDir(e.target.value)}
                    placeholder={t("setup.profileDirPlaceholder")}
                  />
                  <small>{t("setup.profileDirHint")}</small>
                </div>
              ) : null}
              <button
                type="button"
                className="primary"
                disabled={!displayName.trim() || !username.trim()}
                onClick={() => setStep("ai")}
              >
                {t("setup.continue")}
              </button>
            </>
          )}

          {step === "ai" && (
            <>
              <div className="form-group">
                <label>{t("setup.aiTitle")}</label>
                <p className="field-desc">{t("setup.aiLede")}</p>
              </div>
              <div className="form-group">
                <div className="network-preset-cards" role="radiogroup" aria-label={t("setup.aiChoiceAria")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={aiChoice === "skip"}
                    className={`network-preset-card${aiChoice === "skip" ? " network-preset-card--active" : ""}`}
                    onClick={() => setAiChoice("skip")}
                  >
                    <strong>{t("setup.aiSkip")}</strong>
                    <span>{t("setup.aiSkipDesc")}</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={aiChoice === "configure"}
                    className={`network-preset-card${aiChoice === "configure" ? " network-preset-card--active" : ""}`}
                    onClick={() => setAiChoice("configure")}
                  >
                    <strong>{t("setup.aiConfigure")}</strong>
                    <span>{t("setup.aiConfigureDesc")}</span>
                  </button>
                </div>
              </div>
              {aiChoice === "configure" && (
                <>
                  <div className="form-group">
                    <label htmlFor="setup-model-mode">{t("settings.ai.model.providerLabel")}</label>
                    <select
                      id="setup-model-mode"
                      className="settings-select"
                      value={modelMode}
                      onChange={(e) => setModelMode(e.target.value as ModelProviderMode)}
                    >
                      <option value="openai-compatible">{t("settings.ai.model.modeOpenAiCompatible")}</option>
                      <option value="anthropic-compatible">{t("settings.ai.model.modeAnthropicCompatible")}</option>
                      <option value="ollama">{t("settings.ai.model.modeOllama")}</option>
                      <option value="litellm">{t("settings.ai.model.modeLitellm")}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="setup-model-endpoint">{t("settings.ai.model.endpointUrl")}</label>
                    <input
                      id="setup-model-endpoint"
                      type="text"
                      value={modelEndpoint}
                      onChange={(e) => setModelEndpoint(e.target.value)}
                      placeholder={
                        modelProviderHints.endpointPlaceholder || t("settings.ai.model.endpointPlaceholderDefault")
                      }
                    />
                    {modelProviderHints.hint ? <small>{modelProviderHints.hint}</small> : null}
                  </div>
                  <div className="form-group">
                    <label htmlFor="setup-model-name">{t("settings.ai.model.modelName")}</label>
                    <input
                      id="setup-model-name"
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder={t("settings.ai.model.modelNamePlaceholder")}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="setup-model-api-key">{t("settings.ai.model.apiKey")}</label>
                    <input
                      id="setup-model-api-key"
                      type="password"
                      value={modelApiKey}
                      onChange={(e) => setModelApiKey(e.target.value)}
                      placeholder={t("settings.ai.model.apiKeyPlaceholder")}
                    />
                    {modelProviderHints.apiKeyHint ? <small>{modelProviderHints.apiKeyHint}</small> : null}
                  </div>
                </>
              )}
              <div className="setup-wizard-nav">
                <button type="button" className="secondary" onClick={() => setStep("profile")}>
                  {t("setup.back")}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={isInitializing || (aiChoice === "configure" && modelValidationError !== null)}
                  onClick={() => void handleFinish()}
                >
                  {isInitializing
                    ? t("setup.finishing")
                    : aiChoice === "skip"
                      ? t("setup.launch")
                      : t("setup.finish")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
