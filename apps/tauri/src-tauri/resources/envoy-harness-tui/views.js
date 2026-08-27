/**
 * U3 — detail-view renderers for the dedicated TUI. Pure functions:
 * each takes the protocol snapshot and returns lines for the screen's
 * content area. Hermetic-tested without a TTY.
 */
import { color, SGR } from "./theme.js";
function peerLabel(p) {
    const model = p.model !== undefined ? ` ${p.model}` : "";
    const caps = p.capabilities !== undefined && p.capabilities.length > 0
        ? ` caps=${[...p.capabilities].join(",")}`
        : "";
    return `${p.id}${model}${caps}`;
}
/** `/mesh` — mesh onboarding: discover peers, configure, and collaborate. */
export function renderMeshView(options) {
    const lines = [
        "Mesh — collaborate across envoy-harness nodes",
        "",
        "Quick start:",
        "  1. On each worker: envoy-peer serve --port 18123",
        "  2. Start TUI with peers wired:",
        "     envoy-harness-tui --spawn --provider openai --peers w1@127.0.0.1:18123",
        "  3. Explore: /cluster /peers /route <tag> /scoreboard /team /trace",
        "",
        "Slash commands:",
        "  /mesh      this guide",
        "  /cluster   health + routing previews",
        "  /peers     connected peer list",
        "  /route     which peer would run a capability tag",
        "  /scoreboard peer skill reputation",
        "  /team      distributed team jobs",
        "  /trace     peer discovery event log",
        "",
        "Runtime connect:",
        "  /mesh connect <id>@<host:port>   add a peer without restart",
        "",
        "Configuration:",
        "  [[peers]] in ~/.config/envoy-harness/config.toml",
        "  --peers <id>@<host:port>     repeatable CLI flag",
        "  ENVOY_PEERS=id@host:port,... env var (comma or space separated)",
        "  --cluster-only               cluster console (no local agent chat)",
        "  --connect-timeout-ms <n>     per-peer TCP connect timeout",
        "",
        "Modes:",
        "  --spawn --peers …   live agent + mesh rail (recommended)",
        "  --cluster-only      distributed ops console (chat echoes hint)",
        "  envoy-peer ui       same cluster console via envoy-peer CLI",
    ];
    if (options?.configuredPeers !== undefined && options.configuredPeers.length > 0) {
        lines.push("", "Configured endpoints:");
        for (const peer of options.configuredPeers) {
            lines.push(`  ${peer.id} → ${peer.endpoint}`);
        }
    }
    if (options?.connected !== undefined) {
        lines.push("", `Live status: connected ${options.connected}, failed ${options.failed ?? 0}`);
    }
    return lines;
}
/** `/cluster` — per-peer health + totals + routing previews. */
export function renderClusterView(cluster, routePreviews) {
    const lines = [
        `Cluster · connected ${cluster.connected} / failed ${cluster.failed}`,
    ];
    if (cluster.peers.length === 0) {
        lines.push("  no peers configured");
        return lines;
    }
    for (const p of cluster.peers) {
        lines.push(`  ${peerLabel(p)}`);
        if (p.health.ok) {
            const rtt = p.health.rttMs !== undefined ? ` rtt=${p.health.rttMs}ms` : "";
            const at = p.health.lastPingAt !== undefined ? ` since ${p.health.lastPingAt}` : "";
            lines.push(`    health: ok${rtt}${at}`);
        }
        else {
            const error = p.health.error !== undefined ? ` (${p.health.error})` : "";
            lines.push(`    health: down${error}`);
        }
    }
    if (routePreviews !== undefined && routePreviews.length > 0) {
        lines.push("  routing:");
        for (const preview of routePreviews) {
            lines.push(preview.peer === undefined
                ? `    ${preview.tag} → no peer`
                : `    ${preview.tag} → ${peerLabel(preview.peer)}`);
        }
    }
    else {
        lines.push("  /route <tag> — preview which peer a task would go to");
    }
    return lines;
}
/** `/route <tag>` — routing preview for one capability tag. */
export function renderRouteView(input) {
    if (input.peer === undefined) {
        return [`Route "${input.tag}" → no peer available`];
    }
    return [`Route "${input.tag}" → ${peerLabel(input.peer)}`];
}
/** `/peers` — flat peer list (same data as the rail, full detail). */
export function renderPeersView(peers) {
    if (peers.length === 0)
        return ["Peers (0) — no peers configured"];
    return [`Peers (${peers.length})`, ...peers.map((p) => `  ${peerLabel(p)}`)];
}
/** `/team` — live team jobs: agents, hosts, status, cost. */
export function renderTeamView(jobs) {
    if (jobs.length === 0)
        return ["Team (0) — no jobs"];
    const lines = [`Team (${jobs.length})`];
    for (const job of jobs) {
        const cost = job.costUsd !== undefined ? ` cost=${job.costUsd}` : "";
        lines.push(`  ${job.jobId} ${job.status}${cost} @ ${job.createdAt}`);
        for (const agent of job.agents) {
            const model = agent.model !== undefined ? ` ${agent.model}` : "";
            const costA = agent.costUsd !== undefined ? ` cost=${agent.costUsd}` : "";
            lines.push(`    ${agent.id} @ ${agent.host}${model} = ${agent.status}${costA}`);
        }
    }
    return lines;
}
/** `/scoreboard` — reputation per (peer, skill). */
export function renderScoreboardView(entries) {
    if (entries.length === 0)
        return ["Scoreboard (0) — no verdicts yet"];
    return [
        `Scoreboard (${entries.length})`,
        ...entries.map((e) => `  ${e.workerPeerId} ${e.skillId} score=${e.score} pass=${e.passCount} fail=${e.failCount} partial=${e.partialCount}`),
    ];
}
/** The discovery ticker (last events, newest first), shown above the input. */
export function renderDiscoveryTicker(events, max = 3) {
    return events
        .slice(-max)
        .reverse()
        .map((e) => {
        const detail = e.type === "peer.connected"
            ? "connected"
            : e.type === "peer.disconnected"
                ? "disconnected"
                : e.type === "peer.failed"
                    ? `failed${e.error !== undefined ? `: ${e.error}` : ""}`
                    : e.rttMs !== undefined
                        ? `rtt=${e.rttMs}ms`
                        : "health";
        return `! ${e.peerId} ${detail}`;
    });
}
/** `/search <term>` — transcript lines containing the term (case-insensitive). */
export function renderSearchView(transcript, term) {
    const needle = term.toLowerCase();
    const matches = transcript.filter((line) => line.toLowerCase().includes(needle));
    if (matches.length === 0) {
        return [`Search "${term}" — no matches`];
    }
    return [
        `Search "${term}" — ${matches.length} match${matches.length === 1 ? "" : "es"}`,
        ...matches.map((line) => `  ${line}`),
    ];
}
/** `/trace` — the discovery/peer event log (newest first). */
export function renderTraceView(events) {
    if (events.length === 0)
        return ["Trace (0) — no events yet"];
    return [
        `Trace (${events.length})`,
        ...[...events].reverse().map((e) => {
            const detail = e.type === "peer.connected"
                ? "connected"
                : e.type === "peer.disconnected"
                    ? "disconnected"
                    : e.type === "peer.failed"
                        ? `failed${e.error !== undefined ? `: ${e.error}` : ""}`
                        : e.rttMs !== undefined
                            ? `rtt=${e.rttMs}ms`
                            : "health";
            return `  ${e.at} ${e.peerId} ${detail}`;
        }),
    ];
}
/** `/plan` tab — current plan text with section header. */
export function renderPlanView(text, options) {
    const { color: useColor = false } = options ?? {};
    const header = useColor
        ? `${color("Plan", SGR.bold)} ${color("(read-only · /plan edit)", SGR.dim)}`
        : "Plan (read-only · /plan edit)";
    if (text.trim().length === 0) {
        return [
            header,
            useColor ? color("  empty — use /plan enter", SGR.dim) : "  empty — use /plan enter",
        ];
    }
    const body = text.split("\n").map((l) => `  ${l}`);
    return [header, ...body];
}
/** `/memory` tab — memory list or body. */
export function renderMemoryView(text, options) {
    const { color: useColor = false } = options ?? {};
    const header = useColor
        ? `${color("Memory", SGR.bold)} ${color("( /memory list | read | add )", SGR.dim)}`
        : "Memory ( /memory list | read | add )";
    if (text.trim().length === 0) {
        return [header, useColor ? color("  empty", SGR.dim) : "  empty"];
    }
    return [header, ...text.split("\n").map((l) => `  ${l}`)];
}
/** `/diff` tab — inline git diff with optional ANSI colors. */
export function renderGitDiffView(text, options) {
    const { color: useColor = false } = options ?? {};
    const header = useColor
        ? `${color("Git diff", SGR.bold)} ${color("( /diff --staged --stat )", SGR.dim)}`
        : "Git diff ( /diff --staged --stat )";
    if (text.trim().length === 0) {
        return [header, useColor ? color("  clean working tree", SGR.green) : "  clean working tree"];
    }
    const lines = text.split("\n").map((line) => {
        const padded = `  ${line}`;
        if (!useColor)
            return padded;
        if (line.startsWith("+++") || line.startsWith("---")) {
            return color(padded, SGR.bold);
        }
        if (line.startsWith("+"))
            return color(padded, SGR.green);
        if (line.startsWith("-"))
            return color(padded, SGR.red);
        if (line.startsWith("@@"))
            return color(padded, SGR.cyan);
        return padded;
    });
    return [header, ...lines];
}
/** U6a.5 — resume picker from `sessions/list`. */
export function renderResumeView(sessions, options) {
    const { color: useColor = false } = options ?? {};
    const header = useColor
        ? `${color("Resume session", SGR.bold)} ${color("( type row # or session id )", SGR.dim)}`
        : "Resume session ( type row # or session id )";
    if (sessions.length === 0) {
        return [
            header,
            useColor ? color("  no persisted sessions — use --persist", SGR.dim) : "  no persisted sessions — use --persist",
        ];
    }
    const lines = [header, "  #   id          messages  title / cwd"];
    sessions.forEach((s, i) => {
        const title = s.title ?? s.cwd ?? "—";
        const shortId = s.id.length > 12 ? `${s.id.slice(0, 10)}…` : s.id;
        lines.push(`  ${String(i + 1).padStart(2)}  ${shortId.padEnd(12)} ${String(s.messageCount).padStart(3)}     ${title}`);
    });
    lines.push(useColor ? color("  Esc → chat", SGR.dim) : "  Esc → chat");
    return lines;
}
//# sourceMappingURL=views.js.map