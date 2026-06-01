/** Browser-safe group room thread key helpers (no node-only deps). */

export function chatRoomThreadKey(roomId: string): string {
  return `room:${roomId}`;
}

export function parseChatRoomThreadKey(threadKey: string): string | null {
  if (!threadKey.startsWith("room:")) return null;
  const roomId = threadKey.slice("room:".length).trim();
  return roomId.length > 0 ? roomId : null;
}

export function isChatRoomThreadKey(threadKey: string): boolean {
  return parseChatRoomThreadKey(threadKey) !== null;
}
