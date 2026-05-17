/** Display label for a bond contact. */
export function contactLabel(contact) {
    const d = contact.displayName?.trim();
    if (d)
        return d;
    if (contact.libp2pPeerId?.trim())
        return contact.libp2pPeerId.trim();
    return contact.peerOwnerId;
}
/** Display label for a message sender. */
export function peerDisplayLabel(sender) {
    return sender.displayName?.trim() || sender.nodeId?.trim() || "Peer";
}
/** Suggested interest topics shown in search and profile views. */
export const SUGGESTED_TOPICS = [
    "music", "tech", "art", "science", "gaming",
    "movies", "books", "travel", "food", "fitness",
    "news", "sports", "fashion", "photography", "coding",
];
//# sourceMappingURL=display.js.map