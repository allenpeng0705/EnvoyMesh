import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type {
  AuditEvent,
  DashboardConfig,
  DashboardSnapshot,
  OutboundSendResult,
  SendChatRequest,
  SendPairingRequest,
  SendTaskProposalRequest,
  SetTrustRecordRequest,
  VaultSearchHit,
} from "../shared/dashboard.js";
import "./styles.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; snapshot: DashboardSnapshot; config: DashboardConfig }
  | { status: "error"; message: string };

const TASK_COMPOSER_STEPS = ["Objective", "Constraints", "Mandate Controls", "Routing", "Review & Send"] as const;
const TASK_COMPOSER_PERSIST_KEY = "envoymesh.dashboard.taskComposer.v1";
const INITIAL_TASK_COMPOSE_FORM: SendTaskProposalRequest & { collectCompletedResultsText: string } = {
  target: "",
  taskId: "",
  mandateId: "",
  objective: "",
  requestedResult: "",
  correlationId: "",
  closeOnFirstCompletedResult: false,
  collectCompletedResultsText: "",
};

const TASK_COMPOSER_PRESETS: Array<{
  id: string;
  label: string;
  objective: string;
  requestedResult: string;
  closeOnFirstCompletedResult: boolean;
  collectCompletedResultsText: string;
}> = [
  {
    id: "quick-ack",
    label: "Quick Ack",
    objective: "Run lightweight acknowledgement task",
    requestedResult: "Return a short acknowledgment message.",
    closeOnFirstCompletedResult: true,
    collectCompletedResultsText: "",
  },
  {
    id: "collect-2",
    label: "Collect 2 Results",
    objective: "Collect two independent completion results",
    requestedResult: "Return two completed results from different peers.",
    closeOnFirstCompletedResult: false,
    collectCompletedResultsText: "2",
  },
  {
    id: "review-required",
    label: "Review Required",
    objective: "Prepare output for manual review",
    requestedResult: "Provide full reasoning and artifacts for review.",
    closeOnFirstCompletedResult: false,
    collectCompletedResultsText: "",
  },
];

function discoveryBannerTitle(badge: DashboardSnapshot["connectivityHealth"]["stageDBadge"]): string {
  switch (badge) {
    case "ok":
      return "Connectivity looks healthy";
    case "warn":
      return "Connectivity needs attention";
    case "starting":
      return "Connectivity warming up";
    default:
      return "Connectivity status unknown";
  }
}

function App() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [vaultQuery, setVaultQuery] = useState("");
  const [vaultResults, setVaultResults] = useState<VaultSearchHit[]>([]);
  const [trustForm, setTrustForm] = useState<SetTrustRecordRequest>({
    peerOwnerId: "",
    level: "direct",
    displayName: "",
    note: "",
  });
  const [auditCorrelationFilter, setAuditCorrelationFilter] = useState("");
  const [showP2pTrace, setShowP2pTrace] = useState(false);
  const [pairingTimelineStatusFilter, setPairingTimelineStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "deferred" | "approved_remote"
  >("all");
  const [pairingTimelineQuery, setPairingTimelineQuery] = useState("");
  const [pairingTimelineExportPath, setPairingTimelineExportPath] = useState("./pairing-timeline.json");
  const [livePolling, setLivePolling] = useState(true);
  const [sendResult, setSendResult] = useState<OutboundSendResult | undefined>(undefined);
  const [copyNotice, setCopyNotice] = useState<string | undefined>(undefined);
  const [chatThreadQuery, setChatThreadQuery] = useState("");
  const [chatStatusFilter, setChatStatusFilter] = useState<"all" | ChatThreadMessage["status"]>("all");
  const [selectedChatThreadKey, setSelectedChatThreadKey] = useState<string | undefined>(undefined);
  const [taskComposerStep, setTaskComposerStep] = useState(0);
  const [taskPresetId, setTaskPresetId] = useState<string>("none");
  const [chatForm, setChatForm] = useState<SendChatRequest>({
    target: "",
    text: "",
    correlationId: "",
  });
  const [pairingForm, setPairingForm] = useState<SendPairingRequest>({
    target: "",
    note: "",
    requestedDeviceProfile: "satellite",
  });
  const [taskComposeForm, setTaskComposeForm] = useState<SendTaskProposalRequest & { collectCompletedResultsText: string }>(
    INITIAL_TASK_COMPOSE_FORM,
  );
  const [negotiateForm, setNegotiateForm] = useState({
    target: "",
    taskId: "",
    mandateId: "",
    message: "",
    proposedChangesLine: "",
    negotiationId: "",
    correlationId: "",
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TASK_COMPOSER_PERSIST_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        presetId?: string;
        step?: number;
        target?: string;
        taskId?: string;
        mandateId?: string;
        objective?: string;
        requestedResult?: string;
        correlationId?: string;
        closeOnFirstCompletedResult?: boolean;
        collectCompletedResultsText?: string;
      };
      if (parsed.presetId && (parsed.presetId === "none" || TASK_COMPOSER_PRESETS.some((item) => item.id === parsed.presetId))) {
        setTaskPresetId(parsed.presetId);
      }
      if (typeof parsed.step === "number" && parsed.step >= 0 && parsed.step < TASK_COMPOSER_STEPS.length) {
        setTaskComposerStep(parsed.step);
      }
      setTaskComposeForm((previous) => ({
        ...previous,
        taskId: parsed.taskId ?? previous.taskId,
        objective: parsed.objective ?? previous.objective,
        requestedResult: parsed.requestedResult ?? previous.requestedResult,
        target: parsed.target ?? previous.target,
        mandateId: parsed.mandateId ?? previous.mandateId,
        correlationId: parsed.correlationId ?? previous.correlationId,
        closeOnFirstCompletedResult: parsed.closeOnFirstCompletedResult ?? previous.closeOnFirstCompletedResult,
        collectCompletedResultsText: parsed.collectCompletedResultsText ?? previous.collectCompletedResultsText,
      }));
    } catch {
      // Ignore corrupt local dashboard preferences.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TASK_COMPOSER_PERSIST_KEY,
        JSON.stringify({
          presetId: taskPresetId,
          step: taskComposerStep,
          taskId: taskComposeForm.taskId,
          objective: taskComposeForm.objective,
          requestedResult: taskComposeForm.requestedResult,
          target: taskComposeForm.target,
          mandateId: taskComposeForm.mandateId,
          correlationId: taskComposeForm.correlationId,
          closeOnFirstCompletedResult: taskComposeForm.closeOnFirstCompletedResult,
          collectCompletedResultsText: taskComposeForm.collectCompletedResultsText,
        }),
      );
    } catch {
      // Ignore browser storage errors.
    }
  }, [taskComposeForm, taskComposerStep, taskPresetId]);

  async function refresh() {
    try {
      const [config, snapshot] = await Promise.all([
        window.envoyDashboard.getConfig(),
        window.envoyDashboard.getDashboardSnapshot(),
      ]);
      setLoadState({ status: "ready", config, snapshot });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!livePolling) {
      return;
    }
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [livePolling]);

  const pendingApprovals = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }

    return loadState.snapshot.approvals.filter((approval) => approval.status === "pending");
  }, [loadState]);
  const pairingApprovals = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }
    return loadState.snapshot.approvals.filter((approval) => approval.taskId.startsWith("pairing:"));
  }, [loadState]);

  const deferredPairingPeers = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }
    const latestByPeer = new Map<string, string>();
    for (const event of loadState.snapshot.auditEvents) {
      if (event.intent !== "device.pair.deferred" || !event.remotePeerId) {
        continue;
      }
      latestByPeer.set(event.remotePeerId, event.createdAt);
    }
    return [...latestByPeer.entries()].map(([peerId, createdAt]) => ({ peerId, createdAt }));
  }, [loadState]);

  const filteredAuditEvents = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }

    const needle = auditCorrelationFilter.trim();
    return loadState.snapshot.auditEvents.filter((event) => {
      if (!showP2pTrace && event.type === "p2p.trace") {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = `${event.correlationId ?? ""}\n${event.taskId ?? ""}`;
      return haystack.includes(needle);
    });
  }, [auditCorrelationFilter, loadState, showP2pTrace]);
  const filteredPairingTimeline = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }

    const query = pairingTimelineQuery.trim().toLowerCase();
    return loadState.snapshot.pairingTimeline.filter((item) => {
      if (pairingTimelineStatusFilter !== "all" && item.status !== pairingTimelineStatusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${item.requestId}\n${item.summary}\n${item.remotePeerId ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [loadState, pairingTimelineQuery, pairingTimelineStatusFilter]);
  const chatThreads = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }
    return buildChatThreads(loadState.snapshot.chatAuditTrail);
  }, [loadState]);
  const filteredChatThreads = useMemo(() => {
    const query = chatThreadQuery.trim().toLowerCase();
    return chatThreads.filter((thread) => {
      if (
        chatStatusFilter !== "all" &&
        !thread.messages.some((message) => message.status === chatStatusFilter)
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${thread.label}\n${thread.correlationId ?? ""}\n${thread.taskId ?? ""}\n${thread.remotePeerId ?? ""}\n${thread.messages.map((message) => message.summary).join("\n")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [chatStatusFilter, chatThreadQuery, chatThreads]);
  const taskStepHint = useMemo(() => {
    return validateTaskStep(taskComposeForm, taskComposerStep);
  }, [taskComposeForm, taskComposerStep]);

  useEffect(() => {
    if (filteredChatThreads.length === 0) {
      setSelectedChatThreadKey(undefined);
      return;
    }
    const stillPresent = selectedChatThreadKey
      ? filteredChatThreads.some((thread) => thread.key === selectedChatThreadKey)
      : false;
    if (!stillPresent) {
      setSelectedChatThreadKey(filteredChatThreads[0]?.key);
    }
  }, [filteredChatThreads, selectedChatThreadKey]);

  async function updateApproval(approvalId: string, action: "approve" | "reject") {
    if (action === "approve") {
      await window.envoyDashboard.approveRequest(approvalId);
    } else {
      await window.envoyDashboard.rejectRequest(approvalId);
    }

    await refresh();
  }

  async function saveTrustRecord() {
    await window.envoyDashboard.setTrustRecord({
      peerOwnerId: trustForm.peerOwnerId,
      level: trustForm.level,
      displayName: trustForm.displayName || undefined,
      note: trustForm.note || undefined,
    });
    setTrustForm({ peerOwnerId: "", level: "direct", displayName: "", note: "" });
    await refresh();
  }

  async function removeTrustRecord(peerOwnerId: string) {
    await window.envoyDashboard.removeTrustRecord(peerOwnerId);
    await refresh();
  }

  async function searchVault() {
    setVaultResults(await window.envoyDashboard.searchVault(vaultQuery));
  }

  async function sendChatMessage() {
    const result = await window.envoyDashboard.sendChatMessage({
      ...chatForm,
      correlationId: chatForm.correlationId?.trim() || undefined,
    });
    setSendResult(result);
    setChatForm((previous) => ({ ...previous, text: "", correlationId: "" }));
    await refresh();
  }

  async function sendPairingRequest() {
    const result = await window.envoyDashboard.sendPairingRequest({
      target: pairingForm.target,
      note: pairingForm.note?.trim() || undefined,
      requestedDeviceProfile: pairingForm.requestedDeviceProfile,
    });
    setSendResult(result);
    await refresh();
  }

  async function retryDeferredPairing(target: string) {
    const result = await window.envoyDashboard.sendPairingRequest({
      ...pairingForm,
      target,
      note: pairingForm.note?.trim() || "Retry deferred pairing request.",
    });
    setSendResult(result);
    await refresh();
  }

  async function copyCommand(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice(`Copied: ${text}`);
      setTimeout(() => setCopyNotice(undefined), 2000);
    } catch (error) {
      setCopyNotice(`Copy failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function copyAllSmokeCommands() {
    const commands = [
      `npm run node:dev -- --profile "${config.profileDir}" --listen /ip4/0.0.0.0/tcp/0 --p2p-debug`,
      `npm run cli -w @envoymesh/node -- smoke-checklist --machine-a primary --machine-b satellite`,
      `npm run cli -w @envoymesh/node -- pairing timeline --profile "${config.profileDir}" --format json --output "./pairing-timeline.json"`,
    ];
    await copyCommand(commands.join("\n"));
  }

  async function exportPairingTimelineJson() {
    const resolved = await window.envoyDashboard.exportPairingTimeline(pairingTimelineExportPath);
    setCopyNotice(`Exported pairing timeline: ${resolved}`);
  }

  async function sendTaskProposal() {
    const collectRaw = taskComposeForm.collectCompletedResultsText.trim();
    const collectParsed = Number.parseInt(collectRaw, 10);
    const collectCompletedResults =
      collectRaw.length > 0 && !Number.isNaN(collectParsed) && collectParsed >= 2 ? collectParsed : undefined;
    const result = await window.envoyDashboard.sendTaskProposal({
      target: taskComposeForm.target,
      taskId: taskComposeForm.taskId,
      mandateId: taskComposeForm.mandateId?.trim() || undefined,
      objective: taskComposeForm.objective,
      requestedResult: taskComposeForm.requestedResult,
      correlationId: taskComposeForm.correlationId?.trim() || undefined,
      closeOnFirstCompletedResult: taskComposeForm.closeOnFirstCompletedResult || undefined,
      collectCompletedResults,
    });
    setSendResult(result);
    setTaskComposeForm((previous) => ({ ...previous, correlationId: "" }));
    setTaskComposerStep(0);
    await refresh();
  }

  function resetTaskComposerState() {
    setTaskPresetId("none");
    setTaskComposerStep(0);
    setTaskComposeForm(INITIAL_TASK_COMPOSE_FORM);
    try {
      window.localStorage.removeItem(TASK_COMPOSER_PERSIST_KEY);
    } catch {
      // Ignore browser storage errors.
    }
  }

  async function sendTaskNegotiate() {
    const proposed = negotiateForm.proposedChangesLine
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const result = await window.envoyDashboard.sendTaskNegotiate({
      target: negotiateForm.target,
      taskId: negotiateForm.taskId,
      mandateId: negotiateForm.mandateId,
      message: negotiateForm.message,
      proposedChanges: proposed.length > 0 ? proposed : undefined,
      negotiationId: negotiateForm.negotiationId?.trim() || undefined,
      correlationId: negotiateForm.correlationId?.trim() || undefined,
    });
    setSendResult(result);
    setNegotiateForm((previous) => ({ ...previous, correlationId: "" }));
    await refresh();
  }

  if (loadState.status === "loading") {
    return <main className="shell">Loading EnvoyMesh dashboard...</main>;
  }

  if (loadState.status === "error") {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Dashboard Error</h1>
          <p>{loadState.message}</p>
          <button onClick={() => void refresh()}>Retry</button>
        </section>
      </main>
    );
  }

  const { snapshot, config } = loadState;
  const selectedChatThread = filteredChatThreads.find((thread) => thread.key === selectedChatThreadKey);

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">EnvoyMesh Desktop</p>
          <h1>Operator Console</h1>
          <p className="muted">Local profile: {config.profileDir}</p>
          <p className="muted">Shared vault: {config.vaultDir}</p>
        </div>
        <div className="actions">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={livePolling}
              onChange={(event) => setLivePolling(event.target.checked)}
            />
            Live update
          </label>
          <button onClick={() => void refresh()}>Refresh</button>
          <button className="secondary" onClick={() => void copyAllSmokeCommands()}>
            Copy Smoke Cmds
          </button>
        </div>
      </header>
      {copyNotice ? <p className="muted">{copyNotice}</p> : null}

      <section className="grid cards">
        <Metric label="Pending Approvals" value={pendingApprovals.length} />
        <Metric label="Trust Records" value={snapshot.trustRecords.length} />
        <Metric label="Observed Peers" value={snapshot.observedPeers.length} />
        <Metric label="Vault Documents" value={snapshot.vault.documentCount} />
      </section>

      <Panel title="Live P2P Visualization">
        <div className="grid cards">
          <Metric label="Active Peers" value={snapshot.liveP2p.peerCount} />
          <Metric label="Inbound Events" value={snapshot.liveP2p.inboundCount} />
          <Metric label="Outbound Events" value={snapshot.liveP2p.outboundCount} />
          <Metric label="Protocols Seen" value={snapshot.liveP2p.protocolCounts.length} />
        </div>
        <p className="muted">
          Generated at {snapshot.liveP2p.generatedAt}. Run the node with <code>--p2p-debug</code> for stream
          lifecycle traces.
        </p>
        <div className="grid two">
          <div className="list">
            {snapshot.liveP2p.protocolCounts.length === 0 ? (
              <p className="muted">No protocol traces yet.</p>
            ) : (
              snapshot.liveP2p.protocolCounts.map((item) => (
                <article key={item.protocol} className="row compact">
                  <div>
                    <strong>{item.protocol}</strong>
                    <small>events={item.count}</small>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="list">
            {snapshot.liveP2p.traces.length === 0 ? (
              <p className="muted">No recent p2p.trace events.</p>
            ) : (
              snapshot.liveP2p.traces.map((trace) => (
                <article key={trace.eventId} className="row compact">
                  <div>
                    <strong>{trace.summary}</strong>
                    <small>
                      {trace.createdAt}
                      {trace.direction ? ` · ${trace.direction}` : ""}
                      {trace.remotePeerId ? ` · ${trace.remotePeerId}` : ""}
                    </small>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Discovery Health">
        <div className={`connectivity-stage-banner connectivity-stage-${snapshot.connectivityHealth.stageDBadge}`}>
          <div className="connectivity-stage-banner-title">{discoveryBannerTitle(snapshot.connectivityHealth.stageDBadge)}</div>
          <p className="connectivity-stage-banner-body">{snapshot.connectivityHealth.stageDExplanation}</p>
        </div>
        <div className="grid cards">
          <Metric label="Bootstrap Peers" value={snapshot.connectivityHealth.bootstrapPeerCount} />
          <Metric label="Peers Discovered" value={snapshot.connectivityHealth.discoveredPeerCount} />
          <Metric label="Relay Discoveries" value={snapshot.connectivityHealth.relayDiscoveryCount} />
          <Metric label="Bootstrap Probe OK" value={snapshot.connectivityHealth.bootstrapProbeSuccessCount} />
          <Metric label="Bootstrap Probe Fail" value={snapshot.connectivityHealth.bootstrapProbeFailureCount} />
          <Metric label="Warnings" value={snapshot.connectivityHealth.warningCount} />
        </div>
        <p className="muted">
          discoveryProfile={snapshot.connectivityHealth.discoveryProfile}
          {snapshot.connectivityHealth.lastCheckpointAt
            ? ` · lastCheckpoint=${snapshot.connectivityHealth.lastCheckpointAt}`
            : ""}
        </p>
        {snapshot.connectivityHealth.warnings.length === 0 ? (
          <p className="muted">No connectivity warnings recorded.</p>
        ) : (
          <div className="list">
            {snapshot.connectivityHealth.warnings.map((warning) => (
              <article key={warning} className="row compact">
                <div>
                  <strong>Warning</strong>
                  <small>{warning}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <section className="grid two">
        <Panel title="Profile">
          <dl className="facts">
            <dt>Owner ID</dt>
            <dd>{snapshot.profile.owner.ownerId}</dd>
            <dt>Device ID</dt>
            <dd>{snapshot.profile.device.deviceId}</dd>
            <dt>Device Profile</dt>
            <dd>{snapshot.profile.deviceCertificate.deviceProfile}</dd>
            <dt>Capabilities</dt>
            <dd>{snapshot.profile.deviceCertificate.capabilities.join(", ")}</dd>
          </dl>
        </Panel>

        <Panel title="Approvals">
          {snapshot.approvals.length === 0 ? (
            <p className="muted">No approval requests yet.</p>
          ) : (
            <div className="list">
              {snapshot.approvals.map((approval) => (
                <article key={approval.approvalId} className="row">
                  <div>
                    <strong>{approval.requestedAction}</strong>
                    <p>{approval.reason}</p>
                    <small>
                      {approval.approvalId} · {approval.status} · task {approval.taskId}
                    </small>
                  </div>
                  {approval.status === "pending" ? (
                    <div className="actions">
                      <button onClick={() => void updateApproval(approval.approvalId, "approve")}>
                        Approve
                      </button>
                      <button
                        className="secondary"
                        onClick={() => void updateApproval(approval.approvalId, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel title="Pairing Queue">
        {pairingApprovals.length === 0 ? (
          <p className="muted">No device pairing approvals queued.</p>
        ) : (
          <div className="list">
            {pairingApprovals.map((approval) => (
              <article key={approval.approvalId} className="row">
                <div>
                  <strong>{approval.taskId}</strong>
                  <p>{approval.reason.split("\nPAIRING_CONTEXT:")[0]}</p>
                  <small>
                    {approval.approvalId} · {approval.status}
                  </small>
                </div>
                {approval.status === "pending" ? (
                  <div className="actions">
                    <button onClick={() => void updateApproval(approval.approvalId, "approve")}>Approve</button>
                    <button className="secondary" onClick={() => void updateApproval(approval.approvalId, "reject")}>
                      Reject
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
        <p className="muted">Deferred pairing notices seen from peers:</p>
        {deferredPairingPeers.length === 0 ? (
          <p className="muted">None observed yet.</p>
        ) : (
          <div className="list">
            {deferredPairingPeers.map((entry) => (
              <article key={entry.peerId} className="row compact">
                <div>
                  <strong>{entry.peerId}</strong>
                  <small>last deferred at {entry.createdAt}</small>
                </div>
                <button onClick={() => void retryDeferredPairing(entry.peerId)}>Retry Pairing</button>
                <button
                  className="secondary"
                  onClick={() =>
                    void copyCommand(
                      `npm run node:dev -- --profile "${config.profileDir}" --pair-request "${entry.peerId}" --pair-note "Retry deferred pairing request"`,
                    )
                  }
                >
                  Copy Retry Cmd
                </button>
              </article>
            ))}
          </div>
        )}
        <p className="muted">Pairing status timeline:</p>
        <div className="pairing-timeline-toolbar">
          <input
            type="text"
            placeholder="Filter requestId/summary/peer"
            value={pairingTimelineQuery}
            onChange={(event) => setPairingTimelineQuery(event.target.value)}
          />
          <select
            value={pairingTimelineStatusFilter}
            onChange={(event) =>
              setPairingTimelineStatusFilter(
                event.target.value as
                  | "all"
                  | "pending"
                  | "approved"
                  | "rejected"
                  | "deferred"
                  | "approved_remote",
              )
            }
          >
            <option value="all">all</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="deferred">deferred</option>
            <option value="approved_remote">approved_remote</option>
          </select>
          <input
            type="text"
            placeholder="Export path (json)"
            value={pairingTimelineExportPath}
            onChange={(event) => setPairingTimelineExportPath(event.target.value)}
          />
          <button className="secondary" onClick={() => void exportPairingTimelineJson()}>
            Export Timeline JSON
          </button>
        </div>
        {filteredPairingTimeline.length === 0 ? (
          <p className="muted">No pairing timeline rows yet.</p>
        ) : (
          <div className="list">
            {filteredPairingTimeline.map((item, index) => (
              <article key={`${item.requestId}-${item.createdAt}-${index}`} className="row compact">
                <div>
                  <strong>{item.requestId}</strong>
                  <p>{item.summary}</p>
                  <small>
                    {item.createdAt} · status={item.status}
                    {item.approvalId ? ` · approval=${item.approvalId}` : ""}
                    {item.remotePeerId ? ` · peer=${item.remotePeerId}` : ""}
                  </small>
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    void copyCommand(
                      `npm run cli -w @envoymesh/node -- pairing timeline --profile "${config.profileDir}" --limit 50`,
                    )
                  }
                >
                  Copy Timeline Cmd
                </button>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <section className="grid two">
        <Panel title="Trust Records">
          <div className="form-grid">
            <input
              placeholder="Peer owner ID"
              value={trustForm.peerOwnerId}
              onChange={(event) => setTrustForm({ ...trustForm, peerOwnerId: event.target.value })}
            />
            <select
              value={trustForm.level}
              onChange={(event) =>
                setTrustForm({
                  ...trustForm,
                  level: event.target.value as SetTrustRecordRequest["level"],
                })
              }
            >
              <option value="direct">direct</option>
              <option value="referred">referred</option>
              <option value="public">public</option>
              <option value="blocked">blocked</option>
            </select>
            <input
              placeholder="Display name"
              value={trustForm.displayName}
              onChange={(event) => setTrustForm({ ...trustForm, displayName: event.target.value })}
            />
            <input
              placeholder="Note"
              value={trustForm.note}
              onChange={(event) => setTrustForm({ ...trustForm, note: event.target.value })}
            />
            <button disabled={!trustForm.peerOwnerId} onClick={() => void saveTrustRecord()}>
              Save Trust
            </button>
          </div>

          <div className="list">
            {snapshot.trustRecords.map((record) => (
              <article key={record.peerOwnerId} className="row">
                <div>
                  <strong>{record.displayName ?? record.peerOwnerId}</strong>
                  <p>{record.peerOwnerId}</p>
                  <small>
                    level={record.level}
                    {record.note ? ` · ${record.note}` : ""}
                  </small>
                </div>
                <button className="secondary" onClick={() => void removeTrustRecord(record.peerOwnerId)}>
                  Remove
                </button>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Observed Peers">
          {snapshot.observedPeers.length === 0 ? (
            <p className="muted">No remote peers observed in audit events.</p>
          ) : (
            <div className="list">
              {snapshot.observedPeers.map((peer) => (
                <article key={peer.peerId} className="row compact">
                  <div>
                    <strong>{peer.peerId}</strong>
                    <small>
                      {peer.messageCount} messages · last seen {peer.lastSeenAt}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Recent Tasks">
          <ActivityList
            empty="No task journal entries yet."
            rows={snapshot.taskJournalEntries.map((entry) => ({
              id: entry.eventId,
              title: `${entry.taskId} · ${entry.eventType}/${entry.state}`,
              detail: entry.summary,
              meta: entry.createdAt,
            }))}
          />
        </Panel>

        <Panel title="Recent Audit">
          <div className="audit-toolbar">
            <input
              type="text"
              placeholder="Filter by correlation / task id"
              value={auditCorrelationFilter}
              onChange={(event) => setAuditCorrelationFilter(event.target.value)}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showP2pTrace}
                onChange={(event) => setShowP2pTrace(event.target.checked)}
              />
              Show p2p.trace
            </label>
          </div>
          <p className="muted">
            p2p.trace rows only appear when the node is started with <code>--p2p-debug</code>.
          </p>
          <ActivityList
            empty="No audit events match the current filters."
            rows={filteredAuditEvents.map((event) => formatAuditRow(event))}
          />
        </Panel>
      </section>

      <Panel title="Shared Vault">
        <div className="vault-search">
          <input
            placeholder="Search shared vault"
            value={vaultQuery}
            onChange={(event) => setVaultQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void searchVault();
              }
            }}
          />
          <button disabled={!vaultQuery.trim()} onClick={() => void searchVault()}>
            Search
          </button>
        </div>
        <p className="muted">
          {snapshot.vault.documentCount} documents, {snapshot.vault.chunkCount} chunks
        </p>
        <div className="grid two">
          <div className="list">
            {snapshot.vault.documents.map((document) => (
              <article key={document.documentId} className="row compact">
                <div>
                  <strong>{document.relativePath}</strong>
                  <small>
                    {document.byteLength} bytes · {document.chunkCount} chunks
                  </small>
                </div>
              </article>
            ))}
          </div>
          <div className="list">
            {vaultResults.map((result) => (
              <article key={`${result.relativePath}-${result.chunkIndex}`} className="row compact">
                <div>
                  <strong>
                    {result.relativePath}#{result.chunkIndex}
                  </strong>
                  <p>{result.preview}</p>
                  <small>matches: {result.matches.join(", ")}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      </Panel>

      <section className="grid two">
        <Panel title="Chat / Task Composition">
          <div className="compose-section">
            <h3>Chat Threads</h3>
            <div className="form-grid-compose">
              <input placeholder="Filter thread / peer / summary" value={chatThreadQuery} onChange={(event) => setChatThreadQuery(event.target.value)} />
              <select
                value={chatStatusFilter}
                onChange={(event) => setChatStatusFilter(event.target.value as "all" | ChatThreadMessage["status"])}
              >
                <option value="all">all statuses</option>
                <option value="sent">sent</option>
                <option value="received">received</option>
                <option value="deferred">deferred</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
            <div className="chat-thread-layout">
              <div className="list">
                {filteredChatThreads.length === 0 ? (
                  <p className="muted">No chat threads match current filters.</p>
                ) : (
                  filteredChatThreads.map((thread) => (
                    <article
                      key={thread.key}
                      className={`row compact ${selectedChatThreadKey === thread.key ? "row-active" : ""}`}
                    >
                      <button
                        className="thread-button"
                        onClick={() => setSelectedChatThreadKey(thread.key)}
                        type="button"
                      >
                        <div>
                          <strong>{thread.label}</strong>
                          <p>{thread.lastSummary}</p>
                          <small>
                            {thread.lastCreatedAt}
                            {thread.correlationId ? ` · corr=${thread.correlationId}` : ""}
                            {thread.taskId ? ` · task=${thread.taskId}` : ""}
                          </small>
                        </div>
                        <span className="status-chip status-chip-neutral">{thread.messages.length}</span>
                      </button>
                    </article>
                  ))
                )}
              </div>
              <div className="list">
                {selectedChatThread ? (
                  <>
                    <article className="row compact">
                      <div>
                        <strong>Thread Metrics</strong>
                        <small>
                          messages={selectedChatThread.messages.length} · sent={selectedChatThread.metrics.sent} ·
                          received={selectedChatThread.metrics.received} · deferred={selectedChatThread.metrics.deferred}
                          · rejected={selectedChatThread.metrics.rejected}
                        </small>
                        <small>
                          avgLatency=
                          {typeof selectedChatThread.metrics.averageLatencyMs === "number"
                            ? `${selectedChatThread.metrics.averageLatencyMs}ms`
                            : "n/a"}
                        </small>
                      </div>
                    </article>
                    {selectedChatThread.messages.map((message) => (
                      <article key={message.eventId} className="row compact">
                        <div>
                          <strong>{message.summary}</strong>
                          <small>
                            {message.createdAt}
                            {message.remotePeerId ? ` · ${message.remotePeerId}` : ""}
                            {message.correlationId ? ` · corr=${message.correlationId}` : ""}
                          </small>
                          <small>
                            {message.direction ?? "unknown-direction"} · {message.outcome}
                            {message.verificationStatus ? ` · verify=${message.verificationStatus}` : ""}
                            {typeof message.latencyMs === "number" ? ` · ${message.latencyMs}ms` : ""}
                          </small>
                        </div>
                        <span className={`status-chip ${statusChipClass(message.status)}`}>{message.status}</span>
                      </article>
                    ))}
                  </>
                ) : (
                  <p className="muted">Select a thread to inspect message flow.</p>
                )}
              </div>
            </div>
            <h3>Send Chat Message</h3>
            <div className="form-grid-compose">
              <input placeholder="Target peerId/multiaddr/ownerId" value={chatForm.target} onChange={(event) => setChatForm({ ...chatForm, target: event.target.value })} />
              <input placeholder="Correlation ID (optional)" value={chatForm.correlationId} onChange={(event) => setChatForm({ ...chatForm, correlationId: event.target.value })} />
              <input
                placeholder="Message text"
                value={chatForm.text}
                onChange={(event) => setChatForm({ ...chatForm, text: event.target.value })}
              />
              <button disabled={!chatForm.target.trim() || !chatForm.text.trim()} onClick={() => void sendChatMessage()}>
                Send Chat
              </button>
            </div>
            <h3>Device Pairing Request</h3>
            <div className="form-grid-compose">
              <input
                placeholder="Primary peerId/multiaddr/ownerId"
                value={pairingForm.target}
                onChange={(event) => setPairingForm({ ...pairingForm, target: event.target.value })}
              />
              <select
                value={pairingForm.requestedDeviceProfile}
                onChange={(event) =>
                  setPairingForm({
                    ...pairingForm,
                    requestedDeviceProfile: event.target.value as SendPairingRequest["requestedDeviceProfile"],
                  })
                }
              >
                <option value="satellite">satellite</option>
                <option value="full">full</option>
              </select>
              <input
                placeholder="Pairing note (optional)"
                value={pairingForm.note ?? ""}
                onChange={(event) => setPairingForm({ ...pairingForm, note: event.target.value })}
              />
              <button disabled={!pairingForm.target.trim()} onClick={() => void sendPairingRequest()}>
                Send Pairing Request
              </button>
            </div>
          </div>

          <div className="compose-section">
            <h3>Task Proposal Wizard</h3>
            <p className="muted">
              Step {taskComposerStep + 1} of 5:{" "}
              {TASK_COMPOSER_STEPS[taskComposerStep]}
            </p>
            <div className="form-grid-compose">
              <select
                value={taskPresetId}
                onChange={(event) => {
                  const nextPresetId = event.target.value;
                  setTaskPresetId(nextPresetId);
                  const preset = TASK_COMPOSER_PRESETS.find((item) => item.id === nextPresetId);
                  if (!preset) {
                    return;
                  }
                  setTaskComposeForm((previous) => ({
                    ...previous,
                    objective: preset.objective,
                    requestedResult: preset.requestedResult,
                    closeOnFirstCompletedResult: preset.closeOnFirstCompletedResult,
                    collectCompletedResultsText: preset.collectCompletedResultsText,
                  }));
                }}
              >
                <option value="none">No preset</option>
                {TASK_COMPOSER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    Preset: {preset.label}
                  </option>
                ))}
              </select>
              {taskComposerStep === 0 ? (
                <>
                  <input placeholder="Task ID" value={taskComposeForm.taskId} onChange={(event) => setTaskComposeForm({ ...taskComposeForm, taskId: event.target.value })} />
                  <input placeholder="Objective" value={taskComposeForm.objective} onChange={(event) => setTaskComposeForm({ ...taskComposeForm, objective: event.target.value })} />
                </>
              ) : null}
              {taskComposerStep === 1 ? (
                <input
                  placeholder="Requested result"
                  value={taskComposeForm.requestedResult}
                  onChange={(event) => setTaskComposeForm({ ...taskComposeForm, requestedResult: event.target.value })}
                />
              ) : null}
              {taskComposerStep === 2 ? (
                <>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(taskComposeForm.closeOnFirstCompletedResult)}
                      onChange={(event) =>
                        setTaskComposeForm({ ...taskComposeForm, closeOnFirstCompletedResult: event.target.checked })
                      }
                    />
                    Close on first completed result
                  </label>
                  <input
                    placeholder="Collect N completed results (2-32, optional)"
                    value={taskComposeForm.collectCompletedResultsText}
                    onChange={(event) => setTaskComposeForm({ ...taskComposeForm, collectCompletedResultsText: event.target.value })}
                  />
                </>
              ) : null}
              {taskComposerStep === 3 ? (
                <>
                  <input placeholder="Target peerId/multiaddr/ownerId" value={taskComposeForm.target} onChange={(event) => setTaskComposeForm({ ...taskComposeForm, target: event.target.value })} />
                  <input placeholder="Mandate ID (optional)" value={taskComposeForm.mandateId} onChange={(event) => setTaskComposeForm({ ...taskComposeForm, mandateId: event.target.value })} />
                  <input placeholder="Correlation ID (optional)" value={taskComposeForm.correlationId} onChange={(event) => setTaskComposeForm({ ...taskComposeForm, correlationId: event.target.value })} />
                </>
              ) : null}
              {taskComposerStep === 4 ? (
                <div className="composer-review">
                  <small>preset={taskPresetId}</small>
                  <small>taskId={taskComposeForm.taskId || "-"}</small>
                  <small>objective={taskComposeForm.objective || "-"}</small>
                  <small>requestedResult={taskComposeForm.requestedResult || "-"}</small>
                  <small>target={taskComposeForm.target || "-"}</small>
                  <small>mandateId={taskComposeForm.mandateId || "-"}</small>
                  <small>correlationId={taskComposeForm.correlationId || "-"}</small>
                  <small>
                    termination=
                    {taskComposeForm.closeOnFirstCompletedResult
                      ? "closeOnFirstCompletedResult"
                      : taskComposeForm.collectCompletedResultsText || "default"}
                  </small>
                </div>
              ) : null}
              {taskStepHint ? <p className="muted wizard-hint">{taskStepHint}</p> : null}
              <div className="wizard-nav">
                <button className="secondary" disabled={taskComposerStep === 0} onClick={() => setTaskComposerStep((step) => Math.max(0, step - 1))}>
                  Back
                </button>
                <button
                  className="secondary"
                  disabled={taskComposerStep >= 4 || Boolean(taskStepHint)}
                  onClick={() => setTaskComposerStep((step) => Math.min(4, step + 1))}
                >
                  Next
                </button>
                <button className="secondary" type="button" onClick={resetTaskComposerState}>
                  Reset Composer State
                </button>
              </div>
              <button
                disabled={
                  !taskComposeForm.target.trim() ||
                  !taskComposeForm.taskId.trim() ||
                  !taskComposeForm.objective.trim() ||
                  !taskComposeForm.requestedResult.trim() ||
                  taskComposerStep !== 4
                }
                onClick={() => void sendTaskProposal()}
              >
                Send Task Proposal
              </button>
            </div>
          </div>

          <div className="compose-section">
            <h3>Task Negotiate (follow-up)</h3>
            <p className="muted">
              Uses the mandate from the last task proposal sent in this dashboard session (same task ID and mandate
              ID).
            </p>
            <div className="form-grid-compose">
              <input
                placeholder="Target peerId/multiaddr/ownerId"
                value={negotiateForm.target}
                onChange={(event) => setNegotiateForm({ ...negotiateForm, target: event.target.value })}
              />
              <input
                placeholder="Task ID (must match last proposal)"
                value={negotiateForm.taskId}
                onChange={(event) => setNegotiateForm({ ...negotiateForm, taskId: event.target.value })}
              />
              <input
                placeholder="Mandate ID (must match last proposal)"
                value={negotiateForm.mandateId}
                onChange={(event) => setNegotiateForm({ ...negotiateForm, mandateId: event.target.value })}
              />
              <input
                placeholder="Negotiation message"
                value={negotiateForm.message}
                onChange={(event) => setNegotiateForm({ ...negotiateForm, message: event.target.value })}
              />
              <input
                placeholder="Proposed changes (comma-separated, optional)"
                value={negotiateForm.proposedChangesLine}
                onChange={(event) =>
                  setNegotiateForm({ ...negotiateForm, proposedChangesLine: event.target.value })
                }
              />
              <input
                placeholder="Negotiation ID (optional)"
                value={negotiateForm.negotiationId}
                onChange={(event) => setNegotiateForm({ ...negotiateForm, negotiationId: event.target.value })}
              />
              <input
                placeholder="Correlation ID (optional)"
                value={negotiateForm.correlationId}
                onChange={(event) => setNegotiateForm({ ...negotiateForm, correlationId: event.target.value })}
              />
              <button
                disabled={
                  !negotiateForm.target.trim() ||
                  !negotiateForm.taskId.trim() ||
                  !negotiateForm.mandateId.trim() ||
                  !negotiateForm.message.trim()
                }
                onClick={() => void sendTaskNegotiate()}
              >
                Send Negotiation
              </button>
            </div>
          </div>

          {sendResult ? (
            <p className="muted">
              Last outbound: {sendResult.intent} to {sendResult.target} message={sendResult.messageId} latency=
              {sendResult.latencyMs}ms
            </p>
          ) : null}
        </Panel>

        <Panel title="Morning Report">
          {snapshot.morningReport.length === 0 ? (
            <p className="muted">No discovery digest candidates yet.</p>
          ) : (
            <div className="list">
              {snapshot.morningReport.map((entry) => (
                <article key={entry.ownerId} className="row compact">
                  <div>
                    <strong>
                      score={entry.score} {entry.ownerId}
                    </strong>
                    <p>{entry.reason}</p>
                    <small>
                      trust={entry.trustLevel} peer={entry.peerId ?? "-"} matches={entry.discoveryMatchCount}
                      {entry.lastSeenAt ? ` · lastSeen=${entry.lastSeenAt}` : ""}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ActivityList({
  rows,
  empty,
}: {
  rows: Array<{ id: string; title: string; detail: string; meta: string }>;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="muted">{empty}</p>;
  }

  return (
    <div className="list">
      {rows.map((row) => (
        <article key={row.id} className="row compact">
          <div>
            <strong>{row.title}</strong>
            <p>{row.detail}</p>
            <small>{row.meta}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

type ChatThreadMessage = {
  eventId: string;
  createdAt: string;
  summary: string;
  remotePeerId?: string;
  correlationId?: string;
  direction?: "inbound" | "outbound";
  outcome: string;
  verificationStatus?: string;
  latencyMs?: number;
  status: "sent" | "received" | "deferred" | "rejected";
};

type ChatThread = {
  key: string;
  label: string;
  correlationId?: string;
  taskId?: string;
  remotePeerId?: string;
  lastSummary: string;
  lastCreatedAt: string;
  messages: ChatThreadMessage[];
  metrics: {
    sent: number;
    received: number;
    deferred: number;
    rejected: number;
    averageLatencyMs?: number;
  };
};

function buildChatThreads(events: AuditEvent[]): ChatThread[] {
  const threadMap = new Map<string, ChatThread>();
  for (const event of events) {
    const status = inferChatStatus(event);
    const key = event.correlationId ?? event.taskId ?? event.remotePeerId ?? `event:${event.eventId}`;
    const label = event.correlationId
      ? `corr:${event.correlationId}`
      : event.taskId
        ? `task:${event.taskId}`
        : event.remotePeerId ?? "unscoped";
    const existing = threadMap.get(key);
    const message: ChatThreadMessage = {
      eventId: event.eventId,
      createdAt: event.createdAt,
      summary: event.summary,
      remotePeerId: event.remotePeerId,
      correlationId: event.correlationId,
      direction: event.direction,
      outcome: event.outcome,
      verificationStatus: event.verificationStatus,
      latencyMs: event.latencyMs,
      status,
    };
    if (existing) {
      existing.messages.push(message);
      if (existing.lastCreatedAt.localeCompare(event.createdAt) <= 0) {
        existing.lastCreatedAt = event.createdAt;
        existing.lastSummary = event.summary;
      }
      continue;
    }
    threadMap.set(key, {
      key,
      label,
      correlationId: event.correlationId,
      taskId: event.taskId,
      remotePeerId: event.remotePeerId,
      lastSummary: event.summary,
      lastCreatedAt: event.createdAt,
      messages: [message],
      metrics: {
        sent: 0,
        received: 0,
        deferred: 0,
        rejected: 0,
      },
    });
  }
  return [...threadMap.values()]
    .map((thread) => {
      const sortedMessages = thread.messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latencyValues = sortedMessages
        .map((message) => message.latencyMs)
        .filter((value): value is number => typeof value === "number");
      const total = sortedMessages.reduce(
        (acc, message) => {
          acc[message.status] += 1;
          return acc;
        },
        { sent: 0, received: 0, deferred: 0, rejected: 0 },
      );
      return {
        ...thread,
        messages: sortedMessages,
        metrics: {
          ...total,
          averageLatencyMs:
            latencyValues.length > 0
              ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
              : undefined,
        },
      };
    })
    .sort((a, b) => b.lastCreatedAt.localeCompare(a.lastCreatedAt));
}

function inferChatStatus(event: AuditEvent): ChatThreadMessage["status"] {
  if (event.intent === "device.pair.deferred" || event.summary.toLowerCase().includes("deferred")) {
    return "deferred";
  }
  if (event.type === "message.rejected" || event.outcome === "deny") {
    return "rejected";
  }
  if (event.direction === "outbound") {
    return "sent";
  }
  return "received";
}

function statusChipClass(status: ChatThreadMessage["status"]): string {
  if (status === "sent") {
    return "status-chip-sent";
  }
  if (status === "received") {
    return "status-chip-received";
  }
  if (status === "deferred") {
    return "status-chip-deferred";
  }
  return "status-chip-rejected";
}

function validateTaskStep(
  form: SendTaskProposalRequest & { collectCompletedResultsText: string },
  step: number,
): string | undefined {
  if (step === 0) {
    if (!form.taskId.trim()) {
      return "Task ID is required before moving forward.";
    }
    if (!form.objective.trim()) {
      return "Objective is required before moving forward.";
    }
    return undefined;
  }
  if (step === 1) {
    if (!form.requestedResult.trim()) {
      return "Requested result is required before moving forward.";
    }
    return undefined;
  }
  if (step === 2) {
    const raw = form.collectCompletedResultsText.trim();
    if (!raw) {
      return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 2 || parsed > 32) {
      return "Collect N must be a number between 2 and 32.";
    }
    return undefined;
  }
  if (step === 3) {
    if (!form.target.trim()) {
      return "Target is required before moving forward.";
    }
    return undefined;
  }
  return undefined;
}

function formatAuditRow(event: AuditEvent): { id: string; title: string; detail: string; meta: string } {
  const correlation = event.correlationId ? ` · corr ${event.correlationId}` : "";
  const direction = event.direction ? ` · ${event.direction}` : "";
  const verify = event.verificationStatus ? ` · ${event.verificationStatus}` : "";
  const latency = typeof event.latencyMs === "number" ? ` · ${event.latencyMs}ms` : "";
  const protocol = event.protocol ? ` · ${event.protocol}` : "";
  const remote = event.remotePeerId ? ` · ${event.remotePeerId}` : "";

  return {
    id: event.eventId,
    title: `${event.type} · ${event.outcome}${correlation}`,
    detail: event.summary,
    meta: `${event.createdAt}${direction}${verify}${latency}${protocol}${remote}`,
  };
}

createRoot(document.getElementById("root")!).render(<App />);
