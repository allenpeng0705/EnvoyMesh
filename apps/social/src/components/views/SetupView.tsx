import { useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { getNetworkPresets, networkPresetById, type NetworkPresetId } from "../../lib/network-presets.js";
import type { ModelProviderConfig } from "@envoymesh/api";

type WizardStep = "profile" | "network" | "ai";

export function SetupView() {
  const t = useT();
  const nodeService = useNodeService();
  const networkPresets = useMemo(() => getNetworkPresets(t), [t]);

  const [step, setStep] = useState<WizardStep>("profile");
  const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [networkPreset, setNetworkPreset] = useState<NetworkPresetId>("same-wifi");
  const [setupBootstrapPeers, setSetupBootstrapPeers] = useState("");
  const [aiChoice, setAiChoice] = useState<"skip" | "configure">("skip");
  const [modelEndpoint, setModelEndpoint] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelApiKey, setModelApiKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = networkPresetById(networkPreset);

  const handleFinish = async () => {
    if (!setupProfileDir.trim()) return;
    if (!displayName.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setError(t("setup.profileError"));
      setStep("profile");
      return;
    }
    setIsInitializing(true);
    setError(null);
    try {
      const bootstrapPeers = setupBootstrapPeers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await nodeService.initNode(setupProfileDir, {
        discoveryProfile: preset.discoveryProfile,
        bootstrapPeers,
        bootstrapPresets: [...preset.bootstrapPresets],
      });

      const modelProviders: ModelProviderConfig =
        aiChoice === "configure" && modelEndpoint.trim()
          ? {
              mode: "openai-compatible",
              endpoint: modelEndpoint.trim(),
              modelName: modelName.trim() || undefined,
              apiKey: modelApiKey.trim() || undefined,
            }
          : { mode: "disabled" };

      await nodeService.updateNodeConfig({
        modelProviders,
        chatAssistEnabled: aiChoice === "configure",
      });

      await nodeService.startNode();

      await nodeService.updateHumanProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: "",
        hobbies: [],
        profileVisibility: "private",
      });
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
          {(["profile", "network", "ai"] as WizardStep[]).map((s, i) => (
            <span key={s} className={`setup-wizard-step${step === s ? " active" : ""}`}>
              {i + 1}.{" "}
              {s === "profile" ? t("setup.stepYou") : s === "network" ? t("setup.stepNetwork") : t("setup.stepAi")}
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
              <button
                type="button"
                className="primary"
                disabled={!displayName.trim() || !username.trim()}
                onClick={() => setStep("network")}
              >
                {t("setup.continue")}
              </button>
            </>
          )}

          {step === "network" && (
            <>
              <div className="form-group">
                <label>{t("setup.networkTitle")}</label>
                <div className="network-preset-cards" role="radiogroup" aria-label={t("setup.networkPresetAria")}>
                  {networkPresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={networkPreset === p.id}
                      className={`network-preset-card${networkPreset === p.id ? " network-preset-card--active" : ""}`}
                      onClick={() => setNetworkPreset(p.id)}
                    >
                      <strong>{p.label}</strong>
                      <span>{p.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="secondary" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? t("setup.hideAdvanced") : t("setup.showAdvanced")}
              </button>
              {showAdvanced && (
                <>
                  <div className="form-group">
                    <label>{t("setup.profileDir")}</label>
                    <input
                      type="text"
                      value={setupProfileDir}
                      onChange={(e) => setSetupProfileDir(e.target.value)}
                      placeholder={t("setup.profileDirPlaceholder")}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("setup.bootstrapPeers")}</label>
                    <input
                      type="text"
                      value={setupBootstrapPeers}
                      onChange={(e) => setSetupBootstrapPeers(e.target.value)}
                      placeholder={t("setup.bootstrapPeersPlaceholder")}
                    />
                  </div>
                </>
              )}
              <div className="setup-wizard-nav">
                <button type="button" className="secondary" onClick={() => setStep("profile")}>
                  {t("setup.back")}
                </button>
                <button type="button" className="primary" onClick={() => setStep("ai")}>
                  {t("setup.continue")}
                </button>
              </div>
            </>
          )}

          {step === "ai" && (
            <>
              <div className="form-group">
                <label>{t("setup.aiTitle")}</label>
                <p className="field-desc">{t("setup.aiLede")}</p>
                <div className="settings-radio-group">
                  <label className={`settings-radio-option ${aiChoice === "skip" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="setup-ai"
                      checked={aiChoice === "skip"}
                      onChange={() => setAiChoice("skip")}
                    />
                    <div className="radio-content">
                      <strong>{t("setup.aiSkip")}</strong>
                      <span>{t("setup.aiSkipDesc")}</span>
                    </div>
                  </label>
                  <label className={`settings-radio-option ${aiChoice === "configure" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="setup-ai"
                      checked={aiChoice === "configure"}
                      onChange={() => setAiChoice("configure")}
                    />
                    <div className="radio-content">
                      <strong>{t("setup.aiConfigure")}</strong>
                      <span>{t("setup.aiConfigureDesc")}</span>
                    </div>
                  </label>
                </div>
              </div>
              {aiChoice === "configure" && (
                <>
                  <div className="form-group">
                    <label>{t("setup.endpoint")}</label>
                    <input
                      type="text"
                      value={modelEndpoint}
                      onChange={(e) => setModelEndpoint(e.target.value)}
                      placeholder={t("setup.endpointPlaceholder")}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("setup.modelName")}</label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder={t("setup.modelNamePlaceholder")}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("setup.apiKey")}</label>
                    <input
                      type="password"
                      value={modelApiKey}
                      onChange={(e) => setModelApiKey(e.target.value)}
                      placeholder={t("setup.apiKeyPlaceholder")}
                    />
                  </div>
                </>
              )}
              <div className="setup-wizard-nav">
                <button type="button" className="secondary" onClick={() => setStep("network")}>
                  {t("setup.back")}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={isInitializing}
                  onClick={() => void handleFinish()}
                >
                  {isInitializing ? t("setup.finishing") : t("setup.finish")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
