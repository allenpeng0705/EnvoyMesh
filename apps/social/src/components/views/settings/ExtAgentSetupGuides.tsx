/**
 * Operator-facing install & run instructions for Ext Agent backends.
 */

import React, { useMemo } from "react";
import { useI18n, useT } from "../../../context/I18nContext.js";
import {
  localizedExtAgentGuides,
  type LocalizedExtAgentGuide,
  type LocalizedGuideStep,
} from "../../../i18n/messages/ext-agent-guides/index.js";

interface Props {
  /** Registry entry ids from bridge-config (empty = show all common guides). */
  registryAgentIds: string[];
  profileDir?: string;
}

function renderStep(step: LocalizedGuideStep, key: string) {
  if (typeof step === "string") return <li key={key}>{step}</li>;
  return (
    <li key={key}>
      <code>{step.code}</code>
    </li>
  );
}

function GuidePanel({ guide }: { guide: LocalizedExtAgentGuide }) {
  const t = useT();
  return (
    <details className="ext-agent-setup-guide">
      <summary>
        <strong>{guide.name}</strong>
        <span className="ext-agent-setup-port">
          {t("settings.ai.aiEngine.setupGuides.portLabel")} {guide.defaultPort}
        </span>
        <span className="ext-agent-setup-summary">{guide.summary}</span>
      </summary>
      <div className="ext-agent-setup-body">
        <p className="settings-hint"><em>{guide.bestFor}</em></p>

        <h5>{t("settings.ai.aiEngine.setupGuides.installTitle")}</h5>
        <ol>
          {guide.installSteps.map((step, i) => (
            <li key={`install-${guide.id}-${i}`}>{step}</li>
          ))}
        </ol>

        <h5>{t("settings.ai.aiEngine.setupGuides.runTitle")}</h5>
        <ol>
          {guide.runSteps.map((step, i) => renderStep(step, `run-${guide.id}-${i}`))}
        </ol>

        <h5>{t("settings.ai.aiEngine.setupGuides.verifyTitle")}</h5>
        <ul>
          {guide.verifySteps.map((step, i) => (
            <li key={`verify-${guide.id}-${i}`}>{step}</li>
          ))}
        </ul>

        {guide.troubleshooting.length > 0 && (
          <>
            <h5>{t("settings.ai.aiEngine.setupGuides.troubleshootTitle")}</h5>
            <ul>
              {guide.troubleshooting.map((step, i) => (
                <li key={`ts-${guide.id}-${i}`}>{step}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

export function ExtAgentSetupGuides({ registryAgentIds, profileDir }: Props) {
  const { locale } = useI18n();
  const t = useT();
  const guides = useMemo(
    () => localizedExtAgentGuides(locale, registryAgentIds),
    [locale, registryAgentIds],
  );

  const registerPath = profileDir
    ? `${profileDir.replace(/\/$/, "")}/bridge-config.json`
    : null;

  return (
    <div className="ext-agent-setup-guides">
      <h4 className="ext-agent-setup-heading">{t("settings.ai.aiEngine.setupGuides.title")}</h4>
      <p className="settings-hint">{t("settings.ai.aiEngine.setupGuides.intro")}</p>

      <div className="ext-agent-setup-flow">
        <h5>{t("settings.ai.aiEngine.setupGuides.flowTitle")}</h5>
        <ol className="ext-agent-setup-flow-steps">
          <li>{t("settings.ai.aiEngine.setupGuides.flowStep1")}</li>
          <li>{t("settings.ai.aiEngine.setupGuides.flowStep2")}</li>
          <li>{t("settings.ai.aiEngine.setupGuides.flowStep3")}</li>
        </ol>
      </div>

      <div className="ext-agent-setup-register">
        <h5>{t("settings.ai.aiEngine.setupGuides.registerTitle")}</h5>
        <p className="settings-hint">
          {registerPath
            ? t("settings.ai.aiEngine.setupGuides.registerWithPath", { path: registerPath })
            : t("settings.ai.aiEngine.setupGuides.registerNoPath")}
        </p>
        <p className="settings-hint">{t("settings.ai.aiEngine.setupGuides.registerExample")}</p>
      </div>

      {guides.map((guide) => (
        <GuidePanel key={guide.id} guide={guide} />
      ))}
    </div>
  );
}
