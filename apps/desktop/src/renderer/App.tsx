import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type {
  DashboardConfig,
  DashboardSnapshot,
  SetTrustRecordRequest,
  VaultSearchHit,
} from "../shared/dashboard.js";
import "./styles.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; snapshot: DashboardSnapshot; config: DashboardConfig }
  | { status: "error"; message: string };

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

  const pendingApprovals = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }

    return loadState.snapshot.approvals.filter((approval) => approval.status === "pending");
  }, [loadState]);

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

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">EnvoyMesh Desktop</p>
          <h1>Operator Console</h1>
          <p className="muted">Local profile: {config.profileDir}</p>
          <p className="muted">Shared vault: {config.vaultDir}</p>
        </div>
        <button onClick={() => void refresh()}>Refresh</button>
      </header>

      <section className="grid cards">
        <Metric label="Pending Approvals" value={pendingApprovals.length} />
        <Metric label="Trust Records" value={snapshot.trustRecords.length} />
        <Metric label="Observed Peers" value={snapshot.observedPeers.length} />
        <Metric label="Vault Documents" value={snapshot.vault.documentCount} />
      </section>

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
          <ActivityList
            empty="No audit events yet."
            rows={snapshot.auditEvents.map((event) => ({
              id: event.eventId,
              title: `${event.type} · ${event.outcome}`,
              detail: event.summary,
              meta: event.createdAt,
            }))}
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

createRoot(document.getElementById("root")!).render(<App />);
