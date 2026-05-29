/**
 * Operator checklist for physical two-NAT WAN §4 sign-off (Phase 15B).
 */
export const WAN_TWO_NAT_CHECKLIST_STEPS = [
    {
        id: "relay",
        title: "Bootstrap both nodes to the same public relay",
        detail: "Settings → WAN diagnostics or `connectivity:smoke --mode advanced --bootstrap <relay>`.",
    },
    {
        id: "axes",
        title: "Verify WAN axes on each NAT client",
        detail: "`connectivity-status --rich` — bootstrap, relay, punch, policy lines documented.",
    },
    {
        id: "automated",
        title: "Run automated relay sign-off baseline",
        detail: "./scripts/wan-relay-signoff-staging.sh /ip4/…/tcp/4001/p2p/…",
    },
    {
        id: "circuit",
        title: "Two-NAT manual §4 — circuit dial + signed chat",
        detail: "Node A peerId visible to Node B via relay.lookup; exchange signed chat.message.",
    },
    {
        id: "evidence",
        title: "Capture evidence + fill ledger row",
        detail: "Audit relay.checkin / p2p.trace correlation id; paste row into docs/wan-connectivity-signoff.md.",
    },
];
export function formatWanTwoNatOperatorChecklist(input) {
    const lines = [
        "=== Physical two-NAT §4 operator checklist ===",
        "",
    ];
    for (const [index, step] of WAN_TWO_NAT_CHECKLIST_STEPS.entries()) {
        lines.push(`${index + 1}. ${step.title}`);
        lines.push(`   ${step.detail}`);
    }
    lines.push("");
    if (input?.relayAddr)
        lines.push(`Relay: ${input.relayAddr}`);
    if (input?.natAPeerId)
        lines.push(`NAT A peerId: ${input.natAPeerId}`);
    if (input?.natBPeerId)
        lines.push(`NAT B peerId: ${input.natBPeerId}`);
    if (input?.automatedBaselineOk)
        lines.push("Automated baseline: [x] wan-relay-signoff-e2e");
    if (input?.chatVerified)
        lines.push("Manual two-NAT chat: [x] verified");
    if (input?.operator)
        lines.push(`Operator: ${input.operator}`);
    lines.push("", "See docs/wan-two-nat-staging-runbook.md");
    return lines.join("\n");
}
//# sourceMappingURL=wan-two-nat-checklist.js.map