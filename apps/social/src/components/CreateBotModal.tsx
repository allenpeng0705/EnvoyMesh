/**
 * Modal dialog for creating a new AI Character Bot.
 * Appears in the ChatSidebar AI section when the "+" button is clicked.
 * Saves via updateNodeConfig({ aiBots: [...] }) → home:config-updated
 * broadcast → all clients pick up the new bot thread.
 */
import { useState } from "react";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import type { AiBotDefinition } from "@envoymesh/api";

export interface CreateBotModalProps {
  onClose: () => void;
}

export function CreateBotModal({ onClose }: CreateBotModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [avatarColor, setAvatarColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedPrompt = systemPrompt.trim();
    if (!trimmedName || !trimmedPrompt) return;

    setSaving(true);
    setError(null);
    try {
      // Fetch current bots.
      const config = await nodeService.getNodeConfig();
      const existing: AiBotDefinition[] = (config as unknown as { aiBots?: AiBotDefinition[] }).aiBots ?? [];

      // Generate unique slug from name.
      const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `bot-${Date.now()}`;
      let uniqueId = slug;
      let counter = 1;
      while (existing.some((b) => b.id === uniqueId)) {
        uniqueId = `${slug}-${counter++}`;
      }

      const newBot: AiBotDefinition = {
        id: uniqueId,
        name: trimmedName,
        systemPrompt: trimmedPrompt,
        description: description.trim() || undefined,
        avatarColor,
        enabled: true,
      };

      // Save via config update — broadcasts to all clients.
      await nodeService.updateNodeConfig({ aiBots: [...existing, newBot] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const canCreate = name.trim().length > 0 && systemPrompt.trim().length > 0 && !saving;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          maxWidth: "28rem",
          width: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
            {t("chat.createBot", "Create AI Bot")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.25rem", color: "var(--color-text-muted, #64748b)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Preview avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
          <span
            style={{
              background: avatarColor,
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.625rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 700,
            }}
          >
            {(name.trim().charAt(0) || "?").toUpperCase()}
          </span>
          <span style={{ fontWeight: 500, fontSize: "0.9rem", color: "var(--color-text, #1f2937)" }}>
            {name.trim() || t("chat.botNamePlaceholder", "Bot name")}
          </span>
        </div>

        <div className="agent-block-fields">
          <div className="agent-field">
            <label className="agent-field-label">
              {t("settings.ai.aiBots.name", "Bot name")}
            </label>
            <input
              type="text"
              className="agent-field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.ai.aiBots.namePlaceholder", "e.g. Luna the Librarian")}
              autoFocus
            />
          </div>
          <div className="agent-field">
            <label className="agent-field-label">
              {t("settings.ai.aiBots.personality", "Personality / System prompt")}
            </label>
            <textarea
              className="agent-field-input"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("settings.ai.aiBots.personalityPlaceholder", "Describe the character: personality, speaking style, expertise…")}
              rows={4}
              style={{ fontFamily: "inherit", fontSize: "0.85rem", resize: "vertical" }}
            />
          </div>
          <div className="agent-field">
            <label className="agent-field-label">
              {t("settings.ai.aiBots.description", "Short description (optional)")}
            </label>
            <input
              type="text"
              className="agent-field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("settings.ai.aiBots.descPlaceholder", "A wise guide for knowledge seekers")}
            />
          </div>
          <div className="agent-field">
            <label className="agent-field-label">
              {t("settings.ai.aiBots.avatarColor", "Avatar color")}
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="color"
                value={avatarColor}
                onChange={(e) => setAvatarColor(e.target.value)}
                style={{ width: "3rem", height: "2rem", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "0.375rem", cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>{avatarColor}</span>
            </div>
          </div>
        </div>

        {error ? (
          <p className="pi-error" style={{ marginTop: "0.75rem" }}>{error}</p>
        ) : null}

        <div className="agent-block-actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="settings-save-btn"
            onClick={() => { void handleCreate() }}
            disabled={!canCreate}
          >
            {saving
              ? t("settings.ai.aiBots.saving", "Saving…")
              : t("settings.ai.aiBots.create", "Create Bot")}
          </button>
          <button
            type="button"
            className="settings-action-btn"
            onClick={onClose}
            disabled={saving}
          >
            {t("settings.ai.aiBots.cancel", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
