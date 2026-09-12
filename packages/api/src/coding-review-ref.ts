/**
 * Phase 68-C2 — mesh peer-review deep-link embedded in chat bodies.
 *
 * Marker line is parseable without a custom OS URL scheme:
 * `[envoymesh-coding-review]{"kind":"eh-workspace-review","v":1,...}`
 */

export const CODING_REVIEW_REF_KIND = "eh-workspace-review" as const;

export const CODING_REVIEW_MARKER = "[envoymesh-coding-review]";

export type CodingReviewRef = {
  kind: typeof CODING_REVIEW_REF_KIND;
  v: 1;
  ownerId: string;
  chatId: string;
  title?: string;
  cwd?: string;
  turnId?: string;
  revision?: number;
};

/** Encode a single machine footer line peers can parse from chat text. */
export function encodeCodingReviewRef(ref: CodingReviewRef): string {
  const payload: CodingReviewRef = {
    kind: CODING_REVIEW_REF_KIND,
    v: 1,
    ownerId: ref.ownerId.trim(),
    chatId: ref.chatId.trim(),
    ...(ref.title?.trim() ? { title: ref.title.trim() } : {}),
    ...(ref.cwd?.trim() ? { cwd: ref.cwd.trim() } : {}),
    ...(ref.turnId?.trim() ? { turnId: ref.turnId.trim() } : {}),
    ...(typeof ref.revision === "number" && Number.isFinite(ref.revision)
      ? { revision: Math.floor(ref.revision) }
      : {}),
  };
  return `${CODING_REVIEW_MARKER}${JSON.stringify(payload)}`;
}

/** Find and parse a coding-review marker from a chat body (any line). */
export function parseCodingReviewRef(text: string): CodingReviewRef | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const idx = text.indexOf(CODING_REVIEW_MARKER);
  if (idx < 0) return null;
  const after = text.slice(idx + CODING_REVIEW_MARKER.length);
  const jsonStart = after.indexOf("{");
  if (jsonStart < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = jsonStart; i < after.length; i++) {
    const ch = after[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    const raw = JSON.parse(after.slice(jsonStart, end + 1)) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    if (obj.kind !== CODING_REVIEW_REF_KIND) return null;
    if (obj.v !== 1) return null;
    const ownerId = typeof obj.ownerId === "string" ? obj.ownerId.trim() : "";
    const chatId = typeof obj.chatId === "string" ? obj.chatId.trim() : "";
    if (!ownerId || !chatId) return null;
    const ref: CodingReviewRef = {
      kind: CODING_REVIEW_REF_KIND,
      v: 1,
      ownerId,
      chatId,
    };
    if (typeof obj.title === "string" && obj.title.trim()) {
      ref.title = obj.title.trim();
    }
    if (typeof obj.cwd === "string" && obj.cwd.trim()) {
      ref.cwd = obj.cwd.trim();
    }
    if (typeof obj.turnId === "string" && obj.turnId.trim()) {
      ref.turnId = obj.turnId.trim();
    }
    if (typeof obj.revision === "number" && Number.isFinite(obj.revision)) {
      ref.revision = Math.floor(obj.revision);
    }
    return ref;
  } catch {
    return null;
  }
}

/**
 * Human-readable invite plus machine footer.
 * Social should `sendChat(peerOwnerId, messageText)` after `createCodingReviewInvite`.
 */
export function formatCodingReviewInviteMessage(ref: CodingReviewRef): string {
  const title = ref.title?.trim();
  const human = title
    ? `I've invited you to review the Coding workspace “${title}”. Open it on the owner's home node to view the timeline and changes (read-only).`
    : "I've invited you to review a Coding workspace. Open it on the owner's home node to view the timeline and changes (read-only).";
  return `${human}\n\n${encodeCodingReviewRef(ref)}`;
}
