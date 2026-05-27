import { resolveBondTarget } from "./bond-target.js";
export async function runLibraryRequestShare(deps, input) {
    const bonds = await deps.getBonds();
    const target = resolveBondTarget(bonds, input.targetOwnerHint);
    if (!target) {
        return { ok: false, error: `Could not match "${input.targetOwnerHint}" to a bonded contact.` };
    }
    const fileTitleQuery = input.fileTitleQuery?.trim() ||
        input.relativePath?.trim() ||
        undefined;
    const peers = await deps.discoverPublishedLibrary({
        fileTitleQuery,
        contentHashPrefix: input.contentHashPrefix?.trim() || undefined,
        targetOwnerIds: [target.peerOwnerId],
        maxResultsPerPeer: 5,
    });
    const peerResult = peers.find((p) => p.peerOwnerId === target.peerOwnerId);
    const matches = peerResult?.files ?? [];
    const label = target.displayName ?? target.peerOwnerId.replace(/^envoy:owner:/, "").slice(0, 12);
    const matchLines = matches.length > 0
        ? matches
            .map((f) => `• ${f.title} (${f.relativePath}, hash ${f.contentHash.slice(0, 12)}…)`)
            .join("\n")
        : "(no published metadata match — still asking politely)";
    const queryNote = fileTitleQuery ? ` matching "${fileTitleQuery}"` : "";
    const chatText = [
        `[Envoy AI] Could you share a file${queryNote}?`,
        "",
        "I found this published metadata on your node:",
        matchLines,
        "",
        "If you're willing, please send a share offer when convenient. Metadata discovery does not download bytes automatically.",
    ].join("\n");
    await deps.sendChat(target.peerOwnerId, chatText);
    return {
        ok: true,
        result: {
            targetOwnerId: target.peerOwnerId,
            targetDisplayName: target.displayName,
            matches,
            chatText,
        },
    };
}
//# sourceMappingURL=library-request-share.js.map