import { LoroDoc } from "loro-crdt";
import { contactNotesSyncScope } from "@envoymesh/api";

const STORAGE_PREFIX = "envoymesh:contact-notes:v1";

function storageKey(ownerId: string, contactOwnerId: string): string {
  return `${STORAGE_PREFIX}:${ownerId.trim() || "anonymous"}:${contactOwnerId.trim()}`;
}

function loadPersistedSnapshot(ownerId: string, contactOwnerId: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerId, contactOwnerId));
    if (!raw) return null;
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function persistSnapshot(ownerId: string, contactOwnerId: string, doc: LoroDoc): void {
  const snapshot = doc.export({ mode: "snapshot" });
  const encoded = btoa(String.fromCharCode(...snapshot));
  localStorage.setItem(storageKey(ownerId, contactOwnerId), encoded);
}

function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Local-first loro notes + tags per contact with optional wire sync (Phase 15E). */
export function createContactNotesCrdt(
  ownerId: string,
  contactOwnerId: string,
  options?: {
    onLocalUpdate?: (updateBase64: string, scope: string) => void;
    onChange?: () => void;
  },
): {
  syncScope: string;
  getNote: () => string;
  setNote: (value: string) => void;
  getTags: () => string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  applyRemoteUpdate: (updateBase64: string) => void;
  destroy: () => void;
} {
  const syncScope = contactNotesSyncScope(contactOwnerId);
  const doc = new LoroDoc();
  const noteText = doc.getText("note");
  const tagList = doc.getList("tags");
  const saved = loadPersistedSnapshot(ownerId, contactOwnerId);
  if (saved) {
    doc.import(saved);
  }

  const unsub = doc.subscribe((batch) => {
    persistSnapshot(ownerId, contactOwnerId, doc);
    options?.onChange?.();
    if (batch.by === "local") {
      const update = doc.export({ mode: "update" });
      options?.onLocalUpdate?.(btoa(String.fromCharCode(...update)), syncScope);
    }
  });

  const replaceNote = (value: string) => {
    const current = noteText.toString();
    if (current.length > 0) {
      noteText.delete(0, current.length);
    }
    if (value) {
      noteText.insert(0, value);
    }
    doc.commit();
  };

  const tagValues = (): string[] =>
    tagList
      .toArray()
      .map((entry) => (typeof entry === "string" ? entry : String(entry)))
      .filter(Boolean);

  return {
    syncScope,
    getNote() {
      return noteText.toString();
    },
    setNote(value: string) {
      replaceNote(value);
    },
    getTags() {
      return tagValues();
    },
    addTag(raw: string) {
      const tag = normalizeTag(raw);
      if (!tag) return;
      const existing = tagValues().map((t) => t.toLowerCase());
      if (existing.includes(tag.toLowerCase())) return;
      tagList.push(tag);
      doc.commit();
    },
    removeTag(raw: string) {
      const target = normalizeTag(raw).toLowerCase();
      if (!target) return;
      const tags = tagValues();
      const index = tags.findIndex((tag) => tag.toLowerCase() === target);
      if (index >= 0) {
        tagList.delete(index, 1);
        doc.commit();
      }
    },
    applyRemoteUpdate(updateBase64: string) {
      const bytes = Uint8Array.from(atob(updateBase64), (c) => c.charCodeAt(0));
      doc.import(bytes);
    },
    destroy() {
      persistSnapshot(ownerId, contactOwnerId, doc);
      unsub();
    },
  };
}

export { contactNotesSyncScope };
