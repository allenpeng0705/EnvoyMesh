/**
 * Unified attach control row for EnvoyAI, Ext Agent, and Envoy Harness composers.
 */

import type { ChangeEvent, RefObject } from "react"

import { AttachIcon } from "../icons.js"
import type { AgentDraftAttachment } from "../lib/agent-attachments.js"
import { AgentAttachmentChips } from "./AgentAttachmentChips.js"

export interface AgentAttachmentComposerLeadingProps {
  attachments: AgentDraftAttachment[]
  busy?: boolean
  disabled?: boolean
  pickTitle?: string
  attachAriaLabel?: string
  fileInputRef?: RefObject<HTMLInputElement | null>
  onFileInputChange?: (event: ChangeEvent<HTMLInputElement>) => void
  onOpenPicker: () => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

export function AgentAttachmentComposerLeading({
  attachments,
  busy = false,
  disabled = false,
  pickTitle = "Attach files",
  attachAriaLabel = "Attach files",
  fileInputRef,
  onFileInputChange,
  onOpenPicker,
  onRemove,
  onClearAll,
}: AgentAttachmentComposerLeadingProps) {
  return (
    <>
      {fileInputRef && onFileInputChange ? (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={onFileInputChange}
        />
      ) : null}
      <AgentAttachmentChips
        attachments={attachments}
        onRemove={onRemove}
        onClearAll={onClearAll}
      />
      <button
        type="button"
        className="secondary chat-attach-file-btn"
        title={pickTitle}
        aria-label={attachAriaLabel}
        disabled={disabled || busy}
        onClick={() => void onOpenPicker()}
      >
        <AttachIcon size={18} />
      </button>
    </>
  )
}
