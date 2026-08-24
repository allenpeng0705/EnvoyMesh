/**
 * @vitest-environment jsdom
 *
 * Turn queue lifecycle — event delivery, cancel UX, inject-after-cancel.
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useEhTurnQueue, assistantTurnId } from "../../src/hooks/useEhTurnQueue.js"
import type { EhTurnCompleteEvent, EhTurnTokenEvent } from "@envoymesh/api"

function createEventBus() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>()
  return {
    on(event: string, handler: (payload: unknown) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
      return () => handlers.get(event)?.delete(handler)
    },
    emit(event: string, payload: unknown) {
      for (const handler of handlers.get(event) ?? []) {
        handler(payload)
      }
    },
  }
}

describe("useEhTurnQueue", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("completes a turn and clears busy when eh:turn_complete arrives", async () => {
    const bus = createEventBus()
    const startTurn = vi.fn(async (text: string) => {
      setTimeout(() => {
        bus.emit("eh:turn_complete", {
          turnId: "turn-1",
          ok: true,
          text: `echo: ${text}`,
        } satisfies EhTurnCompleteEvent)
      }, 0)
      return { turnId: "turn-1" }
    })

    const onAssistantTurn = vi.fn()
    const { result } = renderHook(() =>
      useEhTurnQueue({
        startTurn,
        subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
        subscribePromptBusy: (h) => bus.on("eh:prompt_busy", h),
        cancelTurn: async () => ({ cancelled: true }),
        onAssistantTurn,
      }),
    )

    act(() => {
      result.current.submit("hello", "send")
    })
    expect(result.current.busy).toBe(true)

    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(onAssistantTurn).toHaveBeenCalledWith(
      "echo: hello",
      assistantTurnId("turn-1"),
      expect.objectContaining({ turnId: "turn-1", ok: true }),
    )
  })

  it("delivers eh:turn_complete even when parent re-renders with new option refs", async () => {
    const bus = createEventBus()
    const startTurn = vi.fn(async () => {
      setTimeout(() => {
        bus.emit("eh:turn_complete", {
          turnId: "turn-stable",
          ok: true,
          text: "stable delivery",
        })
      }, 10)
      return { turnId: "turn-stable" }
    })

    const onAssistantTurn = vi.fn()
    const { result, rerender } = renderHook(
      ({ label }: { label: string }) =>
        useEhTurnQueue({
          startTurn,
          subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
          cancelTurn: async () => ({ cancelled: true }),
          onAssistantTurn,
          onSystem: () => label,
        }),
      { initialProps: { label: "a" } },
    )

    act(() => {
      result.current.submit("hi", "send")
    })
    rerender({ label: "b" })
    rerender({ label: "c" })

    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(onAssistantTurn).toHaveBeenCalledWith(
      "stable delivery",
      assistantTurnId("turn-stable"),
      expect.objectContaining({ turnId: "turn-stable", ok: true }),
    )
  })

  it("cancelActiveTurn clears busy immediately without waiting for turn_complete", async () => {
    const bus = createEventBus()
    const startTurn = vi.fn(async () => ({ turnId: "turn-slow" }))
    const cancelTurn = vi.fn(async () => {
      setTimeout(() => {
        bus.emit("eh:turn_complete", {
          turnId: "turn-slow",
          ok: false,
          cancelled: true,
          error: "envoy_harness_cancelled",
        })
      }, 500)
      return { cancelled: true }
    })
    const onTurnEnd = vi.fn()

    const { result } = renderHook(() =>
      useEhTurnQueue({
        startTurn,
        subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
        subscribePromptBusy: (h) => bus.on("eh:prompt_busy", h),
        cancelTurn,
        onTurnEnd,
      }),
    )

    act(() => {
      result.current.submit("hello", "send")
    })
    expect(result.current.busy).toBe(true)

    await act(async () => {
      await result.current.cancelActiveTurn()
    })
    expect(result.current.busy).toBe(false)
    expect(cancelTurn).toHaveBeenCalled()
    expect(onTurnEnd).toHaveBeenCalled()
  })

  it("streams assistant text via eh:turn_token", async () => {
    const bus = createEventBus()
    const startTurn = vi.fn(async () => {
      setTimeout(() => {
        bus.emit("eh:turn_token", {
          turnId: "turn-stream",
          delta: "Hi",
          streamingText: "Hi",
        } satisfies EhTurnTokenEvent)
        bus.emit("eh:turn_complete", {
          turnId: "turn-stream",
          ok: true,
          text: "Hi there",
        })
      }, 0)
      return { turnId: "turn-stream" }
    })

    const onAssistantStreaming = vi.fn()
    const { result } = renderHook(() =>
      useEhTurnQueue({
        startTurn,
        subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
        subscribeTurnToken: (h) => bus.on("eh:turn_token", h),
        cancelTurn: async () => ({ cancelled: true }),
        onAssistantStreaming,
      }),
    )

    act(() => {
      result.current.submit("hello", "send")
    })

    await waitFor(() =>
      expect(onAssistantStreaming).toHaveBeenCalledWith(
        "Hi",
        assistantTurnId("turn-stream"),
      ),
    )
    await waitFor(() => expect(result.current.busy).toBe(false))
  })

  it("clears busy when eh:prompt_busy goes false (server-side backup)", async () => {
    const bus = createEventBus()
    const startTurn = vi.fn(async () => ({ turnId: "turn-busy" }))
    const onTurnEnd = vi.fn()

    const { result } = renderHook(() =>
      useEhTurnQueue({
        startTurn,
        subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
        subscribePromptBusy: (h) => bus.on("eh:prompt_busy", h),
        cancelTurn: async () => ({ cancelled: true }),
        onTurnEnd,
      }),
    )

    act(() => {
      result.current.submit("hello", "send")
    })
    expect(result.current.busy).toBe(true)

    act(() => {
      bus.emit("eh:prompt_busy", { busy: false })
    })
    expect(result.current.busy).toBe(false)
    expect(onTurnEnd).toHaveBeenCalled()
  })

  it("drains queued messages after the active turn completes", async () => {
    const bus = createEventBus()
    let turnCounter = 0
    const startTurn = vi.fn(async (text: string) => {
      const turnId = `turn-q-${++turnCounter}`
      if (turnCounter === 1) {
        return { turnId }
      }
      setTimeout(() => {
        bus.emit("eh:turn_complete", {
          turnId,
          ok: true,
          text: `queued: ${text}`,
        })
      }, 0)
      return { turnId }
    })

    const onAssistantTurn = vi.fn()
    const { result } = renderHook(() =>
      useEhTurnQueue({
        startTurn,
        subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
        cancelTurn: async () => ({ cancelled: true }),
        onAssistantTurn,
      }),
    )

    act(() => {
      result.current.submit("first", "send")
    })
    await waitFor(() => expect(result.current.busy).toBe(true))

    act(() => {
      result.current.submit("second message", "queue")
    })
    expect(result.current.queue).toHaveLength(1)

    await act(async () => {
      bus.emit("eh:turn_complete", {
        turnId: "turn-q-1",
        ok: true,
        text: "first done",
      })
    })

    await waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(onAssistantTurn).toHaveBeenCalledWith(
        "queued: second message",
        assistantTurnId("turn-q-2"),
        expect.objectContaining({ turnId: "turn-q-2", ok: true }),
      ),
    )
    expect(result.current.queue).toHaveLength(0)
    await waitFor(() => expect(result.current.busy).toBe(false))
  })

  it("inject cancels the active turn and runs the new message", async () => {
    const bus = createEventBus()
    let turnCounter = 0
    const startTurn = vi.fn(async (text: string) => {
      const turnId = `turn-inj-${++turnCounter}`
      if (turnCounter === 1) {
        return { turnId }
      }
      setTimeout(() => {
        bus.emit("eh:turn_complete", {
          turnId,
          ok: true,
          text: `injected: ${text}`,
        })
      }, 0)
      return { turnId }
    })
    const cancelTurn = vi.fn(async () => {
      bus.emit("eh:turn_complete", {
        turnId: "turn-inj-1",
        ok: false,
        cancelled: true,
        error: "envoy_harness_cancelled",
      })
      return { cancelled: true }
    })

    const onAssistantTurn = vi.fn()
    const { result } = renderHook(() =>
      useEhTurnQueue({
        startTurn,
        subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
        cancelTurn,
        onAssistantTurn,
      }),
    )

    act(() => {
      result.current.submit("slow", "send")
    })
    await waitFor(() => expect(result.current.busy).toBe(true))

    await act(async () => {
      result.current.submit("urgent", "inject")
    })

    await waitFor(() => expect(cancelTurn).toHaveBeenCalled())
    await waitFor(() => expect(startTurn).toHaveBeenCalledWith("urgent", undefined))
    await waitFor(() =>
      expect(onAssistantTurn).toHaveBeenCalledWith(
        "injected: urgent",
        assistantTurnId("turn-inj-2"),
        expect.objectContaining({ turnId: "turn-inj-2", ok: true }),
      ),
    )
    await waitFor(() => expect(result.current.busy).toBe(false))
  })

  it("reconnects to an in-flight turn via getTurnStatus on mount", async () => {
    const bus = createEventBus()
    const getTurnStatus = vi.fn(async () => ({
      busy: true,
      turnId: "turn-reconn",
      streamingText: "partial reply",
    }))
    const startTurn = vi.fn()
    const onAssistantStreaming = vi.fn()
    const onAssistantTurn = vi.fn()

    renderHook(() =>
      useEhTurnQueue({
        startTurn,
        subscribeTurnComplete: (h) => bus.on("eh:turn_complete", h),
        getTurnStatus,
        cancelTurn: async () => ({ cancelled: true }),
        onAssistantStreaming,
        onAssistantTurn,
      }),
    )

    await waitFor(() =>
      expect(onAssistantStreaming).toHaveBeenCalledWith(
        "partial reply",
        assistantTurnId("turn-reconn"),
      ),
    )

    act(() => {
      bus.emit("eh:turn_complete", {
        turnId: "turn-reconn",
        ok: true,
        text: "full reply",
      })
    })

    await waitFor(() =>
      expect(onAssistantTurn).toHaveBeenCalledWith(
        "full reply",
        assistantTurnId("turn-reconn"),
        expect.objectContaining({ turnId: "turn-reconn", ok: true }),
      ),
    )
    expect(startTurn).not.toHaveBeenCalled()
  })
})
