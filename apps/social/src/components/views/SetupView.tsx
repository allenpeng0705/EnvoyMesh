import { useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS, DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

export function SetupView() {
  const nodeService = useNodeService();

  const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
  const [setupDiscoveryProfile, setSetupDiscoveryProfile] = useState<"lan-fast" | "wan-default">("wan-default");
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
        bootstrapPresets: [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
      });

      await nodeService.startNode();
    } catch (error) {
      console.error("Failed to initialize node:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <div className="setup-view">
      <div className="setup-hero">
        <h1>Welcome to EnvoyMesh</h1>
        <p>Set up your node to join the decentralized mesh</p>
      </div>

      <div className="setup-card">
        <div className="form-group">
          <label>Profile Directory</label>
          <input
            type="text"
            value={setupProfileDir}
            onChange={(e) => setSetupProfileDir(e.target.value)}
            placeholder="./data/default"
          />
          <small className="field-desc">Where your identity and data will be stored</small>
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
          <small className="field-desc">Comma-separated list of peer addresses to connect to</small>
        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={handleInitialize}
          disabled={isInitializing || !setupProfileDir.trim()}
        >
          {isInitializing ? "Initializing..." : "Initialize Node"}
        </button>
      </div>
    </div>
  );
}
