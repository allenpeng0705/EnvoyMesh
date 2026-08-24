import { useEffect, useState } from "react"

/**
 * After `delayMs` of continuous `active`, returns true — used to show
 * "Still working…" without alarming the user in the first few seconds.
 */
export function useStillWorking(active: boolean, delayMs = 8_000): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!active) {
      setShow(false)
      return undefined
    }
    const id = window.setTimeout(() => setShow(true), delayMs)
    return () => {
      window.clearTimeout(id)
      setShow(false)
    }
  }, [active, delayMs])

  return show
}
