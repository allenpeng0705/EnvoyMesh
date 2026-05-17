/**
 * Mobile app entry point — bootstraps the in-process MobileNode and renders
 * the Social UI (React SPA). Uses DirectCallClient instead of WebSocket.
 *
 * Auto-initializes a standalone identity on first launch so the Social UI
 * opens directly into the chat view. On device with Capacitor, use
 * bootstrapMobileApp() from ./bootstrap.js to wire SQLite + Keychain.
 */
import { createRoot } from "react-dom/client";
import { MobileNode } from "@envoymesh/mobile-node";
import { createDirectCallClient } from "@envoymesh/social/lib/direct-call-client.js";
import { NodeServiceProvider } from "@envoymesh/social/hooks/useNodeService.js";
import { NodeStateProvider } from "@envoymesh/social/context/NodeStateContext.js";
import { ThemeProvider } from "@envoymesh/social/context/ThemeContext.js";
import { ErrorBoundary } from "@envoymesh/social/components/ErrorBoundary.js";
import { MobileApp } from "./MobileApp.js";
import "@envoymesh/social/styles-v2.css";
import "@envoymesh/social/reset.css";
import "@envoymesh/social/design-tokens.css";

// ---------------------------------------------------------------------------
// Bootstrap the in-process node before rendering
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
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

  // Auto-initialize: fresh standalone identity for MVP.
  // initNode() generates keys, persists public state, and returns peer IDs.
  // In the future restoreFromSecureStorage() should be tried first.
  await mobileNode.initNode(profileDir);
  await mobileNode.startNode();

  // -------------------------------------------------------------------------
  // Render the Social UI with DirectCallClient
  // -------------------------------------------------------------------------

  const directClient = createDirectCallClient(mobileNode);

  createRoot(document.getElementById("root")!).render(
    <NodeServiceProvider clientFactory={() => directClient}>
      <NodeStateProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <MobileApp />
          </ErrorBoundary>
        </ThemeProvider>
      </NodeStateProvider>
    </NodeServiceProvider>,
  );
}

main().catch((err) => {
  console.error("[mobile] bootstrap failed:", err);
  const rootEl = document.getElementById("root");
  if (rootEl) {
    createRoot(rootEl).render(
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>EnvoyMesh</h2>
        <p>Failed to start: {String(err?.message ?? err)}</p>
      </div>,
    );
  }
});
