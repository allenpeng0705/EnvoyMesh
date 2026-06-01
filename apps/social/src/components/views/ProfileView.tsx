import { useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { ProfilePhotosTab } from "../profile/ProfilePhotosTab.js";
import { ProfileAboutTab } from "../profile/ProfileAboutTab.js";

export type ProfileSubTab = "photos" | "about";

export function ProfileView() {
  const t = useT();
  const [tab, setTab] = useState<ProfileSubTab>("photos");

  return (
    <div className="profile-view">
      <nav className="profile-subtabs" aria-label={t("profile.sectionsLabel")}>
        <button
          type="button"
          className={tab === "photos" ? "active" : ""}
          aria-pressed={tab === "photos"}
          onClick={() => setTab("photos")}
        >
          {t("profile.photos")}
        </button>
        <button
          type="button"
          className={tab === "about" ? "active" : ""}
          aria-pressed={tab === "about"}
          onClick={() => setTab("about")}
        >
          {t("profile.about")}
        </button>
      </nav>
      {tab === "photos" ? <ProfilePhotosTab variant="desktop" /> : <ProfileAboutTab variant="desktop" />}
    </div>
  );
}
