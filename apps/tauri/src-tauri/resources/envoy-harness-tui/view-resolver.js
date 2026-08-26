/**
 * U3/U5 — view-body resolution for the screen mode: which content the
 * active view shows, fetched from the session's protocol methods, plus
 * the cached cluster routing previews. Kept out of `ui.ts` so the run
 * loop stays under the module-size target.
 */
import { formatTranscriptLine } from "./transcript.js";
import { renderClusterView, renderGitDiffView, renderMemoryView, renderMeshView, renderPeersView, renderPlanView, renderResumeView, renderRouteView, renderScoreboardView, renderSearchView, renderTeamView, renderTraceView, } from "./views.js";
/** Fetch a view body, falling back to an "unavailable" line on error. */
async function tryView(fn, label) {
    try {
        return await fn();
    }
    catch (err) {
        return [
            `${label} unavailable: ${err instanceof Error ? err.message : String(err)}`,
        ];
    }
}
/** Resolve the screen's content area for the active view. */
export async function resolveViewBody(view, routeTag, session, cluster, clusterRoutePreviews, searchTerm, meshOptions, renderOptions) {
    if (view === "chat") {
        return session.transcript.map((line) => formatTranscriptLine(line));
    }
    if (view === "mesh") {
        const meshViewOptions = {};
        if (meshOptions?.configuredPeers !== undefined) {
            meshViewOptions.configuredPeers = meshOptions.configuredPeers;
        }
        if (cluster?.connected !== undefined) {
            meshViewOptions.connected = cluster.connected;
        }
        if (cluster?.failed !== undefined) {
            meshViewOptions.failed = cluster.failed;
        }
        return renderMeshView(meshViewOptions);
    }
    if (view === "peers") {
        return tryView(async () => renderPeersView(await session.peers()), "peers");
    }
    if (view === "cluster") {
        return renderClusterView(cluster ?? { peers: [], connected: 0, failed: 0 }, clusterRoutePreviews);
    }
    if (view === "team") {
        return tryView(async () => renderTeamView(await session.teamJobs()), "team");
    }
    if (view === "scoreboard") {
        return tryView(async () => renderScoreboardView(await session.scoreboard()), "scoreboard");
    }
    if (view === "search") {
        return searchTerm !== undefined
            ? renderSearchView(session.transcript.map((line) => formatTranscriptLine(line)), searchTerm)
            : ["/search <term> — search the transcript"];
    }
    if (view === "trace") {
        return renderTraceView(session.discoveryEvents);
    }
    if (view === "plan") {
        return tryView(async () => renderPlanView(await session.fetchPlanView(), renderOptions), "plan");
    }
    if (view === "memory") {
        return tryView(async () => renderMemoryView(await session.fetchMemoryView(), renderOptions), "memory");
    }
    if (view === "git-diff") {
        return tryView(async () => renderGitDiffView(await session.fetchGitDiffView(session.gitDiffStaged, session.gitDiffStat), renderOptions), "git-diff");
    }
    if (view === "resume") {
        return tryView(async () => renderResumeView(await session.listPersistedSessions(), renderOptions), "resume");
    }
    return routeTag !== undefined
        ? tryView(async () => renderRouteView({
            tag: routeTag,
            peer: await session.route(routeTag),
        }), "route")
        : ["/route <tag> — preview routing"];
}
/**
 * U3 follow-up — routing previews for the cluster view: derive candidate
 * tags from the peers' capabilities and ask the host which peer would
 * run each. Cached (10s TTL) so typing in the view doesn't re-route
 * every keystroke.
 */
export async function resolveClusterRoutePreviews(session, cluster, cached) {
    const now = Date.now();
    if (cached !== undefined && now - cached.at < 10_000)
        return cached;
    const tags = [
        ...new Set((cluster?.peers ?? [])
            .filter((p) => p.health.ok)
            .flatMap((p) => p.capabilities ?? [])),
    ].slice(0, 5);
    const previews = tags.length === 0
        ? []
        : await Promise.all(tags.map(async (tag) => ({
            tag,
            peer: await session.route(tag),
        })));
    return { at: now, previews };
}
//# sourceMappingURL=view-resolver.js.map