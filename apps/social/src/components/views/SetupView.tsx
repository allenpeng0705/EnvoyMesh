import { useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR, defaultBootstrapPresetsForDiscoveryProfile } from "@envoymesh/api";
import type { DiscoveryProfile } from "@envoymesh/api";

export function SetupView() {
  const nodeService = useNodeService();

  const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
  const [setupDiscoveryProfile, setSetupDiscoveryProfile] = useState<DiscoveryProfile>("wan-default");
  const [setupBootstrapPeers, setSetupBootstrapPeers] = useState<string>(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitialize = async () => {
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
        bootstrapPresets: [...defaultBootstrapPresetsForDiscoveryProfile(setupDiscoveryProfile)],
      });

      await nodeService.startNode();
      // NodeStateContext will pick up the running state via events
    } catch (error) {
      console.error("Failed to initialize node:", error);
    } finally {
      setIsInitializing(false);
    }
  };

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
              onChange={(e) => setSetupDiscoveryProfile(e.target.value as DiscoveryProfile)}
            >
              <option value="lan-fast">LAN Fast (local network only)</option>
              <option value="contacts-only">Contacts only (relay, no public libp2p swarm)</option>
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
            onClick={handleInitialize}
            disabled={isInitializing || !setupProfileDir.trim()}
          >
            {isInitializing ? "Initializing..." : "Initialize Node"}
          </button>
        </div>
      </div>
    </div>
  );
}
