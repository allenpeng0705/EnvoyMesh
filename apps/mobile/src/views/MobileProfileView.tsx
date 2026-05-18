/**
 * MobileProfileView — iOS Settings-list style profile.
 *
 * Header card with avatar/name/peerID, grouped section rows with chevrons.
 * Tapping header enters edit mode. Settings accessible via row at bottom.
 */
import { useState, useCallback } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "@envoymesh/social/lib/display.js";
import { PRESET_CAPABILITY_GROUPS, type Capability } from "@envoymesh/social/lib/profile.js";
import { PublicIcon, PrivateIcon } from "@envoymesh/social/icons.js";
import type { CreateHumanProfileInput } from "@envoymesh/api";

interface MobileProfileViewProps {
  onNavigateSettings?: () => void;
}

export function MobileProfileView({ onNavigateSettings }: MobileProfileViewProps) {
  const nodeService = useNodeService();
  const { humanProfile, peerId, bonds, nodeStatus, refreshNodeConfig, refreshHumanProfile } = useNodeState();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCapabilities, setSelectedCapabilities] = useState<Capability[]>(
    () => (humanProfile?.capabilities as Capability[]) ?? [],
  );

  const [form, setForm] = useState({
    displayName: humanProfile?.displayName ?? "",
    username: humanProfile?.username ?? "",
    bio: humanProfile?.bio ?? "",
    gender: humanProfile?.gender ?? "",
    hobbies: (humanProfile?.hobbies ?? []).join(", "),
    profileVisibility: (humanProfile?.profileVisibility ?? "private") as "public" | "private",
  });

  const handleSave = useCallback(async () => {
    if (!form.displayName.trim()) { alert("Display name is required"); return; }
    if (!form.username.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(form.username.trim())) {
      alert("Username is required. 3-30 characters, letters, numbers, underscore only.");
      return;
    }
    setIsSaving(true);
    try {
      const interests = form.hobbies.split(",").map((s) => s.trim()).filter(Boolean);
      await nodeService.updateHumanProfile({
        displayName: form.displayName.trim(),
        username: form.username.trim(),
        bio: form.bio,
        gender: form.gender,
        hobbies: interests,
        profileVisibility: form.profileVisibility,
        capabilities: selectedCapabilities,
      } satisfies CreateHumanProfileInput);
      await refreshHumanProfile();
      await refreshNodeConfig();
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }, [form, selectedCapabilities, nodeService, refreshNodeConfig, refreshHumanProfile]);

  // ---- Edit mode ----
  if (isEditing) {
    return (
      <div className="mv-profile">
        <div className="mv-profile-edit">
          <h2>Edit Profile</h2>

          <div className="mv-form-group">
            <label className="mv-form-label">Display Name</label>
            <input
              className="mv-form-input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Your name"
              enterKeyHint="next"
            />
          </div>

          <div className="mv-form-group">
            <label className="mv-form-label">Username</label>
            <input
              className="mv-form-input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="johndoe"
              enterKeyHint="next"
            />
          </div>

          <div className="mv-form-group">
            <label className="mv-form-label">Introduction</label>
            <textarea
              className="mv-form-textarea"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Tell people about yourself..."
              rows={3}
            />
          </div>

          <div className="mv-form-group">
            <label className="mv-form-label">Gender</label>
            <select
              className="mv-form-input"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">Prefer not to say</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="mv-form-group">
            <label className="mv-form-label">Interests</label>
            <input
              className="mv-form-input"
              value={form.hobbies}
              onChange={(e) => setForm({ ...form, hobbies: e.target.value })}
              placeholder="music, tech, gaming..."
              enterKeyHint="done"
            />
            <div className="mv-chips" style={{ marginTop: "var(--space-2)" }}>
              {SUGGESTED_TOPICS.slice(0, 8).map((topic) => (
                <button
                  key={topic}
                  className="mv-chip"
                  onClick={() => {
                    const current = form.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                    if (!current.includes(topic)) {
                      setForm({ ...form, hobbies: [...current, topic].join(", ") });
                    }
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div className="mv-form-group">
            <label className="mv-form-label">Capabilities</label>
            {PRESET_CAPABILITY_GROUPS.map((group) => (
              <div key={group.label} style={{ marginBottom: "var(--space-2)" }}>
                <div className="mv-form-label" style={{ marginBottom: "var(--space-1)" }}>
                  {group.label}
                </div>
                <div className="mv-chips">
                  {group.capabilities.map((cap) => {
                    const sel = selectedCapabilities.some(
                      (sc) => "tag" in sc && sc.tag === cap.tag,
                    );
                    return (
                      <button
                        key={cap.tag}
                        className={`mv-chip${sel ? " active" : ""}`}
                        onClick={() => {
                          if (sel) {
                            setSelectedCapabilities(
                              selectedCapabilities.filter(
                                (sc) => !("tag" in sc) || sc.tag !== cap.tag,
                              ),
                            );
                          } else {
                            setSelectedCapabilities([...selectedCapabilities, { tag: cap.tag }]);
                          }
                        }}
                        style={sel ? {
                          background: "var(--color-primary)",
                          color: "var(--color-primary-on)",
                          borderColor: "var(--color-primary)",
                        } : {}}
                      >
                        {cap.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Visibility toggle */}
          <div className="mv-form-group">
            <label className="mv-form-label">Profile Visibility</label>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                className="mv-chip"
                onClick={() => setForm({ ...form, profileVisibility: "public" })}
                style={form.profileVisibility === "public" ? {
                  background: "var(--color-primary)",
                  color: "var(--color-primary-on)",
                  borderColor: "var(--color-primary)",
                } : {}}
              >
                <PublicIcon size={16} /> Public
              </button>
              <button
                className="mv-chip"
                onClick={() => setForm({ ...form, profileVisibility: "private" })}
                style={form.profileVisibility === "private" ? {
                  background: "var(--color-primary)",
                  color: "var(--color-primary-on)",
                  borderColor: "var(--color-primary)",
                } : {}}
              >
                <PrivateIcon size={16} /> Private
              </button>
            </div>
          </div>

          <div className="mv-form-actions">
            <button className="mv-btn-secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
            <button className="mv-btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Display mode ----
  return (
    <div className="mv-profile">
      {/* Header card — tappable to edit */}
      <div
        className="mv-profile-header"
        onClick={() => {
          setForm({
            displayName: humanProfile?.displayName ?? "",
            username: humanProfile?.username ?? "",
            bio: humanProfile?.bio ?? "",
            gender: humanProfile?.gender ?? "",
            hobbies: (humanProfile?.hobbies ?? []).join(", "),
            profileVisibility: (humanProfile?.profileVisibility ?? "private") as "public" | "private",
          });
          setSelectedCapabilities((humanProfile?.capabilities as Capability[]) ?? []);
          setIsEditing(true);
        }}
        role="button"
        tabIndex={0}
        aria-label="Edit profile"
      >
        <div className="mv-profile-avatar">
          {humanProfile?.displayName?.[0] ?? humanProfile?.username?.[0] ?? peerId?.[0] ?? "?"}
        </div>
        <div className="mv-profile-names">
          <div className="mv-profile-name">
            {humanProfile?.displayName || humanProfile?.username || "Unnamed"}
          </div>
          {humanProfile?.username && (
            <div className="mv-profile-username">@{humanProfile.username}</div>
          )}
          <div className="mv-profile-peer-id">
            {peerId && (peerId.startsWith("envoy_agent_") || !peerId.startsWith("envoy_"))
              ? peerId.slice(0, 12) + "..."
              : "Loading..."}
          </div>
        </div>
        <span className="mv-profile-chevron">&#8250;</span>
      </div>

      {/* About section */}
      {humanProfile?.bio && (
        <div className="mv-section-group">
          <div className="mv-section-group-title">About</div>
          <div className="mv-section-row">
            <span className="mv-section-label">{humanProfile.bio}</span>
          </div>
        </div>
      )}

      {/* Interests section */}
      {(humanProfile?.hobbies?.length ?? 0) > 0 && (
        <div className="mv-section-group">
          <div className="mv-section-group-title">Interests</div>
          <div className="mv-section-row">
            <div className="mv-profile-tags">
              {humanProfile?.hobbies?.map((h: string, i: number) => (
                <span key={i} className="mv-profile-tag">{h}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Capabilities section */}
      {(humanProfile?.capabilities?.length ?? 0) > 0 && (
        <div className="mv-section-group">
          <div className="mv-section-group-title">Capabilities</div>
          <div className="mv-section-row">
            <div className="mv-profile-tags">
              {(humanProfile?.capabilities as Capability[]).map((cap: Capability, i: number) => {
                const label = "tag" in cap ? cap.tag
                  : "type" in cap ? cap.type
                  : "descriptor" in cap ? cap.descriptor
                  : "";
                return <span key={i} className="mv-profile-tag">{label}</span>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Connection section */}
      <div className="mv-section-group">
        <div className="mv-section-group-title">Connection</div>
        <div className="mv-section-row">
          <span className="mv-section-label">Status</span>
          <span className="mv-section-value">{nodeStatus}</span>
        </div>
        <div className="mv-section-row">
          <span className="mv-section-label">Bonded Peers</span>
          <span className="mv-section-value">{bonds.length}</span>
        </div>
      </div>

      {/* Settings link */}
      <div className="mv-section-group">
        <div className="mv-section-group-title">App</div>
        <div
          className="mv-section-row"
          onClick={onNavigateSettings}
          role="button"
          tabIndex={0}
        >
          <span className="mv-section-label">Settings</span>
          <span className="mv-section-row-chevron">&#8250;</span>
        </div>
        <div
          className="mv-section-row"
          onClick={() => setIsEditing(true)}
          role="button"
          tabIndex={0}
        >
          <span className="mv-section-label">Edit Profile</span>
          <span className="mv-section-row-chevron">&#8250;</span>
        </div>
      </div>
    </div>
  );
}

export { MobileProfileView as default };
