/**
 * Knowledge hub — top-level Knowledge view.
 * Browse + Ask (combined), Plugins, Setup.
 * Browse is gated until Envoy Local embed is ready (when that mode is selected).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_AI_KNOWLEDGE_BASE, type AiSettings } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useEnvoyLocalEmbedReadiness } from "../../hooks/useEnvoyLocalEmbedReadiness.js";
import { useToast } from "../../hooks/useToast.js";
import {
  OPEN_CONTENT_KNOWLEDGE_EVENT,
  normalizeKnowledgeHubPanel,
  type KnowledgeHubPanel,
  type OpenContentKnowledgeDetail,
} from "../../lib/content-knowledge-nav.js";
import { openEnvoyAi } from "../../lib/open-envoy-ai-nav.js";
import { KnowledgeEmbedGate } from "./KnowledgeEmbedGate.js";
import { LibraryView } from "./LibraryView.js";
import { KnowledgePluginsPanel } from "./KnowledgePluginsPanel.js";
import { KnowledgeBaseSettings } from "./SettingsAITab.js";

export type { KnowledgeHubPanel };

export interface KnowledgeViewProps {
  /** Initial sub-panel (Browse / Plugins / Setup). Legacy `"ask"` maps to Browse. */
  initialPanel?: KnowledgeHubPanel | "ask";
}

export function KnowledgeView({ initialPanel = "browse" }: KnowledgeViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const { showToast } = useToast();
  const [panel, setPanel] = useState<KnowledgeHubPanel>(() =>
    normalizeKnowledgeHubPanel(initialPanel),
  );

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenContentKnowledgeDetail>).detail;
      if (detail?.panel) setPanel(normalizeKnowledgeHubPanel(detail.panel));
    };
    window.addEventListener(OPEN_CONTENT_KNOWLEDGE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONTENT_KNOWLEDGE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (initialPanel) setPanel(normalizeKnowledgeHubPanel(initialPanel));
  }, [initialPanel]);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const obsidianAutoTried = useRef(false);

  const knowledgeBase = {
    ...DEFAULT_AI_KNOWLEDGE_BASE,
    ...(nodeConfig?.aiSettings?.knowledgeBase ?? {}),
  };

  const embed = useEnvoyLocalEmbedReadiness(knowledgeBase.embedding);

  // Best-effort: enable Obsidian enricher once when Knowledge opens (app install optional).
  useEffect(() => {
    if (obsidianAutoTried.current) return;
    obsidianAutoTried.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const list = await nodeService.listKbPlugins();
        if (cancelled) return;
        const obsidian = list.find((p) => p.pluginId === "obsidian");
        if (!obsidian || obsidian.status === "active") return;
        const result = await nodeService.activateKbPlugin({ pluginId: "obsidian" });
        if (cancelled) return;
        if (!result.ok) {
          showToast(
            t("knowledge.plugins.obsidianAutoFail") +
              (result.reason ? `: ${result.reason}` : ""),
            "error",
          );
        }
      } catch {
        // Manual activate remains on Plugins tab.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService, showToast, t]);

  const updateAiSettings = async (partial: Partial<AiSettings>) => {
    const current = nodeConfig?.aiSettings ?? {};
    await nodeService.updateNodeConfig({
      aiSettings: { ...current, ...partial } as AiSettings,
    });
    await refreshNodeConfig();
  };

  const runAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    if (embed.blocked) {
      showToast(t("knowledge.embedGate.blockedToast"), "error");
      return;
    }
    setAskBusy(true);
    setAnswer(null);
    try {
      const text = await nodeService.knowledgeQuery(q);
      setAnswer(text?.trim() ? text : t("knowledge.askEmptyAnswer"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg, "error");
      setAnswer(null);
    } finally {
      setAskBusy(false);
    }
  }, [embed.blocked, nodeService, question, showToast, t]);

  const panels: { id: KnowledgeHubPanel; label: string }[] = [
    { id: "browse", label: t("knowledge.panelBrowse") },
    { id: "plugins", label: t("knowledge.panelPlugins") },
    { id: "setup", label: t("knowledge.panelSetup") },
  ];

  return (
    <div className="knowledge-view" data-testid="knowledge-view">
      <header className="knowledge-view__header">
        <h2>{t("knowledge.title")}</h2>
        <p className="knowledge-view__lede">{t("knowledge.lede")}</p>
      </header>

      {embed.blocked ? (
        <p className="knowledge-view__embed-strip" data-testid="knowledge-embed-strip" role="status">
          {embed.kind === "downloading"
            ? t("knowledge.embedGate.stripDownloading")
            : embed.kind === "error"
              ? t("knowledge.embedGate.stripError")
              : t("knowledge.embedGate.stripNeeded")}
          {" · "}
          <button
            type="button"
            className="knowledge-view__embed-strip-link"
            onClick={() => setPanel("setup")}
          >
            {t("knowledge.embedGate.openSetup")}
          </button>
        </p>
      ) : null}

      <div
        className="knowledge-view__panels"
        role="tablist"
        aria-label={t("knowledge.panelsAria")}
      >
        {panels.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={panel === p.id}
            className={`knowledge-view__panel-tab${
              panel === p.id ? " knowledge-view__panel-tab--active" : ""
            }`}
            data-testid={`knowledge-panel-${p.id}`}
            onClick={() => setPanel(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="knowledge-view__body" role="tabpanel">
        {panel === "browse" ? (
          embed.blocked ? (
            <KnowledgeEmbedGate
              kind={embed.kind}
              status={embed.status}
              loadError={embed.loadError}
              inFlight={embed.inFlight}
              onDownload={() => {
                void embed
                  .startDownload()
                  .then(() => {
                  showToast(t("knowledge.embedGate.downloadStartedToast"), "success");
                });
              }}
              onOpenSetup={() => setPanel("setup")}
            />
          ) : (
            <div className="knowledge-browse" data-testid="knowledge-browse">
              <section className="knowledge-browse__ask" aria-labelledby="knowledge-ask-heading">
                <div className="knowledge-browse__section-head">
                  <h3 id="knowledge-ask-heading">{t("knowledge.askHeading")}</h3>
                  <p>{t("knowledge.askHint")}</p>
                </div>
                <div className="knowledge-ask knowledge-ask--embedded" data-testid="knowledge-ask">
                  <label className="visually-hidden" htmlFor="knowledge-ask-input">
                    {t("knowledge.askLabel")}
                  </label>
                  <div className="knowledge-ask__row">
                    <input
                      id="knowledge-ask-input"
                      className="knowledge-ask__input knowledge-ask__input--inline"
                      type="search"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void runAsk();
                        }
                      }}
                      placeholder={t("knowledge.askPlaceholder")}
                      disabled={askBusy}
                    />
                    <button
                      type="button"
                      className="primary"
                      disabled={askBusy || !question.trim()}
                      onClick={() => void runAsk()}
                    >
                      {askBusy ? t("knowledge.askBusy") : t("knowledge.askSubmit")}
                    </button>
                  </div>
                  <div className="knowledge-ask__meta">
                    <button
                      type="button"
                      className="knowledge-ask__link"
                      data-testid="knowledge-ask-envoy-ai"
                      onClick={() =>
                        openEnvoyAi({
                          draftHint: question.trim() || undefined,
                        })
                      }
                    >
                      {t("knowledge.askContinueEnvoyAi")}
                    </button>
                  </div>
                  {answer != null ? (
                    <div className="knowledge-ask__answer" role="status">
                      <h4>{t("knowledge.askAnswerHeading")}</h4>
                      <pre className="knowledge-ask__answer-body">{answer}</pre>
                    </div>
                  ) : null}
                </div>
              </section>

              <section
                className="knowledge-browse__library"
                aria-labelledby="knowledge-library-heading"
              >
                <div className="knowledge-browse__section-head">
                  <h3 id="knowledge-library-heading">{t("knowledge.libraryHeading")}</h3>
                  <p>{t("knowledge.libraryCaption")}</p>
                </div>
                <LibraryView embedded />
              </section>
            </div>
          )
        ) : null}

        {panel === "plugins" ? <KnowledgePluginsPanel /> : null}

        {panel === "setup" ? (
          <div className="knowledge-setup" data-testid="knowledge-setup">
            <p className="knowledge-view__hint">{t("knowledge.setupHint")}</p>
            <KnowledgeBaseSettings
              value={knowledgeBase}
              onChange={async (next) => {
                await updateAiSettings({ knowledgeBase: next });
              }}
              modelProviders={nodeConfig?.modelProviders}
              embedReadiness={embed}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
