import { useCallback, useState } from "react"

import type { EhTurnReview, EhUxTelemetryEvent } from "@envoymesh/api"

import { getEhReviewMinFiles, setEhReviewMinFiles as persistReviewMinFiles } from "../lib/eh-review-prefs.js"
import { useNodeService } from "./useNodeService.js"
import { useT } from "../context/I18nContext.js"

export interface UseEhTurnReviewOptions {
  chatId?: string | null
  onNotify?: (text: string, tone: "info" | "success" | "error") => void
}

export function useEhTurnReview(options: UseEhTurnReviewOptions = {}) {
  const t = useT()
  const nodeService = useNodeService()
  const chatId = options.chatId ?? null
  const onNotify = options.onNotify

  const [turnReview, setTurnReview] = useState<EhTurnReview | null>(null)
  const [showGitDiffReview, setShowGitDiffReview] = useState(false)
  const [dismissedChanges, setDismissedChanges] = useState(false)
  const [lastReviewTurnId, setLastReviewTurnId] = useState<string | null>(null)
  const [reviewFocusPath, setReviewFocusPath] = useState<string | null>(null)
  const [reviewMinFiles, setReviewMinFilesState] = useState(() => getEhReviewMinFiles())

  const recordUx = useCallback(
    (event: Omit<EhUxTelemetryEvent, "surface" | "occurredAt">) => {
      if (typeof nodeService.recordEnvoyHarnessUxEvent !== "function") return
      void nodeService.recordEnvoyHarnessUxEvent({
        ...event,
        surface: "social",
        occurredAt: new Date().toISOString(),
      }).catch(() => undefined)
    },
    [nodeService],
  )

  const notify = useCallback(
    (text: string, tone: "info" | "success" | "error") => {
      onNotify?.(text, tone)
    },
    [onNotify],
  )

  const clearReviewState = useCallback(() => {
    setTurnReview(null)
    setReviewFocusPath(null)
    setDismissedChanges(true)
    setLastReviewTurnId(null)
  }, [])

  const refreshTurnReview = useCallback(
    async (turnId: string) => {
      const review = await nodeService.getEnvoyHarnessTurnReview(turnId)
      if (review && review.files.length > 0) {
        setTurnReview(review)
        return review
      }
      clearReviewState()
      return null
    },
    [clearReviewState, nodeService],
  )

  const openTurnReview = useCallback(
    (turnId: string, focusPath?: string) => {
      recordUx({ action: "review_opened" })
      setReviewFocusPath(focusPath ?? null)
      void nodeService.getEnvoyHarnessTurnReview(turnId).then((review) => {
        if (review && review.files.length > 0) {
          setTurnReview(review)
          setLastReviewTurnId(turnId)
          setDismissedChanges(false)
        } else {
          setShowGitDiffReview(true)
        }
      }).catch(() => setShowGitDiffReview(true))
    },
    [nodeService, recordUx],
  )

  const handleKeepAllChanges = useCallback(() => {
    if (!lastReviewTurnId) {
      setDismissedChanges(true)
      return
    }
    void nodeService.acceptEnvoyHarnessTurnReview(lastReviewTurnId).then((result) => {
      if (result.accepted) {
        clearReviewState()
        notify(t("eh.reviewKeptAll", "Changes kept."), "success")
      } else {
        notify(t("eh.reviewKeepFailed", "Could not keep changes."), "error")
      }
    }).catch((error: unknown) => notify(String(error), "error"))
  }, [clearReviewState, lastReviewTurnId, nodeService, notify, t])

  const handleKeepFile = useCallback(
    (path: string) => {
      if (!lastReviewTurnId) return
      void nodeService.acceptEnvoyHarnessTurnReview(lastReviewTurnId, [path]).then((result) => {
        if (!result.accepted) {
          notify(t("eh.reviewKeepFailed", "Could not keep changes."), "error")
          return
        }
        if (result.cleared || result.remainingFiles === 0) {
          clearReviewState()
          notify(t("eh.reviewKeptAll", "Changes kept."), "success")
          return
        }
        void refreshTurnReview(lastReviewTurnId)
      }).catch((error: unknown) => notify(String(error), "error"))
    },
    [clearReviewState, lastReviewTurnId, nodeService, notify, refreshTurnReview, t],
  )

  const revertTurn = useCallback(
    (turnId: string): Promise<boolean> => {
      if (!window.confirm(t("eh.revertConfirm", "Restore the files to how they were before this turn? Later edits will never be overwritten."))) {
        return Promise.resolve(false)
      }
      recordUx({ action: "revert_attempted" })
      return nodeService.revertEnvoyHarnessTurn(turnId).then((result) => {
        if (result.reverted) {
          recordUx({ action: "revert_completed", outcome: "success" })
          if (turnId === lastReviewTurnId) clearReviewState()
          notify(t("eh.revertComplete", "This turn's file changes were reverted."), "success")
          return true
        }
        recordUx({
          action: result.conflicts?.length ? "revert_conflicted" : "revert_completed",
          outcome: result.conflicts?.length ? "conflict" : "unavailable",
        })
        notify(
          result.conflicts?.length
            ? t("eh.revertConflict", "Revert stopped because these files changed afterward: {files}", { files: result.conflicts.join(", ") })
            : t("eh.revertUnavailable", "This turn can no longer be reverted safely."),
          "error",
        )
        return false
      }).catch((error: unknown) => {
        notify(String(error), "error")
        return false
      })
    },
    [clearReviewState, lastReviewTurnId, nodeService, notify, recordUx, t],
  )

  const handleRevertAllChanges = useCallback(() => {
    if (!lastReviewTurnId) return
    void revertTurn(lastReviewTurnId)
  }, [lastReviewTurnId, revertTurn])

  const handleRevertFile = useCallback(
    (path: string) => {
      if (!lastReviewTurnId) return
      recordUx({ action: "revert_attempted" })
      void nodeService.revertEnvoyHarnessTurnFiles(lastReviewTurnId, [path]).then((result) => {
        if (result.reverted) {
          recordUx({ action: "revert_completed", outcome: "success" })
          notify(t("eh.reviewRevertedFile", "Reverted {path}", { path }), "success")
          void refreshTurnReview(lastReviewTurnId)
          return
        }
        recordUx({
          action: result.conflicts?.length ? "revert_conflicted" : "revert_completed",
          outcome: result.conflicts?.length ? "conflict" : "unavailable",
        })
        notify(
          result.conflicts?.length
            ? t("eh.revertConflict", "Revert stopped because these files changed afterward: {files}", { files: result.conflicts.join(", ") })
            : t("eh.revertUnavailable", "This turn can no longer be reverted safely."),
          "error",
        )
      }).catch((error: unknown) => notify(String(error), "error"))
    },
    [lastReviewTurnId, nodeService, notify, recordUx, refreshTurnReview, t],
  )

  const onTurnStart = useCallback(() => {
    setDismissedChanges(false)
  }, [])

  const onTurnComplete = useCallback(
    (turnId: string, changedFileCount: number) => {
      if (changedFileCount <= 0) {
        setLastReviewTurnId(null)
        return
      }
      setLastReviewTurnId(turnId)
      setDismissedChanges(false)
      if (changedFileCount >= reviewMinFiles) {
        openTurnReview(turnId)
      }
    },
    [openTurnReview, reviewMinFiles],
  )

  const setReviewMinFiles = useCallback((value: number) => {
    setReviewMinFilesState(value)
    persistReviewMinFiles(value)
  }, [])

  const openChangedFile = useCallback(
    (path: string) => {
      void nodeService.openEnvoyHarnessFile({
        path,
        ...(chatId ? { chatId } : {}),
      }).catch((error: unknown) => notify(String(error), "error"))
    },
    [chatId, nodeService, notify],
  )

  return {
    turnReview,
    setTurnReview,
    showGitDiffReview,
    setShowGitDiffReview,
    dismissedChanges,
    lastReviewTurnId,
    reviewFocusPath,
    reviewMinFiles,
    setReviewMinFiles,
    openTurnReview,
    clearReviewState,
    handleKeepAllChanges,
    handleKeepFile,
    handleRevertAllChanges,
    handleRevertFile,
    revertTurn,
    onTurnStart,
    onTurnComplete,
    openChangedFile,
  }
}
