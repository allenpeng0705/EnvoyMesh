import { useState, useRef, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
import { PRESET_CAPABILITY_GROUPS, type Capability } from "../../lib/profile.js";
import { PublicIcon, PrivateIcon } from "../../icons.js";
import type { HumanProfile, CreateHumanProfileInput, OwnerDidPresentation } from "@envoymesh/api";

interface ProfileEditForm {
  displayName: string;
  username: string;
  bio: string;
  gender: string;
  hobbies: string;
  knowledge: string;
  profileVisibility: "public" | "private";
}

export function ProfileView() {
  const nodeService = useNodeService();
  const { humanProfile, nodeStatus, peerId, bonds, connectionStatus, refreshNodeConfig, refreshHumanProfile } = useNodeState();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedCapabilities, setSelectedCapabilities] = useState<Capability[]>(
    () => humanProfile?.capabilities as Capability[] ?? [],
  );
  const [advertisedTopics, setAdvertisedTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [ownerDid, setOwnerDid] = useState<OwnerDidPresentation | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void nodeService.getOwnerDidPresentation()
      .then((presentation) => {
        if (!cancelled) setOwnerDid(presentation);
      })
      .catch((error) => {
        console.error("Failed to load owner DID presentation:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const connectionInfo = {
    peerId: peerId || "QmLoading...",
    bondedPeers: bonds.length,
  };

  const [profileEditForm, setProfileEditForm] = useState<ProfileEditForm>({
    displayName: humanProfile?.displayName ?? "",
    username: humanProfile?.username ?? "",
    bio: humanProfile?.bio ?? "",
    gender: humanProfile?.gender ?? "",
    hobbies: (humanProfile?.hobbies ?? []).join(", "),
    knowledge: (humanProfile?.knowledge ?? []).join(", "),
    profileVisibility: humanProfile?.profileVisibility ?? "private",
  });

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
      const message = error instanceof Error ? error.message : "Failed to update profile";
      console.error("Failed to update profile:", error);
      alert(message);
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

  // ---- Render: Edit Mode ----
  if (isEditingProfile) {
    return (
      <div className="profile-view">
        <div className="profile-edit">
          <h2>Edit Your Profile</h2>
          <div className="form-group avatar-upload">
            <label>Photo</label>
            <div className="avatar-preview">
              <div className="profile-avatar large">
                {humanProfile?.displayName?.[0] ?? peerId?.[0] ?? "?"}
              </div>
              <input
                type="file"
                accept="image/*"
                ref={avatarInputRef}
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) console.log("Avatar selected:", file.name);
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => avatarInputRef.current?.click()}
              >
                Choose Photo
              </button>
            </div>
          </div>
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
            <small>Used for DHT discovery. 3-30 characters, letters, numbers, underscore only.</small>
          </div>
          <div className="form-group">
            <label>Introduction</label>
            <textarea
              value={profileEditForm.bio}
              onChange={(e) => setProfileEditForm({ ...profileEditForm, bio: e.target.value })}
              placeholder="Hi! I'm into music and coding. Always happy to chat about tech..."
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
            <div className="interests-input-container">
              {profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean).map((interest, i) => (
                <span key={i} className="interest-tag removable">
                  {interest}
                  <button
                    type="button"
                    className="remove-interest"
                    onClick={() => {
                      const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                      current.splice(i, 1);
                      setProfileEditForm({ ...profileEditForm, hobbies: current.join(", ") });
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={profileEditForm.hobbies}
                onChange={(e) => setProfileEditForm({ ...profileEditForm, hobbies: e.target.value })}
                placeholder="Add interests..."
                className="interests-text-input"
              />
            </div>
            <small>Press Enter or comma to add. Click × to remove.</small>
            <div className="suggested-interests">
              <span className="suggested-label">Suggestions:</span>
              <div className="interest-chips">
                {SUGGESTED_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className="interest-chip"
                    onClick={() => {
                      const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                      if (!current.includes(topic)) {
                        setProfileEditForm({ ...profileEditForm, hobbies: [...current, topic].join(", ") });
                      }
                    }}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Capabilities for Discovery</label>
            <p className="field-description">Select capabilities to advertise on the rendezvous network for peer discovery.</p>
            <div className="capability-groups">
              {PRESET_CAPABILITY_GROUPS.map((group) => (
                <div key={group.label} className="capability-group">
                  <h4>{group.label}</h4>
                  <div className="capability-chips">
                    {group.capabilities.map((cap) => {
                      const isSelected = selectedCapabilities.some(
                        (sc) => "tag" in sc && sc.tag === cap.tag
                      );
                      return (
                        <button
                          key={cap.tag}
                          type="button"
                          className={`capability-chip ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCapabilities(
                                selectedCapabilities.filter(
                                  (sc) => !("tag" in sc) || sc.tag !== cap.tag
                                )
                              );
                            } else {
                              setSelectedCapabilities([
                                ...selectedCapabilities,
                                { tag: cap.tag },
                              ]);
                            }
                          }}
                          title={cap.description}
                        >
                          {cap.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selectedCapabilities.length > 0 && (
              <div className="selected-capabilities">
                <span className="selected-label">Selected:</span>
                {selectedCapabilities.map((cap, i) => (
                  <span key={i} className="selected-cap-tag">
                    {"tag" in cap ? cap.tag : "type" in cap ? cap.type : cap.descriptor}
                    <button
                      type="button"
                      className="remove-cap"
                      onClick={() => setSelectedCapabilities(selectedCapabilities.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="profile-edit-actions">
            <button onClick={handleSaveProfile} className="btn-primary" disabled={isSavingProfile}>
              {isSavingProfile ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setIsEditingProfile(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render: Display Mode ----
  return (
    <div className="profile-view">
      <div className="profile-display">
        <div
          className="profile-header profile-header--tappable"
          onClick={() => setIsEditingProfile(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsEditingProfile(true); }}
          aria-label="Edit profile"
        >
          <div className="profile-avatar">
            {humanProfile?.displayName?.[0] ?? humanProfile?.username?.[0] ?? connectionInfo.peerId?.[0] ?? "?"}
          </div>
          <div className="profile-header-info">
            <h2>{humanProfile?.displayName || humanProfile?.username || "Unnamed Peer"}</h2>
            {humanProfile?.username && (
              <p className="profile-username">@{humanProfile.username}</p>
            )}
            <p className="profile-owner-id">
              <button
                className="copy-id-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (peerId && !(peerId.startsWith("envoy_") && !peerId.startsWith("envoy_agent_"))) navigator.clipboard.writeText(peerId);
                }}
                title="Copy network peer ID (libp2p)"
                disabled={!peerId || (peerId.startsWith("envoy_") && !peerId.startsWith("envoy_agent_"))}
              >
                {peerId && !(peerId.startsWith("envoy_") && !peerId.startsWith("envoy_agent_"))
                  ? `${peerId.slice(0, 12)}\u2026 (copy)`
                  : "Network ID loading\u2026"}
              </button>
            </p>
          </div>
          <span className="profile-chevron" aria-hidden="true">&#8250;</span>
        </div>
        {humanProfile?.bio && (
          <div className="profile-section">
            <h3>About</h3>
            <p className="profile-bio">{humanProfile.bio}</p>
          </div>
        )}
        {humanProfile?.gender && (
          <div className="profile-section">
            <h3>Gender</h3>
            <p>{humanProfile.gender}</p>
          </div>
        )}
        {(humanProfile?.hobbies?.length ?? 0) > 0 || (humanProfile?.knowledge?.length ?? 0) > 0 || advertisedTopics.length > 0 ? (
          <div className="profile-section">
            <h3>Interests</h3>
            <div className="profile-tags">
              {humanProfile?.hobbies?.map((h: string, i: number) => (
                <span key={`h-${i}`} className="tag">{h}</span>
              ))}
              {humanProfile?.knowledge?.map((k: string, i: number) => (
                <span key={`k-${i}`} className="tag knowledge">{k}</span>
              ))}
              {advertisedTopics.map((topic, i) => (
                <span key={`t-${i}`} className="tag advertised">{topic}</span>
              ))}
            </div>
          </div>
        ) : null}
        {(humanProfile?.capabilities?.length ?? 0) > 0 || selectedCapabilities.length > 0 ? (
          <div className="profile-section">
            <h3>Capabilities</h3>
            <div className="profile-tags">
              {(humanProfile?.capabilities ?? selectedCapabilities).map((cap: Capability, i: number) => {
                const label = "tag" in cap ? cap.tag : "type" in cap ? cap.type : "descriptor" in cap ? cap.descriptor : "";
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
                      title="Copy W3C did:key"
                    >
                      <code className="peer-id-display">{ownerDid.did}</code>
                    </button>
                  </dd>
                </div>
                <div className="profile-info-row">
                  <dt>Owner ID</dt>
                  <dd>
                    <button
                      type="button"
                      className="copy-id-btn"
                      onClick={() => void navigator.clipboard.writeText(ownerDid.ownerId)}
                      title="Copy Envoy owner id"
                    >
                      <code className="peer-id-display">{ownerDid.ownerId}</code>
                    </button>
                  </dd>
                </div>
                <div className="profile-info-row">
                  <dt>DID document</dt>
                  <dd>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void navigator.clipboard.writeText(JSON.stringify(ownerDid.document, null, 2))}
                    >
                      Copy JSON
                    </button>
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
              <dt>Bonded Peers</dt>
              <dd>{bonds.length}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
