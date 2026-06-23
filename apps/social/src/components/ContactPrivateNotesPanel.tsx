import { memo, useCallback, useEffect, useRef, useState } from "react";
import { isContactNotesSyncScope } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { createContactNotesCrdt } from "../lib/contact-notes-crdt.js";

export interface ContactPrivateNotesPanelProps {
  ownerId: string;
  contactOwnerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Per-contact private notes — isolated from chat send state so slow sends do not re-render this panel. */
export const ContactPrivateNotesPanel = memo(function ContactPrivateNotesPanel({
  ownerId,
  contactOwnerId,
  open,
  onOpenChange,
}: ContactPrivateNotesPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;

  const notesRef = useRef<ReturnType<typeof createContactNotesCrdt> | null>(null);
  const notesSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [contactNote, setContactNote] = useState("");
  const [contactTags, setContactTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const pushNotesSync = useCallback((updateBase64: string, scope: string) => {
    if (notesSyncTimerRef.current) clearTimeout(notesSyncTimerRef.current);
    notesSyncTimerRef.current = setTimeout(() => {
      void nodeServiceRef.current.sendSyncStateUpdate({ scope, updateBase64 }).catch(() => {});
    }, 400);
  }, []);

  useEffect(() => {
    const notes = createContactNotesCrdt(ownerId, contactOwnerId, {
      onLocalUpdate: pushNotesSync,
      onChange: () => {
        const nextNote = notes.getNote();
        const nextTags = notes.getTags();
        setContactNote((prev) => (prev === nextNote ? prev : nextNote));
        setContactTags((prev) =>
          prev.length === nextTags.length && prev.every((tag, i) => tag === nextTags[i])
            ? prev
            : nextTags,
        );
      },
    });
    notesRef.current = notes;
    setContactNote(notes.getNote());
    setContactTags(notes.getTags());
    return () => {
      if (notesSyncTimerRef.current) clearTimeout(notesSyncTimerRef.current);
      notes.destroy();
      notesRef.current = null;
    };
  }, [ownerId, contactOwnerId, pushNotesSync]);

  useEffect(() => {
    return nodeService.on("crdt:sync", (data) => {
      if (!isContactNotesSyncScope(data.scope)) return;
      if (data.scope === notesRef.current?.syncScope) {
        notesRef.current.applyRemoteUpdate(data.updateBase64);
      }
    });
  }, [nodeService]);

  return (
    <details
      className="contact-notes-panel"
      open={open}
      onToggle={(event) => onOpenChange((event.target as HTMLDetailsElement).open)}
    >
      <summary>{t("contactChat.privateNotesSummary")}</summary>
      <textarea
        className="contact-notes-input"
        rows={3}
        placeholder={t("contactChat.privateNotesPlaceholder")}
        value={contactNote}
        onChange={(e) => notesRef.current?.setNote(e.target.value)}
      />
      <div className="contact-notes-tags">
        {contactTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="contact-notes-tag"
            onClick={() => notesRef.current?.removeTag(tag)}
            title={t("contactChat.removeTagTitle")}
          >
            {tag} ×
          </button>
        ))}
      </div>
      <div className="contact-notes-tag-add">
        <input
          type="text"
          className="contact-notes-tag-input"
          placeholder={t("contactChat.addTagPlaceholder")}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const value = tagInput.trim();
            if (!value) return;
            notesRef.current?.addTag(value);
            setTagInput("");
          }}
        />
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const value = tagInput.trim();
            if (!value) return;
            notesRef.current?.addTag(value);
            setTagInput("");
          }}
        >
          {t("contactChat.addTagBtn")}
        </button>
      </div>
    </details>
  );
});
