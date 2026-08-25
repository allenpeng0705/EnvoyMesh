/**
 * Cursor-shaped stack above the EH composer.
 */

import type { ReactNode } from "react"

import type { EhPermissionEvent, EhUserQuestionEvent, EhTurnHintsEvent } from "@envoymesh/api"

import { EhPermissionDock } from "./EhPermissionDock.js"
import { EhUserQuestionDock } from "./EhUserQuestionDock.js"
import { EhTurnHintsDock } from "./EhTurnHintsDock.js"
import { EhInputQueue } from "./EhInputQueue.js"
import { EhContextStrip } from "./EhContextStrip.js"
import { EhChangesDock } from "./EhChangesDock.js"

export interface EhComposerDockStackProps {
  permission: EhPermissionEvent | null
  onPermissionDismiss?: () => void
  onPermissionResponded?: (allowed: boolean) => void
  question: EhUserQuestionEvent | null
  onQuestionDismiss?: () => void
  onQuestionResponded?: (label: string) => void
  turnHints: EhTurnHintsEvent | null
  onTurnHintsDismiss?: () => void
  onSelectFollowUp?: (text: string) => void
  queue: ReadonlyArray<{ id: string; text: string }>
  onQueueUpdate: (id: string, text: string) => void
  onQueueRemove: (id: string) => void
  onQueueClear?: () => void
  contextFiles: readonly string[]
  attachedPaths?: readonly string[]
  onRemoveAttached?: (path: string) => void
  changedFiles: readonly string[]
  onReviewChanges?: () => void
  onDismissChanges?: () => void
  composer?: ReactNode
}

export function EhComposerDockStack({
  permission,
  onPermissionDismiss,
  onPermissionResponded,
  question,
  onQuestionDismiss,
  onQuestionResponded,
  turnHints,
  onTurnHintsDismiss,
  onSelectFollowUp,
  queue,
  onQueueUpdate,
  onQueueRemove,
  onQueueClear,
  contextFiles,
  attachedPaths,
  onRemoveAttached,
  changedFiles,
  onReviewChanges,
  onDismissChanges,
  composer,
}: EhComposerDockStackProps) {
  return (
    <div className="eh-composer-dock-stack">
      {permission ? (
        <EhPermissionDock
          permission={permission}
          onDismiss={onPermissionDismiss}
          onResponded={onPermissionResponded}
        />
      ) : null}
      {question ? (
        <EhUserQuestionDock
          question={question}
          onDismiss={onQuestionDismiss}
          onResponded={onQuestionResponded}
        />
      ) : null}
      <EhContextStrip
        files={contextFiles}
        attachedPaths={attachedPaths}
        onRemoveAttached={onRemoveAttached}
      />
      <EhChangesDock
        files={changedFiles}
        onReview={onReviewChanges}
        onDismiss={onDismissChanges}
      />
      {turnHints ? (
        <EhTurnHintsDock
          hints={turnHints}
          onDismiss={onTurnHintsDismiss}
          onSelectFollowUp={onSelectFollowUp}
        />
      ) : null}
      <EhInputQueue
        items={queue}
        onUpdate={onQueueUpdate}
        onRemove={onQueueRemove}
        onClear={onQueueClear}
      />
      {composer ?? null}
    </div>
  )
}
