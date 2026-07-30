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
import { ModalPortal } from "./ModalPortal.js";

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
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal-panel create-bot-modal"
          role="dialog"
          aria-labelledby="create-bot-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="create-bot-title">{t("chat.createBot", "Create AI Bot")}</h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label={t("common.close", "Close")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="create-bot-preview">
            <span
              className="create-bot-preview-avatar"
              style={{ background: avatarColor }}
              aria-hidden
            >
              {(name.trim().charAt(0) || "?").toUpperCase()}
            </span>
            <span className="create-bot-preview-name">
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
              <div className="create-bot-color-row">
                <input
                  type="color"
                  className="create-bot-color-input"
                  value={avatarColor}
                  onChange={(e) => setAvatarColor(e.target.value)}
                />
                <span className="create-bot-color-hex">{avatarColor}</span>
              </div>
            </div>
          </div>

          {error ? <p className="modal-error">{error}</p> : null}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={saving}
            >
              {t("settings.ai.aiBots.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => { void handleCreate() }}
              disabled={!canCreate}
            >
              {saving
                ? t("settings.ai.aiBots.saving", "Saving…")
                : t("settings.ai.aiBots.create", "Create Bot")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
