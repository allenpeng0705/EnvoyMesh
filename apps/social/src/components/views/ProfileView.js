import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
const PRESET_CAPABILITY_GROUPS = [
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
export function ProfileView() {
    const nodeService = useNodeService();
    const { humanProfile, nodeStatus, peerId, bonds, connectionStatus, refreshNodeConfig } = useNodeState();
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [selectedCapabilities, setSelectedCapabilities] = useState(() => humanProfile?.capabilities ?? []);
    const [advertisedTopics, setAdvertisedTopics] = useState([]);
    const [newTopic, setNewTopic] = useState("");
    const avatarInputRef = useRef(null);
    const connectionInfo = {
        peerId: peerId || "QmLoading...",
        bondedPeers: bonds.length,
    };
    const [profileEditForm, setProfileEditForm] = useState({
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
            });
            await refreshNodeConfig();
            await nodeService.getHumanProfile().then((p) => {
                if (p) {
                    // Update is handled by context refresh, but we reset form
                }
            }).catch(() => { });
            setIsEditingProfile(false);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to update profile";
            console.error("Failed to update profile:", error);
            alert(message);
        }
        finally {
            setIsSavingProfile(false);
        }
    };
    const handleAdvertiseTopic = async () => {
        const topic = newTopic.trim();
        if (!topic)
            return;
        try {
            await nodeService.advertiseTopic(topic);
            setAdvertisedTopics((prev) => [...prev, topic]);
            setNewTopic("");
        }
        catch (error) {
            console.error("Failed to advertise topic:", error);
        }
    };
    const handleStopAdvertiseTopic = async (topic) => {
        try {
            await nodeService.stopAdvertiseTopic(topic);
            setAdvertisedTopics((prev) => prev.filter((t) => t !== topic));
        }
        catch (error) {
            console.error("Failed to stop advertising topic:", error);
        }
    };
    // ---- Render: Edit Mode ----
    if (isEditingProfile) {
        return (_jsx("div", { className: "profile-view", children: _jsxs("div", { className: "profile-edit", children: [_jsx("h2", { children: "Edit Your Profile" }), _jsxs("div", { className: "form-group avatar-upload", children: [_jsx("label", { children: "Photo" }), _jsxs("div", { className: "avatar-preview", children: [_jsx("div", { className: "profile-avatar large", children: humanProfile?.displayName?.[0] ?? peerId?.[0] ?? "?" }), _jsx("input", { type: "file", accept: "image/*", ref: avatarInputRef, style: { display: "none" }, onChange: (e) => {
                                            const file = e.target.files?.[0];
                                            if (file)
                                                console.log("Avatar selected:", file.name);
                                        } }), _jsx("button", { type: "button", className: "btn-secondary", onClick: () => avatarInputRef.current?.click(), children: "Choose Photo" })] })] }), _jsxs("div", { className: "form-group", children: [_jsxs("label", { children: ["Display Name ", _jsx("span", { className: "required", children: "*" })] }), _jsx("input", { type: "text", value: profileEditForm.displayName, onChange: (e) => setProfileEditForm({ ...profileEditForm, displayName: e.target.value }), placeholder: "Your name", required: true })] }), _jsxs("div", { className: "form-group", children: [_jsxs("label", { children: ["Username ", _jsx("span", { className: "required", children: "*" })] }), _jsx("input", { type: "text", value: profileEditForm.username, onChange: (e) => setProfileEditForm({ ...profileEditForm, username: e.target.value }), placeholder: "johndoe", required: true, pattern: "^[a-zA-Z0-9_]{3,30}$" }), _jsx("small", { children: "Used for DHT discovery. 3-30 characters, letters, numbers, underscore only." })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Introduction" }), _jsx("textarea", { value: profileEditForm.bio, onChange: (e) => setProfileEditForm({ ...profileEditForm, bio: e.target.value }), placeholder: "Hi! I'm into music and coding. Always happy to chat about tech...", rows: 3 })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Gender" }), _jsxs("select", { value: profileEditForm.gender, onChange: (e) => setProfileEditForm({ ...profileEditForm, gender: e.target.value }), children: [_jsx("option", { value: "", children: "Prefer not to say" }), _jsx("option", { value: "Male", children: "Male" }), _jsx("option", { value: "Female", children: "Female" }), _jsx("option", { value: "Non-binary", children: "Non-binary" }), _jsx("option", { value: "Other", children: "Other" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Discovery" }), _jsxs("div", { className: "visibility-toggle", children: [_jsxs("button", { type: "button", className: profileEditForm.profileVisibility === "public" ? "active public" : "", onClick: () => setProfileEditForm({ ...profileEditForm, profileVisibility: "public" }), children: [_jsx("span", { className: "visibility-icon", children: "\uD83C\uDF10" }), _jsx("span", { className: "visibility-label", children: "Public" }), _jsx("small", { children: "Advertise to network for discovery" })] }), _jsxs("button", { type: "button", className: profileEditForm.profileVisibility === "private" ? "active private" : "", onClick: () => setProfileEditForm({ ...profileEditForm, profileVisibility: "private" }), children: [_jsx("span", { className: "visibility-icon", children: "\uD83D\uDD12" }), _jsx("span", { className: "visibility-label", children: "Private" }), _jsx("small", { children: "Only visible to bonded peers" })] })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Interests" }), _jsxs("div", { className: "interests-input-container", children: [profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean).map((interest, i) => (_jsxs("span", { className: "interest-tag removable", children: [interest, _jsx("button", { type: "button", className: "remove-interest", onClick: () => {
                                                    const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                                                    current.splice(i, 1);
                                                    setProfileEditForm({ ...profileEditForm, hobbies: current.join(", ") });
                                                }, children: "\u00D7" })] }, i))), _jsx("input", { type: "text", value: profileEditForm.hobbies, onChange: (e) => setProfileEditForm({ ...profileEditForm, hobbies: e.target.value }), placeholder: "Add interests...", className: "interests-text-input" })] }), _jsx("small", { children: "Press Enter or comma to add. Click \u00D7 to remove." }), _jsxs("div", { className: "suggested-interests", children: [_jsx("span", { className: "suggested-label", children: "Suggestions:" }), _jsx("div", { className: "interest-chips", children: SUGGESTED_TOPICS.map((topic) => (_jsx("button", { type: "button", className: "interest-chip", onClick: () => {
                                                const current = profileEditForm.hobbies.split(",").map(s => s.trim()).filter(Boolean);
                                                if (!current.includes(topic)) {
                                                    setProfileEditForm({ ...profileEditForm, hobbies: [...current, topic].join(", ") });
                                                }
                                            }, children: topic }, topic))) })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Capabilities for Discovery" }), _jsx("p", { className: "field-description", children: "Select capabilities to advertise on the rendezvous network for peer discovery." }), _jsx("div", { className: "capability-groups", children: PRESET_CAPABILITY_GROUPS.map((group) => (_jsxs("div", { className: "capability-group", children: [_jsx("h4", { children: group.label }), _jsx("div", { className: "capability-chips", children: group.capabilities.map((cap) => {
                                                const isSelected = selectedCapabilities.some((sc) => "tag" in sc && sc.tag === cap.tag);
                                                return (_jsx("button", { type: "button", className: `capability-chip ${isSelected ? "selected" : ""}`, onClick: () => {
                                                        if (isSelected) {
                                                            setSelectedCapabilities(selectedCapabilities.filter((sc) => !("tag" in sc) || sc.tag !== cap.tag));
                                                        }
                                                        else {
                                                            setSelectedCapabilities([
                                                                ...selectedCapabilities,
                                                                { tag: cap.tag },
                                                            ]);
                                                        }
                                                    }, title: cap.description, children: cap.label }, cap.tag));
                                            }) })] }, group.label))) }), selectedCapabilities.length > 0 && (_jsxs("div", { className: "selected-capabilities", children: [_jsx("span", { className: "selected-label", children: "Selected:" }), selectedCapabilities.map((cap, i) => (_jsxs("span", { className: "selected-cap-tag", children: ["tag" in cap ? cap.tag : "type" in cap ? cap.type : cap.descriptor, _jsx("button", { type: "button", className: "remove-cap", onClick: () => setSelectedCapabilities(selectedCapabilities.filter((_, j) => j !== i)), children: "\u00D7" })] }, i)))] }))] }), _jsxs("div", { className: "profile-edit-actions", children: [_jsx("button", { onClick: handleSaveProfile, className: "btn-primary", disabled: isSavingProfile, children: isSavingProfile ? "Saving..." : "Save" }), _jsx("button", { onClick: () => setIsEditingProfile(false), className: "btn-secondary", children: "Cancel" })] })] }) }));
    }
    // ---- Render: Display Mode ----
    return (_jsx("div", { className: "profile-view", children: _jsxs("div", { className: "profile-display", children: [_jsxs("div", { className: "profile-header", children: [_jsx("div", { className: "profile-avatar", children: humanProfile?.displayName?.[0] ?? humanProfile?.username?.[0] ?? connectionInfo.peerId?.[0] ?? "?" }), _jsxs("div", { className: "profile-header-info", children: [_jsx("h2", { children: humanProfile?.displayName || humanProfile?.username || "Unnamed Peer" }), humanProfile?.username && (_jsxs("p", { className: "profile-username", children: ["@", humanProfile.username] })), _jsx("p", { className: "profile-owner-id", children: _jsx("button", { className: "copy-id-btn", type: "button", onClick: () => peerId && !peerId.startsWith("envoy_") && navigator.clipboard.writeText(peerId), title: "Copy network peer ID (libp2p)", disabled: !peerId || peerId.startsWith("envoy_"), children: peerId && !peerId.startsWith("envoy_")
                                            ? `${peerId.slice(0, 12)}\u2026 (copy)`
                                            : "Network ID loading\u2026" }) })] })] }), _jsx("div", { className: "profile-actions", children: _jsx("button", { onClick: () => setIsEditingProfile(true), className: "btn-primary", children: "Edit Profile" }) }), _jsxs("div", { className: "profile-section", children: [_jsx("h3", { children: "About" }), _jsx("p", { className: "profile-bio", children: humanProfile?.bio || "No bio yet" })] }), humanProfile?.gender && (_jsxs("div", { className: "profile-section", children: [_jsx("h3", { children: "Gender" }), _jsx("p", { children: humanProfile.gender })] })), (humanProfile?.hobbies?.length ?? 0) > 0 || (humanProfile?.knowledge?.length ?? 0) > 0 || advertisedTopics.length > 0 ? (_jsxs("div", { className: "profile-section", children: [_jsx("h3", { children: "Interests" }), _jsx("p", { className: "profile-hint", children: "Your interests help others discover you in search. Dashed tags are advertised for DHT discovery." }), _jsxs("div", { className: "profile-tags", children: [humanProfile?.hobbies?.map((h, i) => (_jsx("span", { className: "tag", children: h }, `h-${i}`))), humanProfile?.knowledge?.map((k, i) => (_jsx("span", { className: "tag knowledge", children: k }, `k-${i}`))), advertisedTopics.map((topic, i) => (_jsx("span", { className: "tag advertised", children: topic }, `t-${i}`)))] })] })) : null, (humanProfile?.capabilities?.length ?? 0) > 0 || selectedCapabilities.length > 0 ? (_jsxs("div", { className: "profile-section", children: [_jsx("h3", { children: "Capabilities" }), _jsx("p", { className: "profile-hint", children: "Your advertised capabilities for rendezvous-based peer discovery." }), _jsx("div", { className: "profile-tags", children: (humanProfile?.capabilities ?? selectedCapabilities).map((cap, i) => {
                                const label = "tag" in cap ? cap.tag : "type" in cap ? cap.type : "descriptor" in cap ? cap.descriptor : "";
                                return (_jsx("span", { className: "tag capability", children: label }, `cap-${i}`));
                            }) })] })) : null, _jsxs("div", { className: "profile-section", children: [_jsx("h3", { children: "Connection" }), _jsx("p", { className: "profile-hint", children: "Libp2p network address for this device \u2014 not the same as Envoy owner or envelope ids." }), _jsxs("dl", { className: "profile-info", children: [_jsx("dt", { children: "Network peer ID" }), _jsx("dd", { children: _jsx("code", { className: "peer-id-display", children: peerId && !peerId.startsWith("envoy_") ? peerId : "\u2014" }) }), _jsx("dt", { children: "Node Status" }), _jsx("dd", { children: nodeStatus }), _jsx("dt", { children: "Connected Peers" }), _jsx("dd", { children: bonds.length })] })] })] }) }));
}
//# sourceMappingURL=ProfileView.js.map