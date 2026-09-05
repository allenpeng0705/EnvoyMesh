import type { ChatAttachment } from "@envoymesh/api";
import { useEffect, useState } from "react";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { useToast } from "../hooks/useToast.js";
import {
  formatFileBytes,
  openVaultLibraryFile,
  revealVaultLibraryFile,
} from "../lib/library-file-actions.js";
import {
  FAMILY_ATTACHMENT_PREVIEW_MAX_BYTES,
  fetchFamilyAttachmentBase64,
} from "../lib/family-content.js";

export interface ChatFileAttachmentProps {
  attachment: ChatAttachment;
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function ChatFileAttachment({ attachment }: ChatFileAttachmentProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const vaultPath = attachment.vaultRelativePath?.replace(/^[\\/]+/, "");

  useEffect(() => {
    if (!isImageMime(attachment.mimeType)) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (vaultPath) {
          const result = await nodeService.readLibraryItemContent({ relativePath: vaultPath });
          if (cancelled) return;
          setPreviewUrl(`data:${result.mimeType};base64,${result.contentBase64}`);
          return;
        }
        // No vault path → family-media attachment (EM-F3). Bytes live in the
        // home `family-media` area, addressed by id — never touch the vault.
        // Files over the preview cap render as the plain chip (no inline img).
        if (attachment.sizeBytes > FAMILY_ATTACHMENT_PREVIEW_MAX_BYTES) {
          if (!cancelled) setPreviewUrl(null);
          return;
        }
        const { contentBase64 } = await fetchFamilyAttachmentBase64(
          (params) => nodeService.readFamilyAttachment(params),
          attachment.id,
        );
        if (cancelled) return;
        setPreviewUrl(`data:${attachment.mimeType};base64,${contentBase64}`);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.mimeType, attachment.sizeBytes, nodeService, vaultPath]);

  const run = async (action: "open" | "reveal") => {
    if (!vaultPath) {
      showToast(t("fileShare.pathUnavailable"), "error");
      return;
    }
    setBusy(true);
    try {
      if (action === "open") {
        await openVaultLibraryFile(nodeService, vaultPath);
      } else {
        await revealVaultLibraryFile(nodeService, vaultPath);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-file-attachment">
      {previewUrl ? (
        <img
          className="chat-file-attachment-preview"
          src={previewUrl}
          alt={attachment.filename}
          loading="lazy"
        />
      ) : (
        <div className="chat-file-attachment-icon" aria-hidden>
          📎
        </div>
      )}
      <div className="chat-file-attachment-body">
        <div className="chat-file-attachment-name">{attachment.filename}</div>
        <div className="chat-file-attachment-meta">
          {formatFileBytes(attachment.sizeBytes)}
          {attachment.mimeType ? ` · ${attachment.mimeType}` : ""}
        </div>
      </div>
      {vaultPath ? (
        <div className="chat-file-attachment-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => void run("open")}>
            {busy ? t("library.opening") : t("library.open")}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run("reveal")}>
            {t("library.showInFolder")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
