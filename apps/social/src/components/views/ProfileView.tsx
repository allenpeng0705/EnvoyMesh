import { useState } from "react";
import { ProfilePhotosTab } from "../profile/ProfilePhotosTab.js";
import { ProfileAboutTab } from "../profile/ProfileAboutTab.js";

export type ProfileSubTab = "photos" | "about";

export function ProfileView() {
  const [tab, setTab] = useState<ProfileSubTab>("photos");

  return (
    <div className="profile-view">
      <nav className="profile-subtabs" aria-label="Profile sections">
        <button
          type="button"
          className={tab === "photos" ? "active" : ""}
          aria-pressed={tab === "photos"}
          onClick={() => setTab("photos")}
        >
          Photos
        </button>
        <button
          type="button"
          className={tab === "about" ? "active" : ""}
          aria-pressed={tab === "about"}
          onClick={() => setTab("about")}
        >
          About
        </button>
      </nav>
      {tab === "photos" ? <ProfilePhotosTab variant="desktop" /> : <ProfileAboutTab variant="desktop" />}
    </div>
  );
}
