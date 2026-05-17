import { useState, useRef } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
import {
  PublicIcon,
  PrivateIcon,
  CopyIcon,
  EditIcon,
  SaveIcon,
  RemoveIcon,
  ExpandIcon,
  CollapseIcon,
} from "../../icons.js";
import type { HumanProfile, CreateHumanProfileInput } from "@envoymesh/api";

// ---- Preset capability groups ----

type CapabilityTag = { tag: string };
type CapabilityType = { type: string; params?: Record<string, unknown>; confidence?: number };
type CapabilityDescriptor = { descriptor: string };
type Capability = CapabilityTag | CapabilityType | CapabilityDescriptor;

interface PresetCapabilityGroup {
  label: string;
  capabilities: Array<{ tag: string; label: string; description?: string }>;
}

const PRESET_CAPABILITY_GROUPS: PresetCapabilityGroup[] = [
  {
    label: "Services",
    capabilities: [
      { tag: "document-search", label: "Document Search", description: "Can search and retrieve documents" },
      { tag: "coding-help", label: "Coding Help", description: "Assists with programming tasks" },
      { tag: "translation", label: "Translation", description: "Language translation service" },
      { tag: "data-analysis", label: "Data Analysis", description: "Analyzes and visualizes data" },
    ],
  },
  {
    label: "Languages",
    capabilities: [
      { tag: "lang:en", label: "English" },
      { tag: "lang:zh", label: "Chinese" },
      { tag: "lang:es", label: "Spanish" },
      { tag: "lang:fr", label: "French" },
      { tag: "lang:de", label: "German" },
      { tag: "lang:ja", label: "Japanese" },
    ],
  },
  {
    label: "Expertise",
    capabilities: [
      { tag: "expertise:python", label: "Python" },
      { tag: "expertise:javascript", label: "JavaScript" },
      { tag: "expertise:typescript", label: "TypeScript" },
      { tag: "expertise:rust", label: "Rust" },
      { tag: "expertise:go", label: "Go" },
      { tag: "expertise:ai", label: "AI/ML" },
    ],
  },
  {
    label: "Resources",
    capabilities: [
      { tag: "vault-access:finance", label: "Finance Vault" },
      { tag: "vault-access:legal", label: "Legal Vault" },
      { tag: "compute-gpu", label: "GPU Compute" },
    ],
  },
];

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
  const { humanProfile, nodeStatus, peerId, bonds, refreshNodeConfig } = useNodeState();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedCapabilities, setSelectedCapabilities] = useState<Capability[]>(
    () => humanProfile?.capabilities as Capability[] ?? [],
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [advertisedTopics, setAdvertisedTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  const shortId = (id: string) => id && id.length > 12 ? id.slice(0, 6) + "..." + id.slice(-4) : id;

  // ---- Edit Mode ----
  if (isEditingProfile) {
    return (
      <div className="profile-edit">
        <h2>Edit Profile</h2>
        <div className="profile-edit-grid">
          {/* Avatar + Basic Info */}
          <div className="profile-edit-card">
            <div className="form-group avatar-upload">
              <label>Photo</label>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
                <div className="profile-avatar-lg">
                  {humanProfile?.displayName?.[0] ?? "?"}
                </div>
                <input type="file" accept="image/*" ref={avatarInputRef} style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files?.[0]) console.log("Avatar:", e.target.files[0].name); }} />
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => avatarInputRef.current?.click()}>
                  Choose Photo
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Display Name <span style={{ color: "var(--color-danger)" }}>*</span></label>
              <input type="text" value={profileEditForm.displayName}
                onChange={(e) => setProfileEditForm({ ...profileEditForm, displayName: e.target.value })}
                placeholder="Your name" required />
            </div>
            <div className="form-group">
              <label>Username <span style={{ color: "var(--color-danger)" }}>*</span></label>
              <input type="text" value={profileEditForm.username}
                onChange={(e) => setProfileEditForm({ ...profileEditForm, username: e.target.value })}
                placeholder="johndoe" required pattern="^[a-zA-Z0-9_]{3,30}$" />
              <small className="field-desc">3-30 chars, letters/numbers/underscore</small>
            </div>
            <div className="form-group">
              <label>Introduction</label>
              <textarea value={profileEditForm.bio}
                onChange={(e) => setProfileEditForm({ ...profileEditForm, bio: e.target.value })}
                placeholder="Hi! I'm into music and coding..." rows={3} />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={profileEditForm.gender}
                onChange={(e) => setProfileEditForm({ ...profileEditForm, gender: e.target.value })}>
                <option value="">Prefer not to say</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Visibility + Interests */}
          <div className="profile-edit-card">
            <div className="form-group">
              <label>Discovery Visibility</label>
              <div className="visibility-toggle">
                <button type="button"
                  className={`visibility-option${profileEditForm.profileVisibility === "public" ? " selected" : ""}`}
                  onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "public" })}>
                  <span className="visibility-option-icon"><PublicIcon size={20} /></span>
                  <div>
                    <div className="visibility-option-label">Public</div>
                    <div className="visibility-option-desc">Advertise for network discovery</div>
                  </div>
                </button>
                <button type="button"
                  className={`visibility-option${profileEditForm.profileVisibility === "private" ? " selected" : ""}`}
                  onClick={() => setProfileEditForm({ ...profileEditForm, profileVisibility: "private" })}>
                  <span className="visibility-option-icon"><PrivateIcon size={20} /></span>
                  <div>
                    <div className="visibility-option-label">Private</div>
                    <div className="visibility-option-desc">Only visible to bonded peers</div>
                  </div>
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Interests</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-2)" }}>
                {profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean).map((interest, i) => (
                  <span key={i} className="profile-tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {interest}
                    <button type="button" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                      onClick={() => {
                        const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                        current.splice(i, 1);
                        setProfileEditForm({ ...profileEditForm, hobbies: current.join(", ") });
                      }}>
                      <RemoveIcon size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <input type="text" value={profileEditForm.hobbies}
                onChange={(e) => setProfileEditForm({ ...profileEditForm, hobbies: e.target.value })}
                placeholder="Add interests (comma-separated)..." />
              <small className="field-desc">Suggestions:</small>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
                {SUGGESTED_TOPICS.map((topic) => (
                  <button key={topic} type="button" className="topic-chip"
                    onClick={() => {
                      const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                      if (!current.includes(topic)) {
                        setProfileEditForm({ ...profileEditForm, hobbies: [...current, topic].join(", ") });
                      }
                    }}>
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="profile-edit-card profile-edit-card-full">
            <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-4)" }}>
              Capabilities
            </label>
            {PRESET_CAPABILITY_GROUPS.map((group) => (
              <div key={group.label} className="capability-group">
                <button type="button" className="capability-group-header"
                  onClick={() => setExpandedGroups({ ...expandedGroups, [group.label]: !expandedGroups[group.label] })}>
                  {group.label}
                  {expandedGroups[group.label] ? <CollapseIcon size={14} /> : <ExpandIcon size={14} />}
                </button>
                {expandedGroups[group.label] && (
                  <div className="capability-group-body">
                    {group.capabilities.map((cap) => {
                      const isSelected = selectedCapabilities.some(sc => "tag" in sc && sc.tag === cap.tag);
                      return (
                        <button key={cap.tag} type="button"
                          className={`topic-chip${isSelected ? "" : ""}`}
                          style={isSelected ? { background: "var(--color-primary-subtle)", borderColor: "var(--color-primary)", color: "var(--color-primary)" } : {}}
                          title={cap.description}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCapabilities(selectedCapabilities.filter(sc => !("tag" in sc) || sc.tag !== cap.tag));
                            } else {
                              setSelectedCapabilities([...selectedCapabilities, { tag: cap.tag }]);
                            }
                          }}>
                          {cap.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sticky save bar */}
        <div className="profile-edit-actions">
          <button className="btn btn-secondary" onClick={() => setIsEditingProfile(false)}>Cancel</button>
          <button className="btn btn-primary btn-lg" onClick={handleSaveProfile} disabled={isSavingProfile}>
            <SaveIcon size={16} />
            {isSavingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Display Mode ----
  return (
    <div className="profile-view">
      <div className="profile-hero">
        <div className="profile-avatar-lg">
          {humanProfile?.displayName?.[0] ?? humanProfile?.username?.[0] ?? "?"}
        </div>
        <div className="profile-hero-info">
          <div className="profile-display-name">
            {humanProfile?.displayName || humanProfile?.username || "Unnamed Peer"}
          </div>
          {humanProfile?.username && (
            <div className="profile-username">@{humanProfile.username}</div>
          )}
          <div className="profile-owner-id">
            {peerId && !peerId.startsWith("envoy_") ? shortId(peerId) : "Network ID loading..."}
            <button onClick={() => peerId && !peerId.startsWith("envoy_") && navigator.clipboard.writeText(peerId)}
              title="Copy peer ID" disabled={!peerId || peerId.startsWith("envoy_")}>
              <CopyIcon size={14} />
            </button>
          </div>
        </div>
        <div className="profile-hero-actions">
          <button className="btn btn-primary" onClick={() => setIsEditingProfile(true)}>
            <EditIcon size={14} />
            Edit Profile
          </button>
        </div>
      </div>

      <div className="profile-section">
        <h3>About</h3>
        <div className="profile-bio">{humanProfile?.bio || "No bio yet — edit your profile to introduce yourself."}</div>
      </div>

      {(humanProfile?.hobbies?.length ?? 0) > 0 && (
        <div className="profile-section">
          <h3>Interests</h3>
          <div className="profile-tags">
            {humanProfile?.hobbies?.map((h: string, i: number) => (
              <span key={`h-${i}`} className="profile-tag">{h}</span>
            ))}
            {humanProfile?.knowledge?.map((k: string, i: number) => (
              <span key={`k-${i}`} className="profile-tag neutral">{k}</span>
            ))}
          </div>
        </div>
      )}

      {(humanProfile?.capabilities?.length ?? 0) > 0 && (
        <div className="profile-section">
          <h3>Capabilities</h3>
          <div className="profile-tags">
            {(humanProfile?.capabilities ?? []).map((cap: Capability, i: number) => {
              const label = "tag" in cap ? cap.tag : "type" in cap ? cap.type : "descriptor" in cap ? cap.descriptor : "";
              return <span key={`cap-${i}`} className="profile-tag neutral">{label}</span>;
            })}
          </div>
        </div>
      )}

      <div className="profile-section">
        <h3>Connection</h3>
        <div className="profile-info-grid">
          <div className="profile-info-item">
            <dt>Peer ID</dt>
            <dd>{peerId && !peerId.startsWith("envoy_") ? shortId(peerId) : "\u2014"}</dd>
          </div>
          <div className="profile-info-item">
            <dt>Status</dt>
            <dd>{nodeStatus}</dd>
          </div>
          <div className="profile-info-item">
            <dt>Connected Peers</dt>
            <dd>{bonds.length}</dd>
          </div>
        </div>
      </div>
    </div>
  );
}
