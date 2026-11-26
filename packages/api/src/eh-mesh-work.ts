/**
 * FH-P2-C — Mesh-lite coding work items (bond chat + deep-link; no Sources v1).
 *
 * Marker line in chat bodies (like `coding-review-ref`):
 * `[envoymesh-coding-work]{"kind":"eh-mesh-work","v":1,...}`
 */

export const EH_MESH_WORK_KIND = "eh-mesh-work" as const

export const EH_MESH_WORK_MARKER = "[envoymesh-coding-work]"

export type EhMeshWorkSource = "bond" | "owner" | "deep-link"

export type EhMeshWorkStatus = "pending" | "running" | "done" | "dismissed"

/** Wire payload embedded in chat (v1). */
export type EhMeshWorkRef = {
  kind: typeof EH_MESH_WORK_KIND
  v: 1
  /** Stable id — matches home-node ticket when already created. */
  workId: string
  prompt: string
  cwd?: string
  chatId?: string
  title?: string
  fromOwnerId: string
}

export type EhMeshWorkItem = {
  id: string
  prompt: string
  cwd: string
  chatId?: string
  title?: string
  source: EhMeshWorkSource
  status: EhMeshWorkStatus
  fromOwnerId?: string
  createdAt: string
  updatedAt: string
  lastError?: string
}

export type EnqueueEhMeshWorkInput = {
  prompt: string
  cwd: string
  chatId?: string
  title?: string
  source?: EhMeshWorkSource
  fromOwnerId?: string
}

export const MAX_EH_MESH_WORK_ITEMS = 32

export function encodeEhMeshWorkRef(ref: EhMeshWorkRef): string {
  const payload: EhMeshWorkRef = {
    kind: EH_MESH_WORK_KIND,
    v: 1,
    workId: ref.workId.trim(),
    prompt: ref.prompt.trim(),
    fromOwnerId: ref.fromOwnerId.trim(),
    ...(ref.cwd?.trim() ? { cwd: ref.cwd.trim() } : {}),
    ...(ref.chatId?.trim() ? { chatId: ref.chatId.trim() } : {}),
    ...(ref.title?.trim() ? { title: ref.title.trim() } : {}),
  }
  return `${EH_MESH_WORK_MARKER}${JSON.stringify(payload)}`
}

export function parseEhMeshWorkRef(text: string): EhMeshWorkRef | null {
  if (typeof text !== "string" || text.length === 0) return null
  const idx = text.indexOf(EH_MESH_WORK_MARKER)
  if (idx < 0) return null
  const after = text.slice(idx + EH_MESH_WORK_MARKER.length)
  const jsonStart = after.indexOf("{")
  if (jsonStart < 0) return null
  let depth = 0
  let end = -1
  for (let i = jsonStart; i < after.length; i++) {
    const ch = after[i]
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return null
  try {
    const raw = JSON.parse(after.slice(jsonStart, end + 1)) as unknown
    if (!raw || typeof raw !== "object") return null
    const obj = raw as Record<string, unknown>
    if (obj.kind !== EH_MESH_WORK_KIND) return null
    if (obj.v !== 1) return null
    const workId = typeof obj.workId === "string" ? obj.workId.trim() : ""
    const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : ""
    const fromOwnerId =
      typeof obj.fromOwnerId === "string" ? obj.fromOwnerId.trim() : ""
    if (!workId || !prompt || !fromOwnerId) return null
    const ref: EhMeshWorkRef = {
      kind: EH_MESH_WORK_KIND,
      v: 1,
      workId,
      prompt,
      fromOwnerId,
    }
    if (typeof obj.cwd === "string" && obj.cwd.trim()) {
      ref.cwd = obj.cwd.trim()
    }
    if (typeof obj.chatId === "string" && obj.chatId.trim()) {
      ref.chatId = obj.chatId.trim()
    }
    if (typeof obj.title === "string" && obj.title.trim()) {
      ref.title = obj.title.trim()
    }
    return ref
  } catch {
    return null
  }
}

/**
 * Human-readable bond message plus machine footer.
 * Social should `sendChat(peerOwnerId, messageText)` after `createEhMeshWorkInvite`.
 */
export function formatEhMeshWorkInviteMessage(ref: EhMeshWorkRef): string {
  const title = ref.title?.trim()
  const human = title
    ? `Coding work request: “${title}”. Open Coding on your home node to run this in Envoy Harness.`
    : "Coding work request. Open Coding on your home node to run this in Envoy Harness."
  return `${human}\n\n${encodeEhMeshWorkRef(ref)}`
}

/** Pull a known mesh-work / dispatch code out of a wrapped RPC error string. */
export function extractEhMeshWorkErrorCode(raw: string | undefined): string {
  const text = (raw ?? "").trim()
  if (!text) return ""
  const match = text.match(
    /\b(eh_mesh_work_[a-z0-9_]+|dispatch_failed|envoy_harness_cancelled)\b/i,
  )
  return match?.[1]?.toLowerCase() ?? text
}

/** Map store / RPC error codes to short end-user copy. */
export function formatEhMeshWorkUserError(raw: string | undefined): string {
  const code = extractEhMeshWorkErrorCode(raw)
  switch (code) {
    case "eh_mesh_work_not_found":
      return "That work item isn’t on this home yet. Wait a moment and try again."
    case "eh_mesh_work_dismissed":
      return "That work item was already dismissed."
    case "eh_mesh_work_already_firing":
    case "eh_mesh_work_turn_busy":
      return "Coding is already busy with this item. Wait for it to finish."
    case "eh_mesh_work_interrupted":
      return "That Coding run was interrupted. Try running it again."
    case "eh_mesh_work_cap":
      return "Too many work items waiting. Dismiss some, then try again."
    case "eh_mesh_work_prompt_required":
    case "eh_mesh_work_cwd_required":
      return "That work invite is missing details. Ask your friend to send it again."
    case "eh_mesh_work_peer_blocked":
    case "eh_mesh_work_peer_not_bonded":
      return "You can only send Coding work to a bonded contact."
    case "dispatch_failed":
    case "envoy_harness_cancelled":
      return "Couldn’t start Coding for this work. Try again."
    default:
      if (!code) return "That didn’t work. Try again."
      if (code.startsWith("eh_mesh_work_")) {
        return "That didn’t work. Try again."
      }
      return code.length > 160 ? `${code.slice(0, 157)}…` : code
  }
}

/** Optional upsert fields when running a bond invite before ingest finishes. */
export type RunEhMeshWorkItemOpts = {
  prompt?: string
  cwd?: string
  fromOwnerId?: string
  title?: string
  chatId?: string
}