/**
 * Codex / Claude Code–style turn queue with non-blocking turn lifecycle.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import type {
  EhPromptBusyEvent,
  EhTurnCompleteEvent,
  EhTurnStatus,
  EhTurnTokenEvent,
} from "@envoymesh/api"

export interface EhQueuedInput {
  id: string
  text: string
}

export type EhSubmitMode = "send" | "queue" | "inject"

export interface UseEhTurnQueueOptions {
  /** Sidebar chat thread this queue serves. Events from other chats are
   *  ignored (the node now runs parallel per-chat turns). `null`/undefined
   *  = legacy active chat (accepts events without a chatId). */
  chatId?: string | null
  startTurn: (
    text: string,
    attachments?: import("@envoymesh/api").AgentAttachmentRef[],
  ) => Promise<{ turnId: string }>
  subscribeTurnComplete: (handler: (event: EhTurnCompleteEvent) => void) => () => void
  subscribeTurnToken?: (handler: (event: EhTurnTokenEvent) => void) => () => void
  subscribePromptBusy?: (handler: (event: EhPromptBusyEvent) => void) => () => void
  getTurnStatus?: () => Promise<EhTurnStatus>
  cancelTurn: () => Promise<{ cancelled: boolean }>
  onUserTurn?: (text: string) => void
  onAssistantTurn?: (text: string, turnId: string, event: EhTurnCompleteEvent) => void
  onAssistantStreaming?: (text: string, turnId: string) => void
  onSystem?: (text: string, tone: "info" | "success" | "error") => void
  onTurnStart?: () => void
  onTurnEnd?: () => void
}

type TurnWaiter = {
  resolve: (event: EhTurnCompleteEvent) => void
  reject: (err: Error) => void
}

function assistantTurnId(turnId: string): string {
  return `${turnId}::assistant`
}

export function useEhTurnQueue(options: UseEhTurnQueueOptions) {
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<EhQueuedInput[]>([])
  const busyRef = useRef(false)
  const queueRef = useRef<EhQueuedInput[]>([])
  const injectAfterCancelRef = useRef<{
    text: string
    attachments?: import("@envoymesh/api").AgentAttachmentRef[]
  } | null>(null)
  const runGenerationRef = useRef(0)
  const turnWaitersRef = useRef(new Map<string, TurnWaiter>())
  const activeTurnIdRef = useRef<string | undefined>(undefined)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const chatIdRef = useRef<string | null>(options.chatId ?? null)
  chatIdRef.current = options.chatId ?? null

  /** True when an event belongs to this queue's chat (or is legacy/unscoped). */
  const eventMatchesChat = useCallback(
    (eventChatId: string | undefined): boolean => {
      if (eventChatId === undefined) return true
      return chatIdRef.current === eventChatId
    },
    [],
  )

  const setBusySafe = useCallback((next: boolean) => {
    busyRef.current = next
    setBusy(next)
  }, [])

  const drainAfterTurnRef = useRef<(generation: number) => void>(() => {})

  const finishTurnFromReconnect = useCallback(
    async (event: EhTurnCompleteEvent) => {
      const generation = runGenerationRef.current
      if (event.cancelled === true) {
        // Cancelled: do not paint an assistant bubble.
      } else if (event.ok) {
        // Always notify — empty text lets the panel drop a thinking-only
        // stream bubble while keeping the human message above it.
        optionsRef.current.onAssistantTurn?.(
          event.text ?? "",
          assistantTurnId(event.turnId),
          event,
        )
      } else {
        optionsRef.current.onAssistantTurn?.(
          "",
          assistantTurnId(event.turnId),
          event,
        )
        if (event.error) {
          optionsRef.current.onSystem?.(event.error, "error")
        }
      }
      if (generation !== runGenerationRef.current) return
      setBusySafe(false)
      optionsRef.current.onTurnEnd?.()
      drainAfterTurnRef.current(generation)
    },
    [setBusySafe],
  )

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  // Mount-only subscriptions — option callbacks from parents are often unstable;
  // re-subscribing every render can drop eh:turn_* events mid-flight.
  useEffect(() => {
    const unsubComplete = optionsRef.current.subscribeTurnComplete((event) => {
      if (!eventMatchesChat(event.chatId)) return
      const waiter = turnWaitersRef.current.get(event.turnId)
      if (waiter === undefined) return
      turnWaitersRef.current.delete(event.turnId)
      if (event.turnId === activeTurnIdRef.current) {
        activeTurnIdRef.current = undefined
      }
      if (event.ok) {
        waiter.resolve(event)
      } else if (event.cancelled) {
        waiter.reject(new Error("envoy_harness_cancelled"))
      } else {
        waiter.reject(new Error(event.error ?? "envoy_harness_turn_failed"))
      }
    })
    const unsubToken = optionsRef.current.subscribeTurnToken?.((event) => {
      if (!eventMatchesChat(event.chatId)) return
      optionsRef.current.onAssistantStreaming?.(
        event.streamingText,
        assistantTurnId(event.turnId),
      )
    })
    const unsubBusy = optionsRef.current.subscribePromptBusy?.((event) => {
      if (!eventMatchesChat(event.chatId)) return
      if (!event.busy && busyRef.current) {
        if (turnWaitersRef.current.size > 0) {
          for (const [, waiter] of turnWaitersRef.current) {
            waiter.reject(new Error("envoy_harness_cancelled"))
          }
          turnWaitersRef.current.clear()
        }
        activeTurnIdRef.current = undefined
        setBusySafe(false)
        optionsRef.current.onTurnEnd?.()
      }
    })
    return () => {
      unsubComplete()
      unsubToken?.()
      unsubBusy?.()
    }
  }, [eventMatchesChat, setBusySafe])

  useEffect(() => {
    if (optionsRef.current.getTurnStatus === undefined) return
    let cancelled = false
    void optionsRef.current.getTurnStatus!().then((status) => {
      if (cancelled || !status.busy || status.turnId === undefined) return
      // Another chat's in-flight turn must not hijack this panel's
      // reconnect (parallel per-chat turns).
      if (status.chatId !== undefined && !eventMatchesChat(status.chatId)) {
        return
      }
      activeTurnIdRef.current = status.turnId
      busyRef.current = true
      setBusy(true)
      // Restore the in-flight human bubble after a remount/history wipe.
      if (status.userPrompt && status.userPrompt.trim().length > 0) {
        optionsRef.current.onUserTurn?.(status.userPrompt)
      }
      if (status.streamingText && status.streamingText.length > 0) {
        optionsRef.current.onAssistantStreaming?.(
          status.streamingText,
          assistantTurnId(status.turnId),
        )
      }
      const waiter: TurnWaiter = {
        resolve: (event) => {
          void finishTurnFromReconnect(event)
        },
        reject: (err) => {
          if (!err.message.includes("cancel")) {
            optionsRef.current.onSystem?.(err.message, "error")
          }
          setBusySafe(false)
          optionsRef.current.onTurnEnd?.()
        },
      }
      turnWaitersRef.current.set(status.turnId, waiter)
    })
    return () => {
      cancelled = true
    }
  }, [finishTurnFromReconnect, setBusySafe])

  const waitForTurn = useCallback((turnId: string): Promise<EhTurnCompleteEvent> => {
    return new Promise((resolve, reject) => {
      turnWaitersRef.current.set(turnId, { resolve, reject })
    })
  }, [])

  const runTurnRef = useRef<
    (
      text: string,
      generation: number,
      attachments?: import("@envoymesh/api").AgentAttachmentRef[],
    ) => Promise<void>
  >(async () => {})

  const drainAfterTurn = useCallback((generation: number) => {
    const inject = injectAfterCancelRef.current
    if (inject !== null) {
      injectAfterCancelRef.current = null
      const nextGen = ++runGenerationRef.current
      void runTurnRef.current(inject.text, nextGen, inject.attachments)
      return
    }

    const pending = queueRef.current
    const nextIndex = pending.findIndex((item) => item.text.trim().length > 0)
    if (nextIndex >= 0) {
      const next = pending[nextIndex]
      const rest = pending.filter((_, i) => i !== nextIndex)
      queueRef.current = rest
      setQueue(rest)
      const nextGen = ++runGenerationRef.current
      void runTurnRef.current(next.text, nextGen)
    }
  }, [])

  drainAfterTurnRef.current = drainAfterTurn

  const runTurn = useCallback(
    async (
      text: string,
      generation: number,
      attachments?: import("@envoymesh/api").AgentAttachmentRef[],
    ) => {
      const trimmed = text.trim()
      if (!trimmed && (attachments === undefined || attachments.length === 0)) return

      setBusySafe(true)
      optionsRef.current.onTurnStart?.()
      optionsRef.current.onUserTurn?.(trimmed)

      let turnId: string
      try {
        ;({ turnId } = await optionsRef.current.startTurn(trimmed, attachments))
        activeTurnIdRef.current = turnId
      } catch (err: unknown) {
        if (generation !== runGenerationRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        optionsRef.current.onSystem?.(msg, "error")
        setBusySafe(false)
        optionsRef.current.onTurnEnd?.()
        drainAfterTurn(generation)
        return
      }

      if (generation !== runGenerationRef.current) return

      try {
        const result = await waitForTurn(turnId)
        if (generation !== runGenerationRef.current) return
        // Always notify on success — including empty text — so the panel
        // can clear a thinking-only stream without dropping the user turn.
        if (result.ok) {
          optionsRef.current.onAssistantTurn?.(
            result.text ?? "",
            assistantTurnId(turnId),
            result,
          )
        }
      } catch (err: unknown) {
        if (generation !== runGenerationRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        if (
          msg !== "envoy_harness_cancelled" &&
          !msg.toLowerCase().includes("cancel")
        ) {
          // Clear any thinking-only stream bubble on failure too.
          optionsRef.current.onAssistantTurn?.(
            "",
            assistantTurnId(turnId),
            {
              turnId,
              ok: false,
              error: msg,
            },
          )
          optionsRef.current.onSystem?.(msg, "error")
        }
      } finally {
        if (generation !== runGenerationRef.current) return
        setBusySafe(false)
        optionsRef.current.onTurnEnd?.()
        drainAfterTurn(generation)
      }
    },
    [drainAfterTurn, setBusySafe, waitForTurn],
  )

  runTurnRef.current = runTurn

  const enqueue = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return false
    setQueue((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), text: trimmed }]
      queueRef.current = next
      return next
    })
    return true
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.id !== id)
      queueRef.current = next
      return next
    })
  }, [])

  const updateQueued = useCallback((id: string, text: string) => {
    setQueue((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, text } : item))
      queueRef.current = next
      return next
    })
  }, [])

  const clearQueue = useCallback(() => {
    queueRef.current = []
    setQueue([])
  }, [])

  const cancelActiveTurn = useCallback(async () => {
    injectAfterCancelRef.current = null
    runGenerationRef.current += 1
    if (turnWaitersRef.current.size > 0) {
      for (const [, waiter] of turnWaitersRef.current) {
        waiter.reject(new Error("envoy_harness_cancelled"))
      }
      turnWaitersRef.current.clear()
    }
    activeTurnIdRef.current = undefined
    setBusySafe(false)
    optionsRef.current.onTurnEnd?.()
    try {
      await optionsRef.current.cancelTurn()
    } catch {
      // UI already cleared; node may still be stopping the turn.
    }
  }, [setBusySafe])

  const submit = useCallback(
    (
      text: string,
      mode: EhSubmitMode,
      attachments?: import("@envoymesh/api").AgentAttachmentRef[],
    ) => {
      const trimmed = text.trim()
      if (!trimmed && (attachments === undefined || attachments.length === 0)) return

      if (!busyRef.current || mode === "send") {
        const gen = ++runGenerationRef.current
        void runTurn(trimmed, gen, attachments)
        return
      }

      if (mode === "queue") {
        enqueue(trimmed)
        return
      }

      injectAfterCancelRef.current = { text: trimmed, attachments }
      if (turnWaitersRef.current.size > 0) {
        for (const [, waiter] of turnWaitersRef.current) {
          waiter.reject(new Error("envoy_harness_cancelled"))
        }
        turnWaitersRef.current.clear()
      }
      void optionsRef.current.cancelTurn()
    },
    [enqueue, runTurn],
  )

  return {
    busy,
    busyRef,
    queue,
    submit,
    enqueue,
    removeFromQueue,
    updateQueued,
    clearQueue,
    cancelActiveTurn,
  }
}

export { assistantTurnId }
