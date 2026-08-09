import { useEffect, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useIsInProcessMobileNode, useModelProviderUiScope } from "../../hooks/useNodeService.js";
import { useToastOptional } from "../../hooks/useToast.js";
import { networkPresetById, type NetworkPresetId } from "../../lib/network-presets.js";
import { markFirstRunSetupComplete } from "../../lib/storage.js";
import { isTauriShell, restartTauriNodeProcess } from "../../lib/tauri-shell.js";
import { SUGGESTED_TOPICS, INTEREST_CATEGORIES } from "../../lib/display.js";
import { getCurrentPosition } from "../../lib/geolocation-adapter.js";
import type {
  ModelProviderConfig,
  DiscoveryLocation,
} from "@envoymesh/api";
import {
  encodeGeohash,
  NEARBY_GEOHASH_PRECISION,
  getModelProviderPreset,
  listModelProviderPresets,
} from "@envoymesh/api";

type WizardStep = "profile" | "interests" | "ai";
type AiChoice = "skip" | "configure";
type LocationChoice = "auto" | "skip";

const MIN_INTERESTS = 3;

/** First-run default — matches Settings → AI CN-first ordering. */
const DEFAULT_SETUP_PRESET_ID = "minimax-cn";

const DEFAULT_SETUP_NETWORK_PRESET: NetworkPresetId = "explore-public";

/** Best-effort ISO-3166 alpha-2 country code from navigator.language or IANA timezone. */
function detectCountryFromLocale(): string | null {
  // 1) navigator.language / languages often carry a region subtag (e.g. "en-US", "zh-CN").
  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ];
  for (const tag of candidates) {
    if (!tag) continue;
    const match = /[-_]([A-Za-z]{2})$/.exec(tag);
    if (match) return match[1].toUpperCase();
  }
  // 2) Fallback: a small IANA timezone → country table for common zones.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) {
    const tzCountry: Record<string, string> = {
      "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
      "America/Los_Angeles": "US", "America/Toronto": "CA", "America/Vancouver": "CA",
      "Europe/London": "GB", "Europe/Paris": "FR", "Europe/Berlin": "DE",
      "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL",
      "Asia/Tokyo": "JP", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK",
      "Asia/Singapore": "SG", "Asia/Seoul": "KR", "Australia/Sydney": "AU",
    };
    if (tzCountry[tz]) return tzCountry[tz];
  }
  return null;
}

/**
 * Validate first-run model fields against a Settings → AI preset.
 * Utility presets (mock/disabled) are not offered in the configure path.
 */
function validateModelSetup(
  presetId: string,
  endpoint: string,
  modelName: string,
  apiKey: string,
): "endpoint" | "modelName" | "apiKey" | null {
  const preset = getModelProviderPreset(presetId);
  if (!preset || preset.utility) return "endpoint";

  const endpointTrimmed = endpoint.trim() || preset.defaultEndpoint?.trim() || "";
  const modelNameTrimmed = modelName.trim();
  const apiKeyTrimmed = apiKey.trim();
  const showEndpoint = preset.endpointEditable !== false;

  if (preset.mode === "ollama") {
    return modelNameTrimmed ? null : "modelName";
  }
  // Envoy Local (llama-server) — loopback OpenAI-compatible, no API key.
  if (preset.id === "envoy-local") {
    if (showEndpoint && !endpointTrimmed) return "endpoint";
    return modelNameTrimmed ? null : "modelName";
  }
  if (preset.mode === "litellm") {
    if (!endpointTrimmed) return "endpoint";
    if (!modelNameTrimmed) return "modelName";
    return null;
  }
  // Cloud / custom OpenAI- or Anthropic-compatible presets.
  if (showEndpoint && !endpointTrimmed) return "endpoint";
  if (!modelNameTrimmed) return "modelName";
  if (!apiKeyTrimmed) return "apiKey";
  return null;
}

export function SetupView({ waitingForNode = false }: { waitingForNode?: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToastOptional();
  const { isConnected, nodeConfig, refreshNodeConfig, refreshHumanProfile } = useNodeState();
  const tauriShell = isTauriShell();
  const modelProviderUiScope = useModelProviderUiScope();
  const isMobileNode = useIsInProcessMobileNode();
  const includeLocal = modelProviderUiScope !== "cloud-only" && !isMobileNode;
  const wanPreset = useMemo(() => networkPresetById(DEFAULT_SETUP_NETWORK_PRESET), []);

  // Waiting-for-node state: elapsed timer + restart recovery.
  const [waitElapsed, setWaitElapsed] = useState(0);
  const [showRestartButton, setShowRestartButton] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  useEffect(() => {
    if (!waitingForNode || isConnected) return;
    let secs = 0;
    const timer = setInterval(() => {
      secs += 1;
      setWaitElapsed(secs);
      if (secs >= 30) setShowRestartButton(true);
    }, 1000);
    return () => clearInterval(timer);
  }, [waitingForNode, isConnected]);

  const handleRestartNode = async () => {
    setRestartBusy(true);
    setRestartError(null);
    try {
      const result = await restartTauriNodeProcess();
      if (!result.ok) {
        setRestartError(result.reason);
      }
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestartBusy(false);
    }
  };

  const [step, setStep] = useState<WizardStep>("profile");
  const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [aiChoice, setAiChoice] = useState<AiChoice>("skip");
  const defaultPreset = getModelProviderPreset(DEFAULT_SETUP_PRESET_ID);
  const [presetId, setPresetId] = useState(DEFAULT_SETUP_PRESET_ID);
  const [modelEndpoint, setModelEndpoint] = useState(defaultPreset?.defaultEndpoint ?? "");
  const [modelName, setModelName] = useState(defaultPreset?.models[0] ?? "");
  const [modelApiKey, setModelApiKey] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Interests + location (cold-start discovery).
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterestInput, setCustomInterestInput] = useState("");
  const [locationChoice, setLocationChoice] = useState<LocationChoice>("auto");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState<DiscoveryLocation | null>(null);

  const interestsRemaining = Math.max(0, MIN_INTERESTS - selectedInterests.length);
  const toggleInterest = (topic: string) => {
    const slug = topic.trim().toLowerCase();
    if (!slug) return;
    setSelectedInterests((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug],
    );
  };
  const addCustomInterest = () => {
    const v = customInterestInput.trim();
    if (!v) return;
    toggleInterest(v);
    setCustomInterestInput("");
  };
  // Suggested = any slug that appears in SUGGESTED_TOPICS. Custom = everything
  // else the user has typed. Splitting the two lets us render the "Your picks"
  // group only when there are custom entries — otherwise we'd render an empty
  // section just to say "no custom interests yet".
  const suggestedSet = useMemo(() => new Set(SUGGESTED_TOPICS), []);
  const customSelected = useMemo(
    () => selectedInterests.filter((i) => !suggestedSet.has(i)),
    [selectedInterests, suggestedSet],
  );

  const detectLocation = async (): Promise<void> => {
    setLocationError(null);
    setLocating(true);
    try {
      const pos = await getCurrentPosition({ timeoutMs: 12_000, maximumAgeMs: 600_000 });
      const geohash = encodeGeohash(pos.latitude, pos.longitude, NEARBY_GEOHASH_PRECISION);
      const countryCode = detectCountryFromLocale() ?? "US";
      setResolvedLocation({ countryCode, geohash });
    } catch {
      // Permission denied, timeout, or no geolocation API at all.
      // Soft fallback: derive a coarse country from locale if possible.
      const cc = detectCountryFromLocale();
      if (cc) {
        setResolvedLocation({ countryCode: cc });
      } else {
        setLocationError(t("setup.locationDenied"));
        setLocationChoice("skip");
      }
    } finally {
      setLocating(false);
    }
  };

  // Auto-detect location when the user first enters the interests step
  // (default choice is "auto"). They can opt out before finishing.
  useEffect(() => {
    if (step !== "interests" || locationChoice !== "auto" || locating) return;
    if (resolvedLocation || locationError) return;
    void detectLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, locationChoice]);

  useEffect(() => {
    const dir = nodeConfig?.profileDir?.trim();
    if (dir) setSetupProfileDir(dir);
  }, [nodeConfig?.profileDir]);

  // Same provider catalog as Settings → AI (cloud presets + optional local).
  // Skip utility presets (mock/disabled) — the "skip AI" card covers that.
  const presets = useMemo(
    () => listModelProviderPresets({ includeLocal }).filter((p) => !p.utility),
    [includeLocal],
  );
  const activePreset =
    getModelProviderPreset(presetId) ??
    getModelProviderPreset(DEFAULT_SETUP_PRESET_ID) ??
    presets[0];
  const showEndpoint =
    Boolean(activePreset) &&
    activePreset!.endpointEditable !== false &&
    activePreset!.mode !== "mock" &&
    activePreset!.mode !== "disabled";
  const showModelAndKey =
    Boolean(activePreset) &&
    activePreset!.mode !== "mock" &&
    activePreset!.mode !== "disabled";

  const applyPreset = (nextId: string) => {
    setPresetId(nextId);
    const info = getModelProviderPreset(nextId);
    if (!info) return;
    if (info.defaultEndpoint) setModelEndpoint(info.defaultEndpoint);
    else if (info.endpointEditable === false) setModelEndpoint("");
    if (info.models.length && (!modelName || !info.models.includes(modelName))) {
      setModelName(info.models[0] ?? "");
    }
  };

  const modelValidationError =
    aiChoice === "configure"
      ? validateModelSetup(presetId, modelEndpoint, modelName, modelApiKey)
      : null;

  const handleFinish = async () => {
    const profileDir = setupProfileDir.trim();
    if (!profileDir) return;
    if (!isConnected) return;
    if (!displayName.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setError(t("setup.profileError"));
      setStep("profile");
      return;
    }
    if (aiChoice === "configure") {
      const modelError = validateModelSetup(presetId, modelEndpoint, modelName, modelApiKey);
      if (modelError) {
        setError(t(`setup.modelError.${modelError}`));
        setStep("ai");
        return;
      }
    }
    setIsInitializing(true);
    setError(null);
    try {
      const preset = getModelProviderPreset(presetId) ?? activePreset;
      const modelProviders: ModelProviderConfig =
        aiChoice === "skip"
          ? { mode: "disabled" }
          : {
              presetId: preset!.id,
              mode: preset!.mode,
              endpoint: showEndpoint
                ? modelEndpoint.trim() || preset!.defaultEndpoint || undefined
                : undefined,
              modelName: showModelAndKey ? modelName.trim() || undefined : undefined,
              apiKey: showModelAndKey ? modelApiKey.trim() || undefined : undefined,
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

      // Persist profile before any node restart — reconnect reads human-profile.json from disk.
      const discoveryLocation =
        locationChoice === "auto" && resolvedLocation ? resolvedLocation : undefined;
      await nodeService.updateHumanProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: "",
        hobbies: selectedInterests,
        profileVisibility: "public",
        ...(discoveryLocation
          ? {
              discoveryLocation,
              discoveryLocationPrecision: "city" as const,
            }
          : {}),
      });

      const verifiedProfile = await nodeService.getHumanProfile();
      if (!verifiedProfile?.displayName?.trim() || !verifiedProfile?.username?.trim()) {
        throw new Error(t("setup.profilePersistError"));
      }

      await refreshNodeConfig();
      await refreshHumanProfile();
      markFirstRunSetupComplete(verifiedProfile.ownerId);

      // Start mesh on the running node (deferred until setup writes node-config.json).
      await nodeService.startNode();

      // Advertise the just-saved interests + location on the DHT so the
      // first-run auto-search (and peers) can find this new user quickly.
      // find:false = provide only; no DHT lookup churn at startup.
      await nodeService.runCapabilityDiscovery({ find: false }).catch(() => {
        /* non-fatal — periodic scheduler will retry */
      });

      // OpenClaw only picks up model provider env after a process restart.
      if (tauriShell && aiChoice === "configure") {
        const restart = await restartTauriNodeProcess();
        if (restart.ok) {
          await nodeService.waitForConnection(25_000);
          await nodeService.reconnect();
        }
      }

      await refreshNodeConfig();
      await refreshHumanProfile();

      const sponsorResult = await nodeService.runSetupSponsorFriend().catch((sponsorErr) => {
        console.warn("[SetupView] setup sponsor friend failed:", sponsorErr);
        return { ok: false as const, reason: String(sponsorErr) };
      });
      if (sponsorResult.ok && !("skipped" in sponsorResult && sponsorResult.skipped)) {
        // Surface the sponsor introduction so the user knows a contact is coming.
        showToast?.(t("setup.sponsorIntroduced"), "success");
      } else if (!sponsorResult.ok && !("skipped" in sponsorResult && sponsorResult.skipped)) {
        console.warn("[SetupView] setup sponsor friend:", sponsorResult.reason ?? "failed");
      }
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

        {waitingForNode && !isConnected ? (
          <div className="setup-connecting-banner" role="status" aria-live="polite">
            <div className="setup-connecting-banner__row">
              <span className="loading-spinner setup-connecting-banner__spinner" aria-hidden />
              <span>{t("setup.connectingBanner")}</span>
            </div>
            <p className="setup-connecting-banner__phase">
              {waitElapsed < 12
                ? t("setup.phaseStarting")
                : waitElapsed < 45
                  ? t("setup.phaseGateway")
                  : t("setup.phaseSlow")}
            </p>
            {showRestartButton ? (
              <div className="setup-connecting-banner__actions">
                <span className="setup-connecting-banner__hint">{t("setup.stuckHint")}</span>
                <button
                  type="button"
                  className="secondary btn-sm"
                  disabled={restartBusy}
                  onClick={handleRestartNode}
                >
                  {restartBusy ? t("setup.restarting") : t("setup.restartNode")}
                </button>
              </div>
            ) : (
              <p className="setup-connecting-banner__timer">
                {t("setup.waitElapsed", { seconds: waitElapsed })}
              </p>
            )}
            {restartError ? (
              <p className="setup-connecting-banner__error">{restartError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="setup-wizard-steps" aria-label={t("setup.progressLabel")}>
          {(["profile", "interests", "ai"] as WizardStep[]).map((s, i) => (
            <span key={s} className={`setup-wizard-step${step === s ? " active" : ""}`}>
              {i + 1}.{" "}
              {s === "profile"
                ? t("setup.stepYou")
                : s === "interests"
                  ? t("setup.stepInterests")
                  : t("setup.stepAi")}
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
                disabled={!displayName.trim() || !username.trim() || (waitingForNode && !isConnected)}
                onClick={() => setStep("interests")}
              >
                {waitingForNode && !isConnected ? t("setup.waitingForNode") : t("setup.continue")}
              </button>
            </>
          )}

          {step === "interests" && (
            <>
              <div className="form-group setup-interests-header">
                <label>{t("setup.interestsTitle")}</label>
                <p className="field-desc">{t("setup.interestsLede")}</p>
              </div>

              {/* Selected interests counter — compact pill that turns green
                  when the MIN_INTERESTS threshold is met. Sits above the
                  category grid so the user can see progress at a glance
                  without scrolling. */}
              <div className={`setup-interests-counter ${interestsRemaining === 0 ? "setup-interests-counter--complete" : ""}`}>
                {interestsRemaining === 0
                  ? <span>✓ {t("setup.interestsSelected", { count: selectedInterests.length })}</span>
                  : <span>⬡ {t("setup.interestsMinHint", { count: interestsRemaining })}</span>}
              </div>

              {/* Categorized suggested topics. Each topic is a chip with
                  a checkmark when active. The single "all selected"
                  duplicate list that used to live at the bottom of the
                  step is gone — the top chips already show selection
                  state, so re-listing them was just visual noise. */}
              <div className="form-group setup-interests-categories" role="group" aria-label={t("setup.stepInterests")}>
                {INTEREST_CATEGORIES.map((category) => {
                  // Look up the localized label by category id. Falls back
                  // to the English literal from display.ts when a locale
                  // hasn't translated the new key — same fallback path
                  // the rest of the setup strings use.
                  const labelKey =
                    `setup.interestsCategory${
                      category.id.charAt(0).toUpperCase() + category.id.slice(1)
                    }` as const;
                  return (
                  <div key={category.id} className="setup-interests-category">
                    <div className="setup-interests-category__head">
                      <span className="setup-interests-category__icon" aria-hidden>{category.icon}</span>
                      <span className="setup-interests-category__label">{t(labelKey, category.label)}</span>
                    </div>
                    <div className="topic-chips setup-interests-category__chips">
                      {category.topics.map((topic) => {
                        const active = selectedInterests.includes(topic);
                        return (
                          <button
                            key={topic}
                            type="button"
                            className={`topic-chip${active ? " topic-chip--active" : ""}`}
                            aria-pressed={active}
                            onClick={() => toggleInterest(topic)}
                          >
                            {active ? "✓ " : ""}{topic}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}

                {/* Custom picks — only rendered when the user has added
                    at least one. Putting them in a labeled section (not
                    the duplicate full-list we had before) keeps the
                    visual scope clean: this group grows only when the
                    user types. Click to remove. */}
                {customSelected.length > 0 ? (
                  <div className="setup-interests-category setup-interests-category--custom">
                    <div className="setup-interests-category__head">
                      <span className="setup-interests-category__icon" aria-hidden>✨</span>
                      <span className="setup-interests-category__label">{t("setup.interestsCategoryYours", "Your picks")}</span>
                    </div>
                    <div className="topic-chips setup-interests-category__chips">
                      {customSelected.map((topic) => (
                        <button
                          key={topic}
                          type="button"
                          className="topic-chip topic-chip--active topic-chip--custom"
                          aria-pressed={true}
                          onClick={() => toggleInterest(topic)}
                          title={t("setup.interestsRemove", "Click to remove")}
                        >
                          ✓ {topic} <span className="topic-chip__remove" aria-hidden>✕</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Custom interest input — full-width field with the Add
                  button stacked underneath (not crammed next to the
                  input, which made the field unusable on narrow viewports).
                  Enter inside the input also submits. */}
              <div className="form-group setup-add-interest">
                <label htmlFor="setup-custom-interest">{t("setup.interestsAddOwn")}</label>
                <input
                  id="setup-custom-interest"
                  type="text"
                  className="setup-add-interest__input"
                  value={customInterestInput}
                  onChange={(e) => setCustomInterestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomInterest();
                    }
                  }}
                  placeholder={t("setup.interestsAddOwnPlaceholder")}
                />
                <button
                  type="button"
                  className="primary setup-add-interest__btn"
                  disabled={!customInterestInput.trim()}
                  onClick={addCustomInterest}
                >
                  {t("setup.interestsAdd")}
                </button>
                <small className="setup-add-interest__hint">
                  {t("setup.interestsAddHint", "Type a topic and press Enter or click Add")}
                </small>
              </div>

              <div className="form-group setup-location">
                <label>{t("setup.locationTitle")}</label>
                <p className="field-desc">{t("setup.locationLede")}</p>
                <div className="network-preset-cards" role="radiogroup" aria-label={t("setup.locationTitle")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={locationChoice === "auto"}
                    className={`network-preset-card${locationChoice === "auto" ? " network-preset-card--active" : ""}`}
                    onClick={() => {
                      setLocationChoice("auto");
                      if (!resolvedLocation && !locating) void detectLocation();
                    }}
                  >
                    <strong>{t("setup.locationUseRecommended")}</strong>
                    <span>
                      {locating
                        ? t("setup.locationDetecting")
                        : resolvedLocation
                          ? t("setup.interestsSelected", { count: 1 })
                          : t("setup.locationUseRecommended")}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={locationChoice === "skip"}
                    className={`network-preset-card${locationChoice === "skip" ? " network-preset-card--active" : ""}`}
                    onClick={() => setLocationChoice("skip")}
                  >
                    <strong>{t("setup.locationSkip")}</strong>
                    <span>{t("setup.locationSkip")}</span>
                  </button>
                </div>
                {locationError ? (
                  <small className="setup-location-error">{locationError}</small>
                ) : null}
              </div>

              <div className="setup-wizard-nav">
                <button type="button" className="secondary" onClick={() => setStep("profile")}>
                  {t("setup.back")}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={interestsRemaining > 0 || (waitingForNode && !isConnected)}
                  onClick={() => setStep("ai")}
                >
                  {waitingForNode && !isConnected ? t("setup.waitingForNode") : t("setup.continue")}
                </button>
              </div>
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
              {aiChoice === "configure" && activePreset && (
                <>
                  <div className="form-group">
                    <label htmlFor="setup-model-preset">{t("settings.ai.model.providerLabel")}</label>
                    <select
                      id="setup-model-preset"
                      className="settings-select"
                      value={presetId}
                      onChange={(e) => applyPreset(e.target.value)}
                    >
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <small>{t("settings.ai.model.presetHint")}</small>
                  </div>
                  {showEndpoint ? (
                    <div className="form-group">
                      <label htmlFor="setup-model-endpoint">{t("settings.ai.model.endpointUrl")}</label>
                      <input
                        id="setup-model-endpoint"
                        type="text"
                        value={modelEndpoint}
                        onChange={(e) => setModelEndpoint(e.target.value)}
                        placeholder={
                          activePreset.endpointPlaceholder ||
                          t("settings.ai.model.endpointPlaceholderDefault")
                        }
                      />
                    </div>
                  ) : null}
                  {showModelAndKey ? (
                    <>
                      <div className="form-group">
                        <label htmlFor="setup-model-name">{t("settings.ai.model.modelName")}</label>
                        {activePreset.models.length > 0 ? (
                          <select
                            id="setup-model-name"
                            className="settings-select"
                            value={
                              activePreset.models.includes(modelName)
                                ? modelName
                                : "__custom__"
                            }
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                setModelName("");
                                return;
                              }
                              setModelName(e.target.value);
                            }}
                          >
                            {activePreset.models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                            <option value="__custom__">
                              {t("settings.ai.model.modelCustomId")}
                            </option>
                          </select>
                        ) : null}
                        {!activePreset.models.length ||
                        !activePreset.models.includes(modelName) ? (
                          <input
                            type="text"
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            placeholder={
                              activePreset.models[0] ||
                              t("settings.ai.model.modelNamePlaceholder")
                            }
                            style={{
                              marginTop: activePreset.models.length ? "6px" : undefined,
                            }}
                          />
                        ) : null}
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
                      </div>
                    </>
                  ) : null}
                </>
              )}
              <div className="setup-wizard-nav">
                <button type="button" className="secondary" onClick={() => setStep("interests")}>
                  {t("setup.back")}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    isInitializing ||
                    (waitingForNode && !isConnected) ||
                    (aiChoice === "configure" && modelValidationError !== null)
                  }
                  onClick={() => void handleFinish()}
                >
                  {isInitializing
                    ? t("setup.finishing")
                    : waitingForNode && !isConnected
                      ? t("setup.waitingForNode")
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
