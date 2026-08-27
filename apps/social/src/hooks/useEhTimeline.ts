import { useCallback, useEffect, useMemo, useReducer } from "react"

import {
  emptyEhTimelineState,
  reduceEhTimeline,
  type EhTimelineItem,
  type EhTimelineState,
  type EhTimelineUpdate,
} from "@envoymesh/api"

const LEGACY_CHAT_ID = "__envoy_harness__"

export interface EhTimelineSource {
  on(event: "eh:timeline", handler: (update: EhTimelineUpdate) => void): () => void
}

type Action =
  | { type: "replace"; chatId: string; items: EhTimelineItem[] }
  | { type: "update"; update: EhTimelineUpdate }

function reducer(state: EhTimelineState, action: Action): EhTimelineState {
  if (action.type === "replace") {
    return {
      chatId: action.chatId,
      items: action.items,
      revision: 0,
    }
  }
  return reduceEhTimeline(state, action.update)
}

export function useEhTimeline(source: EhTimelineSource, chatId?: string | null) {
  const scopedChatId = chatId ?? LEGACY_CHAT_ID
  const [state, dispatch] = useReducer(reducer, scopedChatId, emptyEhTimelineState)

  useEffect(() => {
    if (state.chatId !== scopedChatId) {
      dispatch({ type: "replace", chatId: scopedChatId, items: [] })
    }
  }, [scopedChatId, state.chatId])

  useEffect(
    () => source.on("eh:timeline", (update) => dispatch({ type: "update", update })),
    [source],
  )

  const replace = useCallback(
    (items: EhTimelineItem[]) => {
      dispatch({ type: "replace", chatId: scopedChatId, items })
    },
    [scopedChatId],
  )

  const remove = useCallback(
    (id: string) => dispatch({ type: "update", update: { type: "remove", chatId: scopedChatId, id } }),
    [scopedChatId],
  )

  const nonMessageItems = useMemo(
    () => state.items.filter((item) => item.type !== "message"),
    [state.items],
  )

  return { state, items: state.items, nonMessageItems, replace, remove }
}
