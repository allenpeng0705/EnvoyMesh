import * as Y from "yjs";
import { contactComposeDraftSyncScope } from "@envoymesh/api";

const STORAGE_PREFIX = "envoymesh:contact-compose-draft:v1";
const REMOTE_ORIGIN = "remote";
/** Local edit that should persist locally but not fan out on the mesh (e.g. after send). */
const LOCAL_SILENT = "local-silent";

function storageKey(ownerId: string, contactOwnerId: string): string {
  return `${STORAGE_PREFIX}:${ownerId.trim() || "anonymous"}:${contactOwnerId.trim()}`;
}

function loadPersistedUpdate(ownerId: string, contactOwnerId: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerId, contactOwnerId));
    if (!raw) return null;
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function persistUpdate(ownerId: string, contactOwnerId: string, doc: Y.Doc): void {
  const update = Y.encodeStateAsUpdate(doc);
  const encoded = btoa(String.fromCharCode(...update));
  localStorage.setItem(storageKey(ownerId, contactOwnerId), encoded);
}

/** Local-first yjs compose buffer per contact thread with optional wire sync (Phase 15E). */
export function createContactComposeDraftCrdt(
  ownerId: string,
  contactOwnerId: string,
  options?: {
    onLocalUpdate?: (updateBase64: string, scope: string) => void;
  },
): {
  text: Y.Text;
  setPlainText: (value: string, options?: { skipWireSync?: boolean }) => void;
  getPlainText: () => string;
  applyRemoteUpdate: (updateBase64: string) => void;
  syncScope: string;
  destroy: () => void;
} {
  const syncScope = contactComposeDraftSyncScope(contactOwnerId);
  const doc = new Y.Doc();
  const text = doc.getText("draft");
  const saved = loadPersistedUpdate(ownerId, contactOwnerId);
  if (saved) {
    Y.applyUpdate(doc, saved, REMOTE_ORIGIN);
  }

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    persistUpdate(ownerId, contactOwnerId, doc);
    if (origin !== REMOTE_ORIGIN && origin !== LOCAL_SILENT) {
      options?.onLocalUpdate?.(btoa(String.fromCharCode(...update)), syncScope);
    }
  };
  doc.on("update", onUpdate);

  return {
    text,
    syncScope,
    setPlainText(value: string, opts?: { skipWireSync?: boolean }) {
      doc.transact(() => {
        text.delete(0, text.length);
        if (value) text.insert(0, value);
      }, opts?.skipWireSync ? LOCAL_SILENT : undefined);
    },
    getPlainText() {
      return text.toString();
    },
    applyRemoteUpdate(updateBase64: string) {
      const bytes = Uint8Array.from(atob(updateBase64), (c) => c.charCodeAt(0));
      Y.applyUpdate(doc, bytes, REMOTE_ORIGIN);
    },
    destroy() {
      doc.off("update", onUpdate);
      doc.destroy();
    },
  };
}

export { contactComposeDraftSyncScope };
