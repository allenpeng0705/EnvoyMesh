/**
 * Mobile app entry point — bootstraps the in-process MobileNode and renders
 * the Social UI (React SPA). Uses DirectCallClient instead of WebSocket.
 */
import { createRoot } from "react-dom/client";
import { MobileNode } from "@envoymesh/mobile-node";
import { createDirectCallClient } from "@envoymesh/social/lib/direct-call-client.js";
import { NodeServiceProvider } from "@envoymesh/social/hooks/useNodeService.js";
import { NodeStateProvider } from "@envoymesh/social/context/NodeStateContext.js";
import { ErrorBoundary } from "@envoymesh/social/components/ErrorBoundary.js";
import { App } from "@envoymesh/social/App.js";
import "@envoymesh/social/styles.css";

// ---------------------------------------------------------------------------
// Bootstrap the in-process node
// ---------------------------------------------------------------------------

// Relay URLs will be configured by the user in production.
// The node falls back to in-memory storage when database/vault aren't provided.
const relayUrls: string[] = (() => {
  try {
    const raw = localStorage.getItem("envoymesh_relay_urls");
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
})();

const profileDir = "envoymesh-mobile";

const mobileNode = new MobileNode({
  profileDir,
  relayUrls,
  // No database, vault, or secureStorage — falls back to in-memory.
  // On device, use bootstrapMobileApp() from ./bootstrap.js to wire Capacitor plugins.
});

const directClient = createDirectCallClient(mobileNode);

// ---------------------------------------------------------------------------
// Render the Social UI with DirectCallClient
// ---------------------------------------------------------------------------

createRoot(document.getElementById("root")!).render(
  <NodeServiceProvider clientFactory={() => directClient}>
    <NodeStateProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </NodeStateProvider>
  </NodeServiceProvider>,
);
