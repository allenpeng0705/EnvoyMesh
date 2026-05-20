/**
 * Mobile app entry point — bootstraps the in-process MobileNode and renders
 * the Social UI (React SPA). Uses DirectCallClient instead of WebSocket.
 *
 * On device (Capacitor), wires SQLite + Keychain + Filesystem for persistence.
 * In browser dev mode, falls back to in-memory storage.
 */
import { createRoot } from "react-dom/client";
import { MobileNode } from "@envoymesh/mobile-node";
import { createDirectCallClient } from "@envoymesh/social/lib/direct-call-client.js";
import { NodeServiceProvider } from "@envoymesh/social/hooks/useNodeService.js";
import { NodeStateProvider } from "@envoymesh/social/context/NodeStateContext.js";
import { ThemeProvider } from "@envoymesh/social/context/ThemeContext.js";
import { ErrorBoundary } from "@envoymesh/social/components/ErrorBoundary.js";
import { MobileApp } from "./MobileApp.js";
import "@envoymesh/social/reset.css";
import "@envoymesh/social/design-tokens.css";
import "@envoymesh/social/styles.css";
import "./views/views.css";

// ---------------------------------------------------------------------------
// Bootstrap the in-process node before rendering
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Relay URLs will be configured by the user in production.
  const relayUrls: string[] = (() => {
    try {
      const raw = localStorage.getItem("envoymesh_relay_urls");
      if (raw) return JSON.parse(raw) as string[];
    } catch { /* ignore */ }
    return [];
  })();

  const profileDir = "envoymesh-mobile";

  // Try Capacitor-native bootstrap first (SQLite + Keychain + Filesystem).
  // Falls back to in-memory MobileNode for browser development.
  let mobileNode: MobileNode;

  try {
    const { bootstrapMobileApp } = await import("./bootstrap.js");
    mobileNode = await bootstrapMobileApp({ profileDir, relayUrls });
  } catch {
    // Not running in Capacitor (or plugin not available) — in-memory fallback.
    mobileNode = new MobileNode({ profileDir, relayUrls });
    await mobileNode.initNode(profileDir);
    await mobileNode.startNode();
  }

  // -------------------------------------------------------------------------
  // Render the Social UI with DirectCallClient
  // -------------------------------------------------------------------------

  const directClient = createDirectCallClient(mobileNode);

  createRoot(document.getElementById("root")!).render(
    <NodeServiceProvider clientFactory={() => directClient} modelProviderUiScope="cloud-only">
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
