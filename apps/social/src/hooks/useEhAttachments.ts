/**
 * Project-scoped file attachments for Envoy Harness chat.
 *
 * Thin wrapper over {@link useAgentDraftAttachments}.
 */

import { useAgentDraftAttachments } from "./useAgentDraftAttachments.js"
import { useNodeService } from "./useNodeService.js"

export interface UseEhAttachmentsOptions {
  projectCwd: string | undefined
  onError?: (message: string) => void
}

export function useEhAttachments(projectCwd: string | undefined, onError?: (message: string) => void) {
  const nodeService = useNodeService()
  const draft = useAgentDraftAttachments({
    projectCwd,
    pickTitle: "Attach project files",
    onError,
    uploadEnvoyAttachment: (params) => nodeService.uploadEnvoyAttachment(params),
  })

  return {
    ...draft,
    pickFiles: draft.openPicker,
  }
}

export { useAgentDraftAttachments }
