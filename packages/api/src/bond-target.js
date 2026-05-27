export function resolveBondTarget(bonds, hint) {
    if (!hint?.trim())
        return undefined;
    const h = hint.trim().toLowerCase();
    return (bonds.find((b) => b.peerOwnerId === hint) ??
        bonds.find((b) => b.displayName?.toLowerCase() === h) ??
        bonds.find((b) => b.displayName?.toLowerCase().includes(h)) ??
        bonds.find((b) => b.peerOwnerId.toLowerCase().includes(h)));
}
//# sourceMappingURL=bond-target.js.map