/**
 * Track EH turn context: touched files + live activity paths.
 */

import { useCallback, useEffect, useState } from "react"

import type { EhActivityEvent, EhFilesChangedEvent } from "@envoymesh/api"

const WRITE_EDIT_RE = /^(?:write|edit)\s+(.+)$/i

export function pathFromActivitySummary(summary: string): string | undefined {
  const match = summary.trim().match(WRITE_EDIT_RE)
  return match?.[1]?.trim()
}

export interface UseEhTurnContextOptions {
  subscribeActivity: (handler: (event: EhActivityEvent) => void) => () => void
  subscribeFilesChanged: (handler: (event: EhFilesChangedEvent) => void) => () => void
  projectCwd?: string
}

export function useEhTurnContext(options: UseEhTurnContextOptions) {
  const [touchedFiles, setTouchedFiles] = useState<string[]>([])
  const [attachedPaths, setAttachedPaths] = useState<string[]>([])

  useEffect(() => {
    const unsubActivity = options.subscribeActivity((event) => {
      if (event.kind !== "tool_call") return
      const path = pathFromActivitySummary(event.summary)
      if (!path) return
      setTouchedFiles((prev) => (prev.includes(path) ? prev : [...prev, path]))
    })
    const unsubFiles = options.subscribeFilesChanged((event) => {
      if (event.files.length === 0) return
      setTouchedFiles((prev) => {
        const next = [...prev]
        for (const file of event.files) {
          if (!next.includes(file)) next.push(file)
        }
        return next
      })
    })
    return () => {
      unsubActivity()
      unsubFiles()
    }
  }, [options.subscribeActivity, options.subscribeFilesChanged])

  const resetTurnContext = useCallback(() => {
    setTouchedFiles([])
  }, [])

  const addAttachedPath = useCallback((path: string) => {
    const trimmed = path.trim()
    if (!trimmed) return
    setAttachedPaths((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
  }, [])

  const removeAttachedPath = useCallback((path: string) => {
    setAttachedPaths((prev) => prev.filter((p) => p !== path))
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachedPaths([])
  }, [])

  const contextFiles = [...new Set([...attachedPaths, ...touchedFiles])]

  return {
    touchedFiles,
    attachedPaths,
    contextFiles,
    projectCwd: options.projectCwd,
    resetTurnContext,
    addAttachedPath,
    removeAttachedPath,
    clearAttachments,
  }
}
