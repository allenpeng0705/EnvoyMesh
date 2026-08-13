/**
 * Knowledge → Plugins — Obsidian + Notion/MCP cards.
 * Obsidian app optional. Notion = MCP only (no desktop app / OAuth / local path).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_AI_KNOWLEDGE_BASE,
  DESKTOP_APP_SITE,
  type AiKnowledgeBaseSettings,
  type AiSettings,
  type KbPluginInfo,
} from "@envoymesh/api";
import { HomeFolderPicker } from "../HomeFolderPicker.js";
import { HomeFolderBrowserModal } from "../HomeFolderBrowserModal.js";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";
import { isTauriShell, pickTauriDirectory } from "../../lib/tauri-shell.js";

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

/** Simplified Obsidian gem mark — high contrast on brand purple. */
function ObsidianMark() {
  return (
    <span className="knowledge-plugin-card__mark knowledge-plugin-card__mark--obsidian" aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path
          fill="currentColor"
          d="M12.4 2.2 5.1 8.4c-.5.45-.6 1.2-.25 1.75l5.55 8.75c.45.7 1.5.7 1.95 0l5.55-8.75c.35-.55.25-1.3-.25-1.75L12.4 2.2Zm.05 3.35 4.2 3.55-4.2 6.65-4.2-6.65 4.2-3.55Z"
        />
      </svg>
    </span>
  );
}

/** Notion-style geometric N — white on black so it stays visible in dark mode. */
function NotionMark() {
  return (
    <span className="knowledge-plugin-card__mark knowledge-plugin-card__mark--notion" aria-hidden>
      <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
        <path
          fill="currentColor"
          d="M5.5 4.2h3.1l6.2 10.2V4.2H18v15.6h-3.1L8.7 9.6v10.2H5.5V4.2Z"
        />
      </svg>
    </span>
  );
}

export function KnowledgePluginsPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const { showToast } = useToast();

  const [plugins, setPlugins] = useState<KbPluginInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /** Obsidian + Notion "Install & use" stay in sync. */
  const [helpOpen, setHelpOpen] = useState(false);
  const autoLinkTried = useRef(false);

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

  const updateKb = useCallback(
    async (patch: Partial<AiKnowledgeBaseSettings>) => {
      const current = nodeConfig?.aiSettings;
      const nextKb = {
        ...DEFAULT_AI_KNOWLEDGE_BASE,
        ...(current?.knowledgeBase ?? {}),
        ...patch,
      };
      await nodeService.updateNodeConfig({
        aiSettings: { ...(current ?? {}), knowledgeBase: nextKb } as AiSettings,
      });
      await refreshNodeConfig();
    },
    [nodeConfig?.aiSettings, nodeService, refreshNodeConfig],
  );

  // Auto-link Obsidian vaults found on the home node (respect dismissals).
  useEffect(() => {
    if (!nodeConfig || autoLinkTried.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const discovered = await nodeService.discoverObsidianVaults();
        if (cancelled) return;
        const linked = (kb.linkedObsidianVaultPaths ?? [])
          .map((p) => p.trim())
          .filter(Boolean);
        const dismissed = new Set(
          (kb.dismissedObsidianVaultPaths ?? []).map((p) => p.trim()).filter(Boolean),
        );
        const toAdd = (discovered.paths ?? []).filter(
          (p) => p && !linked.includes(p) && !dismissed.has(p),
        );
        if (toAdd.length) {
          await updateKb({
            linkedObsidianVaultPaths: [...linked, ...toAdd],
          });
          if (cancelled) return;
          showToast(
            toAdd.length === 1
              ? t(
                  "knowledge.plugins.linkedVaultAutoOne",
                  "Linked Obsidian vault found on this computer.",
                )
              : t(
                  "knowledge.plugins.linkedVaultAutoMany",
                  "Linked {count} Obsidian vaults found on this computer.",
                  { count: toAdd.length },
                ),
            "success",
          );
        }
        if (!cancelled) autoLinkTried.current = true;
      } catch {
        // Leave autoLinkTried false so a later config refresh can retry.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeConfig]);

  const commitLinkedVaults = (nextPaths: string[]) => {
    const prev = new Set(
      (kb.linkedObsidianVaultPaths ?? []).map((p) => p.trim()).filter(Boolean),
    );
    const next = [...new Set(nextPaths.map((p) => p.trim()).filter(Boolean))];
    const nextSet = new Set(next);
    const removed = [...prev].filter((p) => !nextSet.has(p));
    const added = next.filter((p) => !prev.has(p));
    let dismissed = [
      ...new Set(
        (kb.dismissedObsidianVaultPaths ?? []).map((p) => p.trim()).filter(Boolean),
      ),
    ];
    for (const r of removed) {
      if (!dismissed.includes(r)) dismissed.push(r);
    }
    dismissed = dismissed.filter((d) => !added.includes(d));
    void updateKb({
      linkedObsidianVaultPaths: next.length ? next : undefined,
      dismissedObsidianVaultPaths: dismissed.length ? dismissed : undefined,
    });
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

  const handleOpenDesktopApp = async (app: "obsidian" | "notion") => {
    setBusy(`open:${app}`);
    try {
      const result = await nodeService.openDesktopApp({ app });
      if (!result.ok) {
        showToast(
          result.error ??
            t("knowledge.plugins.openAppFailed", "Could not open the app on this computer."),
          "error",
        );
        return;
      }
      if (result.openedWebsite) {
        showToast(
          t(
            "knowledge.plugins.openedWebsite",
            "App not installed locally — opened the official website.",
          ),
          "success",
        );
      }
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : t("knowledge.plugins.openAppFailed", "Could not open the app on this computer."),
        "error",
      );
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
              <ObsidianMark />
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
            <button
              type="button"
              className="secondary"
              data-testid="open-desktop-obsidian"
              disabled={busy === "open:obsidian"}
              onClick={() => void handleOpenDesktopApp("obsidian")}
            >
              {busy === "open:obsidian"
                ? t("knowledge.plugins.openingApp", "Opening…")
                : t("knowledge.plugins.openObsidian", "Open Obsidian")}
            </button>
          </div>

          <div className="knowledge-plugin-card__fields">
            <span className="knowledge-plugin-card__field-label" id="knowledge-linked-obsidian-label">
              {t("knowledge.plugins.linkedVaultLabel")}
            </span>
            <LinkedObsidianVaultPaths
              paths={kb.linkedObsidianVaultPaths ?? []}
              onChange={commitLinkedVaults}
            />
            <p className="field-desc">{t("knowledge.plugins.linkedVaultDesc")}</p>
          </div>

          <div className="knowledge-plugin-card__footer">
            <details
              className="knowledge-plugin-card__details"
              open={helpOpen}
              onToggle={(e) => {
                setHelpOpen((e.currentTarget as HTMLDetailsElement).open);
              }}
            >
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
            <a
              className="knowledge-plugin-card__download-link"
              href={DESKTOP_APP_SITE.obsidian.download}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="download-obsidian"
            >
              {t("knowledge.plugins.downloadObsidian", "Download Obsidian")}
            </a>
          </div>
        </article>

        {/* —— Notion / MCP —— */}
        <article className="knowledge-plugin-card" data-testid="plugin-card-notion-mcp">
          <header className="knowledge-plugin-card__header">
            <div className="knowledge-plugin-card__identity">
              <NotionMark />
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

          <div className="knowledge-plugin-card__actions">
            <button
              type="button"
              className="secondary"
              data-testid="open-desktop-notion"
              disabled={busy === "open:notion"}
              onClick={() => void handleOpenDesktopApp("notion")}
            >
              {busy === "open:notion"
                ? t("knowledge.plugins.openingApp", "Opening…")
                : t("knowledge.plugins.openNotion", "Open Notion")}
            </button>
          </div>

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
              <p className="field-desc">{t("knowledge.plugins.notionNoLocalPath")}</p>
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

          <div className="knowledge-plugin-card__footer">
            <details
              className="knowledge-plugin-card__details"
              open={helpOpen}
              onToggle={(e) => {
                setHelpOpen((e.currentTarget as HTMLDetailsElement).open);
              }}
            >
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
            <a
              className="knowledge-plugin-card__download-link"
              href={DESKTOP_APP_SITE.notion.download}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="download-notion"
            >
              {t("knowledge.plugins.downloadNotion", "Download Notion")}
            </a>
          </div>
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

/** Multi-folder linked Obsidian vaults — OS picker (Tauri) or home-node browser (web). */
function LinkedObsidianVaultPaths({
  paths,
  onChange,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const t = useT();
  const tauriShell = isTauriShell();
  const [adding, setAdding] = useState(false);
  const [webBrowserOpen, setWebBrowserOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickTitle = t(
    "knowledge.plugins.linkedVaultPickTitle",
    "Choose Obsidian vault folder",
  );

  const commitPaths = (next: string[]) => {
    const unique: string[] = [];
    for (const raw of next) {
      const p = raw.trim();
      if (!p || unique.includes(p)) continue;
      unique.push(p);
    }
    onChange(unique);
  };

  const handleAdd = async () => {
    setError(null);
    if (tauriShell) {
      setAdding(true);
      try {
        const picked = await pickTauriDirectory({ title: pickTitle });
        if (!picked.ok) {
          setError(picked.error);
          return;
        }
        if (picked.path) commitPaths([...paths, picked.path]);
      } finally {
        setAdding(false);
      }
      return;
    }
    setWebBrowserOpen(true);
  };

  return (
    <div
      className="knowledge-linked-vaults"
      data-testid="linked-obsidian-vault-paths"
      aria-labelledby="knowledge-linked-obsidian-label"
    >
      {paths.length === 0 ? (
        <p className="field-desc" data-testid="linked-obsidian-vault-empty">
          {t(
            "knowledge.plugins.linkedVaultEmpty",
            "No linked vaults yet. Use Add vault folder… to browse folders on this home computer.",
          )}
        </p>
      ) : null}
      {paths.map((path, index) => (
        <HomeFolderPicker
          key={`${path}-${index}`}
          className="knowledge-linked-vaults__row"
          value={path}
          title={pickTitle}
          onChange={(next) => {
            const copy = [...paths];
            if (!next?.trim()) copy.splice(index, 1);
            else copy[index] = next.trim();
            commitPaths(copy);
          }}
        />
      ))}
      <div className="knowledge-linked-vaults__add">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={adding}
          onClick={() => void handleAdd()}
        >
          {adding
            ? t("settings.ai.aiEngine.browsingFolder", "Browsing…")
            : t("knowledge.plugins.linkedVaultAdd", "Add vault folder…")}
        </button>
      </div>
      {error ? <p className="home-folder-picker-error">{error}</p> : null}
      {webBrowserOpen ? (
        <HomeFolderBrowserModal
          title={pickTitle}
          initialPath={paths[paths.length - 1]}
          onClose={() => setWebBrowserOpen(false)}
          onSelect={(path) => {
            setWebBrowserOpen(false);
            commitPaths([...paths, path]);
          }}
        />
      ) : null}
    </div>
  );
}

