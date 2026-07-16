import React, { useState, useEffect, useCallback } from "react";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";
import type { OpenClawPluginInfo, OpenClawPluginDetail } from "@envoymesh/api";

interface Props {
  onClose: () => void;
}

export function SkillManagerModal({ onClose }: Props) {
  const nodeService = useNodeService();
  const [tab, setTab] = useState<"installed" | "trending" | "search" | "extensions">("installed");
  const [trending, setTrending] = useState<string[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [installLoading, setInstallLoading] = useState(false);
  const [installName, setInstallName] = useState("");
  const [installMsg, setInstallMsg] = useState("");
  const [installOk, setInstallOk] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  // Extension tab state
  const [extensions, setExtensions] = useState<OpenClawPluginInfo[]>([]);
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [expandedExt, setExpandedExt] = useState<string | null>(null);
  const [extDetail, setExtDetail] = useState<Record<string, OpenClawPluginDetail>>({});
  const [extDetailLoading, setExtDetailLoading] = useState<Record<string, boolean>>({});
  const [extSpec, setExtSpec] = useState("");
  const [extInstallLoading, setExtInstallLoading] = useState(false);
  const [extInstallMsg, setExtInstallMsg] = useState("");
  const [extInstallOk, setExtInstallOk] = useState<boolean | null>(null);
  const [extActionLoading, setExtActionLoading] = useState<Record<string, string | null>>({});
  const [extFilter, setExtFilter] = useState("");
  const [extConfirm, setExtConfirm] = useState<{ action: "uninstall" | "update"; ext: OpenClawPluginInfo } | null>(null);

  useEffect(() => {
    nodeService.getOpenClawPlugins?.().then(setInstalled).catch(() => setInstalled([]));
    // Load saved API keys from bridge config
    nodeService.getNodeConfig?.().then((cfg: any) => {
      console.log("[skills] node config keys:", cfg ? Object.keys(cfg).slice(0, 10) : "null");
      const skillKeys = cfg?.skillApiKeys ?? cfg?.bridgeConfig?.skillApiKeys;
      if (skillKeys) {
        console.log("[skills] loaded keys:", Object.keys(skillKeys));
        setApiKeys(skillKeys);
      } else {
        console.log("[skills] no skillApiKeys in config");
      }
    }).catch((e: any) => console.warn("[skills] load failed:", e.message));
  }, [nodeService]);

  const loadExtensions = useCallback(async () => {
    setExtensionsLoading(true);
    try {
      const list = await nodeService.listOpenClawExtensionPlugins?.() ?? [];
      setExtensions(list);
    } catch {
      setExtensions([]);
    }
    setExtensionsLoading(false);
  }, [nodeService]);

  const handleInspectExt = useCallback(async (id: string) => {
    if (expandedExt === id && extDetail[id]) {
      setExpandedExt(null);
      return;
    }
    setExpandedExt(id);
    setExtDetailLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const detail = await nodeService.inspectOpenClawExtensionPlugin?.(id);
      if (detail) {
        setExtDetail((prev) => ({ ...prev, [id]: detail }));
      }
    } catch { /* inspect failed, partial view still works */ }
    setExtDetailLoading((prev) => ({ ...prev, [id]: false }));
  }, [expandedExt, extDetail, nodeService]);

  const handleToggleExt = useCallback(async (ext: OpenClawPluginInfo) => {
    setExtActionLoading((prev) => ({ ...prev, [ext.id]: ext.enabled ? "disabling" : "enabling" }));
    try {
      if (ext.enabled) {
        await nodeService.disableOpenClawExtensionPlugin?.(ext.id);
      } else {
        await nodeService.enableOpenClawExtensionPlugin?.(ext.id);
      }
      loadExtensions();
    } catch { /* action failed, keep current state */ }
    setExtActionLoading((prev) => ({ ...prev, [ext.id]: null }));
  }, [nodeService, loadExtensions]);

  const handleUninstallExt = useCallback(async (id: string) => {
    const ext = extensions.find((e) => e.id === id);
    if (ext) {
      setExtConfirm({ action: "uninstall", ext });
      return;
    }
  }, [extensions]);

  const handleUpdateExt = useCallback(async (id: string) => {
    const ext = extensions.find((e) => e.id === id);
    if (ext) {
      setExtConfirm({ action: "update", ext });
      return;
    }
  }, [extensions]);

  const confirmExtAction = useCallback(async () => {
    if (!extConfirm) return;
    const { action, ext } = extConfirm;
    setExtConfirm(null);
    setExtActionLoading((prev) => ({ ...prev, [ext.id]: action === "uninstall" ? "uninstalling" : "updating" }));
    try {
      if (action === "uninstall") {
        await nodeService.uninstallOpenClawExtensionPlugin?.(ext.id);
      } else {
        await nodeService.updateOpenClawExtensionPlugin?.(ext.id);
      }
      loadExtensions();
    } catch { /* action failed */ }
    setExtActionLoading((prev) => ({ ...prev, [ext.id]: null }));
  }, [extConfirm, nodeService, loadExtensions]);

  const handleInstallExt = useCallback(async () => {
    if (!extSpec.trim()) return;
    setExtInstallLoading(true);
    setExtInstallMsg("");
    setExtInstallOk(null);
    try {
      const r = await nodeService.installOpenClawExtensionPlugin?.(extSpec.trim()) ?? { ok: false, message: "No response" };
      setExtInstallMsg(r.message);
      setExtInstallOk(r.ok);
      if (r.ok) {
        setExtSpec("");
        loadExtensions();
      }
    } catch (e: any) { setExtInstallMsg(e.message || "Failed"); setExtInstallOk(false); }
    setExtInstallLoading(false);
  }, [extSpec, nodeService, loadExtensions]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      const r = await nodeService.searchOpenClawPlugins?.(query) ?? [];
      setResults(r);
    } catch { setResults([]); }
    setSearchLoading(false);
  }, [query, nodeService]);

  const handleInstall = useCallback(async () => {
    if (!installName.trim()) return;
    setInstallLoading(true);
    setInstallMsg("");
    setInstallOk(null);
    try {
      const r = await nodeService.installOpenClawPlugin?.(installName.trim()) ?? { ok: false, message: "No response" };
      setInstallMsg(r.message);
      setInstallOk(r.ok);
      if (r.ok) {
        setInstallName("");
        nodeService.getOpenClawPlugins?.().then(setInstalled);
      }
    } catch (e: any) { setInstallMsg(e.message || "Failed"); setInstallOk(false); }
    setInstallLoading(false);
  }, [installName, nodeService]);

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div className="skill-manager" role="dialog" aria-label="OpenClaw Skills & Plugins" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="skill-manager__header">
            <div>
              <h2 className="skill-manager__title">Skills &amp; Plugins</h2>
              <p className="skill-manager__subtitle">OpenClaw</p>
            </div>
            <button type="button" className="skill-manager__close" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* ClawHub Token */}
          <div className="skill-manager__token-bar">
            <button
              type="button"
              className="skill-manager__token-toggle"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? "Hide" : "ClawHub Token"}
            </button>
            {showToken && (
              <div className="skill-manager__token-form">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your ClawHub API token…"
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={async () => {
                  await nodeService.saveClawhubToken?.(token);
                  setShowToken(false);
                }}>
                  Save
                </button>
                <p className="skill-manager__token-hint">
                  Get your token at <a href="https://clawhub.ai/settings/tokens" target="_blank" rel="noopener">clawhub.ai/settings/tokens</a>
                </p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="skill-manager__tabs">
            <button
              type="button"
              className={`skill-manager__tab ${tab === "search" ? "active" : ""}`}
              onClick={() => setTab("search")}
            >
              Search
            </button>
            <button
              type="button"
              className={`skill-manager__tab ${tab === "trending" ? "active" : ""}`}
              onClick={() => {
                setTab("trending");
                if (trending.length === 0) {
                  setTrendingLoading(true);
                  nodeService.getTrendingOpenClawPlugins?.().then(setTrending).catch(() => setTrending([])).finally(() => setTrendingLoading(false));
                }
              }}
            >
              Trending
            </button>
            <button
              type="button"
              className={`skill-manager__tab ${tab === "installed" ? "active" : ""}`}
              onClick={() => setTab("installed")}
            >
              Installed
              {(() => {
                const real = installed.filter(p => p !== "(no skills installed)" && !p.startsWith("Error:") && p !== "__clawhub_missing__");
                return real.length > 0 ? <span className="skill-manager__badge">{real.length}</span> : null;
              })()}
            </button>
            <button
              type="button"
              className={`skill-manager__tab ${tab === "extensions" ? "active" : ""}`}
              onClick={() => {
                setTab("extensions");
                if (extensions.length === 0 && !extensionsLoading) {
                  loadExtensions();
                }
              }}
            >
              Extensions
            </button>
          </div>

          {/* Content */}
          <div className="skill-manager__body">
            {tab === "installed" && (
              <div className="skill-manager__list">
                {installed[0] === "__clawhub_missing__" ? (
                  <div className="skill-manager__empty">
                    <div className="skill-manager__empty-icon">📥</div>
                    <p>ClawHub CLI not installed</p>
                    <div className="skill-manager__setup-cmd">
                      <code>npm i -g clawhub && clawhub login</code>
                    </div>
                    <p className="skill-manager__hint">
                      This installs the ClawHub CLI and authenticates with your account.
                      After that, you can install skills from the marketplace.
                    </p>
                  </div>
                ) : installed.length === 0 ? (
                  <div className="skill-manager__empty">
                    <div className="skill-manager__empty-icon">🧩</div>
                    <p>No plugins installed yet</p>
                    <button type="button" className="btn btn-primary" onClick={() => setTab("search")}>
                      Browse ClawHub
                    </button>
                  </div>
                ) : installed[0]?.startsWith("Error:") ? (
                  <div className="skill-manager__empty">
                    <div className="skill-manager__empty-icon">⚠️</div>
                    <p className="skill-manager__error-msg">{installed[0]}</p>
                  </div>
                ) : (
                  <>
                    {installed.filter(p => p !== "(no skills installed)").map((p, i) => {
                      const slug = p.split(" ")[0] || p;
                      return (
                        <div key={i} className="skill-manager__item skill-manager__item--installed">
                          <span className="skill-manager__item-icon">📦</span>
                          <div className="skill-manager__item-info">
                            <span className="skill-manager__item-name">{p}</span>
                            {editingKey === slug ? (
                              <div className="skill-manager__key-row">
                                <input
                                  type="password"
                                  className="skill-manager__inline-key"
                                  value={apiKeys[slug] || ""}
                                  onChange={(e) => setApiKeys({ ...apiKeys, [slug]: e.target.value })}
                                  placeholder="API key…"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="skill-manager__save-btn"
                                  onClick={async () => {
                                    await nodeService.saveSkillApiKeys(apiKeys);
                                    setEditingKey(null);
                                  }}
                                  title="Save"
                                >
                                  ✓
                                </button>
                                {apiKeys[slug] && (
                                  <button
                                    type="button"
                                    className="skill-manager__remove-btn"
                                    onClick={async () => {
                                      const updated = { ...apiKeys };
                                      delete updated[slug];
                                      setApiKeys(updated);
                                      await nodeService.saveSkillApiKeys(updated);
                                      setEditingKey(null);
                                    }}
                                    title="Remove key"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="skill-manager__key-btn"
                                onClick={() => setEditingKey(slug)}
                              >
                                {apiKeys[slug] ? "API Key ✓" : "Set API Key"}
                              </button>
                            )}
                          </div>
                           <button
                             type="button"
                             className="btn btn-secondary btn-sm"
                             style={{ color: "var(--color-error, #dc2626)", borderColor: "var(--color-error, #dc2626)" }}
                             onClick={async () => {
                               await nodeService.uninstallOpenClawPlugin?.(slug);
                               // Remove the API key for this skill
                               const updated = { ...apiKeys };
                               delete updated[slug];
                               setApiKeys(updated);
                               await nodeService.saveSkillApiKeys(updated);
                               nodeService.getOpenClawPlugins?.().then(setInstalled);
                             }}
                           >
                             Remove
                           </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {tab === "trending" && (
              <div className="skill-manager__list">
                {trendingLoading ? (
                  <p className="skill-manager__hint">Loading trending skills…</p>
                ) : trending.length > 0 && trending[0]?.startsWith("Error:") ? (
                  <div className="skill-manager__error-block">
                    <p className="skill-manager__error-msg">{trending[0]}</p>
                  </div>
                ) : (
                  trending.map((r, i) => {
                    let skill: { slug?: string; name?: string; desc?: string; url?: string; owner?: string } = {};
                    try { skill = JSON.parse(r); } catch { /* raw */ }
                    const slug = skill.slug || r.split(" ")[0] || r;
                    return (
                      <div key={i} className="skill-manager__item skill-manager__item--result">
                        <span className="skill-manager__item-icon">📦</span>
                        <div className="skill-manager__item-info">
                          <span className="skill-manager__item-name" style={{ cursor: skill.url ? "pointer" : "default" }}
                            onClick={() => { if (skill.url) window.open(skill.url, "_blank"); }}
                          >
                            {skill.owner ? <span className="skill-manager__item-owner">{skill.owner}/</span> : null}
                            {skill.name || r}
                          </span>
                          {skill.desc && <span className="skill-manager__item-desc">{skill.desc}</span>}
                        </div>
                        <button type="button" className="btn btn-secondary btn-sm"
                          disabled={installingSlug === slug}
                          onClick={async () => {
                            setInstallingSlug(slug);
                            try { await nodeService.installOpenClawPlugin?.(slug); nodeService.getOpenClawPlugins?.().then(setInstalled); }
                            catch {}
                            setInstallingSlug(null);
                          }}
                        >
                          {installingSlug === slug ? "Installing…" : "Install"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === "search" && (
              <div className="skill-manager__search">
                {/* Search bar */}
                <div className="skill-manager__search-bar">
                  <svg className="skill-manager__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Search ClawHub…"
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleSearch} disabled={searchLoading}>
                    {searchLoading ? "Searching…" : "Search"}
                  </button>
                </div>

                {/* Results */}
                {results.length > 0 && results[0]?.startsWith("Error:") ? (
                  <div className="skill-manager__error-block">
                    <p className="skill-manager__error-msg">{results[0]}</p>
                    <p className="skill-manager__hint">
                      Make sure <code>clawhub</code> is installed and you've run <code>clawhub login</code>.
                    </p>
                  </div>
                ) : results.length > 0 && (
                  <div className="skill-manager__results">
                    {results.map((r, i) => {
                      let skill: { slug?: string; name?: string; desc?: string; url?: string; owner?: string } = {};
                      try { skill = JSON.parse(r); } catch { /* raw text */ }
                      const displayName = skill.name || r;
                      const slug = skill.slug || r.split(" ")[0] || r;
                      return (
                        <div key={i} className="skill-manager__item skill-manager__item--result">
                          <span className="skill-manager__item-icon">📦</span>
                          <div className="skill-manager__item-info">
                            <span
                              className="skill-manager__item-name"
                              style={{ cursor: skill.url ? "pointer" : "default" }}
                              onClick={() => { if (skill.url) window.open(skill.url, "_blank"); }}
                              title={skill.url || ""}
                            >
                              {skill.owner ? <span className="skill-manager__item-owner">{skill.owner}/</span> : null}
                              {displayName}
                            </span>
                            {skill.desc && <span className="skill-manager__item-desc">{skill.desc}</span>}
                          </div>
                           <button
                             type="button"
                             className="btn btn-secondary btn-sm"
                             disabled={installingSlug === slug}
                             onClick={async () => {
                               setInstallingSlug(slug);
                               try {
                                 await nodeService.installOpenClawPlugin?.(slug);
                                 nodeService.getOpenClawPlugins?.().then(setInstalled);
                               } catch { /* handled by installOpenClawPlugin */ }
                               setInstallingSlug(null);
                             }}
                           >
                             {installingSlug === slug ? "Installing…" : "Install"}
                           </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Manual install */}
                <div className="skill-manager__install">
                  <label className="skill-manager__label">Install by name</label>
                  <div className="skill-manager__install-row">
                    <input
                      type="text"
                      value={installName}
                      onChange={(e) => setInstallName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInstall()}
                      placeholder="e.g. tavily"
                    />
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleInstall} disabled={installLoading || !installName.trim()}>
                      {installLoading ? "Installing…" : "Install"}
                    </button>
                  </div>
                  {installMsg && (
                    <p className={`skill-manager__msg ${installOk === true ? "success" : installOk === false ? "error" : ""}`}>
                      {installMsg}
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === "extensions" && (
              <div className="skill-manager__extensions">
                {/* Filter bar */}
                {extensions.length > 0 && (
                  <div className="skill-manager__ext-filter">
                    <input
                      type="text"
                      value={extFilter}
                      onChange={(e) => setExtFilter(e.target.value)}
                      placeholder="Filter extensions…"
                    />
                  </div>
                )}

                {/* Installed extensions list */}
                <div className="skill-manager__ext-list">
                  {extensionsLoading ? (
                    <p className="skill-manager__hint">Loading extensions…</p>
                  ) : extensions.length === 0 ? (
                    <div className="skill-manager__empty">
                      <div className="skill-manager__empty-icon">🔌</div>
                      <p>No extensions installed</p>
                      <p className="skill-manager__hint">
                        Extensions add channels, tools, and capabilities to OpenClaw.
                        Install from npm or a git URL below.
                      </p>
                    </div>
                  ) : extFilter.trim() && !extensions.some((ext) => {
                      const q = extFilter.toLowerCase()
                      return ext.name.toLowerCase().includes(q) ||
                        ext.id.toLowerCase().includes(q) ||
                        (ext.description ?? "").toLowerCase().includes(q) ||
                        ext.origin.includes(q)
                    }) ? (
                    <div className="skill-manager__empty">
                      <div className="skill-manager__empty-icon">🔍</div>
                      <p>No extensions match "{extFilter}"</p>
                    </div>
                  ) : (
                    extensions
                      .filter((ext) => {
                        if (!extFilter.trim()) return true
                        const q = extFilter.toLowerCase()
                        return ext.name.toLowerCase().includes(q) ||
                          ext.id.toLowerCase().includes(q) ||
                          (ext.description ?? "").toLowerCase().includes(q) ||
                          ext.origin.includes(q)
                      })
                      .map((ext) => {
                      const isExpanded = expandedExt === ext.id;
                      const detail = extDetail[ext.id];
                      const action = extActionLoading[ext.id];
                      const isBundled = ext.origin === "bundled";
                      return (
                        <div key={ext.id} className="skill-manager__ext-item">
                          <div className="skill-manager__ext-row">
                            <span className="skill-manager__item-icon">{ext.enabled ? "✅" : "⏸️"}</span>
                            <div className="skill-manager__item-info">
                              <span className="skill-manager__item-name" style={{ cursor: "pointer" }} onClick={() => handleInspectExt(ext.id)}>
                                {ext.name}
                                {ext.version && <span className="skill-manager__item-owner"> v{ext.version}</span>}
                              </span>
                              {ext.description && <span className="skill-manager__item-desc">{ext.description}</span>}
                              <div className="skill-manager__ext-meta">
                                <span className={`skill-manager__ext-origin skill-manager__ext-origin--${ext.origin}`}>
                                  {ext.origin}
                                </span>
                                {ext.channels && ext.channels.length > 0 && (
                                  <span className="skill-manager__ext-tag">{ext.channels.length} channels</span>
                                )}
                                {ext.tools && ext.tools.length > 0 && (
                                  <span className="skill-manager__ext-tag">{ext.tools.length} tools</span>
                                )}
                              </div>
                            </div>
                            <div className="skill-manager__ext-actions">
                              {/* Enable/disable toggle */}
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={!!action}
                                onClick={() => handleToggleExt(ext)}
                                title={ext.enabled ? "Disable" : "Enable"}
                              >
                                {action === "enabling" ? "Enabling…" : action === "disabling" ? "Disabling…" : ext.enabled ? "Disable" : "Enable"}
                              </button>
                              {/* Uninstall — not available for bundled */}
                              {!isBundled && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={!!action}
                                  style={{ color: "var(--color-error, #dc2626)", borderColor: "var(--color-error, #dc2626)" }}
                                  onClick={() => handleUninstallExt(ext.id)}
                                  title="Uninstall"
                                >
                                  {action === "uninstalling" ? "Removing…" : "Remove"}
                                </button>
                              )}
                              {/* Update — for non-bundled extensions */}
                              {!isBundled && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={!!action}
                                  onClick={() => handleUpdateExt(ext.id)}
                                  title="Update"
                                >
                                  {action === "updating" ? "Updating…" : "Update"}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="skill-manager__ext-detail">
                              {extDetailLoading[ext.id] ? (
                                <p className="skill-manager__hint">Loading details…</p>
                              ) : detail ? (
                                <>
                                  <div className="skill-manager__ext-detail-grid">
                                    <div>
                                      <span className="skill-manager__label">ID</span>
                                      <code className="skill-manager__ext-code">{detail.id}</code>
                                    </div>
                                    {detail.installRecord && (
                                      <div>
                                        <span className="skill-manager__label">Source</span>
                                        <code className="skill-manager__ext-code">
                                          {detail.installRecord.source}: {detail.installRecord.spec}
                                        </code>
                                      </div>
                                    )}
                                    {detail.channels && detail.channels.length > 0 && (
                                      <div>
                                        <span className="skill-manager__label">Channels</span>
                                        <div className="skill-manager__ext-tags">
                                          {detail.channels.map((ch) => (
                                            <span key={ch} className="skill-manager__ext-tag">{ch}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {detail.tools && detail.tools.length > 0 && (
                                      <div>
                                        <span className="skill-manager__label">Tools</span>
                                        <div className="skill-manager__ext-tags">
                                          {detail.tools.map((t) => (
                                            <span key={t} className="skill-manager__ext-tag">{t}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {detail.contributions != null && (
                                      <div>
                                        <span className="skill-manager__label">Contributions</span>
                                        <pre className="skill-manager__ext-json">{JSON.stringify(detail.contributions, null, 2)}</pre>
                                      </div>
                                    )}
                                    {detail.configSchema != null && (
                                      <div>
                                        <span className="skill-manager__label">Config Schema</span>
                                        <pre className="skill-manager__ext-json">{JSON.stringify(detail.configSchema, null, 2)}</pre>
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <p className="skill-manager__hint">Details unavailable</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Install bar */}
                <div className="skill-manager__install">
                  <label className="skill-manager__label">Install extension</label>
                  <div className="skill-manager__install-row">
                    <input
                      type="text"
                      value={extSpec}
                      onChange={(e) => setExtSpec(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInstallExt()}
                      placeholder="npm package or git URL…"
                    />
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleInstallExt} disabled={extInstallLoading || !extSpec.trim()}>
                      {extInstallLoading ? "Installing…" : "Install"}
                    </button>
                  </div>
                  {extInstallMsg && (
                    <p className={`skill-manager__msg ${extInstallOk === true ? "success" : extInstallOk === false ? "error" : ""}`}>
                      {extInstallMsg}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Confirmation dialog */}
          {extConfirm && (
            <div className="skill-manager__confirm-overlay">
              <div className="skill-manager__confirm" role="alertdialog" aria-label="Confirm action">
                <p className="skill-manager__confirm-text">
                  {extConfirm.action === "uninstall"
                    ? <>Are you sure you want to remove <strong>{extConfirm.ext.name}</strong>?</>
                    : <>Are you sure you want to update <strong>{extConfirm.ext.name}</strong>?</>
                  }
                </p>
                <div className="skill-manager__confirm-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExtConfirm(null)}>Cancel</button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={confirmExtAction}
                    style={extConfirm.action === "uninstall" ? { background: "var(--color-error, #dc2626)" } : undefined}
                  >
                    {extConfirm.action === "uninstall" ? "Remove" : "Update"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
