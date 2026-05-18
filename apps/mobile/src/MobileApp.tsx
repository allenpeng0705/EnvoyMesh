/**
 * MobileApp — Mobile-specific app shell with bottom tab bar.
 *
 * Uses independent mobile-native view components (MobileChatView, etc.)
 * that share only hooks/context/icons with the desktop app.
 *
 * 4-tab layout (WeChat-style): Chats | Contacts | Discover | Me
 * Settings is accessed from the "Me" tab via a gear icon.
 */
import { useState, type ReactNode } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useTheme } from "@envoymesh/social/context/ThemeContext.js";
import { ErrorBoundary } from "@envoymesh/social/components/ErrorBoundary.js";
import { MobileChatView } from "./views/MobileChatView.js";
import { MobileContactsView } from "./views/MobileContactsView.js";
import { MobileDiscoverView } from "./views/MobileDiscoverView.js";
import { MobileProfileView } from "./views/MobileProfileView.js";
import { MobileSettingsView } from "./views/MobileSettingsView.js";
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

type TabId = "chat" | "contacts" | "discover" | "me";

/** Sub-views within the "Me" tab */
type MeView = "profile" | "settings";

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
      onClick={() => { navigator.vibrate?.(10); onClick(id); }}
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

const TAB_TITLES: Record<TabId, string> = {
  chat: "Chats",
  contacts: "Contacts",
  discover: "Discover",
  me: "Me",
};

// ---------------------------------------------------------------------------
// MobileApp
// ---------------------------------------------------------------------------

export function MobileApp() {
  const { isConnected, nodeStatus, peerId, pendingHellOs } = useNodeState();
  const { resolved, setTheme } = useTheme();
  const [currentTab, setCurrentTab] = useState<TabId>("chat");
  const [meView, setMeView] = useState<MeView>("profile");

  const isDark = resolved === "dark";

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
          {currentTab === "me" && meView === "settings" ? (
            <>
              <button
                className="top-bar-back-btn"
                onClick={() => setMeView("profile")}
                aria-label="Back to profile"
              >
                &#8592;
              </button>
              <span className="top-bar-title">Settings</span>
            </>
          ) : (
            <>
              <div className="top-bar-logo">E</div>
              <span className="top-bar-title">{TAB_TITLES[currentTab]}</span>
            </>
          )}
        </div>
        <div className="top-bar-right">
          {currentTab === "me" && meView === "profile" && (
            <button
              className="top-bar-settings-btn"
              onClick={() => setMeView("settings")}
              aria-label="Settings"
            >
              <SettingsIcon size={18} />
            </button>
          )}
          <button
            className="top-bar-theme-btn"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <LightModeIcon size={18} /> : <DarkModeIcon size={18} />}
          </button>
          <span className="top-bar-peer">{shortPeerId(peerId)}</span>
          <div className="top-bar-status" />
        </div>
      </header>

      {/* Main content area */}
      <main className="mobile-content">
        <ErrorBoundary>
          {currentTab === "chat" && <MobileChatView key="chat" />}
          {currentTab === "contacts" && <MobileContactsView key="contacts" />}
          {currentTab === "discover" && <MobileDiscoverView key="discover" />}
          {currentTab === "me" && meView === "profile" && (
            <MobileProfileView
              key="profile"
              onNavigateSettings={() => setMeView("settings")}
            />
          )}
          {currentTab === "me" && meView === "settings" && (
            <MobileSettingsView
              key="settings"
              onBack={() => setMeView("profile")}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Bottom tab bar — WeChat-style 4 tabs */}
      <nav className="bottom-tabs" role="tablist">
        <TabButton
          id="chat" icon={<ChatIcon size={22} />} label="Chats"
          active={currentTab === "chat"} onClick={(id) => { setCurrentTab(id); }}
          badge={pendingHellOs.length}
        />
        <TabButton
          id="contacts" icon={<ContactsIcon size={22} />} label="Contacts"
          active={currentTab === "contacts"} onClick={(id) => { setCurrentTab(id); }}
        />
        <TabButton
          id="discover" icon={<SearchIcon size={22} />} label="Discover"
          active={currentTab === "discover"} onClick={(id) => { setCurrentTab(id); }}
        />
        <TabButton
          id="me" icon={<ProfileIcon size={22} />} label="Me"
          active={currentTab === "me"} onClick={(id) => { setCurrentTab(id); setMeView("profile"); }}
        />
      </nav>
    </div>
  );
}

export { MobileApp as default };
