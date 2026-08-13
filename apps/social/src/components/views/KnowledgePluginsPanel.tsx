/**
 * Knowledge → Plugins — Obsidian + Notion/MCP cards.
 * Obsidian app optional. Notion = MCP only (no desktop app / OAuth).
 */
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_AI_KNOWLEDGE_BASE,
  type AiKnowledgeBaseSettings,
  type AiSettings,
  type KbPluginInfo,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";

function statusLabel(
  t: (k: string, f?: string) => string,
  status: KbPluginInfo["status"],
): string {
  switch (status) {
    case "active":
      return t("kbPlugins.statusActive");
    case "disabled":
      return t("kbPlugins.statusDisabled");
    case "error":
      return t("kbPlugins.statusError");
    default:
      return t("kbPlugins.statusRegistered");
  }
}

export function KnowledgePluginsPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const { showToast } = useToast();

  const [plugins, setPlugins] = useState<KbPluginInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const kb: AiKnowledgeBaseSettings = {
    ...DEFAULT_AI_KNOWLEDGE_BASE,
    ...(nodeConfig?.aiSettings?.knowledgeBase ?? {}),
  };
  const mcpEnabled = kb.externalProvider === "mcp";

  const loadPlugins = useCallback(async () => {
    try {
      const list = await nodeService.listKbPlugins();
      setPlugins(list);
      return list;
    } catch {
      setPlugins([]);
      return [] as KbPluginInfo[];
    }
  }, [nodeService]);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const updateKb = async (patch: Partial<AiKnowledgeBaseSettings>) => {
    const current = nodeConfig?.aiSettings ?? {};
    const nextKb = { ...kb, ...patch };
    await nodeService.updateNodeConfig({
      aiSettings: { ...current, knowledgeBase: nextKb } as AiSettings,
    });
    await refreshNodeConfig();
  };

  const handleActivate = async (pluginId: string) => {
    setBusy(pluginId);
    try {
      const result = await nodeService.activateKbPlugin({ pluginId });
      if (!result.ok) {
        showToast(
          t("kbPlugins.activateError") + (result.reason ? `: ${result.reason}` : ""),
          "error",
        );
      }
      await loadPlugins();
    } catch {
      showToast(t("kbPlugins.activateError"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleDeactivate = async (pluginId: string) => {
    setBusy(pluginId);
    try {
      const result = await nodeService.deactivateKbPlugin({ pluginId });
      if (!result.ok) {
        showToast(
          t("kbPlugins.deactivateError") + (result.reason ? `: ${result.reason}` : ""),
          "error",
        );
      }
      await loadPlugins();
    } catch {
      showToast(t("kbPlugins.deactivateError"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSync = async (pluginId: string) => {
    setBusy(`sync:${pluginId}`);
    try {
      const result = await nodeService.activateKbPlugin({ pluginId });
      if (!result.ok) {
        showToast(
          t("kbPlugins.syncError") + (result.reason ? `: ${result.reason}` : ""),
          "error",
        );
      } else {
        showToast(t("kbPlugins.syncDone"), "success");
      }
      await loadPlugins();
    } catch {
      showToast(t("kbPlugins.syncError"), "error");
    } finally {
      setBusy(null);
    }
  };

  const obsidian = plugins.find((p) => p.pluginId === "obsidian");
  const otherPlugins = plugins.filter(
    (p) => p.pluginId !== "obsidian" && p.pluginId !== "mcp-knowledge",
  );

  return (
    <div className="knowledge-plugins" data-testid="knowledge-plugins">
      <p className="knowledge-plugins__lede">{t("knowledge.plugins.lede")}</p>

      <div className="knowledge-plugins__grid">
        {/* —— Obsidian —— */}
        <article className="knowledge-plugin-card" data-testid="plugin-card-obsidian">
          <header className="knowledge-plugin-card__header">
            <div className="knowledge-plugin-card__identity">
              <span className="knowledge-plugin-card__mark knowledge-plugin-card__mark--obsidian" aria-hidden>
                Ob
              </span>
              <div>
                <h3>{t("knowledge.plugins.obsidianTitle")}</h3>
                <p className="knowledge-plugin-card__tagline">{t("knowledge.plugins.obsidianTagline")}</p>
              </div>
            </div>
            <span
              className={`knowledge-plugin-card__badge${
                obsidian?.status === "active" ? " knowledge-plugin-card__badge--on" : ""
              }`}
            >
              {obsidian
                ? statusLabel(t, obsidian.status)
                : t("knowledge.plugins.statusUnavailable")}
            </span>
          </header>

          {obsidian?.errorMessage ? (
            <p className="knowledge-plugin-card__error" role="alert">
              {obsidian.errorMessage}
            </p>
          ) : null}

          <div className="knowledge-plugin-card__actions">
            {!obsidian ? (
              <p className="field-desc">{t("knowledge.plugins.obsidianNotRegistered")}</p>
            ) : obsidian.status !== "active" ? (
              <button
                type="button"
                className="primary"
                disabled={busy === "obsidian"}
                onClick={() => void handleActivate("obsidian")}
              >
                {busy === "obsidian" ? t("kbPlugins.activating") : t("kbPlugins.activate")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="primary"
                  disabled={busy === "sync:obsidian"}
                  onClick={() => void handleSync("obsidian")}
                >
                  {busy === "sync:obsidian" ? t("kbPlugins.syncing") : t("kbPlugins.syncNow")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy === "obsidian"}
                  onClick={() => void handleDeactivate("obsidian")}
                >
                  {busy === "obsidian" ? t("kbPlugins.deactivating") : t("kbPlugins.deactivate")}
                </button>
              </>
            )}
          </div>

          <div className="knowledge-plugin-card__fields">
            <label htmlFor="knowledge-linked-obsidian">{t("knowledge.plugins.linkedVaultLabel")}</label>
            <input
              id="knowledge-linked-obsidian"
              type="text"
              placeholder={t("knowledge.plugins.linkedVaultPlaceholder")}
              value={(kb.linkedObsidianVaultPaths ?? []).join(", ")}
              onChange={(e) => {
                const paths = e.target.value
                  .split(",")
                  .map((p) => p.trim())
                  .filter(Boolean);
                void updateKb({
                  linkedObsidianVaultPaths: paths.length ? paths : undefined,
                });
              }}
            />
            <p className="field-desc">{t("knowledge.plugins.linkedVaultDesc")}</p>
          </div>

          <details className="knowledge-plugin-card__details">
            <summary>{t("knowledge.plugins.showHelp")}</summary>
            <div className="knowledge-plugin-card__hints">
              <p>
                <strong>{t("knowledge.plugins.howToInstall")}</strong>{" "}
                {t("knowledge.plugins.obsidianInstall")}
              </p>
              <p>
                <strong>{t("knowledge.plugins.howToUse")}</strong>{" "}
                {t("knowledge.plugins.obsidianUse")}
              </p>
              <p className="field-desc">{t("knowledge.plugins.obsidianIfMissing")}</p>
            </div>
          </details>
        </article>

        {/* —— Notion / MCP —— */}
        <article className="knowledge-plugin-card" data-testid="plugin-card-notion-mcp">
          <header className="knowledge-plugin-card__header">
            <div className="knowledge-plugin-card__identity">
              <span className="knowledge-plugin-card__mark knowledge-plugin-card__mark--notion" aria-hidden>
                N
              </span>
              <div>
                <h3>{t("knowledge.plugins.notionTitle")}</h3>
                <p className="knowledge-plugin-card__tagline">{t("knowledge.plugins.notionTagline")}</p>
              </div>
            </div>
            <span
              className={`knowledge-plugin-card__badge${
                mcpEnabled ? " knowledge-plugin-card__badge--on" : ""
              }`}
            >
              {mcpEnabled
                ? t("knowledge.plugins.notionStatusOn")
                : t("knowledge.plugins.notionStatusOff")}
            </span>
          </header>

          <div className="knowledge-plugin-card__toggle">
            <div className="toggle-info">
              <strong>{t("knowledge.plugins.notionEnable")}</strong>
              <span className="toggle-desc">{t("knowledge.plugins.notionEnableDesc")}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={mcpEnabled}
                onChange={(e) => {
                  void updateKb({
                    externalProvider: e.target.checked ? "mcp" : "none",
                  });
                }}
              />
              <span className="slider" />
            </label>
          </div>

          {mcpEnabled ? (
            <div className="knowledge-plugin-card__fields">
              <label htmlFor="knowledge-mcp-url">{t("settings.ai.rag.mcpServerUrl")}</label>
              <input
                id="knowledge-mcp-url"
                type="url"
                placeholder={t("settings.ai.rag.mcpUrlPlaceholder")}
                value={kb.mcpServerUrl ?? ""}
                onChange={(e) => {
                  void updateKb({ mcpServerUrl: e.target.value.trim() || undefined });
                }}
              />
              <label htmlFor="knowledge-mcp-tool">{t("settings.ai.rag.mcpSearchTool")}</label>
              <input
                id="knowledge-mcp-tool"
                type="text"
                placeholder={t("settings.ai.rag.mcpSearchToolPlaceholder")}
                value={kb.mcpSearchTool ?? ""}
                onChange={(e) => {
                  void updateKb({ mcpSearchTool: e.target.value.trim() || undefined });
                }}
              />
            </div>
          ) : null}

          <details className="knowledge-plugin-card__details">
            <summary>{t("knowledge.plugins.showHelp")}</summary>
            <div className="knowledge-plugin-card__hints">
              <p>
                <strong>{t("knowledge.plugins.howToInstall")}</strong>{" "}
                {t("knowledge.plugins.notionInstall")}
              </p>
              <p>
                <strong>{t("knowledge.plugins.howToUse")}</strong>{" "}
                {t("knowledge.plugins.notionUse")}
              </p>
              <p className="field-desc">{t("knowledge.plugins.notionIfMissing")}</p>
            </div>
          </details>
        </article>
      </div>

      {otherPlugins.length > 0 ? (
        <article className="knowledge-plugin-card knowledge-plugin-card--muted">
          <header className="knowledge-plugin-card__header">
            <h3>{t("knowledge.plugins.futureTitle")}</h3>
          </header>
          <ul className="knowledge-plugin-card__list">
            {otherPlugins.map((p) => (
              <li key={p.pluginId}>
                <strong>{p.displayName}</strong> — {statusLabel(t, p.status)}
                {p.description ? ` · ${p.description}` : ""}
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <p className="knowledge-plugins__more">{t("knowledge.plugins.futureEmpty")}</p>
      )}
    </div>
  );
}
