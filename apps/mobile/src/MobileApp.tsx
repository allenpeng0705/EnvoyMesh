/**
 * MobileApp — Mobile-specific app shell with bottom tab bar.
 *
 * Replaces the desktop App+Header layout from @envoymesh/social.
 * Reuses all view components (ChatView, ContactsView, SearchView,
 * ProfileView, SettingsView) as-is — they get their data from context.
 */
import { useState, type ReactNode } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useTheme } from "@envoymesh/social/context/ThemeContext.js";
import { ErrorBoundary } from "@envoymesh/social/components/ErrorBoundary.js";
import { ChatView } from "@envoymesh/social/components/views/ChatView.js";
import { ContactsView } from "@envoymesh/social/components/views/ContactsView.js";
import { SearchView } from "@envoymesh/social/components/views/SearchView.js";
import { ProfileView } from "@envoymesh/social/components/views/ProfileView.js";
import { SettingsView } from "@envoymesh/social/components/views/SettingsView.js";
import {
  ChatIcon,
  ContactsIcon,
  SearchIcon,
  ProfileIcon,
  SettingsIcon,
  DarkModeIcon,
  LightModeIcon,
} from "@envoymesh/social/icons.js";
import "./MobileApp.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "chat" | "contacts" | "search" | "profile" | "settings";

interface TabButtonProps {
  id: TabId;
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: (id: TabId) => void;
  badge?: number;
}

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({ icon, label, active, onClick, id, badge }: TabButtonProps) {
  return (
    <button
      className={`tab-button${active ? " active" : ""}`}
      onClick={() => onClick(id)}
      aria-label={label}
      aria-selected={active}
      role="tab"
    >
      <div className="tab-icon">
        {icon}
        {badge != null && badge > 0 && (
          <span className="tab-badge">{badge > 99 ? "99+" : badge}</span>
        )}
      </div>
      <span className="tab-label">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortPeerId(peerId: string | undefined): string {
  if (!peerId) return "";
  return peerId.length > 12 ? peerId.slice(0, 6) + "..." + peerId.slice(-4) : peerId;
}

// ---------------------------------------------------------------------------
// MobileApp
// ---------------------------------------------------------------------------

export function MobileApp() {
  const { isConnected, nodeStatus, peerId, pendingHellOs } = useNodeState();
  const [currentTab, setCurrentTab] = useState<TabId>("chat");
  const { resolved, setTheme } = useTheme();

  // -- Loading ---------------------------------------------------------------
  if (!isConnected) {
    return (
      <div className="mobile-app">
        <div className="mobile-loading">
          <div className="spinner" />
          <p style={{ marginTop: 16, fontSize: 14 }}>Connecting to EnvoyMesh...</p>
        </div>
      </div>
    );
  }

  // -- Setup / offline -------------------------------------------------------
  if (nodeStatus === "offline") {
    return (
      <div className="mobile-app">
        <div className="mobile-setup">
          <div className="top-bar-logo" style={{ width: 48, height: 48, borderRadius: 12, fontSize: 24 }}>
            E
          </div>
          <h2 style={{ marginTop: 16, fontWeight: 600 }}>EnvoyMesh</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>
            Node is offline. Pull to refresh or restart the app.
          </p>
        </div>
      </div>
    );
  }

  // -- Main app --------------------------------------------------------------
  return (
    <div className="mobile-app">
      {/* Top bar */}
      <header className="top-bar">
        <div className="top-bar-left">
          <div className="top-bar-logo">E</div>
          <span className="top-bar-title">EnvoyMesh</span>
        </div>
        <div className="top-bar-right">
          <button
            className="top-bar-theme-btn"
            onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
            aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {resolved === "dark" ? <LightModeIcon size={18} /> : <DarkModeIcon size={18} />}
          </button>
          <span className="top-bar-peer">{shortPeerId(peerId)}</span>
          <div className="top-bar-status" />
        </div>
      </header>

      {/* Main content area */}
      <main className="mobile-content">
        <ErrorBoundary>
          {currentTab === "chat" && <ChatView key="chat" />}
          {currentTab === "contacts" && <ContactsView key="contacts" />}
          {currentTab === "search" && <SearchView key="search" />}
          {currentTab === "profile" && <ProfileView key="profile" />}
          {currentTab === "settings" && <SettingsView key="settings" />}
        </ErrorBoundary>
      </main>

      {/* Bottom tab bar */}
      <nav className="bottom-tabs" role="tablist">
        <TabButton
          id="chat" icon={<ChatIcon />} label="Chat"
          active={currentTab === "chat"} onClick={setCurrentTab}
          badge={pendingHellOs.length}
        />
        <TabButton
          id="contacts" icon={<ContactsIcon />} label="Contacts"
          active={currentTab === "contacts"} onClick={setCurrentTab}
        />
        <TabButton
          id="search" icon={<SearchIcon />} label="Search"
          active={currentTab === "search"} onClick={setCurrentTab}
        />
        <TabButton
          id="profile" icon={<ProfileIcon />} label="Profile"
          active={currentTab === "profile"} onClick={setCurrentTab}
        />
        <TabButton
          id="settings" icon={<SettingsIcon />} label="Settings"
          active={currentTab === "settings"} onClick={setCurrentTab}
        />
      </nav>
    </div>
  );
}

export { MobileApp as default };
