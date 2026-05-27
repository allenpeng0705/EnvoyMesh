import * as Y from "yjs";
import { ASSISTANT_DRAFT_SYNC_SCOPE } from "@envoymesh/api";

const STORAGE_PREFIX = "envoymesh:assistant-draft:v1";
const REMOTE_ORIGIN = "remote";

function storageKey(ownerId: string): string {
  return `${STORAGE_PREFIX}:${ownerId.trim() || "anonymous"}`;
}

function loadPersistedUpdate(ownerId: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (!raw) return null;
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function persistUpdate(ownerId: string, doc: Y.Doc): void {
  const update = Y.encodeStateAsUpdate(doc);
  const encoded = btoa(String.fromCharCode(...update));
  localStorage.setItem(storageKey(ownerId), encoded);
}

/** Local-first yjs draft buffer for Assistant compose with optional wire sync (Phase 15E). */
export function createAssistantDraftCrdt(
  ownerId: string,
  options?: {
    onLocalUpdate?: (updateBase64: string) => void;
  },
): {
  text: Y.Text;
  setPlainText: (value: string) => void;
  getPlainText: () => string;
  applyRemoteUpdate: (updateBase64: string) => void;
  encodeFullStateBase64: () => string;
  destroy: () => void;
} {
  const doc = new Y.Doc();
  const text = doc.getText("draft");
  const saved = loadPersistedUpdate(ownerId);
  if (saved) {
    Y.applyUpdate(doc, saved, REMOTE_ORIGIN);
  }

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    persistUpdate(ownerId, doc);
    if (origin !== REMOTE_ORIGIN) {
      options?.onLocalUpdate?.(btoa(String.fromCharCode(...update)));
    }
  };
  doc.on("update", onUpdate);

  return {
    text,
    setPlainText(value: string) {
      doc.transact(() => {
        text.delete(0, text.length);
        if (value) text.insert(0, value);
      });
    },
    getPlainText() {
      return text.toString();
    },
    applyRemoteUpdate(updateBase64: string) {
      const bytes = Uint8Array.from(atob(updateBase64), (c) => c.charCodeAt(0));
      Y.applyUpdate(doc, bytes, REMOTE_ORIGIN);
    },
    encodeFullStateBase64() {
      return btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
    },
    destroy() {
      doc.off("update", onUpdate);
      doc.destroy();
    },
  };
}

export { ASSISTANT_DRAFT_SYNC_SCOPE };
