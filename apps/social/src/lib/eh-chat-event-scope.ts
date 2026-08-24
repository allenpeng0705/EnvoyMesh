/** True when an EH event belongs to this panel chat (or is legacy/unscoped). */
export function ehEventMatchesChat(
  event: { chatId?: string },
  panelChatId: string | null | undefined,
): boolean {
  if (!event.chatId) return true;
  if (!panelChatId) return true;
  return event.chatId === panelChatId;
}
