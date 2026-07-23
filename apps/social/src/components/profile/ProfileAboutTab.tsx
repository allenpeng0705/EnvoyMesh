import { useEffect, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";
import { PRESET_CAPABILITY_GROUPS, type Capability } from "../../lib/profile.js";
import { PublicIcon, PrivateIcon } from "../../icons.js";
import type { CreateHumanProfileInput, OwnerDidPresentation } from "@envoymesh/api";
import { encodeGeohash, normalizeCountryCode, deriveLocationDiscoveryTopics, NEARBY_GEOHASH_PRECISION } from "@envoymesh/api";
import { ProfilePhotoAvatar } from "../ProfilePhotoAvatar.js";
import { ShareContactCard } from "../discover/ShareContactCard.js";
import { LocationGazetteerFields } from "./LocationGazetteerFields.js";
import { NearbyMapPicker } from "./NearbyMapPicker.js";
import { formatLocalizedLocation } from "../../lib/gazetteer.js";
import { MySitePanel } from "../MySitePanel.js";

interface ProfileEditForm {
  displayName: string;
  username: string;
  bio: string;
  gender: string;
  hobbies: string;
  knowledge: string;
  profileVisibility: "public" | "private";
  locationCountry: string;
  locationRegion: string;
  locationCity: string;
  locationTown: string;
  locationGeohash: string;
  locationPrecision: import("@envoymesh/api").DiscoveryLocationPrecision;
}

export interface ProfileAboutTabProps {
  variant?: "desktop" | "mobile";
}

export function ProfileAboutTab({ variant = "desktop" }: ProfileAboutTabProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const { humanProfile, nodeStatus, peerId, bonds, connectionStatus, refreshNodeConfig, refreshHumanProfile } =
    useNodeState();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedCapabilities, setSelectedCapabilities] = useState<Capability[]>(
    () => humanProfile?.capabilities as Capability[] ?? [],
  );
  const [advertisedTopics, setAdvertisedTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [ownerDid, setOwnerDid] = useState<OwnerDidPresentation | null>(null);

  const [profileEditForm, setProfileEditForm] = useState<ProfileEditForm>({
    displayName: humanProfile?.displayName ?? "",
    username: humanProfile?.username ?? "",
    bio: humanProfile?.bio ?? "",
    gender: humanProfile?.gender ?? "",
    hobbies: (humanProfile?.hobbies ?? []).join(", "),
    knowledge: (humanProfile?.knowledge ?? []).join(", "),
    profileVisibility: humanProfile?.profileVisibility ?? "private",
    locationCountry: humanProfile?.discoveryLocation?.countryCode ?? "",
    locationRegion: humanProfile?.discoveryLocation?.regionCode ?? "",
    locationCity: humanProfile?.discoveryLocation?.city ?? "",
    locationTown: humanProfile?.discoveryLocation?.town ?? "",
    locationGeohash: humanProfile?.discoveryLocation?.geohash ?? "",
    locationPrecision: humanProfile?.discoveryLocationPrecision ?? "hidden",
  });

  useEffect(() => {
    let cancelled = false;
    void nodeService.getOwnerDidPresentation()
      .then((presentation) => {
        if (!cancelled) setOwnerDid(presentation);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const handleSaveProfile = async () => {
    if (!profileEditForm.displayName.trim()) {
      showToast(t("profileAbout.displayNameRequired"), "error");
      return;
    }
    if (!profileEditForm.username.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(profileEditForm.username.trim())) {
      showToast(t("profileAbout.usernameInvalid"), "error");
      return;
    }
    setIsSavingProfile(true);
    try {
      const interests = profileEditForm.hobbies.split(",").map((s) => s.trim()).filter(Boolean);
      const cc = profileEditForm.locationCountry.trim();
      const discoveryLocation =
        cc.length === 2
          ? {
              countryCode: normalizeCountryCode(cc),
              ...(profileEditForm.locationRegion.trim()
                ? { regionCode: profileEditForm.locationRegion.trim() }
                : {}),
              ...(profileEditForm.locationCity.trim()
                ? { city: profileEditForm.locationCity.trim() }
                : {}),
              ...(profileEditForm.locationTown.trim()
                ? { town: profileEditForm.locationTown.trim() }
                : {}),
              ...(profileEditForm.locationGeohash.trim()
                ? {
                    geohash: profileEditForm.locationGeohash
                      .trim()
                      .toLowerCase()
                      .slice(0, NEARBY_GEOHASH_PRECISION),
                  }
                : {}),
            }
          : undefined;
      await nodeService.updateHumanProfile({
        displayName: profileEditForm.displayName.trim(),
        username: profileEditForm.username.trim(),
        bio: profileEditForm.bio,
        gender: profileEditForm.gender,
        hobbies: interests,
        profileVisibility: profileEditForm.profileVisibility,
        discoveryLocation,
        discoveryLocationPrecision: profileEditForm.locationPrecision,
        capabilities: selectedCapabilities,
      } satisfies CreateHumanProfileInput);
      await refreshHumanProfile();
      await refreshNodeConfig();
      setIsEditingProfile(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("profileAbout.updateFailed"), "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAdvertiseTopic = async () => {
    const topic = newTopic.trim();
    if (!topic) return;
    try {
      await nodeService.advertiseTopic(topic);
      setAdvertisedTopics((prev) => [...prev, topic]);
      setNewTopic("");
    } catch (error) {
      console.error("Failed to advertise topic:", error);
    }
  };

  const handleStopAdvertiseTopic = async (topic: string) => {
    try {
      await nodeService.stopAdvertiseTopic(topic);
      setAdvertisedTopics((prev) => prev.filter((t) => t !== topic));
    } catch (error) {
      console.error("Failed to stop advertising topic:", error);
    }
  };

  const rootClass = variant === "mobile" ? "profile-about-tab mv-profile-about" : "profile-about-tab";

  if (isEditingProfile) {
    return (
      <div className={`${rootClass} profile-edit`}>
        <h2>{t("profileAbout.editTitle")}</h2>
        <div className="form-group">
          <label>{t("profileAbout.displayName")} <span className="required">*</span></label>
          <input
            type="text"
            value={profileEditForm.displayName}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, displayName: e.target.value })}
            placeholder={t("profileAbout.displayNamePlaceholder")}
            required
          />
        </div>
        <div className="form-group">
          <label>{t("profileAbout.username")} <span className="required">*</span></label>
          <input
            type="text"
            value={profileEditForm.username}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, username: e.target.value })}
            placeholder={t("profileAbout.usernamePlaceholder")}
            required
            pattern="^[a-zA-Z0-9_]{3,30}$"
          />
          <small>{t("profileAbout.usernameHint")}</small>
        </div>
        <div className="form-group">
          <label>{t("profileAbout.introduction")}</label>
          <textarea
            value={profileEditForm.bio}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, bio: e.target.value })}
            placeholder={t("profileAbout.bioPlaceholder")}
            rows={3}
          />
        </div>
        <div className="form-group">
          <label>{t("profileAbout.gender")}</label>
          <select
            value={profileEditForm.gender}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, gender: e.target.value })}
          >
            <option value="">{t("profileAbout.genderPreferNot")}</option>
            <option value="Male">{t("profileAbout.genderMale")}</option>
            <option value="Female">{t("profileAbout.genderFemale")}</option>
            <option value="Non-binary">{t("profileAbout.genderNonBinary")}</option>
            <option value="Other">{t("profileAbout.genderOther")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t("profileAbout.discovery")}</label>
          <div className="visibility-toggle">
            <button
              type="button"
              className={profileEditForm.profileVisibility === "public" ? "active public" : ""}
              onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "public" })}
            >
              <span className="visibility-icon"><PublicIcon size={20} /></span>
              <span className="visibility-label">{t("profileAbout.public")}</span>
              <small>{t("profileAbout.publicDesc")}</small>
            </button>
            <button
              type="button"
              className={profileEditForm.profileVisibility === "private" ? "active private" : ""}
              onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "private" })}
            >
              <span className="visibility-icon"><PrivateIcon size={20} /></span>
              <span className="visibility-label">{t("profileAbout.private")}</span>
              <small>{t("profileAbout.privateDesc")}</small>
            </button>
          </div>
        </div>
        <div className="form-group">
          <label>{t("profileAbout.interests")}</label>
          <input
            type="text"
            value={profileEditForm.hobbies}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, hobbies: e.target.value })}
            placeholder={t("profileAbout.interestsPlaceholder")}
          />
        </div>
        <div className="form-group">
          <label>{t("profileAbout.locationSection")}</label>
          <p className="profile-hint muted small">{t("profileAbout.locationHint")}</p>
          <div className="profile-location-grid">
            <LocationGazetteerFields
              countryCode={profileEditForm.locationCountry}
              regionCode={profileEditForm.locationRegion}
              city={profileEditForm.locationCity}
              onCountryChange={(code) =>
                setProfileEditForm((prev) => ({ ...prev, locationCountry: code }))
              }
              onRegionChange={(code) =>
                setProfileEditForm((prev) => ({ ...prev, locationRegion: code }))
              }
              onCityChange={(city) =>
                setProfileEditForm((prev) => ({ ...prev, locationCity: city }))
              }
              t={t}
              countryLabel={t("profileAbout.countryLabel")}
              regionLabel={t("profileAbout.regionLabel")}
              cityLabel={t("profileAbout.cityLabel")}
              countryPlaceholder={t("profileAbout.countryPlaceholder")}
              regionPlaceholder={t("profileAbout.regionPlaceholder")}
              cityPlaceholder={t("profileAbout.cityPlaceholder")}
            />
            <input
              type="text"
              value={profileEditForm.locationTown}
              onChange={(e) => setProfileEditForm({ ...profileEditForm, locationTown: e.target.value })}
              placeholder={t("profileAbout.townPlaceholder")}
              aria-label={t("profileAbout.townLabel")}
            />
          </div>
          <label className="profile-location-precision-label" htmlFor="location-precision">
            {t("profileAbout.locationPrecisionLabel")}
          </label>
          <select
            id="location-precision"
            value={profileEditForm.locationPrecision}
            onChange={(e) =>
              setProfileEditForm({
                ...profileEditForm,
                locationPrecision: e.target.value as ProfileEditForm["locationPrecision"],
              })
            }
          >
            <option value="hidden">{t("profileAbout.precisionHidden")}</option>
            <option value="country">{t("profileAbout.precisionCountry")}</option>
            <option value="region">{t("profileAbout.precisionRegion")}</option>
            <option value="city">{t("profileAbout.precisionCity")}</option>
            <option value="town">{t("profileAbout.precisionTown")}</option>
            <option value="nearby">{t("profileAbout.precisionNearby")}</option>
          </select>
          {profileEditForm.locationPrecision === "nearby" ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-small profile-location-gps-btn"
                onClick={() => {
                  if (!navigator.geolocation) {
                    showToast(t("profileAbout.geolocationUnavailable"), "error");
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      const geohash = encodeGeohash(
                        pos.coords.latitude,
                        pos.coords.longitude,
                        NEARBY_GEOHASH_PRECISION,
                      );
                      setProfileEditForm((prev) => ({
                        ...prev,
                        locationGeohash: geohash,
                        locationPrecision: "nearby",
                      }));
                    },
                    () => showToast(t("profileAbout.geolocationDenied"), "error"),
                    { timeout: 12_000 },
                  );
                }}
              >
                {t("profileAbout.useDeviceLocation")}
              </button>
              {profileEditForm.locationGeohash ? (
                <p className="muted small profile-geohash-hint">
                  {t("profileAbout.geohashHint")}: {profileEditForm.locationGeohash}
                </p>
              ) : null}
              <NearbyMapPicker
                countryCode={profileEditForm.locationCountry}
                geohash={profileEditForm.locationGeohash}
                onGeohashChange={(geohash) =>
                  setProfileEditForm((prev) => ({
                    ...prev,
                    locationGeohash: geohash,
                    locationPrecision: "nearby",
                  }))
                }
                pickOnMapLabel={t("profileAbout.pickOnMap")}
                mapHint={t("profileAbout.mapPickerHint")}
              />
            </>
          ) : null}
        </div>
        <div className="form-group">
          <label>{t("profileAbout.capabilities")}</label>
          {PRESET_CAPABILITY_GROUPS.map((group) => (
            <div key={group.label} className="capability-group">
              <h4>{group.label}</h4>
              <div className="capability-chips">
                {group.capabilities.map((cap) => {
                  const isSelected = selectedCapabilities.some((sc) => "tag" in sc && sc.tag === cap.tag);
                  return (
                    <button
                      key={cap.tag}
                      type="button"
                      className={`capability-chip ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedCapabilities(
                            selectedCapabilities.filter((sc) => !("tag" in sc) || sc.tag !== cap.tag),
                          );
                        } else {
                          setSelectedCapabilities([...selectedCapabilities, { tag: cap.tag }]);
                        }
                      }}
                    >
                      {cap.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="profile-edit-actions">
          <button onClick={handleSaveProfile} className="btn-primary" disabled={isSavingProfile}>
            {isSavingProfile ? t("profileAbout.saving") : t("common.save")}
          </button>
          <button onClick={() => setIsEditingProfile(false)} className="btn-secondary">{t("common.cancel")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div
        className="profile-header profile-header--tappable"
        onClick={() => {
          setProfileEditForm({
            displayName: humanProfile?.displayName ?? "",
            username: humanProfile?.username ?? "",
            bio: humanProfile?.bio ?? "",
            gender: humanProfile?.gender ?? "",
            hobbies: (humanProfile?.hobbies ?? []).join(", "),
            knowledge: (humanProfile?.knowledge ?? []).join(", "),
            profileVisibility: humanProfile?.profileVisibility ?? "private",
            locationCountry: humanProfile?.discoveryLocation?.countryCode ?? "",
            locationRegion: humanProfile?.discoveryLocation?.regionCode ?? "",
            locationCity: humanProfile?.discoveryLocation?.city ?? "",
            locationTown: humanProfile?.discoveryLocation?.town ?? "",
            locationGeohash: humanProfile?.discoveryLocation?.geohash ?? "",
            locationPrecision: humanProfile?.discoveryLocationPrecision ?? "hidden",
          });
          setSelectedCapabilities((humanProfile?.capabilities as Capability[]) ?? []);
          setIsEditingProfile(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setIsEditingProfile(true);
        }}
        aria-label={t("profileAbout.editAriaLabel")}
      >
        <ProfilePhotoAvatar
          photo={humanProfile?.publicThumbnail}
          fallbackLabel={humanProfile?.displayName ?? humanProfile?.username ?? "?"}
        />
        <div className="profile-header-info">
          <h2>{humanProfile?.displayName || humanProfile?.username || t("profileAbout.unnamedPeer")}</h2>
          {humanProfile?.username && <p className="profile-username">@{humanProfile.username}</p>}
        </div>
        <span className="profile-chevron" aria-hidden="true">&#8250;</span>
      </div>
      <p className="profile-hint muted small">{t("profileAbout.hint")}</p>

      {humanProfile?.ownerId ? (
        <div className="profile-section">
          <MySitePanel ownerId={humanProfile.ownerId} compact />
        </div>
      ) : null}

      {humanProfile?.bio && (
        <div className="profile-section">
          <h3>{t("profileAbout.about")}</h3>
          <p className="profile-bio">{humanProfile.bio}</p>
        </div>
      )}

      {humanProfile?.discoveryLocation?.countryCode &&
      humanProfile.discoveryLocationPrecision &&
      humanProfile.discoveryLocationPrecision !== "hidden" ? (
        <div className="profile-section">
          <h3>{t("profileAbout.locationSection")}</h3>
          <p className="profile-bio">
            {formatLocalizedLocation({
              countryCode: humanProfile.discoveryLocation.countryCode,
              regionCode: humanProfile.discoveryLocation.regionCode,
              city: humanProfile.discoveryLocation.city,
              town: humanProfile.discoveryLocation.town,
              t,
            })}
          </p>
          <div className="profile-tags">
            {deriveLocationDiscoveryTopics({
              location: humanProfile.discoveryLocation,
              precision: humanProfile.discoveryLocationPrecision,
            }).map((topic) => (
              <span key={topic} className="tag advertised">{topic}</span>
            ))}
          </div>
        </div>
      ) : null}

      {(humanProfile?.hobbies?.length ?? 0) > 0 || advertisedTopics.length > 0 ? (
        <div className="profile-section">
          <h3>{t("profileAbout.interests")}</h3>
          <div className="profile-tags">
            {humanProfile?.hobbies?.map((h: string, i: number) => (
              <span key={`h-${i}`} className="tag">{h}</span>
            ))}
            {advertisedTopics.map((topic, i) => (
              <span key={`t-${i}`} className="tag advertised">
                {topic}
                <button type="button" className="remove-interest" onClick={() => void handleStopAdvertiseTopic(topic)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="topic-advertise" style={{ marginTop: "0.75rem" }}>
            <input
              type="text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder={t("profileAbout.advertiseTopicPlaceholder")}
            />
            <button type="button" className="btn-secondary btn-small" onClick={() => void handleAdvertiseTopic()}>
              {t("profileAbout.advertise")}
            </button>
          </div>
        </div>
      ) : null}

      {(humanProfile?.capabilities?.length ?? 0) > 0 ? (
        <div className="profile-section">
          <h3>{t("profileAbout.capabilities")}</h3>
          <div className="profile-tags">
            {(humanProfile?.capabilities ?? []).map((cap: Capability, i: number) => {
              const label =
                "tag" in cap ? cap.tag : "type" in cap ? cap.type : "descriptor" in cap ? cap.descriptor : "";
              return (
                <span key={`cap-${i}`} className="tag capability">{label}</span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="profile-section">
        <h3>{t("profileAbout.identity")}</h3>
        <dl className="profile-info">
          {ownerDid && (
            <>
              <div className="profile-info-row">
                <dt>{t("profileAbout.did")}</dt>
                <dd>
                  <button
                    type="button"
                    className="copy-id-btn"
                    onClick={() => void navigator.clipboard.writeText(ownerDid.did)}
                  >
                    <code className="peer-id-display">{ownerDid.did}</code>
                  </button>
                </dd>
              </div>
              <div className="profile-info-row">
                <dt>{t("profileAbout.ownerId")}</dt>
                <dd>
                  <code className="peer-id-display">{ownerDid.ownerId}</code>
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="profile-section">
        <ShareContactCard />
      </div>

      <div className="profile-section">
        <h3>{t("profileAbout.connection")}</h3>
        <dl className="profile-info">
          <div className="profile-info-row">
            <dt>{t("profileAbout.status")}</dt>
            <dd className={nodeStatus === "running" ? "text-success" : ""}>{nodeStatus}</dd>
          </div>
          {peerId && !(peerId.startsWith("envoy_") && !peerId.startsWith("envoy_agent_")) && (
            <div className="profile-info-row">
              <dt>{t("profileAbout.peerId")}</dt>
              <dd><code className="peer-id-display">{peerId}</code></dd>
            </div>
          )}
          <div className="profile-info-row">
            <dt>{t("profileAbout.bondedPeers")}</dt>
            <dd>{bonds.length}</dd>
          </div>
          {connectionStatus?.online != null && (
            <div className="profile-info-row">
              <dt>{t("profileAbout.mesh")}</dt>
              <dd>{connectionStatus.online ? t("profileAbout.online") : t("profileAbout.offline")}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
