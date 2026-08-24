/**
 * Track EH turn context: touched files + live activity paths.
 */

import { useCallback, useEffect, useRef, useState } from "react"

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
  const [activityLog, setActivityLog] = useState<string[]>([])
  /** Synchronous mirror for callbacks that fire before state flushes. */
  const activityLogRef = useRef<string[]>([])
  const lastTurnSummaryRef = useRef<string | undefined>(undefined)
  /**
   * Callers pass inline `subscribeActivity` / `subscribeFilesChanged`
   * closures (recreated every render). Subscribing with those as effect
   * deps would tear down + re-subscribe on every render — and combined
   * with a nodeService whose identity changes, it can spin a render
   * loop. Keep the latest options in a ref and subscribe ONCE.
   */
  const optionsRef = useRef(options)
  optionsRef.current = options

  const appendActivity = useCallback((summary: string) => {
    const next = [...activityLogRef.current, summary]
    if (next.length > 100) next.splice(0, next.length - 100)
    activityLogRef.current = next
    setActivityLog(next)
  }, [])

  useEffect(() => {
    const unsubActivity = optionsRef.current.subscribeActivity((event) => {
      const summary = event.summary?.trim()
      if (summary && summary.length > 0) {
        appendActivity(summary)
        if (event.kind === "agent_end") {
          lastTurnSummaryRef.current = summary
        }
      }
      if (event.kind !== "tool_call") return
      const path = pathFromActivitySummary(event.summary)
      if (!path) return
      setTouchedFiles((prev) => (prev.includes(path) ? prev : [...prev, path]))
    })
    const unsubFiles = optionsRef.current.subscribeFilesChanged((event) => {
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
  }, [appendActivity])

  /**
   * Idempotent reset: returning the SAME empty array reference when
   * there is nothing to clear lets React bail out (a fresh `[]` literal
   * fails `Object.is` and forces a re-render on every call — which is
   * what made the TerminalPanel test's mocked nodeService spin an
   * infinite render loop).
   */
  const resetTurnContext = useCallback(() => {
    activityLogRef.current = []
    lastTurnSummaryRef.current = undefined
    setTouchedFiles((prev) => (prev.length === 0 ? prev : []))
    setActivityLog((prev) => (prev.length === 0 ? prev : []))
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
    setAttachedPaths((prev) => (prev.length === 0 ? prev : []))
  }, [])

  const contextFiles = [...new Set([...attachedPaths, ...touchedFiles])]

  return {
    touchedFiles,
    attachedPaths,
    contextFiles,
    activityLog,
    /** Synchronous activity log for callbacks that fire mid-flight. */
    activityLogRef,
    /** The last `agent_end` summary ("done — N turns, M tool calls, $X"). */
    lastTurnSummaryRef,
    projectCwd: options.projectCwd,
    resetTurnContext,
    addAttachedPath,
    removeAttachedPath,
    clearAttachments,
  }
}
