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