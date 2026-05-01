import { useState, useEffect } from "react";
import { useNodeService, useHelloRequests, useBonds, useChatMessages } from "./hooks/useNodeService.js";
import type { PeerSearchResult, HelloProfile, NodeConfig, RelayConfig, NodeStatus } from "@envoymesh/api";

// App-level settings
interface AppSettings {
  wsUrl: string;
  autoConnect: boolean;
  notificationsEnabled: boolean;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  wsUrl: "ws://localhost:3030/ws",
  autoConnect: true,
  notificationsEnabled: true,
};

function loadAppSettings(): AppSettings {
  try {
    const stored = localStorage.getItem("envoymesh:app-settings");
    if (stored) {
      return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_APP_SETTINGS;
}

function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem("envoymesh:app-settings", JSON.stringify(settings));
}

function App() {
  const nodeService = useNodeService();
  const bonds = useBonds();
  const { requests: pendingHellOs, accept, decline } = useHelloRequests();

  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PeerSearchResult[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [currentView, setCurrentView] = useState<"chat" | "contacts" | "search" | "profile" | "settings">("chat");
  const [nodeConfig, setNodeConfig] = useState<NodeConfig | null>(null);
  const [relays, setRelays] = useState<RelayConfig[]>([]);
  const [newRelayAddr, setNewRelayAddr] = useState("");
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);
  const [settingsTab, setSettingsTab] = useState<"node" | "app">("node");

  // Node status and setup
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>("offline");
  const [showSetup, setShowSetup] = useState(false);
  const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
  const [setupDiscoveryProfile, setSetupDiscoveryProfile] = useState<"lan-fast" | "wan-default">("wan-default");
  const [setupBootstrapPeers, setSetupBootstrapPeers] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);

  const messages = useChatMessages(selectedContact);

  // Load node status and config on mount
  useEffect(() => {
    if (!nodeService.isConnected) return;

    nodeService.getNodeStatus()
      .then((result) => {
        setNodeStatus(result.status);
        setShowSetup(result.status === "offline");
      })
      .catch(() => {
        setShowSetup(true);
      });

    nodeService.getNodeConfig().then(setNodeConfig).catch(console.error);
    nodeService.listRelays().then(setRelays).catch(console.error);
  }, [nodeService, nodeService.isConnected]);

  // Listen for node status changes
  useEffect(() => {
    const unsubscribe = nodeService.on("node:status", (data) => {
      setNodeStatus(data.status);
      setShowSetup(data.status === "offline");
    });
    return unsubscribe;
  }, [nodeService]);

  const connectionInfo = {
    online: nodeService.isConnected && nodeStatus === "running",
    peerId: "QmLoading...", // Will be fetched from getProfile
    multiaddrs: [] as string[],
    connectedRelays: [] as string[],
    bondedPeers: bonds.length,
  };

  const handleInitializeNode = async () => {
    if (!setupProfileDir.trim()) return;
    setIsInitializing(true);
    try {
      const bootstrapPeers = setupBootstrapPeers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await nodeService.initNode(setupProfileDir, {
        discoveryProfile: setupDiscoveryProfile,
        bootstrapPeers,
      });
      setShowSetup(false);
      // Start the node
      await nodeService.startNode();
    } catch (error) {
      console.error("Failed to initialize node:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleStartNode = async () => {
    try {
      await nodeService.startNode();
    } catch (error) {
      console.error("Failed to start node:", error);
    }
  };

  const handleStopNode = async () => {
    try {
      await nodeService.stopNode();
    } catch (error) {
      console.error("Failed to stop node:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedContact) return;
    try {
      await nodeService.sendChat(selectedContact, chatInput);
      setChatInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleAcceptHello = async (messageId: string) => {
    try {
      await accept(messageId);
    } catch (error) {
      console.error("Failed to accept hello:", error);
    }
  };

  const handleDeclineHello = async (messageId: string, reason?: string) => {
    try {
      await decline(messageId, reason);
    } catch (error) {
      console.error("Failed to decline hello:", error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await nodeService.searchPeers({ interests: [searchQuery] });
      setSearchResults(results);
    } catch (error) {
      console.error("Failed to search:", error);
      setSearchResults([]);
    }
  };

  const handleSayHello = async (targetOwnerId: string) => {
    try {
      const profile: HelloProfile = {
        displayName: "Your Name", // TODO: get from human profile
        interests: [],
        whatShares: [],
      };
      await nodeService.sendHello(targetOwnerId, profile, "Hello!");
    } catch (error) {
      console.error("Failed to send hello:", error);
    }
  };

  if (!nodeService.isConnected) {
    return (
      <div className="app">
        <div className="loading">Connecting to Envoy...</div>
      </div>
    );
  }

  if (showSetup || nodeStatus === "offline") {
    return (
      <div className="app">
        <div className="setup-view">
          <h1>Welcome to Envoy</h1>
          <p className="muted">Set up your Envoy node to join the network</p>

          <div className="setup-form">
            <div className="form-group">
              <label>Profile Directory</label>
              <input
                type="text"
                value={setupProfileDir}
                onChange={(e) => setSetupProfileDir(e.target.value)}
                placeholder="./data/default"
              />
              <small>Where your identity and data will be stored</small>
            </div>

            <div className="form-group">
              <label>Discovery Profile</label>
              <select
                value={setupDiscoveryProfile}
                onChange={(e) => setSetupDiscoveryProfile(e.target.value as "lan-fast" | "wan-default")}
              >
                <option value="lan-fast">LAN Fast (local network only)</option>
                <option value="wan-default">WAN Default (connect to wider network)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Bootstrap Peers (optional)</label>
              <input
                type="text"
                value={setupBootstrapPeers}
                onChange={(e) => setSetupBootstrapPeers(e.target.value)}
                placeholder="/ip4/1.2.3.4/tcp/4001/p2p/Qm..., /dnsaddr/example.com/..."
              />
              <small>Comma-separated list of peer addresses to connect to</small>
            </div>

            <button
              className="primary"
              onClick={handleInitializeNode}
              disabled={isInitializing || !setupProfileDir.trim()}
            >
              {isInitializing ? "Initializing..." : "Initialize Node"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Envoy</h1>
        </div>
        <nav className="header-nav">
          <button
            className={currentView === "chat" ? "active" : ""}
            onClick={() => setCurrentView("chat")}
          >
            Chat
          </button>
          <button
            className={currentView === "contacts" ? "active" : ""}
            onClick={() => setCurrentView("contacts")}
          >
            Contacts ({bonds.length})
          </button>
          <button
            className={currentView === "search" ? "active" : ""}
            onClick={() => setCurrentView("search")}
          >
            Search
          </button>
          <button
            className={currentView === "profile" ? "active" : ""}
            onClick={() => setCurrentView("profile")}
          >
            Profile
          </button>
          <button
            className={currentView === "settings" ? "active" : ""}
            onClick={() => setCurrentView("settings")}
          >
            Settings
          </button>
        </nav>
        <div className="header-right">
          <span className={`status-dot ${nodeStatus === "running" ? "online" : nodeStatus === "starting" ? "starting" : "offline"}`} />
          <span className="node-status">{nodeStatus}</span>
          <span className="peer-id">{connectionInfo.peerId.slice(0, 12)}...</span>
        </div>
      </header>

      <main className="main">
        {currentView === "chat" && (
          <div className="chat-view">
            <aside className="contact-list">
              <h3>Contacts</h3>
              {bonds.length === 0 ? (
                <p className="empty">No contacts yet. Search to find people!</p>
              ) : (
                bonds.map((contact) => (
                  <button
                    key={contact.peerOwnerId}
                    className={selectedContact === contact.peerOwnerId ? "active" : ""}
                    onClick={() => setSelectedContact(contact.peerOwnerId)}
                  >
                    <span className="avatar">{contact.displayName?.[0] ?? "?"}</span>
                    <span className="name">{contact.displayName ?? contact.peerOwnerId}</span>
                  </button>
                ))
              )}
            </aside>

            <section className="chat-area">
              {selectedContact ? (
                <>
                  <header className="chat-header">
                    <span className="chat-name">
                      {bonds.find((c) => c.peerOwnerId === selectedContact)?.displayName ?? selectedContact}
                    </span>
                  </header>
                  <div className="messages">
                    {messages.length === 0 ? (
                      <p className="empty">No messages yet. Say hello!</p>
                    ) : (
                      messages.map((msg) => (
                        <div key={msg.messageId} className="message">
                          <span className="message-text">{msg.content.text}</span>
                          <span className="message-time">
                            {new Date(msg.metadata.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <footer className="chat-input">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    />
                    <button onClick={handleSendMessage}>Send</button>
                  </footer>
                </>
              ) : (
                <div className="no-chat-selected">
                  <p>Select a contact to start chatting</p>
                </div>
              )}
            </section>
          </div>
        )}

        {currentView === "contacts" && (
          <div className="contacts-view">
            <h2>Your Contacts</h2>
            {bonds.length === 0 ? (
              <p className="empty">No contacts yet. Use Search to find people!</p>
            ) : (
              <ul className="contact-cards">
                {bonds.map((contact) => (
                  <li key={contact.peerOwnerId} className="contact-card">
                    <span className="avatar large">{contact.displayName?.[0] ?? "?"}</span>
                    <div className="contact-info">
                      <strong>{contact.displayName ?? contact.peerOwnerId}</strong>
                      <span className="bond-level">{contact.level}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {currentView === "search" && (
          <div className="search-view">
            <h2>Find People</h2>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search by interests (e.g., blues, jazz)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button onClick={handleSearch}>Search</button>
            </div>
            {searchResults.length > 0 ? (
              <ul className="search-results">
                {searchResults.map((result) => (
                  <li key={result.nodeId} className="search-result">
                    <span className="avatar">{result.displayName[0]}</span>
                    <div className="result-info">
                      <strong>{result.displayName}</strong>
                      {result.bio && <p>{result.bio}</p>}
                      <span className="interests">{result.interests.join(", ")}</span>
                    </div>
                    <button onClick={() => handleSayHello(result.ownerId)}>
                      Say Hello
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Search for people by their interests</p>
            )}
          </div>
        )}

        {currentView === "profile" && (
          <div className="profile-view">
            <h2>Your Profile</h2>
            <p className="muted">Profile editing coming soon</p>
            <dl className="profile-info">
              <dt>Your Peer ID</dt>
              <dd><code>{connectionInfo.peerId}</code></dd>
            </dl>
          </div>
        )}

        {currentView === "settings" && (
          <div className="settings-view">
            <h2>Settings</h2>

            <div className="settings-tabs">
              <button
                className={settingsTab === "node" ? "active" : ""}
                onClick={() => setSettingsTab("node")}
              >
                Node
              </button>
              <button
                className={settingsTab === "app" ? "active" : ""}
                onClick={() => setSettingsTab("app")}
              >
                App
              </button>
            </div>

            {settingsTab === "node" && (
              <>
                <section className="settings-section">
                  <h3>Node Control</h3>
                  <dl className="settings-list">
                    <dt>Status</dt>
                    <dd className={`status-${nodeStatus}`}>
                      <span className={`status-dot ${nodeStatus === "running" ? "online" : nodeStatus === "starting" ? "starting" : "offline"}`} />
                      {nodeStatus.charAt(0).toUpperCase() + nodeStatus.slice(1)}
                    </dd>

                    <dt>Profile Directory</dt>
                    <dd>{nodeConfig?.profileDir ?? "Loading..."}</dd>

                    <dt>Peer ID</dt>
                    <dd><code>{connectionInfo.peerId || "Not connected"}</code></dd>
                  </dl>

                  <div className="node-controls">
                    {nodeStatus === "running" ? (
                      <button onClick={handleStopNode}>
                        Stop Node
                      </button>
                    ) : (
                      <button onClick={handleStartNode}>
                        Start Node
                      </button>
                    )}
                  </div>
                </section>

                <section className="settings-section">
                  <h3>Relay Configuration</h3>
                  <dl className="settings-list">
                    <dt>Discovery Profile</dt>
                    <dd>{nodeConfig?.discoveryProfile ?? "Loading..."}</dd>

                    <dt>Relay Enabled</dt>
                    <dd>{nodeConfig?.relayEnabled ? "Yes" : "No"}</dd>

                    <dt>Relay Server Enabled</dt>
                    <dd>{nodeConfig?.relayServerEnabled ? "Yes" : "No"}</dd>

                    <dt>Advertised Addresses</dt>
                    <dd>
                      {nodeConfig?.advertiseAddrs.length ? (
                        <ul>{nodeConfig.advertiseAddrs.map((addr, i) => <li key={i}><code>{addr}</code></li>)}</ul>
                      ) : "None"}
                    </dd>

                    <dt>Bootstrap Peers</dt>
                    <dd>
                      {nodeConfig?.bootstrapPeers.length ? (
                        <ul>{nodeConfig.bootstrapPeers.map((peer, i) => <li key={i}><code>{peer}</code></li>)}</ul>
                      ) : "None"}
                    </dd>
                  </dl>
                </section>

                <section className="settings-section">
                  <h3>Configured Relays</h3>
                  {relays.length === 0 ? (
                    <p className="empty">No relays configured</p>
                  ) : (
                    <ul className="relay-list">
                      {relays.map((relay) => (
                        <li key={relay.relayId} className="relay-item">
                          <span className="relay-info">
                            <strong>{relay.addr}</strong>
                            {relay.level !== undefined && <span className="relay-level">Level {relay.level}</span>}
                            {relay.region && <span className="relay-region">{relay.region}</span>}
                          </span>
                          <button
                            className="remove-relay"
                            onClick={async () => {
                              await nodeService.removeRelay(relay.relayId);
                              setRelays(relays.filter(r => r.relayId !== relay.relayId));
                            }}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="add-relay-form">
                    <h4>Add Relay</h4>
                    <input
                      type="text"
                      placeholder="Relay address (e.g., /ip4/1.2.3.4/tcp/4001)"
                      value={newRelayAddr}
                      onChange={(e) => setNewRelayAddr(e.target.value)}
                    />
                    <button
                      onClick={async () => {
                        if (!newRelayAddr.trim()) return;
                        try {
                          const relay = await nodeService.addRelay(newRelayAddr);
                          setRelays([...relays, relay]);
                          setNewRelayAddr("");
                        } catch (error) {
                          console.error("Failed to add relay:", error);
                        }
                      }}
                    >
                      Add
                    </button>
                  </div>
                </section>
              </>
            )}

            {settingsTab === "app" && (
              <section className="settings-section">
                <h3>App Settings</h3>
                <dl className="settings-list">
                  <dt>WebSocket URL</dt>
                  <dd>
                    <input
                      type="text"
                      className="settings-input"
                      value={appSettings.wsUrl}
                      onChange={(e) => {
                        const newSettings = { ...appSettings, wsUrl: e.target.value };
                        setAppSettings(newSettings);
                        saveAppSettings(newSettings);
                      }}
                    />
                  </dd>

                  <dt>Auto Connect</dt>
                  <dd>
                    <input
                      type="checkbox"
                      checked={appSettings.autoConnect}
                      onChange={(e) => {
                        const newSettings = { ...appSettings, autoConnect: e.target.checked };
                        setAppSettings(newSettings);
                        saveAppSettings(newSettings);
                      }}
                    />
                    <label>Connect automatically on startup</label>
                  </dd>

                  <dt>Notifications</dt>
                  <dd>
                    <input
                      type="checkbox"
                      checked={appSettings.notificationsEnabled}
                      onChange={(e) => {
                        const newSettings = { ...appSettings, notificationsEnabled: e.target.checked };
                        setAppSettings(newSettings);
                        saveAppSettings(newSettings);
                      }}
                    />
                    <label>Enable notifications for new messages</label>
                  </dd>
                </dl>
              </section>
            )}
          </div>
        )}
      </main>

      {pendingHellOs.length > 0 && (
        <aside className="hello-requests">
          <h3>Hello Requests ({pendingHellOs.length})</h3>
          {pendingHellOs.map((request) => (
            <div key={request.messageId} className="hello-card">
              <span className="avatar">{request.profile.displayName[0]}</span>
              <div className="hello-info">
                <strong>{request.profile.displayName}</strong>
                {request.profile.bio && <p>{request.profile.bio}</p>}
                <span className="interests">{request.profile.interests.join(", ")}</span>
              </div>
              <div className="hello-actions">
                <button className="accept" onClick={() => handleAcceptHello(request.messageId)}>
                  Accept
                </button>
                <button className="decline" onClick={() => handleDeclineHello(request.messageId)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

export { App };
