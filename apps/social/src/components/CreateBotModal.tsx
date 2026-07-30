/**
 * Modal dialog for creating or editing an AI Character Bot.
 * Saves via updateNodeConfig({ aiBots: [...] }) → home:config-updated
 * broadcast → all clients pick up the bot thread.
 */
import { useState } from "react";
import { aiBotThreadKey, normalizeAiBotDefinition, type AiBotDefinition } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";

export interface CreateBotModalProps {
  onClose: () => void;
  /** Called with `bot:<id>` after a successful create/save. */
  onCreated?: (threadKey: string) => void;
  /** When set, modal edits this bot (keeps the same id). */
  initialBot?: AiBotDefinition;
}

export function CreateBotModal({ onClose, onCreated, initialBot }: CreateBotModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { refreshNodeConfig } = useNodeState();
  const isEdit = Boolean(initialBot);
  const [name, setName] = useState(initialBot?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initialBot?.systemPrompt ?? "");
  const [description, setDescription] = useState(initialBot?.description ?? "");
  const [avatarColor, setAvatarColor] = useState(initialBot?.avatarColor ?? "#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedPrompt = systemPrompt.trim();
    if (!trimmedName || !trimmedPrompt) {
      setError(
        !trimmedName
          ? t("settings.ai.aiBots.nameRequired", "Bot name is required")
          : t("settings.ai.aiBots.promptRequired", "Personality / system prompt is required"),
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const config = await nodeService.getNodeConfig();
      const existing: AiBotDefinition[] =
        (config as unknown as { aiBots?: AiBotDefinition[] }).aiBots ?? [];

      const nameTaken = existing.some(
        (b) =>
          b.id !== initialBot?.id &&
          b.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      );
      if (nameTaken) {
        setError(
          t("settings.ai.aiBots.nameTaken", "A bot named “{name}” already exists.", {
            name: trimmedName,
          }),
        );
        setSaving(false);
        return;
      }

      let uniqueId = initialBot?.id ?? "";
      if (!isEdit) {
        const slug =
          trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
          `bot-${Date.now()}`;
        uniqueId = slug;
        let counter = 1;
        while (existing.some((b) => b.id === uniqueId)) {
          uniqueId = `${slug}-${counter++}`;
        }
      }

      const nextBot = normalizeAiBotDefinition({
        id: uniqueId,
        name: trimmedName,
        systemPrompt: trimmedPrompt,
        description: description.trim() || undefined,
        avatarColor,
        enabled: initialBot?.enabled !== false,
        ...(initialBot?.taskType ? { taskType: initialBot.taskType } : {}),
        ...(initialBot?.model ? { model: initialBot.model } : {}),
      });

      const newBots = isEdit
        ? existing.map((b) => (b.id === uniqueId ? nextBot : b))
        : [...existing, nextBot];

      await nodeService.updateNodeConfig({ aiBots: newBots });
      await refreshNodeConfig();
      onCreated?.(aiBotThreadKey(uniqueId));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
            <h2 id="create-bot-title">
              {isEdit
                ? t("chat.editBot", "Edit AI Bot")
                : t("chat.createBot", "Create AI Bot")}
            </h2>
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
                placeholder={t(
                  "settings.ai.aiBots.personalityPlaceholder",
                  "You are Luna, my girlfriend. You love music, movies, and travelling. Speak warmly and affectionately.",
                )}
                rows={4}
              />
              <p className="settings-hint">
                {t(
                  "settings.ai.aiBots.personalityHint",
                  "Write as the character in first person (“You are …”). Avoid third person (“Luna is …”) or assistant wording (“I am an AI that helps…”). We reshape this on save.",
                )}
              </p>
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
                placeholder={t(
                  "settings.ai.aiBots.descPlaceholder",
                  "My girlfriend · music & travel",
                )}
              />
              <p className="settings-hint">
                {t(
                  "settings.ai.aiBots.descHint",
                  "One short line for the chat list. Leave blank to auto-fill from the personality.",
                )}
              </p>
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
              onClick={() => { void handleSave() }}
              disabled={saving}
            >
              {saving
                ? t("settings.ai.aiBots.saving", "Saving…")
                : isEdit
                  ? t("settings.ai.aiBots.save", "Save")
                  : t("settings.ai.aiBots.create", "Create Bot")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
