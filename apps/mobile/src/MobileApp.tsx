/**
 * MobileApp — Mobile-specific app shell with bottom tab bar.
 *
 * Replaces the desktop App+Header layout from @envoymesh/social.
 * Reuses all view components (ChatView, ContactsView, SearchView,
 * ProfileView, SettingsView) as-is — they get their data from context.
 */
import { useState, type ReactNode } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { ErrorBoundary } from "@envoymesh/social/components/ErrorBoundary.js";
import { ChatView } from "@envoymesh/social/components/views/ChatView.js";
import { ContactsView } from "@envoymesh/social/components/views/ContactsView.js";
import { SearchView } from "@envoymesh/social/components/views/SearchView.js";
import { ProfileView } from "@envoymesh/social/components/views/ProfileView.js";
import { SettingsView } from "@envoymesh/social/components/views/SettingsView.js";
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
// SVG Icons (24x24, outline style)
// ---------------------------------------------------------------------------

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
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
