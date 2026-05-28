import { useEffect, useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { PRESET_CAPABILITY_GROUPS, type Capability } from "../../lib/profile.js";
import { PublicIcon, PrivateIcon } from "../../icons.js";
import type { CreateHumanProfileInput, OwnerDidPresentation } from "@envoymesh/api";
import { ProfilePhotoAvatar } from "../ProfilePhotoAvatar.js";

interface ProfileEditForm {
  displayName: string;
  username: string;
  bio: string;
  gender: string;
  hobbies: string;
  knowledge: string;
  profileVisibility: "public" | "private";
}

export interface ProfileAboutTabProps {
  variant?: "desktop" | "mobile";
}

export function ProfileAboutTab({ variant = "desktop" }: ProfileAboutTabProps) {
  const nodeService = useNodeService();
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
      alert("Display name is required");
      return;
    }
    if (!profileEditForm.username.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(profileEditForm.username.trim())) {
      alert("Username is required. 3-30 characters, letters, numbers, underscore only.");
      return;
    }
    setIsSavingProfile(true);
    try {
      const interests = profileEditForm.hobbies.split(",").map((s) => s.trim()).filter(Boolean);
      await nodeService.updateHumanProfile({
        displayName: profileEditForm.displayName.trim(),
        username: profileEditForm.username.trim(),
        bio: profileEditForm.bio,
        gender: profileEditForm.gender,
        hobbies: interests,
        profileVisibility: profileEditForm.profileVisibility,
        capabilities: selectedCapabilities,
      } satisfies CreateHumanProfileInput);
      await refreshHumanProfile();
      await refreshNodeConfig();
      setIsEditingProfile(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update profile");
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
        <h2>Edit profile</h2>
        <div className="form-group">
          <label>Display Name <span className="required">*</span></label>
          <input
            type="text"
            value={profileEditForm.displayName}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, displayName: e.target.value })}
            placeholder="Your name"
            required
          />
        </div>
        <div className="form-group">
          <label>Username <span className="required">*</span></label>
          <input
            type="text"
            value={profileEditForm.username}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, username: e.target.value })}
            placeholder="johndoe"
            required
            pattern="^[a-zA-Z0-9_]{3,30}$"
          />
          <small>Used for DHT discovery. 3-30 characters.</small>
        </div>
        <div className="form-group">
          <label>Introduction</label>
          <textarea
            value={profileEditForm.bio}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, bio: e.target.value })}
            placeholder="Hi! I'm into music and coding..."
            rows={3}
          />
        </div>
        <div className="form-group">
          <label>Gender</label>
          <select
            value={profileEditForm.gender}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, gender: e.target.value })}
          >
            <option value="">Prefer not to say</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label>Discovery</label>
          <div className="visibility-toggle">
            <button
              type="button"
              className={profileEditForm.profileVisibility === "public" ? "active public" : ""}
              onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "public" })}
            >
              <span className="visibility-icon"><PublicIcon size={20} /></span>
              <span className="visibility-label">Public</span>
              <small>Advertise to network for discovery</small>
            </button>
            <button
              type="button"
              className={profileEditForm.profileVisibility === "private" ? "active private" : ""}
              onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "private" })}
            >
              <span className="visibility-icon"><PrivateIcon size={20} /></span>
              <span className="visibility-label">Private</span>
              <small>Only visible to bonded peers</small>
            </button>
          </div>
        </div>
        <div className="form-group">
          <label>Interests</label>
          <input
            type="text"
            value={profileEditForm.hobbies}
            onChange={(e) => setProfileEditForm({ ...profileEditForm, hobbies: e.target.value })}
            placeholder="music, tech, hiking"
          />
        </div>
        <div className="form-group">
          <label>Capabilities</label>
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
            {isSavingProfile ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setIsEditingProfile(false)} className="btn-secondary">Cancel</button>
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
          });
          setSelectedCapabilities((humanProfile?.capabilities as Capability[]) ?? []);
          setIsEditingProfile(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setIsEditingProfile(true);
        }}
        aria-label="Edit profile details"
      >
        <ProfilePhotoAvatar
          photo={humanProfile?.publicThumbnail}
          fallbackLabel={humanProfile?.displayName ?? humanProfile?.username ?? "?"}
        />
        <div className="profile-header-info">
          <h2>{humanProfile?.displayName || humanProfile?.username || "Unnamed Peer"}</h2>
          {humanProfile?.username && <p className="profile-username">@{humanProfile.username}</p>}
        </div>
        <span className="profile-chevron" aria-hidden="true">&#8250;</span>
      </div>
      <p className="profile-hint muted small">Tap header to edit name, bio, and discovery settings. Photos are on the Photos tab.</p>

      {humanProfile?.bio && (
        <div className="profile-section">
          <h3>About</h3>
          <p className="profile-bio">{humanProfile.bio}</p>
        </div>
      )}

      {(humanProfile?.hobbies?.length ?? 0) > 0 || advertisedTopics.length > 0 ? (
        <div className="profile-section">
          <h3>Interests</h3>
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
              placeholder="Advertise a DHT topic..."
            />
            <button type="button" className="btn-secondary btn-small" onClick={() => void handleAdvertiseTopic()}>
              Advertise
            </button>
          </div>
        </div>
      ) : null}

      {(humanProfile?.capabilities?.length ?? 0) > 0 ? (
        <div className="profile-section">
          <h3>Capabilities</h3>
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
        <h3>Identity</h3>
        <dl className="profile-info">
          {ownerDid && (
            <>
              <div className="profile-info-row">
                <dt>DID</dt>
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
                <dt>Owner ID</dt>
                <dd>
                  <code className="peer-id-display">{ownerDid.ownerId}</code>
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="profile-section">
        <h3>Connection</h3>
        <dl className="profile-info">
          <div className="profile-info-row">
            <dt>Status</dt>
            <dd className={nodeStatus === "running" ? "text-success" : ""}>{nodeStatus}</dd>
          </div>
          {peerId && !(peerId.startsWith("envoy_") && !peerId.startsWith("envoy_agent_")) && (
            <div className="profile-info-row">
              <dt>Peer ID</dt>
              <dd><code className="peer-id-display">{peerId}</code></dd>
            </div>
          )}
          <div className="profile-info-row">
            <dt>Bonded peers</dt>
            <dd>{bonds.length}</dd>
          </div>
          {connectionStatus?.online != null && (
            <div className="profile-info-row">
              <dt>Mesh</dt>
              <dd>{connectionStatus.online ? "Online" : "Offline"}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
