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

// Preset capabilities for rendezvous discovery
type CapabilityTag = { tag: string };
type CapabilityType = { type: string; params?: Record<string, unknown>; confidence?: number };
type CapabilityDescriptor = { descriptor: string };
type Capability = CapabilityTag | CapabilityType | CapabilityDescriptor;

interface PresetCapabilityGroup {
  label: string;
  capabilities: Array<{ tag: string; label: string; description?: string }>;
}

const PRESET_CAPABILITY_GROUPS: PresetCapabilityGroup[] = [
  {
    label: "Services",
    capabilities: [
      { tag: "document-search", label: "Document Search", description: "Can search and retrieve documents" },
      { tag: "coding-help", label: "Coding Help", description: "Assists with programming tasks" },
      { tag: "translation", label: "Translation", description: "Language translation service" },
      { tag: "data-analysis", label: "Data Analysis", description: "Analyzes and visualizes data" },
    ],
  },
  {
    label: "Languages",
    capabilities: [
      { tag: "lang:en", label: "English", description: "English language proficiency" },
      { tag: "lang:zh", label: "Chinese", description: "Chinese language proficiency" },
      { tag: "lang:es", label: "Spanish", description: "Spanish language proficiency" },
      { tag: "lang:fr", label: "French", description: "French language proficiency" },
      { tag: "lang:de", label: "German", description: "German language proficiency" },
      { tag: "lang:ja", label: "Japanese", description: "Japanese language proficiency" },
    ],
  },
  {
    label: "Expertise",
    capabilities: [
      { tag: "expertise:python", label: "Python", description: "Python programming" },
      { tag: "expertise:javascript", label: "JavaScript", description: "JavaScript/TypeScript programming" },
      { tag: "expertise:typescript", label: "TypeScript", description: "TypeScript programming" },
      { tag: "expertise:rust", label: "Rust", description: "Rust programming" },
      { tag: "expertise:go", label: "Go", description: "Go programming" },
      { tag: "expertise:ai", label: "AI/ML", description: "Artificial intelligence and machine learning" },
    ],
  },
  {
    label: "Resources",
    capabilities: [
      { tag: "vault-access:finance", label: "Finance Vault", description: "Access to financial documents" },
      { tag: "vault-access:legal", label: "Legal Vault", description: "Access to legal documents" },
      { tag: "compute-gpu", label: "GPU Compute", description: "GPU-accelerated computing" },
    ],
  },
];

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
  const [currentView, setCurrentView] = useState<"chat" | "contacts" | "search" | "profile" | "settings" | "inbox">("chat");
  const [nodeConfig, setNodeConfig] = useState<NodeConfig | null>(null);
  const [relays, setRelays] = useState<RelayConfig[]>([]);
  const [newRelayAddr, setNewRelayAddr] = useState("");
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);
  const [settingsTab, setSettingsTab] = useState<"node" | "app">("node");
  const [humanProfile, setHumanProfile] = useState<any>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileEditForm, setProfileEditForm] = useState({
    displayName: "",
    username: "",
    bio: "",
    gender: "",
    hobbies: "",
    knowledge: "",
    profileVisibility: "public" as "public" | "private",
  });
  const [advertisedTopics, setAdvertisedTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");

  // Selected capabilities for rendezvous discovery
  const [selectedCapabilities, setSelectedCapabilities] = useState<Capability[]>([]);

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
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [isPublicNetwork, setIsPublicNetwork] = useState(false);

  // Discovered peers (mDNS / DHT found but not bonded)
  const [discoveredPeers, setDiscoveredPeers] = useState<Array<{ peerId: string; displayName?: string; lastSeen?: string }>>([]);
  const [showAroundMe, setShowAroundMe] = useState(false);

  // Inbox: pending hello requests and notifications
  const [inboxRequests, setInboxRequests] = useState<any[]>([]);
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const [showInbox, setShowInbox] = useState(false);

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
          username: profile.username || "",
          bio: profile.bio || "",
          gender: profile.gender || "",
          hobbies: (profile.hobbies || []).join(", "),
          knowledge: (profile.knowledge || []).join(", "),
          profileVisibility: profile.profileVisibility || "private",
        });
        // Load capabilities from profile
        if (profile.capabilities && Array.isArray(profile.capabilities)) {
          setSelectedCapabilities(profile.capabilities);
        }
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

  // Listen for discovered peers (mDNS / DHT found)
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = nodeService.on("peer:discovered", (data) => {
      setDiscoveredPeers((prev) => {
        // Don't add if already bonded
        if (bonds.some((b) => b.peerOwnerId === data.ownerId)) return prev;
        // Don't add duplicates
        if (prev.some((p) => p.peerId === data.nodeId)) return prev;
        return [...prev, {
          peerId: data.nodeId,
          displayName: data.displayName,
          lastSeen: new Date().toISOString(),
        }];
      });
    });
    return unsubscribe;
  }, [nodeService, bonds]);

  // Listen for hello:request events (inbox)
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = nodeService.on("hello:request", (data) => {
      setInboxRequests((prev) => {
        // Don't add duplicates
        if (prev.some((r) => r.messageId === data.messageId)) return prev;
        return [...prev, data];
      });
      setShowInbox(true);
    });
    return unsubscribe;
  }, [nodeService]);

  // Listen for pending messages (before bond is established)
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = nodeService.on("chat:message", (data) => {
      const msg = data as any;
      // Check if this peer is NOT already bonded
      const isBonded = bonds.some(
        (b) =>
          b.peerOwnerId === msg.sender.nodeId ||
          b.peerOwnerId === msg.sender.ownerId ||
          b.peerOwnerId === msg.sender.displayName,
      );
      if (!isBonded) {
        setPendingMessages((prev) => {
          // Don't add duplicates
          if (prev.some((m) => m.messageId === msg.messageId)) return prev;
          return [...prev, msg];
        });
      }
    });
    return unsubscribe;
  }, [nodeService, bonds]);

  // When a bond is established, remove any pending messages from that peer since they'll now use normal chat
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = nodeService.on("bond:established", (data) => {
      const { peerOwnerId } = data as { peerOwnerId: string };
      setPendingMessages((prev) =>
        prev.filter((m) => m.sender.ownerId !== peerOwnerId && m.sender.nodeId !== peerOwnerId && m.sender.displayName !== peerOwnerId),
      );
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
    console.log(`[handleSendMessage] selectedContact=${selectedContact}, chatInput=${chatInput}`);
    if (!chatInput.trim() || !selectedContact) {
      console.log(`[handleSendMessage] early return - missing contact or empty input`);
      return;
    }
    try {
      await nodeService.sendChat(selectedContact, chatInput);
      setChatInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleRevokeBond = async (peerOwnerId: string) => {
    if (!confirm("Are you sure you want to remove this contact?")) return;
    try {
      await nodeService.revokeBond(peerOwnerId);
      if (selectedContact === peerOwnerId) {
        setSelectedContact(null);
      }
    } catch (error) {
      console.error("Failed to revoke bond:", error);
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
      const query = searchQuery.trim();

      if (searchMode === "peerId") {
        console.log(`[search] Looking up peer ID: ${query}`);
        results = await nodeService.searchPeers({ peerId: query });
      } else if (searchMode === "interest") {
        // Always search by interest when in interest mode
        console.log(`[search] Searching by interest: ${query}`);
        // Also search by username if query looks like a username (single word, no spaces)
        const searchQuery2 = query.toLowerCase();
        results = await nodeService.searchPeers({
          interests: [searchQuery2],
          username: searchQuery2,
        });
      } else {
        // Default: treat as interest
        console.log(`[search] Searching by interest: ${query}`);
        results = await nodeService.searchPeers({ interests: [query.toLowerCase()] });
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
    // Validation
    if (!profileEditForm.displayName.trim()) {
      alert("Display name is required");
      return;
    }
    if (!profileEditForm.username.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(profileEditForm.username.trim())) {
      alert("Username is required. 3-30 characters, letters, numbers, underscore only.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const interests = profileEditForm.hobbies.split(",").map((s) => s.trim()).filter(Boolean);
      const updated = await nodeService.updateHumanProfile({
        displayName: profileEditForm.displayName.trim(),
        username: profileEditForm.username.trim(),
        bio: profileEditForm.bio,
        gender: profileEditForm.gender,
        hobbies: interests,
        profileVisibility: profileEditForm.profileVisibility,
        capabilities: selectedCapabilities,
      });

      setHumanProfile(updated);
      setIsEditingProfile(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile";
      console.error("Failed to update profile:", error);
      alert(message);
    } finally {
      setIsSavingProfile(false);
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
        displayName: humanProfile?.displayName || "Envoy User",
        bio: humanProfile?.bio || "",
        interests: (humanProfile?.hobbies || []).concat(humanProfile?.knowledge || []),
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
          <img src="/assets/logo.svg" alt="Envoy" className="logo" />
          <span className="logo-text">Envoy</span>
        </div>
        <nav className="header-nav">
          <button
            className={`${currentView === "chat" ? "active" : ""} ${inboxRequests.length > 0 ? "has-inbox" : ""}`}
            onClick={() => setCurrentView("chat")}
          >
            Chat {inboxRequests.length > 0 && <span className="inbox-badge">{inboxRequests.length}</span>}
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
          <span className="node-name" title={connectionInfo.peerId}>{humanProfile?.displayName || humanProfile?.username || connectionInfo.peerId.slice(0, 8) + "..."}</span>
          {connectionStatus?.bondedPeers > 0 && (
            <span className="peer-count">{connectionStatus.bondedPeers} peers</span>
          )}
        </div>
      </header>

      <main className="main">
        {currentView === "chat" && (
          <div className="chat-view">
            <aside className="contact-list">
              <div className="contact-list-header">
                <h3>Contacts</h3>
                <span className="inbox-count">{inboxRequests.length} pending</span>
              </div>
              <div className="inbox-section">
                <h4>Inbox</h4>
                {inboxRequests.length === 0 ? (
                  <p className="empty inbox-empty-text">No pending requests</p>
                ) : (
                  inboxRequests.map((request) => (
                    <div key={request.messageId} className="inbox-mini-card">
                      <span className="avatar small">{request.profile.displayName[0]}</span>
                      <div className="inbox-mini-info">
                        <strong>{request.profile.displayName}</strong>
                        <span className="owner-id">{request.sender.ownerId.slice(0, 12)}...</span>
                      </div>
                      <div className="inbox-mini-actions">
                        <button
                          className="accept small"
                          onClick={() => {
                            handleAcceptHello(request.messageId);
                            setInboxRequests((prev) => prev.filter((r) => r.messageId !== request.messageId));
                          }}
                        >
                          ✓
                        </button>
                        <button
                          className="decline small"
                          onClick={() => {
                            handleDeclineHello(request.messageId);
                            setInboxRequests((prev) => prev.filter((r) => r.messageId !== request.messageId));
                          }}
                        >
                          ✗
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {pendingMessages.length > 0 && (
                <div className="pending-messages-section">
                  <h4>Pending Messages</h4>
                  {pendingMessages.map((msg) => (
                    <div key={msg.messageId} className="pending-message-card">
                      <span className="avatar small">{msg.sender.displayName?.[0] ?? "?"}</span>
                      <div className="pending-message-info">
                        <strong>{msg.sender.displayName ?? msg.sender.nodeId}</strong>
                        <span className="message-preview">{msg.content?.text?.slice(0, 30)}...</span>
                      </div>
                      <button
                        className="say-hello-btn small"
                        onClick={() => handleSayHello(msg.sender.nodeId)}
                      >
                        Say Hello
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {bonds.length === 0 && inboxRequests.length === 0 && pendingMessages.length === 0 ? (
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
            <div className="contacts-header">
              <h2>Your Contacts</h2>
              <div className="around-me-toggle">
                <button
                  className={`around-me-btn ${showAroundMe ? 'active' : ''}`}
                  onClick={() => setShowAroundMe(!showAroundMe)}
                >
                  Around Me {discoveredPeers.length > 0 && <span className="badge">{discoveredPeers.length}</span>}
                </button>
              </div>
            </div>

            {showAroundMe && (
              <div className="around-me-section">
                <h3>Discovered Peers</h3>
                {discoveredPeers.length === 0 ? (
                  <p className="empty">No peers discovered yet. Keep your node running to discover nearby peers.</p>
                ) : (
                  <ul className="around-me-list">
                    {discoveredPeers.map((peer) => (
                      <li key={peer.peerId} className="around-me-item">
                        <span className="avatar">{peer.displayName?.[0] ?? "?"}</span>
                        <div className="peer-info">
                          <strong>{peer.displayName || "Unknown Peer"}</strong>
                          <span className="peer-id">{peer.peerId.slice(0, 12)}...</span>
                        </div>
                        <button
                          className="say-hello-btn"
                          onClick={() => handleSayHello(peer.peerId)}
                        >
                          Say Hello
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {bonds.length === 0 && !showAroundMe ? (
              <p className="empty">No contacts yet. Use Search to find people, or check Around Me for discovered peers.</p>
            ) : (
              <ul className="contact-cards">
                {bonds.map((contact) => (
                  <li key={contact.peerOwnerId} className="contact-card">
                    <span className="avatar large">{contact.displayName?.[0] ?? "?"}</span>
                    <div className="contact-info">
                      <strong>{contact.displayName ?? contact.peerOwnerId}</strong>
                      <span className="bond-level">{contact.level}</span>
                    </div>
                    <button
                      className="remove-contact"
                      onClick={() => handleRevokeBond(contact.peerOwnerId)}
                      title="Remove contact"
                    >
                      ×
                    </button>
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
            </div>
            <div className="search-bar">
              <input
                type="text"
                placeholder={
                  searchMode === "peerId"
                    ? "Enter Peer ID (e.g., 12D3KooWSHXmS7N94yFj1...)"
                    : "Enter username or interest (e.g., alice, music)"
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
                    <strong>Searching for "{searchQuery}"</strong>
                    <p>Looking for peers with this interest...</p>
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

            {searchMode === "interest" && !searchQuery && (
              <div className="topic-suggestions">
                <h4>Suggested Interests</h4>
                <div className="topic-chips">
                  {suggestedTopics.map((topic) => (
                    <button
                      key={topic}
                      className="topic-chip"
                      onClick={() => {
                        setSearchQuery(topic);
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
                <p>Searching {searchMode === "peerId" ? "peer ID..." : "by interest..."}</p>
              </div>
            ) : searchResults.length > 0 ? (
              <ul className="search-results">
                {searchResults.map((result) => (
                  <li key={result.nodeId} className="search-result">
                    <span className="avatar">{result.displayName[0]}</span>
                    <div className="result-info">
                      <strong>{result.displayName}</strong>
                      {result.username && <span className="result-username">@{result.username}</span>}
                      {result.bio && <p>{result.bio}</p>}
                      {result.interests.length > 0 && (
                        <span className="interests">{result.interests.join(", ")}</span>
                      )}
                    </div>
                    <button onClick={() => handleSayHello(result.nodeId)}>
                      Say Hello
                    </button>
                  </li>
                ))}
              </ul>
            ) : searchQuery.trim() ? (
              <div className="search-empty">
                <p>No peers found for "{searchQuery}"</p>
                <small>
                  {searchMode === "peerId"
                    ? "Check if the peer ID is correct. You may need to be connected to them first."
                    : "Try a different interest or check your connection to the network."}
                </small>
              </div>
            ) : (
              <p className="empty">Enter an interest to find people</p>
            )}
          </div>
        )}

        {currentView === "profile" && (
          <div className="profile-view">
            {isEditingProfile ? (
              <div className="profile-edit">
                <h2>Edit Your Profile</h2>
                <div className="form-group avatar-upload">
                  <label>Photo</label>
                  <div className="avatar-preview">
                    <div className="profile-avatar large">
                      {humanProfile?.displayName?.[0] ?? connectionInfo.peerId?.[0] ?? "?"}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // For now, just show a preview - actual upload would need backend
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            // Could store base64 or blob URL for preview
                            console.log("Avatar selected:", file.name);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      id="avatar-input"
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => document.getElementById("avatar-input")?.click()}
                    >
                      Choose Photo
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Display Name <span className="required">*</span></label>
                  <input
                    type="text"
                    value={profileEditForm.displayName}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, displayName: e.target.value })}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Username <span className="required">*</span></label>
                  <input
                    type="text"
                    value={profileEditForm.username}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, username: e.target.value })}
                    placeholder="johndoe"
                    required
                    pattern="^[a-zA-Z0-9_]{3,30}$"
                  />
                  <small>Used for DHT discovery. 3-30 characters, letters, numbers, underscore only.</small>
                </div>
                <div className="form-group">
                  <label>Introduction</label>
                  <textarea
                    value={profileEditForm.bio}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, bio: e.target.value })}
                    placeholder="Hi! I'm into music and coding. Always happy to chat about tech..."
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select
                    value={profileEditForm.gender}
                    onChange={(e) => setProfileEditForm({ ...profileEditForm, gender: e.target.value })}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Discovery</label>
                  <div className="visibility-toggle">
                    <button
                      type="button"
                      className={profileEditForm.profileVisibility === "public" ? "active public" : ""}
                      onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "public" })}
                    >
                      <span className="visibility-icon">🌐</span>
                      <span className="visibility-label">Public</span>
                      <small>Advertise to network for discovery</small>
                    </button>
                    <button
                      type="button"
                      className={profileEditForm.profileVisibility === "private" ? "active private" : ""}
                      onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "private" })}
                    >
                      <span className="visibility-icon">🔒</span>
                      <span className="visibility-label">Private</span>
                      <small>Only visible to bonded peers</small>
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Interests</label>
                  <div className="interests-input-container">
                    {profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean).map((interest, i) => (
                      <span key={i} className="interest-tag removable">
                        {interest}
                        <button
                          type="button"
                          className="remove-interest"
                          onClick={() => {
                            const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                            current.splice(i, 1);
                            setProfileEditForm({ ...profileEditForm, hobbies: current.join(", ") });
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={profileEditForm.hobbies}
                      onChange={(e) => setProfileEditForm({ ...profileEditForm, hobbies: e.target.value })}
                      placeholder="Add interests..."
                      className="interests-text-input"
                    />
                  </div>
                  <small>Press Enter or comma to add. Click × to remove.</small>
                  <div className="suggested-interests">
                    <span className="suggested-label">Suggestions:</span>
                    <div className="interest-chips">
                      {suggestedTopics.map((topic) => (
                        <button
                          key={topic}
                          type="button"
                          className="interest-chip"
                          onClick={() => {
                            const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                            if (!current.includes(topic)) {
                              setProfileEditForm({
                                ...profileEditForm,
                                hobbies: [...current, topic].join(", ")
                              });
                            }
                          }}
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Capabilities for Discovery</label>
                  <p className="field-description">Select capabilities to advertise on the rendezvous network for peer discovery.</p>
                  <div className="capability-groups">
                    {PRESET_CAPABILITY_GROUPS.map((group) => (
                      <div key={group.label} className="capability-group">
                        <h4>{group.label}</h4>
                        <div className="capability-chips">
                          {group.capabilities.map((cap) => {
                            const isSelected = selectedCapabilities.some(
                              (sc) => "tag" in sc && sc.tag === cap.tag
                            );
                            return (
                              <button
                                key={cap.tag}
                                type="button"
                                className={`capability-chip ${isSelected ? "selected" : ""}`}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedCapabilities(
                                      selectedCapabilities.filter(
                                        (sc) => !("tag" in sc) || sc.tag !== cap.tag
                                      )
                                    );
                                  } else {
                                    setSelectedCapabilities([
                                      ...selectedCapabilities,
                                      { tag: cap.tag },
                                    ]);
                                  }
                                }}
                                title={cap.description}
                              >
                                {cap.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedCapabilities.length > 0 && (
                    <div className="selected-capabilities">
                      <span className="selected-label">Selected:</span>
                      {selectedCapabilities.map((cap, i) => (
                        <span key={i} className="selected-cap-tag">
                          {"tag" in cap ? cap.tag : "type" in cap ? cap.type : cap.descriptor}
                          <button
                            type="button"
                            className="remove-cap"
                            onClick={() => {
                              setSelectedCapabilities(
                                selectedCapabilities.filter((_, j) => j !== i)
                              );
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="profile-edit-actions">
                  <button onClick={handleSaveProfile} className="btn-primary" disabled={isSavingProfile}>
                    {isSavingProfile ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setIsEditingProfile(false)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="profile-display">
                <div className="profile-header">
                  <div className="profile-avatar">
                    {humanProfile?.displayName?.[0] ?? humanProfile?.username?.[0] ?? connectionInfo.peerId?.[0] ?? "?"}
                  </div>
                  <div className="profile-header-info">
                    <h2>{humanProfile?.displayName || humanProfile?.username || "Unnamed Peer"}</h2>
                    {humanProfile?.username && (
                      <p className="profile-username">@{humanProfile.username}</p>
                    )}
                    <p className="profile-owner-id">
                      <button
                        className="copy-id-btn"
                        onClick={() => navigator.clipboard.writeText(connectionInfo.peerId)}
                        title="Click to copy Peer ID"
                      >
                        {connectionInfo.peerId.slice(0, 12)}... (click to copy)
                      </button>
                    </p>
                  </div>
                </div>
                <div className="profile-actions">
                  <button onClick={() => setIsEditingProfile(true)} className="btn-primary">
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
                {(humanProfile?.hobbies?.length > 0 || humanProfile?.knowledge?.length > 0 || advertisedTopics.length > 0) && (
                  <div className="profile-section">
                    <h3>Interests</h3>
                    <p className="profile-hint">Your interests help others discover you in search. Dashed tags are advertised for DHT discovery.</p>
                    <div className="profile-tags">
                      {humanProfile?.hobbies?.map((h: string, i: number) => (
                        <span key={`h-${i}`} className="tag">{h}</span>
                      ))}
                      {humanProfile?.knowledge?.map((k: string, i: number) => (
                        <span key={`k-${i}`} className="tag knowledge">{k}</span>
                      ))}
                      {advertisedTopics.map((topic, i) => (
                        <span key={`t-${i}`} className="tag advertised">{topic}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(humanProfile?.capabilities?.length > 0 || selectedCapabilities.length > 0) && (
                  <div className="profile-section">
                    <h3>Capabilities</h3>
                    <p className="profile-hint">Your advertised capabilities for rendezvous-based peer discovery.</p>
                    <div className="profile-tags">
                      {(humanProfile?.capabilities || selectedCapabilities).map((cap: Capability, i: number) => {
                        const label = "tag" in cap ? cap.tag : "type" in cap ? cap.type : "descriptor" in cap ? cap.descriptor : "";
                        return (
                          <span key={`cap-${i}`} className="tag capability">{label}</span>
                        );
                      })}
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
                  <h3>Discovery Settings</h3>
                  <p className="section-desc">
                    Configure how your node discovers other peers on the network.
                  </p>

                  <div className="settings-toggle-row">
                    <div className="toggle-info">
                      <strong>mDNS Discovery</strong>
                      <span className="toggle-desc">Discover peers on local network via multicast DNS</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={nodeConfig?.enableMdns ?? true}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          await nodeService.updateNodeConfig({ enableMdns: newValue } as any);
                          // Restart node to apply changes
                          try {
                            await nodeService.stopNode();
                            await nodeService.waitForConnection(10000);
                            await nodeService.startNode();
                          } catch (err) {
                            console.error("[app] Failed to restart node:", err);
                          }
                          nodeService.getNodeConfig().then(setNodeConfig).catch(console.error);
                        }}
                      />
                      <span className="toggle-slider" />
                    </label>
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
                                // Wait for reconnection after stop
                                await nodeService.waitForConnection(10000);
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

        {currentView === "inbox" && (
          <div className="inbox-view">
            <div className="inbox-header">
              <h2>Inbox</h2>
              {inboxRequests.length > 0 && (
                <button
                  className="clear-inbox"
                  onClick={() => setInboxRequests([])}
                >
                  Clear All
                </button>
              )}
            </div>
            {inboxRequests.length === 0 ? (
              <div className="inbox-empty">
                <p>No pending requests</p>
                <small>Hello requests from other users will appear here</small>
              </div>
            ) : (
              <ul className="inbox-list">
                {inboxRequests.map((request) => (
                  <li key={request.messageId} className="inbox-item">
                    <div className="inbox-sender">
                      <span className="avatar large">{request.profile.displayName[0]}</span>
                      <div className="inbox-sender-info">
                        <strong>{request.profile.displayName}</strong>
                        <span className="owner-id">{request.sender.ownerId}</span>
                      </div>
                    </div>
                    {request.profile.bio && (
                      <p className="inbox-bio">{request.profile.bio}</p>
                    )}
                    {request.profile.interests.length > 0 && (
                      <span className="interests">{request.profile.interests.join(", ")}</span>
                    )}
                    {request.message && (
                      <p className="inbox-message">"{request.message}"</p>
                    )}
                    <div className="inbox-actions">
                      <button
                        className="accept"
                        onClick={() => {
                          handleAcceptHello(request.messageId);
                          setInboxRequests((prev) => prev.filter((r) => r.messageId !== request.messageId));
                        }}
                      >
                        Accept
                      </button>
                      <button
                        className="decline"
                        onClick={() => {
                          handleDeclineHello(request.messageId);
                          setInboxRequests((prev) => prev.filter((r) => r.messageId !== request.messageId));
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!showInbox && pendingHellOs.length > 0 && (
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
