/**
 * Banner when EnvoyAI has no usable model provider.
 * Cloud / Ollama / Envoy Local are equal choices — local download is never required.
 */
import { hasUsableModelProvider } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";

export function ConfigureAiBanner({
  onOpenSettingsAi,
}: {
  onOpenSettingsAi?: () => void;
}) {
  const t = useT();
  const { nodeConfig } = useNodeState();
  if (hasUsableModelProvider(nodeConfig?.modelProviders)) {
    return null;
  }
  if (!onOpenSettingsAi) {
    return null;
  }

  return (
    <div className="configure-ai-banner" role="status" aria-live="polite" data-testid="configure-ai-banner">
      <div className="configure-ai-banner-body">
        <div className="configure-ai-banner-text">
          <div className="configure-ai-banner-title">{t("aiChat.configureAiTitle")}</div>
          <div className="configure-ai-banner-desc">{t("aiChat.configureAiDesc")}</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={onOpenSettingsAi}>
          {t("aiChat.configureAiButton")}
        </button>
      </div>
    </div>
  );
}
