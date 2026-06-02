/**
 * MobileProfileView — Me tab with Photos | About sub-tabs (shared with desktop Social).
 */
import { useState } from "react";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { ProfilePhotosTab } from "@envoymesh/social/components/profile/ProfilePhotosTab.js";
import { ProfileAboutTab } from "@envoymesh/social/components/profile/ProfileAboutTab.js";
import type { ProfileSubTab } from "@envoymesh/social/components/views/ProfileView.js";

interface MobileProfileViewProps {
  onNavigateSettings?: () => void;
  onNavigateLibrary?: () => void;
}

export function MobileProfileView({ onNavigateSettings, onNavigateLibrary }: MobileProfileViewProps) {
  const t = useT();
  const [tab, setTab] = useState<ProfileSubTab>("photos");

  return (
    <div className="mv-profile">
      <nav className="profile-subtabs mv-profile-subtabs" aria-label="Profile sections">
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

      {tab === "photos" ? (
        <ProfilePhotosTab variant="mobile" />
      ) : (
        <ProfileAboutTab variant="mobile" />
      )}

      <div className="mv-section-group mv-profile-links">
        <div className="mv-section-group-title">{t("mobile.profile.app")}</div>
        <div className="mv-section-row" onClick={onNavigateLibrary} role="button" tabIndex={0}>
          <span className="mv-section-label">{t("mobile.profile.library")}</span>
          <span className="mv-section-row-chevron">&#8250;</span>
        </div>
        <div className="mv-section-row" onClick={onNavigateSettings} role="button" tabIndex={0}>
          <span className="mv-section-label">{t("mobile.profile.settings")}</span>
          <span className="mv-section-row-chevron">&#8250;</span>
        </div>
      </div>
    </div>
  );
}

export { MobileProfileView as default };
