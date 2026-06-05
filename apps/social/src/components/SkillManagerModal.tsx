import React, { useState, useEffect, useCallback } from "react";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";

interface Props {
  onClose: () => void;
}

export function SkillManagerModal({ onClose }: Props) {
  const nodeService = useNodeService();
  const [tab, setTab] = useState<"installed" | "trending" | "search">("installed");
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
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
