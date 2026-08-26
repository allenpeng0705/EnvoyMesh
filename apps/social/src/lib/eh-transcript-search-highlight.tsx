import { type ReactNode } from "react"

/**
 * Wrap case-insensitive query matches in <mark> for transcript search.
 */
export function SearchHighlightedText({
  text,
  query,
  active = false,
}: {
  text: string
  query: string
  /** Brighter marks when this bubble is the focused match. */
  active?: boolean
}): ReactNode {
  const needle = query.trim()
  if (!needle) return text

  const needleLower = needle.toLocaleLowerCase()
  const textLower = text.toLocaleLowerCase()
  const parts: ReactNode[] = []
  let start = 0
  let matchIndex = 0

  while (start < text.length) {
    const at = textLower.indexOf(needleLower, start)
    if (at === -1) {
      parts.push(text.slice(start))
      break
    }
    if (at > start) parts.push(text.slice(start, at))
    parts.push(
      <mark
        key={`${at}-${matchIndex}`}
        className={
          active
            ? "eh-transcript-highlight eh-transcript-highlight--active"
            : "eh-transcript-highlight"
        }
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    )
    start = at + needle.length
    matchIndex += 1
  }

  return parts.length === 1 ? parts[0]! : parts
}
