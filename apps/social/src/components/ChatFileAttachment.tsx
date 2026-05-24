import type { ChatAttachment } from "@envoymesh/api";
import { useState } from "react";
import { useNodeService } from "../hooks/useNodeService.js";
import { useToast } from "../hooks/useToast.js";
import {
  formatFileBytes,
  openVaultLibraryFile,
  revealVaultLibraryFile,
} from "../lib/library-file-actions.js";

export interface ChatFileAttachmentProps {
  attachment: ChatAttachment;
}

export function ChatFileAttachment({ attachment }: ChatFileAttachmentProps) {
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const vaultPath = attachment.vaultRelativePath?.replace(/^[\\/]+/, "");

  const run = async (action: "open" | "reveal") => {
    if (!vaultPath) {
      showToast("File path unavailable for this attachment", "error");
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
      <div className="chat-file-attachment-icon" aria-hidden>
        📎
      </div>
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
            Open
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run("reveal")}>
            Show in folder
          </button>
        </div>
      ) : null}
    </div>
  );
}
