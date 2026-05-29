/**
 * Operator helpers for docs/wan-connectivity-signoff.md ledger rows (Phase 15B).
 */
function todayUtc() {
    return new Date().toISOString().slice(0, 10);
}
function bracket(state) {
    if (state === "ok")
        return "[x]";
    if (state === "partial" || state === "n/a")
        return "[~]";
    return "[ ]";
}
export function formatWanSignOffLedgerRow(input) {
    const date = input.date ?? todayUtc();
    const version = input.commitSha ? `main @ ${input.commitSha}` : "main @ (unknown)";
    const topology = input.topology ??
        (input.physicalTwoNat
            ? "NAT Client A + NAT Client B + public relay"
            : "operator staging");
    const relay = bracket(input.relaySignOff ?? (input.physicalTwoNat ? "pending" : "partial"));
    const dcutr = bracket(input.dcutrSignOff ?? "pending");
    const quic = bracket(input.quicSignOff ?? "pending");
    const operator = input.operator ?? "@operator";
    const notes = input.notes ??
        [
            input.relayAddr ? `relay=${input.relayAddr}` : null,
            input.peerId ? `peerId=${input.peerId}` : null,
            input.physicalTwoNat
                ? "physical two-NAT per wan-two-nat-staging-runbook.md"
                : "automated wan-relay-signoff-e2e baseline",
        ]
            .filter(Boolean)
            .join("; ");
    return `${date} | ${version} | ${topology} | ${relay} circuit dial + chat | ${dcutr} DCUtR | ${quic} QUIC | ${operator} | ${notes}`;
}
export function formatWanSignOffEvidenceReport(input) {
    const lines = [
        "=== WAN connectivity sign-off evidence ===",
        "",
        "Ledger row (paste into docs/wan-connectivity-signoff.md):",
        formatWanSignOffLedgerRow(input),
        "",
    ];
    if (input.diagnostics) {
        const { axes, stageD, nodeOnline } = input.diagnostics;
        lines.push("Diagnostics snapshot:", `  nodeOnline=${nodeOnline}`, `  stageD=${stageD.badge} (${stageD.badgeExplanation})`, `  bootstrap=${axes.bootstrapReachability.state} — ${axes.bootstrapReachability.explanation}`, `  relay=${axes.relayAvailability.state} — ${axes.relayAvailability.explanation}`, `  punch=${axes.holePunch.state} — ${axes.holePunch.explanation}`, `  policy=${axes.policyBlock.state} — ${axes.policyBlock.explanation}`, "");
    }
    lines.push("Physical two-NAT checklist:", "  1. Bootstrap both nodes to the same public relay.", "  2. connectivity-status --rich on each NAT client.", "  3. relay.lookup until remote peer appears; exchange signed chat.message.", "  4. Fill ledger row with physicalTwoNat evidence (this CLI: connectivity-signoff --physical-two-nat).", "", "See docs/wan-two-nat-staging-runbook.md");
    return lines.join("\n");
}
//# sourceMappingURL=wan-signoff-evidence.js.map