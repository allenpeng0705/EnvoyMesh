import { useCallback, useEffect, useMemo, useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel } from "../../lib/display.js";
import type {
  AgentActivityRecord,
  AgentActivityDomain,
  AuditEventSummary,
  BondRecord,
  TaskJournalSummary,
} from "@envoymesh/api";

const DOMAIN_LABEL: Record<AgentActivityDomain, string> = {
  social: "Social",
  knowledge: "Knowledge",
  home: "Home",
  research: "Research",
};

const KIND_LABEL: Record<AgentActivityRecord["kind"], string> = {
  task_started: "Task started",
  task_progress: "In progress",
  task_completed: "Completed",
  task_failed: "Failed",
  knowledge_answered: "Knowledge",
  intro_sync: "Intro sync",
  friend_autopilot_pass: "Friend autopilot",
  share_proposed: "Share proposed",
  approval_needed: "Needs approval",
  report_received: "Report",
};

type DateRangePreset = "all" | "today" | "7d" | "custom";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfLocalDay(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfNextLocalDay(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function resolveDateRange(
  preset: DateRangePreset,
  customDay: string,
): { since?: string; until?: string } {
  if (preset === "all") return {};
  if (preset === "today") {
    return { since: startOfLocalDay(), until: startOfNextLocalDay() };
  }
  if (preset === "7d") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { since: d.toISOString() };
  }
  if (preset === "custom" && customDay.trim()) {
    const day = new Date(`${customDay.trim()}T00:00:00`);
    if (Number.isNaN(day.getTime())) return {};
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return { since: day.toISOString(), until: next.toISOString() };
  }
  return {};
}

function ActivityDetailPanel(props: {
  row: AgentActivityRecord;
  onClose: () => void;
}) {
  const nodeService = useNodeService();
  const [audits, setAudits] = useState<AuditEventSummary[]>([]);
  const [journal, setJournal] = useState<TaskJournalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [auditRows, journalRows] = await Promise.all([
          nodeService.listAuditEvents({
            correlationId: props.row.correlationId,
            taskId: props.row.taskId,
            limit: 50,
          }),
          nodeService.listTaskJournalEntries({
            taskId: props.row.taskId,
            limit: 50,
          }),
        ]);
        if (!cancelled) {
          setAudits(auditRows);
          setJournal(journalRows);
        }
      } catch (err) {
        console.warn("[ActivityView] drill-down failed:", err);
        if (!cancelled) {
          setAudits([]);
          setJournal([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService, props.row.activityId, props.row.correlationId, props.row.taskId]);

  return (
    <div className="activity-detail-panel">
      <div className="activity-detail-header">
        <h3>Trace</h3>
        <button type="button" className="btn-secondary" onClick={props.onClose}>
          Close
        </button>
      </div>
      <p className="field-desc">{props.row.summary}</p>
      {loading ? (
        <p className="field-desc">Loading audit trace…</p>
      ) : (
        <>
          {journal.length > 0 && (
            <>
              <h4 className="activity-detail-subtitle">Task journal</h4>
              <ul className="activity-trace-list">
                {journal.map((entry) => (
                  <li key={entry.eventId}>
                    <span className="activity-trace-kind">{entry.eventType}</span>
                    <span>{entry.summary}</span>
                    <time dateTime={entry.createdAt}>{fmtWhen(entry.createdAt)}</time>
                  </li>
                ))}
              </ul>
            </>
          )}
          {audits.length > 0 && (
            <>
              <h4 className="activity-detail-subtitle">Audit events</h4>
              <ul className="activity-trace-list">
                {audits.map((entry) => (
                  <li key={entry.eventId}>
                    <span className="activity-trace-kind">{entry.type}</span>
                    <span>{entry.summary}</span>
                    <time dateTime={entry.createdAt}>{fmtWhen(entry.createdAt)}</time>
                  </li>
                ))}
              </ul>
            </>
          )}
          {journal.length === 0 && audits.length === 0 && (
            <p className="field-desc">No correlated audit or journal rows found.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Owner Activity timeline (Phase 13D / US-AV8 filters). */
export function ActivityView() {
  const nodeService = useNodeService();
  const [rows, setRows] = useState<AgentActivityRecord[]>([]);
  const [bonds, setBonds] = useState<BondRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState<AgentActivityDomain | "all">("all");
  const [contactFilter, setContactFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customDay, setCustomDay] = useState("");
  const [selected, setSelected] = useState<AgentActivityRecord | null>(null);

  const bondLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const bond of bonds) {
      map.set(bond.peerOwnerId, contactLabel(bond));
    }
    return map;
  }, [bonds]);

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customDay),
    [datePreset, customDay],
  );

  useEffect(() => {
    void nodeService.getBonds().then(setBonds).catch(() => setBonds([]));
  }, [nodeService]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await nodeService.listAgentActivity({
        limit: 200,
        domain: domainFilter === "all" ? undefined : domainFilter,
        remoteOwnerId: contactFilter === "all" ? undefined : contactFilter,
        since: dateRange.since,
        until: dateRange.until,
      });
      setRows(list);
    } catch (err) {
      console.warn("[ActivityView] listAgentActivity failed:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [nodeService, domainFilter, contactFilter, dateRange.since, dateRange.until]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const unsub = nodeService.on("agent:activity", (record: AgentActivityRecord) => {
      if (domainFilter !== "all" && record.domain !== domainFilter) return;
      if (contactFilter !== "all" && record.remoteOwnerId !== contactFilter) return;
      if (dateRange.since && record.createdAt < dateRange.since) return;
      if (dateRange.until && record.createdAt >= dateRange.until) return;
      setRows((prev) => [record, ...prev.filter((row) => row.activityId !== record.activityId)]);
    });
    return unsub;
  }, [nodeService, domainFilter, contactFilter, dateRange.since, dateRange.until]);

  return (
    <div className="activity-view">
      <div className="activity-header">
        <div>
          <h2 className="activity-title">Activity</h2>
          <p className="activity-subtitle">
            What your agent did off-chat — tasks, reports, and A2A work.
          </p>
        </div>
        <div className="activity-filters">
          <label className="activity-filter-label" htmlFor="activity-domain-filter">
            Domain
          </label>
          <select
            id="activity-domain-filter"
            className="activity-filter-select"
            value={domainFilter}
            onChange={(e) =>
              setDomainFilter(e.target.value as AgentActivityDomain | "all")
            }
          >
            <option value="all">All</option>
            {(Object.keys(DOMAIN_LABEL) as AgentActivityDomain[]).map((key) => (
              <option key={key} value={key}>
                {DOMAIN_LABEL[key]}
              </option>
            ))}
          </select>

          <label className="activity-filter-label" htmlFor="activity-contact-filter">
            Contact
          </label>
          <select
            id="activity-contact-filter"
            className="activity-filter-select"
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
          >
            <option value="all">All contacts</option>
            {bonds.map((bond) => (
              <option key={bond.peerOwnerId} value={bond.peerOwnerId}>
                {contactLabel(bond)}
              </option>
            ))}
          </select>

          <label className="activity-filter-label" htmlFor="activity-date-filter">
            When
          </label>
          <select
            id="activity-date-filter"
            className="activity-filter-select"
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="custom">Custom day</option>
          </select>
          {datePreset === "custom" ? (
            <input
              type="date"
              className="activity-filter-select"
              value={customDay}
              onChange={(e) => setCustomDay(e.target.value)}
              aria-label="Activity custom day"
            />
          ) : null}
        </div>
      </div>

      {selected ? <ActivityDetailPanel row={selected} onClose={() => setSelected(null)} /> : null}

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-desc">Loading activity…</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No agent activity yet</div>
          <div className="empty-state-desc">
            Task progress and owner reports appear here — not in contact chat threads.
          </div>
        </div>
      ) : (
        <ul className="activity-list">
          {rows.map((row) => (
            <li key={row.activityId}>
              <button
                type="button"
                className={`activity-row${selected?.activityId === row.activityId ? " activity-row--selected" : ""}`}
                onClick={() => setSelected((prev) => (prev?.activityId === row.activityId ? null : row))}
              >
                <div className="activity-row-meta">
                  <span className="activity-kind">{KIND_LABEL[row.kind]}</span>
                  <span className="activity-domain">{DOMAIN_LABEL[row.domain]}</span>
                  {row.remoteOwnerId ? (
                    <span className="activity-contact">
                      {bondLabels.get(row.remoteOwnerId) ??
                        row.remoteOwnerId.replace(/^envoy:owner:/, "").slice(0, 12)}
                    </span>
                  ) : null}
                  <time className="activity-time" dateTime={row.createdAt}>
                    {fmtWhen(row.createdAt)}
                  </time>
                </div>
                <p className="activity-summary">{row.summary}</p>
                {(row.taskId || row.correlationId) && (
                  <div className="activity-refs">
                    {row.taskId ? <span className="activity-ref">task: {row.taskId}</span> : null}
                    {row.correlationId ? (
                      <span className="activity-ref">corr: {row.correlationId.slice(0, 12)}…</span>
                    ) : null}
                  </div>
                )}
                {row.requiresOwnerAction ? (
                  <span className="activity-action-badge">Needs your action</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
