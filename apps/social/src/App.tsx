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
  const [searchMode, setSearchMode] = useState<"interest" | "peerId" | "topic">("interest");
  const [isSearching, setIsSearching] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [currentView, setCurrentView] = useState<"chat" | "contacts" | "search" | "profile" | "settings">("chat");
  const [nodeConfig, setNodeConfig] = useState<NodeConfig | null>(null);
  const [relays, setRelays] = useState<RelayConfig[]>([]);
  const [newRelayAddr, setNewRelayAddr] = useState("");
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);
  const [settingsTab, setSettingsTab] = useState<"node" | "app">("node");
  const [humanProfile, setHumanProfile] = useState<any>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileEditForm, setProfileEditForm] = useState({
    displayName: "",
    bio: "",
    gender: "",
    hobbies: "",
    knowledge: "",
  });
  const [advertisedTopics, setAdvertisedTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [searchTopic, setSearchTopic] = useState("");

  // Common topics for discovery
  const suggestedTopics = [
    "music", "tech", "art", "science", "gaming",
    "movies", "books", "travel", "food", "fitness",
    "news", "sports", "fashion", "photography", "coding"
  ];

  // Bootstrap presets for public network (libp2p)
  const [bootstrapPresets, setBootstrapPresets] = useState<string[]>([]);

  // Node status and setup
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>("offline");
  const [showSetup, setShowSetup] = useState(false);
  const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
  const [setupDiscoveryProfile, setSetupDiscoveryProfile] = useState<"lan-fast" | "wan-default">("wan-default");
  const [setupBootstrapPeers, setSetupBootstrapPeers] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [isPublicNetwork, setIsPublicNetwork] = useState(false);

  const messages = useChatMessages(selectedContact);

  // Track connection state
  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(nodeService.isConnected);
    }, 100);
    return () => clearInterval(interval);
  }, [nodeService]);

  // Load node status and config on mount
  useEffect(() => {
    if (!isConnected) return;

    nodeService.getNodeStatus()
      .then((result) => {
        setNodeStatus(result.status);
        setShowSetup(result.status === "offline");
      })
      .catch(() => {
        setShowSetup(true);
      });

    nodeService.getNodeConfig().then((config) => {
      setNodeConfig(config);
      // Set bootstrap presets from config
      const presets = config.bootstrapPresets || [];
      setBootstrapPresets(presets);
      setIsPublicNetwork(presets.length > 0);
    }).catch(console.error);
    nodeService.listRelays().then(setRelays).catch(console.error);

    // Fetch connection status
    nodeService.getConnectionStatus().then((status) => {
      setConnectionStatus(status);
    }).catch(() => {});

    // Fetch profile for peer ID
    nodeService.getProfile().then((profile: any) => {
      if (profile?.owner?.ownerId) {
        setPeerId(profile.owner.ownerId);
      }
    }).catch(() => {});

    // Fetch human profile
    nodeService.getHumanProfile().then((profile) => {
      if (profile) {
        setHumanProfile(profile);
        setProfileEditForm({
          displayName: profile.displayName || "",
          bio: profile.bio || "",
          gender: profile.gender || "",
          hobbies: (profile.hobbies || []).join(", "),
          knowledge: (profile.knowledge || []).join(", "),
        });
      }
    }).catch(() => {});
  }, [nodeService, isConnected]);

  // Listen for node status changes
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = nodeService.on("node:status", (data) => {
      setNodeStatus(data.status);
      setShowSetup(data.status === "offline");
      if (data.peerId) {
        setPeerId(data.peerId);
      }
    });
    return unsubscribe;
  }, [nodeService]);

  const connectionInfo = {
    online: isConnected && nodeStatus === "running",
    peerId: peerId || "QmLoading...",
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
    setIsSearching(true);
    setSearchResults([]);
    try {
      let results: PeerSearchResult[] = [];
      if (searchMode === "peerId") {
        console.log(`[search] Looking up peer ID: ${searchQuery.trim()}`);
        results = await nodeService.searchPeers({ peerId: searchQuery.trim() });
      } else if (searchMode === "topic") {
        console.log(`[search] Querying DHT topic: ${searchQuery.trim()}`);
        results = await nodeService.searchPeers({ topic: searchQuery.trim() });
      } else {
        console.log(`[search] Searching local peers by interest: ${searchQuery}`);
        results = await nodeService.searchPeers({ interests: [searchQuery] });
      }
      console.log(`[search] Found ${results.length} results`);
      setSearchResults(results);
    } catch (error) {
      console.error("[search] Failed:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const hobbies = profileEditForm.hobbies.split(",").map((s) => s.trim()).filter(Boolean);
      const knowledge = profileEditForm.knowledge.split(",").map((s) => s.trim()).filter(Boolean);
      const updated = await nodeService.updateHumanProfile({
        displayName: profileEditForm.displayName,
        bio: profileEditForm.bio,
        gender: profileEditForm.gender,
        hobbies,
        knowledge,
      });
      setHumanProfile(updated);
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  const handleAdvertiseTopic = async () => {
    const topic = newTopic.trim();
    if (!topic) return;
    try {
      await nodeService.advertiseTopic(topic);
      setAdvertisedTopics((prev) => [...prev, topic]);
      setNewTopic("");
      console.log(`[app] Advertised topic: ${topic}`);
    } catch (error) {
      console.error("[app] Failed to advertise topic:", error);
    }
  };

  const handleStopAdvertiseTopic = async (topic: string) => {
    try {
      await nodeService.stopAdvertiseTopic(topic);
      setAdvertisedTopics((prev) => prev.filter((t) => t !== topic));
      console.log(`[app] Stopped advertising topic: ${topic}`);
    } catch (error) {
      console.error("[app] Failed to stop advertising topic:", error);
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

  if (!isConnected) {
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
          {isPublicNetwork && (
            <div className={`network-status ${connectionStatus?.online ? 'public' : 'checking'}`}>
              <span className="status-indicator" />
              <span>{connectionStatus?.online ? 'Public Network' : 'Connecting...'}</span>
            </div>
          )}
          {!isPublicNetwork && (
            <div className="network-status private">
              <span className="status-indicator" />
              <span>Private</span>
            </div>
          )}
          <span className="node-status">{nodeStatus}</span>
          <span className="peer-id">{connectionInfo.peerId.slice(0, 12)}...</span>
          {connectionStatus?.bondedPeers > 0 && (
            <span className="peer-count">{connectionStatus.bondedPeers} peers</span>
          )}
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
            <div className="search-mode-tabs">
              <button
                className={searchMode === "interest" ? "active" : ""}
                onClick={() => setSearchMode("interest")}
              >
                By Interest
              </button>
              <button
                className={searchMode === "peerId" ? "active" : ""}
                onClick={() => setSearchMode("peerId")}
              >
                By Peer ID
              </button>
              <button
                className={searchMode === "topic" ? "active" : ""}
                onClick={() => setSearchMode("topic")}
              >
                By Topic
              </button>
            </div>
            <div className="search-bar">
              <input
                type="text"
                placeholder={
                  searchMode === "peerId"
                    ? "Enter Peer ID (e.g., 12D3KooWSHXmS7N94yFj1...)"
                    : searchMode === "topic"
                    ? "Enter topic (e.g., music, tech, art)"
                    : "Search by interests (e.g., blues, jazz)"
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button onClick={handleSearch} disabled={isSearching} className="search-btn">
                {isSearching ? (
                  <>
                    <span className="search-spinner" />
                    Searching...
                  </>
                ) : (
                  "Search"
                )}
              </button>
            </div>

            {isSearching && (
              <div className="search-status">
                <div className="search-status-content">
                  <span className="search-status-icon">🔍</span>
                  <div>
                    <strong>Searching DHT for "{searchQuery}"</strong>
                    <p>Looking for peers advertising this topic...</p>
                  </div>
                </div>
                <div className="search-status-progress">
                  <div className="progress-bar">
                    <div className="progress-bar-fill" />
                  </div>
                  <span className="progress-text">Querying network...</span>
                </div>
              </div>
            )}

            {searchMode === "topic" && (
              <div className="topic-advertise">
                <h3>Advertise Your Topics</h3>
                <p className="topic-hint">Advertise topics so others can discover you when searching by topic</p>
                <div className="topic-input-row">
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="Enter topic (e.g., music, tech)"
                    onKeyDown={(e) => e.key === "Enter" && handleAdvertiseTopic()}
                  />
                  <button onClick={handleAdvertiseTopic}>Advertise</button>
                </div>
                {advertisedTopics.length > 0 && (
                  <div className="advertised-topics">
                    <span className="advertised-label">Your topics:</span>
                    {advertisedTopics.map((topic) => (
                      <span key={topic} className="topic-tag">
                        {topic}
                        <button onClick={() => handleStopAdvertiseTopic(topic)} className="topic-remove">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {searchMode === "topic" && !searchQuery && (
              <div className="topic-suggestions">
                <h4>Suggested Topics</h4>
                <div className="topic-chips">
                  {suggestedTopics.map((topic) => (
                    <button
                      key={topic}
                      className="topic-chip"
                      onClick={() => {
                        setSearchQuery(topic);
                        setSearchTopic(topic);
                        // Trigger search after setting query
                        setTimeout(() => handleSearch(), 0);
                      }}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isSearching ? (
              <div className="search-loading">
                <div className="spinner"></div>
                <p>Searching {searchMode === "topic" ? "DHT topic..." : searchMode === "peerId" ? "peer ID..." : "local peers..."}</p>
              </div>
            ) : searchResults.length > 0 ? (
              <ul className="search-results">
                {searchResults.map((result) => (
                  <li key={result.nodeId} className="search-result">
                    <span className="avatar">{result.displayName[0]}</span>
                    <div className="result-info">
                      <strong>{result.displayName}</strong>
                      {result.bio && <p>{result.bio}</p>}
                      {result.interests.length > 0 && (
                        <span className="interests">{result.interests.join(", ")}</span>
                      )}
                    </div>
                    <button onClick={() => handleSayHello(result.ownerId)}>
                      Say Hello
                    </button>
                  </li>
                ))}
              </ul>
            ) : searchQuery.trim() ? (
              <div className="search-empty">
                <p>No peers found for "{searchQuery}"</p>
                <small>
                  {searchMode === "topic"
                    ? "Try advertising a topic first. Peers must be advertising the same topic via DHT."
                    : searchMode === "peerId"
                    ? "Check if the peer ID is correct. You may need to be connected to them first."
                    : "You may not have any bonded peers yet. Try saying hello to someone!"}
                </small>
              </div>
            ) : (
              <p className="empty">Enter a {searchMode === "topic" ? "topic" : searchMode === "peerId" ? "peer ID" : "search term"} to find people</p>
            )}
          </div>
        )}

        {currentView === "profile" && (
          <div className="profile-view">
            {isEditingProfile ? (
              <div className="profile-edit">
                <h2>Edit Your Profile</h2>
                <div className="form-group">
                  <label>Display Name</label>
                  <input
                    type="text"
                    value={profileEditForm.displayName}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, displayName: e.target.value })}
                    placeholder="Your name"
                  />
                </div>
                <div className="form-group">
                  <label>Bio</label>
                  <textarea
                    value={profileEditForm.bio}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, bio: e.target.value })}
                    placeholder="Tell us about yourself"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <input
                    type="text"
                    value={profileEditForm.gender}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, gender: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div className="form-group">
                  <label>Hobbies (comma separated)</label>
                  <input
                    type="text"
                    value={profileEditForm.hobbies}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, hobbies: e.target.value })}
                    placeholder="music, travel, cooking"
                  />
                </div>
                <div className="form-group">
                  <label>Knowledge (comma separated)</label>
                  <input
                    type="text"
                    value={profileEditForm.knowledge}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, knowledge: e.target.value })}
                    placeholder="music, tech, art"
                  />
                </div>
                <div className="profile-edit-actions">
                  <button onClick={handleSaveProfile} className="btn-primary">Save</button>
                  <button onClick={() => setIsEditingProfile(false)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="profile-display">
                <div className="profile-header">
                  <div className="profile-avatar">
                    {humanProfile?.displayName?.[0] ?? connectionInfo.peerId?.[0] ?? "?"}
                  </div>
                  <div className="profile-header-info">
                    <h2>{humanProfile?.displayName || "Unnamed Peer"}</h2>
                    <p className="profile-owner-id">{connectionInfo.peerId}</p>
                  </div>
                </div>
                <div className="profile-actions">
                  <button onClick={() => setIsEditingProfile(true)} className="btn-secondary">
                    Edit Profile
                  </button>
                </div>
                <div className="profile-section">
                  <h3>About</h3>
                  <p className="profile-bio">{humanProfile?.bio || "No bio yet"}</p>
                </div>
                {humanProfile?.gender && (
                  <div className="profile-section">
                    <h3>Gender</h3>
                    <p>{humanProfile.gender}</p>
                  </div>
                )}
                {humanProfile?.hobbies?.length > 0 && (
                  <div className="profile-section">
                    <h3>Hobbies</h3>
                    <div className="profile-tags">
                      {humanProfile.hobbies.map((h: string, i: number) => (
                        <span key={i} className="tag">{h}</span>
                      ))}
                    </div>
                  </div>
                )}
                {humanProfile?.knowledge?.length > 0 && (
                  <div className="profile-section">
                    <h3>Knowledge</h3>
                    <div className="profile-tags">
                      {humanProfile.knowledge.map((k: string, i: number) => (
                        <span key={i} className="tag knowledge">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="profile-section">
                  <h3>Connection Info</h3>
                  <dl className="profile-info">
                    <dt>Peer ID</dt>
                    <dd><code className="peer-id-display">{connectionInfo.peerId}</code></dd>
                    <dt>Node Status</dt>
                    <dd>{nodeStatus}</dd>
                    <dt>Connected Peers</dt>
                    <dd>{bonds.length}</dd>
                  </dl>
                </div>
              </div>
            )}
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
                  <h3>Public Network (libp2p)</h3>
                  <p className="section-desc">
                    Enable to connect to the public libp2p network and discover peers globally.
                    Disable to use only your private relay servers.
                  </p>
                  <div className="bootstrap-presets">
                      {[
                        { id: "public-libp2p", label: "public-libp2p", desc: "4 bootstrap servers" },
                        { id: "public-libp2p-am6", label: "public-libp2p-am6", desc: "1 server (AM6)" },
                        { id: "public-libp2p-am7", label: "public-libp2p-am7", desc: "1 server (AM7)" },
                      ].map((preset) => (
                        <label key={preset.id} className="preset-checkbox">
                          <input
                            type="checkbox"
                            checked={bootstrapPresets.includes(preset.id)}
                            onChange={async () => {
                              const updated = bootstrapPresets.includes(preset.id)
                                ? bootstrapPresets.filter(p => p !== preset.id)
                                : [...bootstrapPresets, preset.id];
                              setBootstrapPresets(updated);
                              await nodeService.updateNodeConfig({ bootstrapPresets: updated });
                              // Restart node to apply new bootstrap presets (enables DHT)
                              try {
                                await nodeService.stopNode();
                                await nodeService.startNode();
                              } catch (e) {
                                console.error("[app] Failed to restart node:", e);
                              }
                              nodeService.getNodeConfig().then(setNodeConfig).catch(console.error);
                            }}
                          />
                          <span className="preset-info">
                            <strong>{preset.label}</strong>
                            <span className="preset-desc">{preset.desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>

                <section className="settings-section">
                  <h3>Configured Relays</h3>
                  {relays.length === 0 ? (
                    <p className="empty">No relays configured</p>
                  ) : (
                    <ul className="relay-list">
                      {relays.map((relay) => (
                        <li key={relay.relayId} className="relay-item">
                          <label className="relay-toggle">
                            <input
                              type="checkbox"
                              checked={relay.enabled}
                              onChange={async () => {
                                const updatedRelays = relays.map(r =>
                                  r.relayId === relay.relayId
                                    ? { ...r, enabled: !r.enabled }
                                    : r
                                );
                                await nodeService.updateNodeConfig({ configuredRelays: updatedRelays });
                                setRelays(updatedRelays);
                              }}
                            />
                            <span className="relay-info">
                              <strong>{relay.addr}</strong>
                              {relay.level !== undefined && <span className="relay-level">Level {relay.level}</span>}
                              {relay.region && <span className="relay-region">{relay.region}</span>}
                            </span>
                          </label>
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
